import { useSyncExternalStore } from 'react';
import { api, type Garden } from '../api';
import { setV2, type PerchKey, type Reward } from './ui';

// The garden is worked out by the server from what the person did. This module keeps the latest copy, works out what is new since
// the last one (so the screen can celebrate it), and refreshes when something the garden counts has just happened.

interface GardenState { garden: Garden | null; /** The latest rangoli they made, shown by the gate. */ creation: string | null; /** Parts of the island that just grew, so they can pop in. */ fresh: string[]; error: boolean }
let state: GardenState = { garden: null, creation: null, fresh: [], error: false };
const listeners = new Set<() => void>();
const set = (p: Partial<GardenState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };

export const getGarden = () => state.garden;
export function useGarden<T>(sel: (s: GardenState) => T): T {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => sel(state), () => sel(state));
}

const GROWS: { key: keyof Garden['counts'] | string; fresh: string; place: PerchKey; line: string }[] = [
  { key: 'checkin', fresh: 'tree', place: 'tree', line: 'Your tree got its water.' },
  { key: 'journal', fresh: 'journal', place: 'journal', line: 'A new flower opened in your bed.' },
  { key: 'talk', fresh: 'talk', place: 'talk', line: 'Your bench by the tree is glowing.' },
  { key: 'breathe', fresh: 'calm', place: 'calm', line: 'A lily opened on the pond.' },
  { key: 'meditate', fresh: 'calm', place: 'calm', line: 'A lily opened on the pond.' },
  { key: 'sleep', fresh: 'sleep', place: 'sleep', line: 'The moon nook lit up.' },
  { key: 'walk', fresh: 'out', place: 'out', line: 'A new stepping stone by the gate.' },
  { key: 'event', fresh: 'out', place: 'out', line: 'A new stepping stone by the gate.' },
  { key: 'plan', fresh: 'tree', place: 'plan', line: 'Something sprouted in the herb bed.' },
  { key: 'create', fresh: 'calm', place: 'calm', line: 'Something you made found a place here.' },
];

/** What changed between two copies of the garden, in the words a person would use. */
export function whatGrew(prev: Garden, next: Garden): { reward: Reward | null; fresh: string[] } {
  const gain = next.sunlight - prev.sunlight;
  const lines: string[] = [];
  const fresh: string[] = [];
  let place: PerchKey | undefined;
  for (const g of GROWS) {
    if ((next.counts[g.key] ?? 0) > (prev.counts[g.key] ?? 0)) {
      if (!lines.includes(g.line)) lines.push(g.line);
      if (!fresh.includes(g.fresh)) fresh.push(g.fresh);
      place ??= g.place;
    }
  }
  if (next.seeds.planted > prev.seeds.planted) { lines.push('A seed was planted in the greenhouse. It will sprout once today is over.'); fresh.push('house'); place = 'house'; }
  if (next.plants.length > prev.plants.length) fresh.push('plant');
  if (next.keepsakes.potSeams !== prev.keepsakes.potSeams || next.keepsakes.pots > prev.keepsakes.pots) fresh.push('pot');
  if (next.today.golden && !prev.today.golden) lines.push('Golden hour: you tended all three parts of today.');
  const levelUp = next.stage > prev.stage ? next.stageName : null;
  if (gain <= 0 && !lines.length && !levelUp) return { reward: null, fresh };
  return { reward: { gain: Math.max(0, gain), lines: lines.length ? lines.slice(0, 3) : ['Your garden grew a little.'], levelUp, place }, fresh };
}

let inflight: Promise<Garden | null> | null = null;
/** Fetch the garden. Unless `quiet`, anything new since the last copy is celebrated. */
export async function loadGarden(opts: { quiet?: boolean } = {}): Promise<Garden | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const next = await api.garden();
      const prev = state.garden;
      if (prev && !opts.quiet) {
        const { reward, fresh } = whatGrew(prev, next);
        set({ garden: next, fresh, error: false });
        if (reward) announce(reward);
        if (fresh.length) setTimeout(() => set({ fresh: [] }), 2600);
      } else set({ garden: next, error: false });
      if (next.rangolis > 0 && (!prev || next.rangolis !== prev.rangolis || !state.creation)) void api.creations().then(c => set({ creation: c[0]?.image ?? null })).catch(() => undefined);
      if (next.rangolis === 0 && state.creation) set({ creation: null });
      return next;
    } catch { set({ error: true }); return state.garden; } finally { inflight = null; }
  })();
  return inflight;
}

/** Use a garden that an action just returned (planting, picking) without a second request. */
export function takeGarden(next: Garden, opts: { celebrate?: boolean } = {}) {
  const prev = state.garden;
  set({ garden: next });
  if (prev && opts.celebrate) {
    const { reward, fresh } = whatGrew(prev, next);
    set({ fresh });
    if (reward) announce(reward);
    if (fresh.length) setTimeout(() => set({ fresh: [] }), 2600);
  }
}

function announce(r: Reward) {
  setV2({ reward: r, birdAt: r.place ?? 'tree', say: r.lines[0] });
  if (r.levelUp) setTimeout(() => setV2({ levelUp: r.levelUp ?? null }), Math.min(7000, r.lines.length * 2800 + 600));
}

let t1: ReturnType<typeof setTimeout> | undefined;
let t2: ReturnType<typeof setTimeout> | undefined;
/** Something the garden counts may just have happened. The server writes are a beat behind the screen, so look twice. */
export function gardenMayHaveChanged() {
  clearTimeout(t1); clearTimeout(t2);
  t1 = setTimeout(() => void loadGarden(), 1100);
  t2 = setTimeout(() => void loadGarden(), 3600);
}

export function resetGarden() { clearTimeout(t1); clearTimeout(t2); inflight = null; set({ garden: null, creation: null, fresh: [], error: false }); }
