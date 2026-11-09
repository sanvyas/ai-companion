import { useSyncExternalStore } from 'react';
import type { MonthMode } from '@saathi/domain';

// State that belongs only to the third design: which of its own screens is open, the sheet and banner, and the choices that
// only change how things are shown. What someone said, wrote or did lives in the shared store and on the server.

export type GameId = 'rangoli' | 'balloon' | 'fruit' | 'room';
export type V3Sheet = { id: 'help' } | { id: 'inbox' } | { id: 'event'; eventId: string } | { id: 'day'; entryId: string } | null;
export interface Banner { text: string; go: 'checkin' | 'breathe' | 'event' | 'story'; eventId?: string }
export type Feel = 'All' | 'Calm down' | 'Sleep' | 'Lift me up' | 'Focus';

interface V3State {
  /** Screens of its own that open over the tabs: the check-in, what it is about, a game. */
  over: 'mood' | 'why' | 'game' | 'language' | null;
  why: string[];
  sheet: V3Sheet;
  banner: Banner | null;
  bannerShown: boolean;
  game: GameId | null;
  feel: Feel;
  /** Month: which of the four ways to see it is open (the one for this month, unless they look at another). */
  view: MonthMode | null;
  /** Journal: today, or the book. */
  jtab: 'today' | 'book';
  /** Where "back" goes from a screen that was opened from elsewhere. */
  from: string | null;
}

// When to ask how they are: on opening the app after a few hours away, and not again until the next time. Answering and skipping
// count the same, so nobody is asked twice in a sitting and nobody is nagged. All of it stays on the phone.
const ASKED = 'saathi.v3.asked';
const LAST = 'saathi.v3.last';
export const GAP_MS = 3 * 3_600_000;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
export const shouldAskMood = (now = Date.now()) => { const at = Number(read(ASKED)); return !at || now - at >= GAP_MS; };
export const markAsked = (now = Date.now()) => write(ASKED, String(now));
export const rememberMood = (mood: number, now = Date.now()) => write(LAST, JSON.stringify({ mood, at: now }));
export function lastMood(): { mood: number; at: number } | null {
  try { const v = JSON.parse(read(LAST) ?? 'null'); return v && typeof v.mood === 'number' && typeof v.at === 'number' ? v : null; } catch { return null; }
}
/** "earlier today", "yesterday evening": when something was, in the words a friend would use. */
export function whenWords(at: number, now = new Date()): string {
  const d = new Date(at), days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  const h = d.getHours(), part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return days <= 0 ? 'earlier today' : days === 1 ? `yesterday ${part}` : `${days} days ago`;
}

let state: V3State = { over: null, why: [], sheet: null, banner: null, bannerShown: false, game: null, feel: 'All', view: null, jtab: 'today', from: null };
const listeners = new Set<() => void>();

export const getV3 = () => state;
export function setV3(patch: Partial<V3State> | ((s: V3State) => Partial<V3State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach(l => l());
}
export const subscribeV3 = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useV3<T>(selector: (s: V3State) => T): T {
  return useSyncExternalStore(subscribeV3, () => selector(state), () => selector(state));
}

export const openHelp = () => setV3({ sheet: { id: 'help' } });
export const closeSheet = () => setV3({ sheet: null });
