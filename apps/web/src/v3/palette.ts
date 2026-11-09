import type { Part } from './theme';

// Six ways the whole app can look. Each is a small set of colours: the main one (buttons, the active tab), a lighter one for gradients, a
// bright one for little highlights, the paper everything sits on, a soft grey-warm for fields, a tint for icon tiles, the colour of the
// Talk card, and the top-of-screen colour for each part of the day. Everything else (moods, words, warnings) stays put, so changing the
// colours never changes what anything means. All of them are light: nothing goes dark at night.

export interface Palette {
  id: string; name: string; note: string;
  accent: string; accent2: string; gold: string; bg: string; soft: string; t1: string; hero1: string;
  tints: Record<Part, string>;
}

export const PALETTES: Palette[] = [
  { id: 'dusk', name: 'Indigo Dusk', note: 'Calm and a little grown-up. Deep indigo with warm gold.',
    accent: '#2F2A5E', accent2: '#6F6BB8', gold: '#F2B33D', bg: '#FAF6EF', soft: '#F1EDE6', t1: '#E6E4F5', hero1: '#5B57A6',
    tints: { morning: '#FBE3D0', afternoon: '#DDEBEF', evening: '#F3D8CC', night: '#E8DFF2' } },
  { id: 'teal', name: 'Garden Teal', note: 'Fresh and steady, like the first design. Teal with peach.',
    accent: '#245A52', accent2: '#4F9488', gold: '#F0A860', bg: '#FBF7F0', soft: '#F1EBE0', t1: '#DCEBE6', hero1: '#2F7A6D',
    tints: { morning: '#F9DFCB', afternoon: '#D3E8EA', evening: '#F1D9C6', night: '#DCE7E8' } },
  { id: 'terracotta', name: 'Sunrise Terracotta', note: 'Warm and energising. Clay red with marigold.',
    accent: '#7E3320', accent2: '#C8654A', gold: '#F3B53F', bg: '#FCF6EE', soft: '#F4EAE0', t1: '#FBE4DA', hero1: '#A8442B',
    tints: { morning: '#FBDCC6', afternoon: '#F6E5CF', evening: '#F4CFBB', night: '#EEDDDA' } },
  { id: 'plum', name: 'Rose and Plum', note: 'Soft and caring. Plum with rose and honey.',
    accent: '#552654', accent2: '#A5538F', gold: '#F2AA45', bg: '#FCF6F5', soft: '#F4EAE9', t1: '#F3E1EE', hero1: '#823A78',
    tints: { morning: '#FADCD7', afternoon: '#EFE0EC', evening: '#F1D4DC', night: '#EADFEF' } },
  { id: 'ocean', name: 'Ocean Mist', note: 'Open and quiet. Deep sea blue with coral.',
    accent: '#14405A', accent2: '#3D86A8', gold: '#F28C6B', bg: '#F6F9F9', soft: '#E8EFF0', t1: '#DCEBF3', hero1: '#2A6788',
    tints: { morning: '#DDEEF2', afternoon: '#D3E7F1', evening: '#E6DDEB', night: '#DCE3F0' } },
  { id: 'sage', name: 'Forest Sage', note: 'Grounded and natural. Deep green with saffron.',
    accent: '#254B35', accent2: '#5E8F5B', gold: '#E8B04A', bg: '#F9F7EF', soft: '#EDEEE2', t1: '#E3EFDD', hero1: '#3B7550',
    tints: { morning: '#F3E7CC', afternoon: '#DCEBD9', evening: '#EBDDC6', night: '#DCE6DD' } },
];

export const paletteById = (id: string | null | undefined): Palette => PALETTES.find(p => p.id === id) ?? PALETTES[0];

export const paletteVars = (p: Palette): Record<string, string> => ({ '--accent': p.accent, '--accent2': p.accent2, '--gold': p.gold, '--bg': p.bg, '--soft': p.soft, '--t1': p.t1, '--hero1': p.hero1, '--indigo': p.accent });
