import { describe, expect, it } from 'vitest';
import { nextNotes, oneThing, rankByThemes, themesOf, topTheme, weekThemes } from './guidance';

const now = new Date('2026-10-29T10:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('themes', () => {
  it('finds themes in English and Hinglish', () => {
    expect(themesOf('Big meeting tomorrow and I cannot stop thinking about it')).toEqual(expect.arrayContaining(['work']));
    expect(themesOf('Akela feel kar raha hoon, ghar ki yaad')).toEqual(expect.arrayContaining(['lonely', 'family']));
    expect(themesOf('')).toEqual([]);
  });
  it('counts each entry once per theme and only inside the window', () => {
    const c = weekThemes([{ at: ago(1), text: 'work work work deadline' }, { at: ago(2), text: 'meeting' }, { at: ago(9), text: 'office' }], now);
    expect(c.work).toBe(2);
  });
  it('ignores things from the future and treats good things as never the top theme', () => {
    expect(weekThemes([{ at: ago(-3), text: 'work' }], now)).toEqual({});
    expect(topTheme({ joy: 5, tired: 1 })).toBe('tired');
    expect(topTheme({ joy: 3 })).toBeNull();
  });
});

describe('oneThing', () => {
  const none = { themes: {}, night: false, useConversations: true };
  it('waits for a check-in', () => expect(oneThing({ ...none, mood: null })).toBeNull());
  it('gives a heavy day someone to talk to, even late at night or with other themes', () => {
    for (const night of [false, true]) {
      const o = oneThing({ mood: 0, night, themes: { anxious: 4, work: 5 }, useConversations: true });
      expect(o?.id).toBe('voice');
    }
  });
  it('suggests a sleep story late in the evening', () => {
    const o = oneThing({ mood: 3, night: true, themes: { sleep: 2 }, useConversations: true });
    expect(o?.id).toBe('sleep');
    expect(o?.why).toContain('Sleep came up 2 times this week');
  });
  it('turns repeated worry into a paper boat, and says why', () => {
    const o = oneThing({ mood: 3, night: false, themes: { work: 3 }, useConversations: true });
    expect(o).toMatchObject({ id: 'boat' });
    expect(o?.why).toBe('Work came up 3 times this week.');
  });
  it('offers a walk to someone who has felt alone, once is enough', () => {
    expect(oneThing({ mood: 3, night: false, themes: { lonely: 1 }, useConversations: true })?.id).toBe('walk');
  });
  it('uses only today’s mood when conversations are switched off', () => {
    const o = oneThing({ mood: 3, night: false, themes: { work: 5 }, useConversations: false });
    expect(o?.id).toBe('meditate');
    expect(o?.why).toBe('Based on how you feel today.');
  });
  it('keeps a good day for the jar and a flat day for colour', () => {
    expect(oneThing({ ...none, mood: 4 })?.id).toBe('jar');
    expect(oneThing({ ...none, mood: 2 })?.id).toBe('rangoli');
  });
  it('slows a wired day down', () => expect(oneThing({ ...none, mood: 1 })?.id).toBe('breathe'));
});

describe('notes and ranking', () => {
  it('explains each message and stays quiet when check-ins are off', () => {
    expect(nextNotes({}, 'off')).toEqual([]);
    const n = nextNotes({ work: 2 }, 'evening');
    expect(n[0].text).toMatch(/work/i);
    expect(n[0].why).toContain('work came up 2 times this week');
  });
  it('ranks by fit, keeps order for ties, and gives a reason only for fits', () => {
    const items = [{ id: 'a', tags: ['family'] as const }, { id: 'b', tags: ['work'] as const }, { id: 'c', tags: ['sleep'] as const }];
    const r = rankByThemes(items, { work: 2, sleep: 1 }, (k, n) => `${k}:${n}`);
    expect(r.map(x => x.item.id)).toEqual(['b', 'c', 'a']);
    expect(r[0].why).toBe('work:2');
    expect(r[2].why).toBe('');
  });
});
