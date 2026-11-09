import type { Part } from './theme';

// Thirteen ways the whole app can look: nine light (some with a colour wash across the page), and three dark for people who like it
// that way. A palette is a handful of colours: the main one (buttons, the active tab) and the readable version of it for text, a lighter
// one for gradients, a bright one for highlights, the paper and the card on it, the ink and the quieter ink, a line and a field colour, the
// tint of icon tiles, the Talk card, and the colour at the top of each part of the day. Moods, warnings and words never change, so the
// colours never change what anything means. Every pair that carries text is tested for contrast.

export interface Palette {
  id: string; name: string; note: string; dark?: boolean;
  accent: string; accentInk: string; accent2: string; gold: string;
  bg: string; bg2: string; card: string; soft: string; line: string; ink: string; muted: string; t1: string; hero1: string;
  tints: Record<Part, string>;
  /** Where the page colour goes after the top tint: the middle and the end of a wash. Without it the tint fades into the paper. */
  wash?: [string, string];
}

const LIGHT = { card: '#FFFFFF', ink: '#1E2430', muted: '#5C6472' };

export const PALETTES: Palette[] = [
  { id: 'dusk', name: 'Indigo Dusk', note: 'Calm and a little grown-up. Deep indigo with warm gold.', ...LIGHT,
    accent: '#2F2A5E', accentInk: '#2F2A5E', accent2: '#6F6BB8', gold: '#F2B33D', bg: '#FAF6EF', bg2: '#F4EEE3', soft: '#F1EDE6', line: '#E5DED2', t1: '#E6E4F5', hero1: '#5B57A6',
    tints: { morning: '#FBE3D0', afternoon: '#DDEBEF', evening: '#F3D8CC', night: '#E8DFF2' } },
  { id: 'teal', name: 'Garden Teal', note: 'Fresh and steady, like the first design. Teal with peach.', ...LIGHT,
    accent: '#245A52', accentInk: '#245A52', accent2: '#4F9488', gold: '#F0A860', bg: '#FBF7F0', bg2: '#F1EBE0', soft: '#F1EBE0', line: '#E3DCCD', t1: '#DCEBE6', hero1: '#2F7A6D',
    tints: { morning: '#F9DFCB', afternoon: '#D3E8EA', evening: '#F1D9C6', night: '#DCE7E8' } },
  { id: 'terracotta', name: 'Sunrise Terracotta', note: 'Warm and energising. Clay red with marigold.', ...LIGHT,
    accent: '#7E3320', accentInk: '#7E3320', accent2: '#C8654A', gold: '#F3B53F', bg: '#FCF6EE', bg2: '#F6ECE0', soft: '#F4EAE0', line: '#EADBCB', t1: '#FBE4DA', hero1: '#A8442B',
    tints: { morning: '#FBDCC6', afternoon: '#F6E5CF', evening: '#F4CFBB', night: '#EEDDDA' } },
  { id: 'plum', name: 'Rose and Plum', note: 'Soft and caring. Plum with rose and honey.', ...LIGHT,
    accent: '#552654', accentInk: '#552654', accent2: '#A5538F', gold: '#F2AA45', bg: '#FCF6F5', bg2: '#F6ECEB', soft: '#F4EAE9', line: '#EBDAD9', t1: '#F3E1EE', hero1: '#823A78',
    tints: { morning: '#FADCD7', afternoon: '#EFE0EC', evening: '#F1D4DC', night: '#EADFEF' } },
  { id: 'ocean', name: 'Ocean Mist', note: 'Open and quiet. Deep sea blue with coral.', ...LIGHT,
    accent: '#14405A', accentInk: '#14405A', accent2: '#3D86A8', gold: '#F28C6B', bg: '#F6F9F9', bg2: '#EAF1F2', soft: '#E8EFF0', line: '#D6E2E4', t1: '#DCEBF3', hero1: '#2A6788',
    tints: { morning: '#DDEEF2', afternoon: '#D3E7F1', evening: '#E6DDEB', night: '#DCE3F0' } },
  { id: 'sage', name: 'Forest Sage', note: 'Grounded and natural. Deep green with saffron.', ...LIGHT,
    accent: '#254B35', accentInk: '#254B35', accent2: '#5E8F5B', gold: '#E8B04A', bg: '#F9F7EF', bg2: '#F0EFE2', soft: '#EDEEE2', line: '#DEDFCF', t1: '#E3EFDD', hero1: '#3B7550',
    tints: { morning: '#F3E7CC', afternoon: '#DCEBD9', evening: '#EBDDC6', night: '#DCE6DD' } },
  { id: 'sorbet', name: 'Peach Sorbet', note: 'Sweet and bright. A wash of peach, pink and lilac.', ...LIGHT,
    accent: '#7E2552', accentInk: '#7E2552', accent2: '#D9628C', gold: '#FFB347', bg: '#FFF4F0', bg2: '#FFEEE8', soft: '#F7E6E4', line: '#F0D9D6', t1: '#FBE0E8', hero1: '#B03A6E',
    tints: { morning: '#FFD9C7', afternoon: '#FFE3C9', evening: '#FBC9CF', night: '#E5CFF2' }, wash: ['#F9CFD8', '#DDD0F7'] },
  { id: 'sky', name: 'Lavender Sky', note: 'Light and dreamy. Lilac melting into sky blue.', ...LIGHT,
    accent: '#32388F', accentInk: '#32388F', accent2: '#6F7DE8', gold: '#FFAE6B', bg: '#F4F5FF', bg2: '#EAECFB', soft: '#ECEEFA', line: '#DADFF2', t1: '#E1E5FD', hero1: '#4A52B8',
    tints: { morning: '#E5DDFB', afternoon: '#D3E3FA', evening: '#E7D6F5', night: '#D9D6F2' }, wash: ['#D8DEFB', '#CDEBF5'] },
  { id: 'mango', name: 'Mango Lassi', note: 'Sunny and friendly. Cream, mango and a touch of coral.', ...LIGHT,
    accent: '#7A3E00', accentInk: '#7A3E00', accent2: '#E0912B', gold: '#F26B3A', bg: '#FFFAEC', bg2: '#FFF3D8', soft: '#FBF0D8', line: '#F0E3C4', t1: '#FFEFC9', hero1: '#B2560E',
    tints: { morning: '#FFE9B8', afternoon: '#FFF0C9', evening: '#FFD5B5', night: '#F6DDCB' }, wash: ['#FFE2A8', '#FFD0B5'] },
  { id: 'aurora', name: 'Mint Aurora', note: 'Cool and fresh. Mint, aqua and a hint of lilac.', ...LIGHT,
    accent: '#14565C', accentInk: '#14565C', accent2: '#2FA39A', gold: '#FF9A76', bg: '#F2FBF8', bg2: '#E6F6F1', soft: '#E5F4F0', line: '#D2E8E2', t1: '#D8F2EC', hero1: '#1F7A78',
    tints: { morning: '#D5F3E6', afternoon: '#C9EAF2', evening: '#DCD4F3', night: '#CDE0EE' }, wash: ['#BFEBE2', '#D6D2F7'] },
  { id: 'midnight', name: 'Midnight Indigo', note: 'Dark and cosy for late evenings. Deep navy with violet.', dark: true,
    accent: '#6455E0', accentInk: '#CFC9FF', accent2: '#8C80F5', gold: '#F2B33D', bg: '#14142B', bg2: '#1B1B38', card: '#232345', soft: '#2C2C52', line: '#363660', ink: '#F3F0FF', muted: '#B9B7D8', t1: '#33335E', hero1: '#5446C8',
    tints: { morning: '#2A2850', afternoon: '#22294F', evening: '#33284F', night: '#1C1B3E' } },
  { id: 'forest', name: 'Deep Forest', note: 'Dark and grounded. Evergreen with soft mint.', dark: true,
    accent: '#277A59', accentInk: '#A6E8CC', accent2: '#49A67F', gold: '#E9B44C', bg: '#0F1F1A', bg2: '#152A23', card: '#1B3129', soft: '#244237', line: '#2E5144', ink: '#EEF8F2', muted: '#B3CFC2', t1: '#27473B', hero1: '#2A7F5E',
    tints: { morning: '#1E3B30', afternoon: '#1A3A38', evening: '#2C3A2C', night: '#14291F' } },
  { id: 'ember', name: 'Ember Night', note: 'Dark and warm, like a lamp. Charcoal with copper.', dark: true,
    accent: '#A94A27', accentInk: '#FFBFA0', accent2: '#E0814F', gold: '#F2B33D', bg: '#1F1715', bg2: '#271D1A', card: '#2E2320', soft: '#3A2D29', line: '#4A3A34', ink: '#FBF1EA', muted: '#D2BFB5', t1: '#42322B', hero1: '#A5472A',
    tints: { morning: '#3B2822', afternoon: '#36292A', evening: '#432A25', night: '#291D1D' } },
];

export const paletteById = (id: string | null | undefined): Palette => PALETTES.find(p => p.id === id) ?? PALETTES[0];

/** The page behind a screen: the time-of-day tint at the top, then either a wash to a second and third colour, or a fade into the paper. */
export const pageOf = (p: Palette, tint: string) => (p.wash ? `linear-gradient(172deg,${tint} 0%,${p.wash[0]} 52%,${p.wash[1]} 100%)` : `linear-gradient(180deg,${tint} 0px,${p.bg} 440px)`);

export const paletteVars = (p: Palette): Record<string, string> => ({
  '--accent': p.accent, '--accent-ink': p.accentInk, '--accent2': p.accent2, '--gold': p.gold, '--bg': p.bg, '--bg2': p.bg2, '--card': p.card, '--soft': p.soft, '--line': p.line,
  '--ink': p.ink, '--muted': p.muted, '--help': p.dark ? '#FFB9A3' : '#9A3B1E', '--t1': p.t1, '--hero1': p.hero1, '--indigo': p.accent, colorScheme: p.dark ? 'dark' : 'light',
});
