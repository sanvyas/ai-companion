import { describe, expect, it } from 'vitest';
import { partOf, themeFor } from './theme';

const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

describe('the colour of the day', () => {
  it('splits the day into four parts', () => {
    expect([4, 5, 10, 11, 15, 16, 19, 20, 23].map(partOf)).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });
  it('never goes dark in the light palettes, at any hour or mood', () => {
    for (let h = 0; h < 24; h++) for (const m of [null, 0, 1, 2, 3, 4]) expect(lum(themeFor(h, m as number | null).tint)).toBeGreaterThan(0.82);
  });
  it('leans warmer when the day is heavy, without leaving the time of day behind', () => {
    const calm = themeFor(21, null).tint, heavy = themeFor(21, 0).tint;
    const [r1, , b1] = [1, 3, 5].map(i => parseInt(calm.slice(i, i + 2), 16)), [r2, , b2] = [1, 3, 5].map(i => parseInt(heavy.slice(i, i + 2), 16));
    expect(r2 - b2).toBeGreaterThan(r1 - b1);
    expect(heavy).not.toBe(themeFor(9, 0).tint);
  });
  it('changes with the mood and the hour, and the same inputs always give the same colour', () => {
    expect(themeFor(9, 1)).toEqual(themeFor(9, 1));
    expect(themeFor(9, 1).tint).not.toBe(themeFor(9, 4).tint);
  });
});
