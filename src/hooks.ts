import { useEffect, useState } from 'react';
import { timeOfDayFor, type TimeOfDay } from './theme';
import { useStore } from './state/store';

/** Time of day from the device clock (PRD §8: scheduler/UI follow device TZ), unless the demo overrides it. */
export function useTimeOfDay(): TimeOfDay {
  const override = useStore(s => s.todOverride);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return override ?? timeOfDayFor(now);
}

export function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?(am|pm)/i, '');
}

export const todayLong = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
