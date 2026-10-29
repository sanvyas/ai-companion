import type { CSSProperties } from 'react';

// How a day feels, drawn as weather. The five values match the server's mood scale (0 heaviest .. 4 lightest).
export type MoodKey = 'heavy' | 'wired' | 'flat' | 'okay' | 'good';
export interface MoodDef { k: MoodKey; v: 0 | 1 | 2 | 3 | 4; label: string; say: string; wx: 'rain' | 'wind' | 'mist' | 'sun'; c: string }

export const MOODS5: readonly MoodDef[] = [
  { k: 'heavy', v: 0, label: 'Heavy', say: 'That sounds heavy. You came anyway, and that counts.', wx: 'rain', c: '#B8C8EC' },
  { k: 'wired', v: 1, label: 'Wired', say: 'Lots of energy and nowhere to put it. Let’s slow things down together.', wx: 'wind', c: '#F6C9A4' },
  { k: 'flat', v: 2, label: 'Flat', say: 'Flat days are real. A little air can nudge things along.', wx: 'mist', c: '#E3DDC0' },
  { k: 'okay', v: 3, label: 'Okay', say: 'Okay is a good place to build from.', wx: 'sun', c: '#CDE5B0' },
  { k: 'good', v: 4, label: 'Good', say: 'Lovely. Let’s help this feeling last.', wx: 'sun', c: '#FFE49A' },
];
export const moodByValue = (v: number | null | undefined): MoodDef | null => (v === null || v === undefined ? null : MOODS5.find(m => m.v === v) ?? null);

const ART: Record<MoodKey, [string, string, string]> = {
  heavy: ['#9DB2E8', '#5B73BF', '<path d="M12 24a6 6 0 0 1 .8-11.9A8 8 0 0 1 28.4 13 5 5 0 0 1 29 24z" fill="#fff"/><path d="M15 28l-1.5 5M21 28l-1.5 5M27 28l-1.5 5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'],
  wired: ['#F7B58A', '#E2784A', '<path d="M9 16h15a4 4 0 1 0-4-4M9 22h22a4 4 0 1 1-4 4M9 28h9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>'],
  flat: ['#BAC4D4', '#7F8CA6', '<path d="M11 21a5 5 0 0 1 .6-9.9A7 7 0 0 1 26 12a4.5 4.5 0 0 1 .5 9z" fill="#fff"/><path d="M10 27h24M14 32h18" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>'],
  okay: ['#B5DE94', '#5FAE63', '<circle cx="17" cy="17" r="6.5" fill="#FFE58A"/><path d="M17 6v2.5M6 17h2.5M9 9l1.8 1.8M25 9l-1.8 1.8" stroke="#FFE58A" stroke-width="2.2" stroke-linecap="round"/><path d="M15 33a6 6 0 0 1 .5-11.9A8 8 0 0 1 31 22a5 5 0 0 1 .5 11z" fill="#fff"/>'],
  good: ['#FFDE7A', '#F29F1C', '<circle cx="22" cy="22" r="8" fill="#fff"/><path d="M22 6v5M22 33v5M6 22h5M33 22h5M10.7 10.7l3.5 3.5M29.8 29.8l3.5 3.5M33.3 10.7l-3.5 3.5M14.2 29.8l-3.5 3.5" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>'],
};

/** A round weather glyph for one feeling. The artwork is fixed markup written here. */
export function Weather({ k, style }: { k: MoodKey; style?: CSSProperties }) {
  const [a, b, glyph] = ART[k];
  const html = `<defs><linearGradient id="wg-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><circle cx="22" cy="22" r="21" fill="url(#wg-${k})"/><ellipse cx="16" cy="11" rx="9" ry="4.5" fill="#fff" opacity=".22"/>${glyph}`;
  return <svg viewBox="0 0 44 44" aria-hidden="true" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
