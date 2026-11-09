import { describe, expect, it } from 'vitest';
import { PALETTES, paletteById } from './palette';
import { themeFor } from './theme';

const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a: string, b: string) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('the colour palettes', () => {
  it('has six, each with its own name and id', () => {
    expect(PALETTES).toHaveLength(6);
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(6);
    expect(new Set(PALETTES.map(p => p.name)).size).toBe(6);
  });
  it('keeps white text readable on the main colour, on the Talk card and on the lighter one', () => {
    for (const p of PALETTES) {
      expect(ratio('#FFFFFF', p.accent), `${p.id} accent`).toBeGreaterThanOrEqual(7);
      expect(ratio('#FFFFFF', p.hero1), `${p.id} talk card`).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#1E2430', p.bg), `${p.id} paper`).toBeGreaterThanOrEqual(12);
    }
  });
  it('stays light at every hour and mood in every palette', () => {
    for (const p of PALETTES) for (let h = 0; h < 24; h += 3) for (const m of [null, 0, 2, 4]) expect(L(themeFor(h, m, p.tints).tint)).toBeGreaterThan(0.6);
  });
  it('falls back to the first palette for anything it does not know', () => {
    expect(paletteById('nope').id).toBe('dusk');
    expect(paletteById(null).id).toBe('dusk');
  });
});
