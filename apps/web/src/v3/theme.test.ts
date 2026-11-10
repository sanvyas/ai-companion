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
  it('does not change with the mood: the chosen palette stays itself on a rough day and a great one', () => {
    for (const h of [3, 9, 13, 18, 22]) for (const m of [0, 1, 2, 3, 4]) expect(themeFor(h, m)).toEqual(themeFor(h, null));
    for (const m of [0, 4]) expect(themeFor(9, m, undefined, true)).toEqual(themeFor(9, null, undefined, true));
  });
  it('still follows the time of day, and the same inputs always give the same colour', () => {
    expect(themeFor(9, 1)).toEqual(themeFor(9, 1));
    expect(themeFor(9, 1).tint).not.toBe(themeFor(13, 1).tint);
  });
});
