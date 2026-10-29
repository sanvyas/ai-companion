import { describe, expect, it } from 'vitest';
import type { Garden } from '../api';
import { whatGrew } from './garden';

const base = (over: Partial<Garden> = {}): Garden => ({
  sunlight: 20, stage: 0, stageName: 'Seedling', nextAt: 60, activeDays: 1, treeLevel: 1,
  counts: { checkin: 1, journal: 0, talk: 0, breathe: 0, meditate: 0, sleep: 0, walk: 0, event: 0, plan: 0, create: 0 },
  today: { checkin: true, body: false, words: false, golden: false, mood: 3 }, flowers: [],
  visitors: { butterflies: 0, bulbul: false, squirrel: false, kingfisher: false }, seeds: { planted: 0, sprouted: 0 }, slots: 2, plants: [],
  tokens: { gold: 0, thread: 0, sky: 0 }, unlocked: { pot: false, thread: false, sky: false }, keepsakes: { potSeams: 0, pots: 0, flags: 0, skies: [] },
  jarCount: 0, boats: 0, rangolis: 0, road: { perActiveDay: 20, current: 0, isles: [] }, ...over,
});

describe('what the garden says grew', () => {
  it('says nothing when nothing changed, so a refresh is never noisy', () => {
    expect(whatGrew(base(), base()).reward).toBeNull();
  });

  it('names what grew in the person’s own terms and how much sunlight it was', () => {
    const next = base({ sunlight: 35, counts: { ...base().counts, journal: 1 } });
    const { reward, fresh } = whatGrew(base(), next);
    expect(reward).toMatchObject({ gain: 15, lines: ['A new flower opened in your bed.'], place: 'journal' });
    expect(fresh).toEqual(['journal']);
  });

  it('keeps it to three gentle lines even after a big moment', () => {
    const counts = { ...base().counts, journal: 1, talk: 1, breathe: 1, sleep: 1, walk: 1 };
    expect(whatGrew(base(), base({ sunlight: 90, counts })).reward?.lines).toHaveLength(3);
  });

  it('celebrates reaching the next stage and a golden day, and a seed in the greenhouse', () => {
    const next = base({ sunlight: 65, stage: 1, stageName: 'Sprout', today: { ...base().today, golden: true }, seeds: { planted: 1, sprouted: 0 } });
    const { reward, fresh } = whatGrew(base(), next);
    expect(reward?.levelUp).toBe('Sprout');
    expect(reward?.lines.join(' ')).toContain('Golden hour');
    expect(fresh).toContain('house');
  });

  it('never reports a loss: less sunlight than before is just a quiet refresh', () => {
    expect(whatGrew(base({ sunlight: 50 }), base({ sunlight: 40 })).reward).toBeNull();
  });
});
