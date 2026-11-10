import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, PALETTES, paletteById } from './palette';
import { themeFor } from './theme';

const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a: string, b: string) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('the colour palettes', () => {
  it('has at least ten, each with its own name and id', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(PALETTES.length);
    expect(new Set(PALETTES.map(p => p.name)).size).toBe(PALETTES.length);
  });
  it('keeps every pair that carries words readable', () => {
    for (const p of PALETTES) {
      expect(ratio('#FFFFFF', p.accent), `${p.id} white on main`).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#FFFFFF', p.hero1), `${p.id} white on Talk card`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.accentInk, p.bg), `${p.id} main as text on paper`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.accentInk, p.card), `${p.id} main as text on card`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.ink, p.bg), `${p.id} ink on paper`).toBeGreaterThanOrEqual(10);
      expect(ratio(p.ink, p.card), `${p.id} ink on card`).toBeGreaterThanOrEqual(10);
      expect(ratio(p.muted, p.bg), `${p.id} quiet ink on paper`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.muted, p.card), `${p.id} quiet ink on card`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.muted, p.soft), `${p.id} quiet ink on fields`).toBeGreaterThanOrEqual(4.5);
      for (const t of Object.values(p.tints)) expect(ratio(p.ink, t), `${p.id} ink on its top tint`).toBeGreaterThanOrEqual(7);
      if (p.wash) for (const w of p.wash) expect(ratio(p.ink, w), `${p.id} ink on its wash`).toBeGreaterThanOrEqual(7);
    }
  });
  it('has dark ones and light ones, and the top tint matches', () => {
    expect(PALETTES.some(p => p.dark)).toBe(true);
    for (const p of PALETTES) for (let h = 0; h < 24; h += 3) for (const m of [null, 0, 2, 4]) {
      const l = L(themeFor(h, m, p.tints, !!p.dark).tint);
      if (p.dark) expect(l, `${p.id} ${h} ${m}`).toBeLessThan(0.15); else expect(l, `${p.id} ${h} ${m}`).toBeGreaterThan(0.45);
    }
  });
  it('is Garden Teal until someone chooses, and for anything it does not know', () => {
    expect(DEFAULT_PALETTE).toBe('teal');
    expect(paletteById('nope').id).toBe('teal');
    expect(paletteById(null).id).toBe('teal');
    expect(paletteById('midnight').id).toBe('midnight');
  });
});

describe('the colours someone sees on a device that tried others earlier', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  it('shows Garden Teal even if an older build saved another colour, and keeps a colour chosen afterwards', async () => {
    localStorage.setItem('saathi.v3.palette', 'dusk'); // what an earlier default left behind
    const ui = await import('./ui');
    expect(ui.getV3().palette).toBe('teal');
    ui.setPalette('plum');
    vi.resetModules();
    expect((await import('./ui')).getV3().palette).toBe('plum');
  });
});
