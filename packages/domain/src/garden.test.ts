import { describe, expect, it } from 'vitest';
import { DAILY_FULL, PICK_BONUS, POINTS, daysTo, stageOf, summariseGarden, treeLevelFor, type DayActs } from './garden';

const day = (d: number, acts: DayActs['acts'], mood: number | null = null): DayActs => ({ day: `2026-10-${String(d).padStart(2, '0')}`, mood, acts });

describe('the garden is worked out from what was done', () => {
  it('starts as a seedling with nothing', () => {
    const g = summariseGarden([]);
    expect(g).toMatchObject({ sunlight: 0, stage: 0, stageName: 'Seedling', nextAt: 60, activeDays: 0, treeLevel: 0 });
  });

  it('gives sunlight for each small thing', () => {
    const g = summariseGarden([day(1, { checkin: 1, journal: 1 })]);
    expect(g.sunlight).toBe(POINTS.checkin + POINTS.journal);
    expect(g.counts.journal).toBe(1);
  });

  it('counts a day with only a mood as a day shown up', () => {
    expect(summariseGarden([day(1, {}, 3)]).activeDays).toBe(1);
  });

  it('adds a bonus when all three parts of a day are tended', () => {
    const g = summariseGarden([day(1, { checkin: 1, breathe: 1, journal: 1 })]);
    expect(g.goldenDays).toBe(1);
    expect(g.sunlight).toBe(POINTS.checkin + POINTS.breathe + POINTS.journal + 10);
  });

  it('does not let a huge day rush the garden: past the daily amount things count half', () => {
    const big = summariseGarden([day(1, { journal: 6 })]);
    expect(big.sunlight).toBeLessThan(6 * POINTS.journal);
    expect(big.sunlight).toBeGreaterThan(DAILY_FULL);
  });

  it('never takes anything away for quiet days', () => {
    const a = summariseGarden([day(1, { journal: 1 }), day(2, { journal: 1 })]);
    const b = summariseGarden([day(1, { journal: 1 }), day(2, {}), day(3, {}), day(4, {}), day(5, { journal: 1 })]);
    expect(b.sunlight).toBe(a.sunlight);
    expect(b.activeDays).toBe(2);
  });

  it('adds sunlight for things picked', () => {
    expect(summariseGarden([], 3).sunlight).toBe(3 * PICK_BONUS);
  });

  it('earns gold on a hard day when they did something other than check in', () => {
    expect(summariseGarden([day(1, { checkin: 1 }, 0)]).goldEarned).toBe(0);
    expect(summariseGarden([day(1, { checkin: 1, walk: 1 }, 0)]).goldEarned).toBe(1);
    expect(summariseGarden([day(1, { checkin: 1, walk: 1 }, 1)]).goldEarned).toBe(1);
    expect(summariseGarden([day(1, { checkin: 1, walk: 1 }, 3)]).goldEarned).toBe(0);
  });

  it('earns a seed only on the heaviest days, a thread per calm session, a sky per sleep story', () => {
    const g = summariseGarden([day(1, { breathe: 2, meditate: 1, sleep: 1 }, 0), day(2, { sleep: 2 }, 3)]);
    expect(g.seeds).toBe(1);
    expect(g.threadsEarned).toBe(3);
    expect(g.skiesEarned).toBe(3);
  });

  it('reaches the stages at the set amounts', () => {
    expect(stageOf(59)).toBe(0);
    expect(stageOf(60)).toBe(1);
    expect(stageOf(250)).toBe(2);
    expect(stageOf(1500)).toBe(4);
  });

  it('grows the tree with days shown up', () => {
    expect([0, 1, 2, 3, 5, 6, 11, 12, 40].map(treeLevelFor)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('estimates days to a goal at their own pace, never promising faster than a gentle pace', () => {
    expect(daysTo(700, 0, 25)).toBe(28);
    expect(daysTo(700, 0, 5)).toBe(59);
    expect(daysTo(100, 200, 25)).toBe(0);
  });
});
