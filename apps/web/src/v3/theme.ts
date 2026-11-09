import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

// The colour at the top of every screen. It follows the time of day, and when someone says they are having a heavy or flat day it
// leans warmer and brighter, to lift rather than to match. It stays light all through the night (a dark screen at bedtime is worse
// for tired eyes than a soft one) and never moves far from the base paper colour, so the app always looks like itself.

export interface Theme { tint: string; wash: string }

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };

export type Part = 'morning' | 'afternoon' | 'evening' | 'night';
export const partOf = (h: number): Part => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'afternoon' : h >= 16 && h < 20 ? 'evening' : 'night');

const BY_PART: Record<Part, string> = { morning: '#FBE3D0', afternoon: '#DDEBEF', evening: '#F3D8CC', night: '#E8DFF2' };
/** What each mood leans toward. Heavy and flat days get warmth and light; steady and good days get something fresh. */
const BY_MOOD = ['#FADAB9', '#FBDDBD', '#FBE7C2', '#E8F2DC', '#FCECC6'];
/** How far the mood pulls the colour. The heaviest days pull the most, and never all the way. */
const PULL = [0.62, 0.55, 0.45, 0.35, 0.4];

export function themeFor(hour: number, mood: number | null): Theme {
  const base = BY_PART[partOf(hour)];
  const tint = mood === null ? base : mix(base, BY_MOOD[mood], PULL[mood]);
  return { tint, wash: mix(tint, '#FFFFFF', 0.45) };
}

/** The theme for right now, kept current while the app stays open. */
export function useTheme(): Theme {
  const mood = useStore(x => x.mood);
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 60_000); return () => clearInterval(id); }, []);
  return themeFor(hour, mood);
}
