import { useSyncExternalStore } from 'react';
import type { MonthMode } from '@saathi/domain';

// State that belongs only to the third design: which of its own screens is open, the sheet and banner, and the choices that
// only change how things are shown. What someone said, wrote or did lives in the shared store and on the server.

export type GameId = 'rangoli' | 'balloon' | 'fruit' | 'room';
export type V3Sheet = { id: 'help' } | { id: 'event'; eventId: string } | { id: 'day'; entryId: string } | null;
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

const SKIP = 'saathi.v3.skip';
const today = () => new Date().toDateString();
export const moodSkipped = () => { try { return localStorage.getItem(SKIP) === today(); } catch { return false; } };
export const skipMood = () => { try { localStorage.setItem(SKIP, today()); } catch { /* blocked */ } };

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
