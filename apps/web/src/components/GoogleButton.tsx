import { useEffect, useRef, useState } from 'react';
import { C, shadow } from '../theme';
import { signInWithGoogle } from '../state/session';
import { api } from '../api';

// "Continue with Google", drawn in the app's own style. Google only issues a sign-in token through its own button, so
// that real button is rendered invisibly on top of ours and receives the tap. The token is verified server-side.
interface GsiWindow { google?: { accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } } } }

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  loading ??= new Promise((res, rej) => {
    if ((window as unknown as GsiWindow).google) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { loading = null; rej(new Error('gsi')); };
    document.head.appendChild(s);
  });
  return loading;
}

const HEIGHT = 52;
const GIS_HEIGHT = 40; // the height of Google's "large" button; it is stretched to fill ours

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Google refuses to sign people in inside the browsers built into other apps (WhatsApp, Instagram, Facebook and so on). */
export function inAppBrowser(ua = navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|; wv\)|GSA\//.test(ua);
}

type State = 'loading' | 'ready' | 'script_failed' | 'button_not_drawn' | 'origin_rejected' | 'in_app_browser';

/** Words for each way sign-in can be stuck. Short, kind, and always with another way forward. */
const STUCK: Record<Exclude<State, 'loading' | 'ready'>, string> = {
  in_app_browser: 'Google doesn’t allow sign-in inside this app’s built-in browser. Open this page in Chrome or Safari, or use your phone number above.',
  script_failed: 'I couldn’t reach Google just now. Check your internet and try again, or use your phone number above.',
  button_not_drawn: 'Google sign-in didn’t load on this device. Please use your phone number above.',
  origin_rejected: 'Google sign-in isn’t switched on for this address yet. Please use your phone number above. (If you run this app: add this address to the Google sign-in settings.)',
};

export function GoogleButton({ clientId }: { clientId: string }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>(inAppBrowser() ? 'in_app_browser' : 'loading');
  const stuck = state !== 'loading' && state !== 'ready';
  const report = (stage: string, note?: string) => api.googleDiag(stage, note);

  useEffect(() => {
    if (state === 'in_app_browser') { report('in_app_browser', navigator.userAgent.slice(0, 80)); return; }
    let dead = false;
    // Google explains its own refusals (wrong address, wrong client) only in the browser console. Listen for those lines
    // for a few seconds so we can say what is wrong instead of leaving a button that does nothing.
    const origErr = console.error, origWarn = console.warn;
    let rejected: string | null = null;
    const listen = (orig: typeof console.error) => (...a: unknown[]) => {
      const t = a.map(String).join(' ');
      if (/GSI_LOGGER/.test(t) && /origin|client/i.test(t)) rejected = t.replace(/\[GSI_LOGGER\]:?\s*/, '').slice(0, 160);
      orig.apply(console, a as []);
    };
    console.error = listen(origErr); console.warn = listen(origWarn);
    const restore = () => { console.error = origErr; console.warn = origWarn; };
    const settle = setTimeout(() => {
      restore();
      if (dead) return;
      if (rejected) { setState('origin_rejected'); report('origin_rejected', rejected); return; }
      const drawn = overlay.current?.querySelector('iframe, [role="button"], div[aria-labelledby]');
      if (!drawn) { setState('button_not_drawn'); report('button_not_drawn'); }
    }, 5000);
    loadGsi().then(() => {
      const g = (window as unknown as GsiWindow).google;
      const el = overlay.current;
      if (dead || !g || !el) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => void signInWithGoogle(r.credential), ux_mode: 'popup' });
      g.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, Math.round(el.offsetWidth)) });
      setState(s => (s === 'loading' || s === 'button_not_drawn' || s === 'script_failed' ? 'ready' : s));
    }).catch(() => { if (!dead) { setState('script_failed'); report('script_failed'); } });
    return () => { dead = true; clearTimeout(settle); restore(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <div>
      <div style={{ position: 'relative', height: HEIGHT, borderRadius: HEIGHT / 2, overflow: 'hidden' }}>
        {/* What people see: matches the other buttons. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.white, border: `1.5px solid ${C.track}`, boxShadow: shadow.cardSoft, borderRadius: HEIGHT / 2, fontSize: 17, fontWeight: 600, color: C.ink, opacity: state === 'ready' ? 1 : 0.6 }}>
          <GoogleG /> Continue with Google
        </div>
        {/* What receives the tap: Google's own button, invisible and stretched to fill ours. */}
        <div ref={overlay} style={{ position: 'absolute', inset: 0, opacity: 0.01, transform: `scaleY(${HEIGHT / GIS_HEIGHT})`, transformOrigin: 'top', display: 'flex', justifyContent: 'center', pointerEvents: stuck ? 'none' : 'auto' }} />
        {/* When Google's button can't be used, our own button says why instead of doing nothing. */}
        {stuck && <button type="button" aria-label="Continue with Google" onClick={() => { report('tapped_while_not_ready', state); }} style={{ position: 'absolute', inset: 0, background: 'transparent', border: 0, cursor: 'pointer' }} />}
      </div>
      {stuck && <div role="status" style={{ fontSize: 14, color: C.amberText, background: C.amber, borderRadius: 14, padding: '10px 12px', marginTop: 10, lineHeight: 1.4 }}>{STUCK[state as keyof typeof STUCK]}</div>}
    </div>
  );
}
