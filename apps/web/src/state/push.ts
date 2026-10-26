import { api, isDemo } from '../api';
import { getState, set } from './store';

// Web push (PRD 8.8). The service worker shows the notification; tapping it opens the right screen and the app
// reports the tap so "ignored" is measured honestly.

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registerServiceWorker() {
  if (isDemo || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try { await navigator.serviceWorker.register('/sw.js'); } catch { /* the app works without it */ }
}

export function detectPushState() {
  if (!supported() || isDemo) { set({ pushState: 'unsupported' }); return; }
  if (Notification.permission === 'denied') { set({ pushState: 'denied' }); return; }
  navigator.serviceWorker.getRegistration().then(async r => {
    const sub = await r?.pushManager.getSubscription();
    set({ pushState: sub && Notification.permission === 'granted' ? 'on' : 'off' });
  }).catch(() => set({ pushState: 'off' }));
}

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export type EnableResult = 'on' | 'denied' | 'unsupported' | 'unavailable';

/** Ask for permission only when the person turns notifications on, never on load. */
export async function enablePush(): Promise<EnableResult> {
  if (!supported() || isDemo) return 'unsupported';
  const { publicKey, enabled } = await api.vapidKey().catch(() => ({ publicKey: null, enabled: false }));
  if (!enabled || !publicKey) return 'unavailable';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { set({ pushState: perm === 'denied' ? 'denied' : 'off' }); return 'denied'; }
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as unknown as BufferSource }));
  await api.registerDevice(sub.toJSON());
  set({ pushState: 'on' });
  return 'on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => undefined);
  set({ pushState: 'off' });
}

export type OpenHandler = (route: string, kind: string, action: string) => void;

/** Notification taps arrive as a message (app already open) or as ?open= (app opened by the tap). */
export function listenForNotificationOpens(handle: OpenHandler) {
  const run = (route: string, kind: string, action: string) => {
    if (kind) void api.notificationOpened(kind).catch(() => undefined);
    handle(route, kind, action);
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'open') run(e.data.route, e.data.kind, e.data.action ?? ''); });
  const q = new URLSearchParams(location.search);
  if (q.has('open')) {
    const r = q.get('open') ?? 'today', k = q.get('kind') ?? '', a = q.get('action') ?? '';
    history.replaceState(null, '', location.pathname);
    return () => { if (getState().phase === 'in') run(r, k, a); };
  }
  return () => undefined;
}
