import { api, isDemo, type AnalyticsEvent } from '../api';
import { getState, subscribe, type Screen } from './store';

// Product analytics, only for people who switched on "Share how I use Saathi". It records which screen is open and for
// how long, which tagged buttons are tapped, and named steps. It never reads text from the page: a button is only
// reported if it carries an explicit data-track id, so nothing a person wrote can end up in an event.

const FLUSH_MS = 15_000;
const MAX_QUEUE = 100;
const sessionId = (crypto.randomUUID?.() ?? `s${Date.now()}${Math.random().toString(36).slice(2)}`).slice(0, 36);

let queue: AnalyticsEvent[] = [];
let current: { screen: Screen; since: number } | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

/** Whether this person has opted in and the platform allows it right now. */
export function analyticsOn(): boolean {
  const s = getState();
  return !isDemo && s.phase === 'in' && !!s.me?.consent.analytics && s.cfg?.analytics !== false;
}

const safe = (v: string | undefined) => (v && /^[a-z0-9][a-z0-9_.:-]{0,39}$/i.test(v) ? v : undefined);

function push(e: AnalyticsEvent) {
  if (!analyticsOn()) return;
  queue.push({ ...e, at: Date.now() });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

/** Named product steps, e.g. track.step('consent_done'). */
export const trackStep = (step: string, result?: string) => { const st = safe(step); if (st) push({ name: 'step', step: st, result: safe(result) }); };

function closeScreen() {
  if (current) push({ name: 'screen_view', screen: safe(current.screen), durationMs: Math.min(Date.now() - current.since, 3_600_000) });
  current = null;
}

export async function flush() {
  if (!queue.length || !analyticsOn()) { if (!analyticsOn()) queue = []; return; }
  const batch = queue.slice(0, 50);
  queue = queue.slice(batch.length);
  try { await api.sendEvents(sessionId, batch); } catch { /* analytics never bothers the person */ }
}

export function startAnalytics(): () => void {
  let last = getState().screen;
  const unsub = subscribe(() => {
    const s = getState();
    if (s.screen === last && current) return;
    last = s.screen;
    closeScreen();
    if (analyticsOn()) current = { screen: s.screen, since: Date.now() };
  });

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('[data-track]');
    const id = safe(el?.getAttribute('data-track') ?? undefined);
    if (id) push({ name: 'click', screen: safe(getState().screen), el: id });
  };
  document.addEventListener('click', onClick, true);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { closeScreen(); void flush(); }
    else if (analyticsOn()) current = { screen: getState().screen, since: Date.now() };
  };
  document.addEventListener('visibilitychange', onVisibility);

  timer = setInterval(() => void flush(), FLUSH_MS);
  return () => { unsub(); document.removeEventListener('click', onClick, true); document.removeEventListener('visibilitychange', onVisibility); clearInterval(timer); };
}
