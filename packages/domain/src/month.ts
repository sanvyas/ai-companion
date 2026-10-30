import type { ActKind } from './garden';

// "Month": the third design's way of showing that someone has been looking after themselves. Four weeks, shown a different way
// each month (a song, letters, a future self, a what-works guide). Everything is worked out from what they did; nothing is a
// score to lose. A quiet day is only a quiet day.

export type MonthKind = 'walk' | 'friend' | 'out' | 'sleep' | 'talk' | 'breathe' | 'journal' | 'play' | 'step' | 'show';
export type Feeling = 'anxious' | 'low' | 'tired' | 'lonely' | 'okay';
export type MonthMode = 'song' | 'letters' | 'future' | 'guide';

export const MONTH_MODES: readonly MonthMode[] = ['song', 'letters', 'future', 'guide'];
export const FEELINGS: readonly Feeling[] = ['anxious', 'low', 'tired', 'lonely', 'okay'];
export const FEELING_LABEL: Record<Feeling, string> = { anxious: 'Anxious', low: 'Low', tired: 'Tired', lonely: 'Lonely', okay: 'Okay' };

export const KIND_INFO: Record<MonthKind, { label: string; color: string }> = {
  walk: { label: 'Walked', color: '#3E7F4C' },
  out: { label: 'Went out', color: '#B0557A' },
  friend: { label: 'Called a friend', color: '#B0557A' },
  sleep: { label: 'Rested', color: '#2F6FA3' },
  talk: { label: 'Talked', color: '#B45A3C' },
  breathe: { label: 'Breathed', color: '#8A5F00' },
  journal: { label: 'Journaled', color: '#5B57A6' },
  play: { label: 'Played', color: '#3A7F93' },
  step: { label: 'Tiny step', color: '#3E7F4C' },
  show: { label: 'Showed up', color: '#7A6A52' },
};

/** What each kind of day sounds like in the song: a row of the score and the instrument it is. */
export const SONG_ROWS: { label: string; kinds: MonthKind[]; color: string }[] = [
  { label: 'Beat', kinds: ['walk', 'step', 'show'], color: '#4E9A5C' },
  { label: 'Melody', kinds: ['friend', 'out'], color: '#D9708F' },
  { label: 'Pad', kinds: ['sleep'], color: '#3B8FC0' },
  { label: 'Bass', kinds: ['talk'], color: '#E8896B' },
  { label: 'Bells', kinds: ['breathe'], color: '#C98E12' },
  { label: 'Keys', kinds: ['journal', 'play'], color: '#6F6BB8' },
];

const LYRICS: Record<MonthKind, string[]> = {
  walk: ['I walked until the city felt smaller', 'Two thousand steps and the sky came closer', 'Feet on the road, my head got clear'],
  friend: ['Your voice on the phone and I laughed again', 'Called a friend and the room got warm', 'Someone picked up, and I wasn’t alone'],
  out: ['I went out and let the evening in', 'Other people, chai, a little less alone'],
  sleep: ['Phone face down, I let the night in', 'Rested early, woke up lighter', 'I gave myself a real night’s rest'],
  talk: ['Said it out loud and it weighed less', 'I talked it through, I didn’t hide', 'Words came out and the knot let go'],
  breathe: ['One slow breath and the noise went quiet', 'In for four, and I came back', 'I stopped, I breathed, I stayed'],
  journal: ['Wrote it all down, now it’s outside me', 'Ink on the page, a little more space'],
  play: ['I let myself play for a while', 'Colours and nonsense, and I smiled'],
  step: ['One tiny thing, and it counted', 'Small step, still a step'],
  show: ['I showed up, even on the grey day', 'Not much today, but I was here'],
};

/** A line for a day, from the first thing they did. `turn` moves along the choices, so "rewrite" gives a different one. */
export function lyricFor(kinds: MonthKind[], turn = 0): string {
  if (!kinds.length) return '';
  const k = kinds[turn % kinds.length];
  const L = LYRICS[k] ?? LYRICS.step;
  return L[turn % L.length];
}

const ACT_TO_KIND: Partial<Record<ActKind, MonthKind>> = { walk: 'walk', event: 'out', talk: 'talk', breathe: 'breathe', meditate: 'breathe', sleep: 'sleep', journal: 'journal', plan: 'step', create: 'play' };

/** The kinds of things a day held, from what the app counted and what they told it. A day with only a check-in is a day they showed up. */
export function kindsOfDay(acts: Partial<Record<ActKind, number>>, logged: MonthKind[], hasMood: boolean): MonthKind[] {
  const out: MonthKind[] = [];
  const add = (k: MonthKind) => { if (!out.includes(k)) out.push(k); };
  for (const [a, n] of Object.entries(acts) as [ActKind, number][]) { const k = ACT_TO_KIND[a]; if (k && n > 0) add(k); }
  for (const k of logged) add(k);
  if (!out.length && (hasMood || (acts.checkin ?? 0) > 0)) add('show');
  return out;
}

// ---------------------------------------------------------------------------------------------------- weeks and modes
const DAY = 86_400_000;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Monday of the week a day falls in. */
export const weekStart = (day: string) => { const t = parse(day); const dow = (new Date(t).getUTCDay() + 6) % 7; return fmt(t - dow * DAY); };
export const addDays = (day: string, n: number) => fmt(parse(day) + n * DAY);

export interface MonthWeek { start: string; days: { day: string; future: boolean; today: boolean }[] }
/** The last `n` weeks (Monday to Sunday), the newest being the one `today` is in. */
export function monthWeeks(today: string, n = 4): MonthWeek[] {
  const first = addDays(weekStart(today), -7 * (n - 1));
  return Array.from({ length: n }, (_, w) => {
    const start = addDays(first, w * 7);
    return { start, days: Array.from({ length: 7 }, (_, d) => { const day = addDays(start, d); return { day, future: day > today, today: day === today }; }) };
  });
}

/** Which of the four ways to see the month it is: each month they have been here moves to the next, starting with the song. */
export function modeFor(signedUpDay: string, today: string): MonthMode {
  const [y0, m0] = signedUpDay.split('-').map(Number), [y1, m1] = today.split('-').map(Number);
  const months = Math.max(0, (y1 - y0) * 12 + (m1 - m0));
  return MONTH_MODES[months % 4];
}

// ---------------------------------------------------------------------------------------------------- feelings and what works
/** How they said they were, in the words the what-works guide uses. */
export function feelingOf(mood: number | null, why: string[] = []): Feeling {
  if (mood === null) return 'low';
  if (mood >= 3) return 'okay';
  if (why.includes('Friends') || why.includes('Love') || why.includes('Family')) return mood <= 1 ? 'lonely' : 'tired';
  if (why.includes('Sleep') && mood === 2) return 'tired';
  return mood === 1 ? 'anxious' : mood === 0 ? 'low' : 'tired';
}

export interface HelpRow { feeling: Feeling; kind: MonthKind; helped: boolean }
export interface GuideLine { kind: MonthKind; tried: number; helped: number }
/** What has helped when they felt this way, best first. Needs a few tries to say anything. */
export function guideStats(rows: HelpRow[], feeling: Feeling): GuideLine[] {
  const by = new Map<MonthKind, GuideLine>();
  for (const r of rows) {
    if (r.feeling !== feeling || r.kind === 'show' || r.kind === 'step') continue;
    const g = by.get(r.kind) ?? { kind: r.kind, tried: 0, helped: 0 };
    g.tried++; if (r.helped) g.helped++;
    by.set(r.kind, g);
  }
  return [...by.values()].sort((a, b) => b.helped / b.tried - a.helped / a.tried || b.tried - a.tried);
}

// ---------------------------------------------------------------------------------------------------- future you
export const FUTURE_FULL = 60;
export interface FutureYou { points: number; clarity: number; blur: number; sat: number; op: number; glow: number; message: string }
/** A self a year from now who comes into focus with each small thing. It only ever gets clearer. */
export function futureYou(points: number): FutureYou {
  const f = Math.min(1, points / FUTURE_FULL);
  const message = points < 30 ? 'I can almost see you. Keep going, gently.' : points < 40 ? 'I sleep better now. Thank you for those early nights.' : points < 52 ? 'I have friends here. It started with one call.' : 'Hi. It’s me. You. We made it somewhere good.';
  return { points, clarity: Math.round(f * 100), blur: Math.max(0, +(16 - points * 0.27).toFixed(1)), sat: +(0.3 + f * 0.7).toFixed(2), op: +(0.45 + f * 0.55).toFixed(2), glow: +(0.2 + f * 0.7).toFixed(2), message };
}

// ---------------------------------------------------------------------------------------------------- letters
/** A line for the letter, from what the week held. */
export function letterBody(name: string, kinds: MonthKind[]): string {
  const uniq = [...new Set(kinds)];
  const said = uniq.length ? uniq.map(k => KIND_INFO[k].label.toLowerCase()).join(', ') : 'quiet, and that’s okay';
  return `Dear ${name},\nThis week: ${said}.\n${uniq.includes('show') ? 'Some days you just showed up. That counts the most.\n' : ''}See you next week.`;
}

/** A line Saathi offers to add to today, from something it noticed. Never added without asking. */
export const NOTICED: Record<number, { kind: MonthKind; text: string }> = {
  0: { kind: 'walk', text: 'A Monday walk. Put “A walk” in today’s envelope?' },
  1: { kind: 'friend', text: 'Did you speak to a friend today? Add it?' },
  2: { kind: 'sleep', text: 'Phone down early last night? Add a rested night?' },
  3: { kind: 'breathe', text: 'Did you take a breathing minute today? Add it?' },
  4: { kind: 'talk', text: 'You talked things through with me. Add it?' },
  5: { kind: 'play', text: 'Did you play for a bit to unwind? Add it?' },
  6: { kind: 'walk', text: 'A Sunday walk. Add it?' },
};
export const noticedFor = (day: string) => NOTICED[(new Date(parse(day)).getUTCDay() + 6) % 7];
