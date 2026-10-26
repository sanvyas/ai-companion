import { describe, expect, it } from 'vitest';
import { buildRhythms } from './insights';

const days = (n: number, start = 1) => Array.from({ length: n }, (_, i) => `2026-10-${String(start + i).padStart(2, '0')}`);

describe('buildRhythms', () => {
  it('says nothing with fewer than 3 points on either side', () => {
    const moods = days(5).map((day, i) => ({ day, value: i < 2 ? 4 : 1 }));
    expect(buildRhythms(moods, days(2).map(day => ({ day, kind: 'walk' })))).toEqual([]);
  });

  it('reports lighter days after walks when the gap is real', () => {
    const d = days(8);
    const moods = d.map((day, i) => ({ day, value: i < 4 ? 4 : 2 }));
    const wins = d.slice(0, 4).map(day => ({ day, kind: 'walk' }));
    expect(buildRhythms(moods, wins)).toEqual(['Days you step out for a walk tend to be lighter.']);
  });

  it('does not invent a pattern when moods are flat', () => {
    const d = days(8);
    expect(buildRhythms(d.map(day => ({ day, value: 3 })), d.slice(0, 4).map(day => ({ day, kind: 'walk' })))).toEqual([]);
  });

  it('reports the heavier direction gently', () => {
    const d = days(8);
    const moods = d.map((day, i) => ({ day, value: i < 4 ? 1 : 3 }));
    const out = buildRhythms(moods, d.slice(0, 4).map(day => ({ day, kind: 'calm' })));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/calm/);
  });
});
