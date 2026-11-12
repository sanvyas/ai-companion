import { describe, expect, it } from 'vitest';
import { NUDGES, dayNumber, nudgeText, nudgesFor, type NudgeId } from './nudge';

const week = (mood: number | null, hour: number) => Array.from({ length: 28 }, (_, day) => nudgesFor({ hour, mood, day })[0]);

describe('what Home offers', () => {
  it('is the same for the same day and answer, and different from one day to the next', () => {
    expect(nudgesFor({ hour: 10, mood: 3, day: 100 })).toEqual(nudgesFor({ hour: 10, mood: 3, day: 100 }));
    expect(nudgesFor({ hour: 10, mood: 3, day: 100 })[0]).not.toBe(nudgesFor({ hour: 10, mood: 3, day: 101 })[0]);
  });
  it('offers each thing once, and asking for something else moves on', () => {
    const all = nudgesFor({ hour: 11, mood: 2, day: 5 });
    expect(new Set(all).size).toBe(all.length);
    expect(nudgesFor({ hour: 11, mood: 2, day: 5, swaps: 1 })[0]).toBe(all[1]);
    expect(new Set(nudgesFor({ hour: 11, mood: 2, day: 5, swaps: 3 })).size).toBe(all.length);
  });
  it('does not lead with talking more than a quarter of the time, for any answer', () => {
    for (const mood of [null, 0, 1, 2, 3, 4]) for (const hour of [9, 14, 19, 22]) {
      const talk = week(mood, hour).filter(x => x === 'talk').length;
      expect(talk / 28, `mood ${mood} at ${hour}`).toBeLessThanOrEqual(0.25);
    }
  });
  it('mixes writing, tasks, stories and calming through the week', () => {
    const seen = new Set<NudgeId>();
    for (const mood of [null, 0, 1, 2, 3, 4]) for (const hour of [9, 14, 19, 22]) for (const x of week(mood, hour)) seen.add(x);
    for (const id of ['write', 'step', 'story', 'breathe', 'calm', 'sit', 'walk'] as NudgeId[]) expect(seen.has(id), id).toBe(true);
  });
  it('keeps stories for the evening and walks for daylight', () => {
    for (const mood of [null, 0, 1, 2, 3, 4]) {
      expect(nudgesFor({ hour: 10, mood, day: 3 })).not.toContain('story');
      expect(nudgesFor({ hour: 23, mood, day: 3 })).not.toContain('walk');
      expect(nudgesFor({ hour: 21, mood, day: 3 })).toContain('story');
    }
  });
  it('starts a heavy day with something gentle and gives every suggestion short words', () => {
    for (const day of [0, 1, 2, 3, 4, 5]) expect(['breathe', 'sit', 'calm', 'talk', 'write', 'story']).toContain(nudgesFor({ hour: 15, mood: 0, day })[0]);
    for (const n of Object.values(NUDGES)) { expect(n.title.split(' ').length).toBeLessThanOrEqual(7); expect(n.sub.split(' ').length).toBeLessThanOrEqual(7); }
  });
  it('turns a clock into a day number that changes at the person’s midnight', () => {
    const a = dayNumber(new Date(2026, 10, 12, 23, 59)), b = dayNumber(new Date(2026, 10, 13, 0, 1));
    expect(b - a).toBe(1);
  });
  it('fits the words to the mood: the chest line is only for a heavy day', () => {
    expect(nudgeText('talk', 0).title).toMatch(/chest/);
    expect(nudgeText('talk', 1).title).toMatch(/chest/);
    for (const mood of [null, 2, 3, 4]) expect(nudgeText('talk', mood).title, `mood ${mood}`).not.toMatch(/chest/);
    expect(nudgeText('talk', 3).title).toBe('Tell me about your day.');
    expect(nudgeText('talk', 4).title).toBe('Share the good news?');
  });
  it('never asks someone who feels fine to write out a heavy day, or someone who feels rough what went well', () => {
    for (const mood of [3, 4]) { const w = nudgeText('write', mood); expect(w.title + w.sub).not.toMatch(/write it out|only you/i); }
    for (const mood of [0, 1]) { const w = nudgeText('write', mood); expect(w.title + w.sub).not.toMatch(/went well|good mood|feeling/i); }
    expect(nudgeText('speak', 4).title).toMatch(/went well/);
  });
  it('keeps every fitted line short, for every suggestion and mood', () => {
    for (const id of Object.keys(NUDGES) as NudgeId[]) for (const mood of [null, 0, 1, 2, 3, 4]) { const n = nudgeText(id, mood); expect(n.title.split(' ').length, `${id} ${mood}`).toBeLessThanOrEqual(8); expect(n.sub.split(' ').length).toBeLessThanOrEqual(7); expect(n.cta.length).toBeGreaterThan(1); }
  });
});
