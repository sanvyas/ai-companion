import { useEffect, useState } from 'react';
import { skyPhase, type SkyPhase } from './island';

/** Morning, day, golden hour or night, from the device clock. Checked each minute. */
export function useSkyPhase(): SkyPhase {
  const [p, setP] = useState<SkyPhase>(() => skyPhase());
  useEffect(() => {
    const id = setInterval(() => setP(skyPhase()), 60_000);
    return () => clearInterval(id);
  }, []);
  return p;
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
}

export const dateLabel = (d: Date = new Date()) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/** A small remembered value that only matters on this device (a last-visit day, a seen letter). Never anything personal. */
export function local(key: string, value?: string): string | null {
  try {
    if (value !== undefined) { localStorage.setItem(key, value); return value; }
    return localStorage.getItem(key);
  } catch { return null; }
}

export function daysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(b) - day(a)) / 86_400_000);
}
