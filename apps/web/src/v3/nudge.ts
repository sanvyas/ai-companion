// What Home offers right now. One thing up front, a few others under it, and never the same one every day: the choice walks
// through a list that suits how they said they feel and the hour, starting somewhere different each day. Talking is one of
// many, not the answer to everything.

export type NudgeId = 'talk' | 'write' | 'speak' | 'step' | 'story' | 'breathe' | 'calm' | 'sit' | 'walk' | 'play';

export interface NudgeText { title: string; sub: string; cta: string; meta: string }

/** Short sentences. `step` gets its words from the person's own list. */
export const NUDGES: Record<NudgeId, NudgeText> = {
  talk: { title: 'Want to get it off your chest?', sub: 'Talk to me about anything.', cta: 'Talk to me', meta: 'Talk' },
  write: { title: 'Three lines about today?', sub: 'Just for you.', cta: 'Write it down', meta: '3 min' },
  speak: { title: 'Say it out loud.', sub: 'I’ll write it down for you.', cta: 'Speak', meta: '2 min' },
  step: { title: 'One tiny step?', sub: 'Small counts.', cta: 'Done it', meta: 'Today' },
  story: { title: 'A story for tonight.', sub: 'Rain on a quiet roof.', cta: 'Listen', meta: '20 min' },
  breathe: { title: 'One minute to breathe.', sub: 'Just follow the circle.', cta: 'Begin', meta: '1 min' },
  calm: { title: 'Calm your mind.', sub: 'Five quiet minutes.', cta: 'Start', meta: '5 min' },
  sit: { title: 'Just sit with me.', sub: 'No talking needed.', cta: 'Sit', meta: 'Quiet' },
  walk: { title: 'A short walk?', sub: 'I’ll come along.', cta: 'Walk with me', meta: '10 min' },
  play: { title: 'A small distraction?', sub: 'Make a rangoli. No rules.', cta: 'Play', meta: 'Game' },
};

/** The ones that suit each answer, in the order they are tried. Heavy days start with something gentle. */
const BY_MOOD: Record<number, NudgeId[]> = {
  0: ['breathe', 'sit', 'talk', 'calm', 'write', 'story'],
  1: ['breathe', 'calm', 'talk', 'write', 'sit', 'story'],
  2: ['step', 'walk', 'write', 'play', 'story', 'talk'],
  3: ['write', 'step', 'walk', 'calm', 'speak', 'talk'],
  4: ['write', 'step', 'speak', 'walk', 'play', 'talk'],
};
const UNKNOWN: NudgeId[] = ['write', 'step', 'breathe', 'walk', 'calm', 'talk'];

export const isNight = (hour: number) => hour >= 20 || hour < 5;

/**
 * All the suggestions for now, best first. `day` is a whole number that changes each day and `swaps` how many times they asked for
 * something else. Stories wait for the evening, walks for daylight. At night the quiet ones come first.
 */
export function nudgesFor(o: { hour: number; mood: number | null; day: number; swaps?: number }): NudgeId[] {
  const pool = [...(o.mood === null ? UNKNOWN : BY_MOOD[o.mood])];
  const night = isNight(o.hour);
  const evening = o.hour >= 17 || o.hour < 5;
  const ok = pool.filter(id => (id !== 'story' || evening) && (id !== 'walk' || (o.hour >= 6 && o.hour < 19)));
  // Evenings and nights: a story or a quiet sit belongs near the top, whatever the mood.
  if (night) for (const id of (['sit', 'story'] as NudgeId[]).reverse()) { const i = ok.indexOf(id); if (i > 0) ok.unshift(...ok.splice(i, 1)); else if (i < 0 && id === 'story') ok.unshift('story'); }
  const n = ok.length;
  const start = (((o.day + (o.swaps ?? 0)) % n) + n) % n;
  return [...ok.slice(start), ...ok.slice(0, start)];
}

/** A whole number for the calendar day on the person's own clock. */
export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
