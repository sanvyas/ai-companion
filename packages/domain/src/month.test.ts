import { describe, expect, it } from 'vitest';
import { feelingOf, futureYou, guideStats, kindsOfDay, letterBody, lyricFor, modeFor, monthWeeks, noticedFor, weekStart, type HelpRow } from './month';

describe('kindsOfDay', () => {
  it('turns what the app counted into the kinds of a day', () => {
    expect(kindsOfDay({ walk: 2, breathe: 1, meditate: 1, plan: 3, create: 1 }, [], true)).toEqual(['walk', 'breathe', 'step', 'play']);
    expect(kindsOfDay({ event: 1, sleep: 1 }, [], false)).toEqual(['out', 'sleep']);
  });
  it('adds what they said themselves, once', () => {
    expect(kindsOfDay({ talk: 1 }, ['friend', 'talk'], false)).toEqual(['talk', 'friend']);
  });
  it('calls a day with only a check-in a day they showed up, and an empty day nothing', () => {
    expect(kindsOfDay({ checkin: 1 }, [], true)).toEqual(['show']);
    expect(kindsOfDay({}, [], true)).toEqual(['show']);
    expect(kindsOfDay({}, [], false)).toEqual([]);
  });
});

describe('weeks', () => {
  it('starts on a Monday and covers four weeks ending with this one', () => {
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    const w = monthWeeks('2026-10-29');
    expect(w.map(x => x.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(w[3].days.map(d => d.today)).toEqual([false, false, false, true, false, false, false]);
    expect(w[3].days.map(d => d.future)).toEqual([false, false, false, false, true, true, true]);
    expect(w[0].days[0].future).toBe(false);
  });
  it('crosses a month and a year without losing a day', () => {
    const w = monthWeeks('2027-01-03');
    expect(w[3].start).toBe('2026-12-28');
    expect(w[3].days[6].day).toBe('2027-01-03');
  });
});

describe('modeFor', () => {
  it('moves to the next way of seeing the month each month, and starts over after four', () => {
    expect(modeFor('2026-10-02', '2026-10-29')).toBe('song');
    expect(modeFor('2026-10-02', '2026-11-01')).toBe('letters');
    expect(modeFor('2026-10-02', '2026-12-15')).toBe('future');
    expect(modeFor('2026-10-02', '2027-01-04')).toBe('guide');
    expect(modeFor('2026-10-02', '2027-02-01')).toBe('song');
  });
});

describe('feelingOf', () => {
  it('names how they said they were', () => {
    expect(feelingOf(4)).toBe('okay');
    expect(feelingOf(3, ['Work'])).toBe('okay');
    expect(feelingOf(1, ['Work'])).toBe('anxious');
    expect(feelingOf(0, ['Work'])).toBe('low');
    expect(feelingOf(2, ['Sleep'])).toBe('tired');
    expect(feelingOf(0, ['Friends'])).toBe('lonely');
    expect(feelingOf(null)).toBe('low');
  });
});

describe('guideStats', () => {
  const rows: HelpRow[] = [
    { feeling: 'anxious', kind: 'breathe', helped: true }, { feeling: 'anxious', kind: 'breathe', helped: true }, { feeling: 'anxious', kind: 'walk', helped: false },
    { feeling: 'anxious', kind: 'talk', helped: true }, { feeling: 'anxious', kind: 'show', helped: true }, { feeling: 'low', kind: 'friend', helped: true },
  ];
  it('ranks what helped when they felt this way, by how often', () => {
    expect(guideStats(rows, 'anxious')).toEqual([{ kind: 'breathe', tried: 2, helped: 2 }, { kind: 'talk', tried: 1, helped: 1 }, { kind: 'walk', tried: 1, helped: 0 }]);
    expect(guideStats(rows, 'tired')).toEqual([]);
  });
});

describe('futureYou', () => {
  it('only ever gets clearer', () => {
    let last = futureYou(0);
    for (let p = 1; p <= 70; p++) { const f = futureYou(p); expect(f.clarity).toBeGreaterThanOrEqual(last.clarity); expect(f.blur).toBeLessThanOrEqual(last.blur); expect(f.sat).toBeGreaterThanOrEqual(last.sat); last = f; }
    expect(futureYou(0).clarity).toBe(0);
    expect(futureYou(60).clarity).toBe(100);
    expect(futureYou(100).clarity).toBe(100);
    expect(futureYou(10).message).toMatch(/almost see you/);
    expect(futureYou(55).message).toMatch(/We made it/);
  });
});

describe('words', () => {
  it('writes a lyric from what a day held, and nothing for a quiet day', () => {
    expect(lyricFor([], 0)).toBe('');
    expect(lyricFor(['walk'], 0)).toBe('I walked until the city felt smaller');
    expect(lyricFor(['walk'], 1)).not.toBe(lyricFor(['walk'], 0));
  });
  it('writes the letter from the week, kindly when it was quiet', () => {
    expect(letterBody('Aarav', [])).toContain('quiet, and that’s okay');
    expect(letterBody('Aarav', ['walk', 'walk', 'show'])).toMatch(/walked, showed up\.\nSome days you just showed up/);
    expect(letterBody('Aarav', ['walk'])).toMatch(/^Dear Aarav,/);
  });
  it('offers something to add that fits the day of the week', () => {
    expect(noticedFor('2026-10-26').kind).toBe('walk');
    expect(noticedFor('2026-10-27').kind).toBe('friend');
    expect(noticedFor('2026-11-01').kind).toBe('walk');
  });
});
