import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { paletteById } from './palette';
import { useV3 } from './ui';

// The colour at the top of every screen. It follows the time of day inside the chosen palette and does not change with mood, so
// the app always looks like itself. It stays light all through the night in the light palettes (a dark screen at bedtime is worse
// for tired eyes than a soft one).

export interface Theme { tint: string; wash: string }

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };

export type Part = 'morning' | 'afternoon' | 'evening' | 'night';
export const partOf = (h: number): Part => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'afternoon' : h >= 16 && h < 20 ? 'evening' : 'night');

export const DEFAULT_TINTS: Record<Part, string> = { morning: '#F9DFCB', afternoon: '#D3E8EA', evening: '#F1D9C6', night: '#DCE7E8' };
/**
 * The colours are the chosen palette's, whatever the mood: Garden Teal stays Garden Teal on a rough day. Only the time of day
 * moves the tint. (The mood is still shown, as weather, and still shapes what Flint suggests and says.)
 */
export function themeFor(hour: number, _mood: number | null, tints: Record<Part, string> = DEFAULT_TINTS, dark = false): Theme {
  const tint = tints[partOf(hour)];
  return { tint, wash: dark ? mix(tint, '#000000', 0.2) : mix(tint, '#FFFFFF', 0.45) };
}

/** The theme for right now, kept current while the app stays open. */
export function useTheme(): Theme {
  const mood = useStore(x => x.mood);
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 60_000); return () => clearInterval(id); }, []);
  const pal = useV3(x => x.palette);
  const p = paletteById(pal);
  return themeFor(hour, mood, p.tints, !!p.dark);
}
