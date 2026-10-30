import { useSyncExternalStore } from 'react';
import { api, type MonthT } from '../api';

// The last four weeks, kept where every screen can read them. Refreshed when something that adds to them has just happened.
let data: MonthT | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const getMonthData = () => data;
export function useMonthData(): MonthT | null {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => data, () => data);
}
export function loadMonthData(): Promise<void> {
  inflight ??= api.month().then(m => { data = m; emit(); }).catch(() => undefined).finally(() => { inflight = null; });
  return inflight;
}
export function resetMonthData() { data = null; emit(); }
