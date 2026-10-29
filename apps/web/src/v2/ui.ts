import { useSyncExternalStore } from 'react';

// State that belongs only to the new design: screens pushed on top of the tabs, the open sheet, the tour, rewards on their way
// to the screen. Everything personal (who you are, what you wrote, what you did) lives in the shared store and on the server.

export type Tab = 'today' | 'journal' | 'talk' | 'calm' | 'you';
export const TABS: readonly Tab[] = ['today', 'journal', 'talk', 'calm', 'you'];

export type PushedId = 'garden' | 'plan' | 'why' | 'letter' | 'convo' | 'page' | 'create-rangoli' | 'create-boat' | 'create-jar' | 'game-pot' | 'game-thread' | 'game-stars' | 'insights' | 'voice-pick';
export interface Pushed { id: PushedId; arg?: string }

export type V2Sheet = { id: 'checkin' } | { id: 'plant'; slot: number | 'auto' } | { id: 'confirm'; title: string; body: string; yes: string; onYes: () => void } | null;

export interface Reward { gain: number; lines: string[]; levelUp?: string | null; place?: PerchKey }
export type PerchKey = 'tree' | 'sleep' | 'calm' | 'journal' | 'talk' | 'plan' | 'out' | 'house' | 'home';

interface V2State {
  stack: Pushed[];
  sheet: V2Sheet;
  tour: number | null;
  tourSeen: boolean;
  reward: Reward | null;
  /** The last step of sign-up: planting the first seed. */
  seed: boolean;
  lastTab: Tab;
  /** Where the bird sits on the island, and what it is saying. */
  birdAt: PerchKey;
  say: string | null;
  levelUp: string | null;
}

const TOUR_KEY = 'saathi.v2.tour';
const seen = (() => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; } })();

let state: V2State = { stack: [], sheet: null, tour: null, tourSeen: seen, reward: null, seed: false, lastTab: 'today', birdAt: 'talk', say: null, levelUp: null };
const listeners = new Set<() => void>();

export const getV2 = () => state;
export function setV2(patch: Partial<V2State> | ((s: V2State) => Partial<V2State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach(l => l());
}
export const subscribeV2 = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useV2<T>(selector: (s: V2State) => T): T {
  return useSyncExternalStore(subscribeV2, () => selector(state), () => selector(state));
}

export const push = (p: Pushed) => setV2(s => (s.stack.some(x => x.id === p.id) ? {} : { stack: [...s.stack, p] }));
export const pop = () => setV2(s => ({ stack: s.stack.slice(0, -1) }));
export const clearStack = () => setV2({ stack: [] });
export const openSheet = (sheet: V2Sheet) => setV2({ sheet });
export const closeSheet = () => setV2({ sheet: null });

export function startTour() { setV2({ tour: 0 }); }
export function endTour() {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* blocked */ }
  setV2({ tour: null, tourSeen: true });
}
