import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { paletteById } from './palette';
import { useV3 } from './ui';

// The colour at the top of every screen. It follows the time of day, and when someone says they are having a heavy or flat day it
// leans warmer and brighter, to lift rather than to match. It stays light all through the night (a dark screen at bedtime is worse
// for tired eyes than a soft one) and never moves far from the base paper colour, so the app always looks like itself.

export interface Theme { tint: string; wash: string }

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };

export type Part = 'morning' | 'afternoon' | 'evening' | 'night';
export const partOf = (h: number): Part => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'afternoon' : h >= 16 && h < 20 ? 'evening' : 'night');

export const DEFAULT_TINTS: Record<Part, string> = { morning: '#F9DFCB', afternoon: '#D3E8EA', evening: '#F1D9C6', night: '#DCE7E8' };
/** What each mood leans toward. Heavy and flat days get warmth and light; steady and good days get something fresh. */
const BY_MOOD = ['#FADAB9', '#FBDDBD', '#FBE7C2', '#E8F2DC', '#FCECC6'];
/** How far the mood pulls the colour. The heaviest days pull the most, and never all the way. */
const PULL = [0.62, 0.55, 0.45, 0.35, 0.4];

/** The same idea for the dark palettes: a heavy day glows a little warmer and lighter, never bright. */
const DARK_BY_MOOD = ['#5C406E', '#6D4253', '#40506B', '#2F6058', '#6B5C3A'];

export function themeFor(hour: number, mood: number | null, tints: Record<Part, string> = DEFAULT_TINTS, dark = false): Theme {
  const base = tints[partOf(hour)];
  const tint = mood === null ? base : dark ? mix(base, DARK_BY_MOOD[mood], 0.3) : mix(base, BY_MOOD[mood], PULL[mood]);
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
