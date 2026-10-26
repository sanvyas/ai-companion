// Plain-sentence rhythms for Insights (PRD 6.6): only patterns with at least 3 data points on each side,
// never scores, never anything that reads as a streak or a grade.

export interface DayMood { day: string; value: number }
export interface DayWin { day: string; kind: string }

const MIN_POINTS = 3;
const MIN_GAP = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const PATTERNS: { kind: string; lighter: string; heavier: string }[] = [
  { kind: 'walk', lighter: 'Days you step out for a walk tend to be lighter.', heavier: 'Walks and heavier days have gone together lately. Gentle is fine.' },
  { kind: 'calm', lighter: 'Days with a calm session tend to be lighter.', heavier: 'You often reach for calm on heavier days. That seems wise.' },
  { kind: 'event', lighter: 'Days you go to something with other people tend to be lighter.', heavier: 'Going out with others has been hard on some days. No pressure.' },
  { kind: 'checkin', lighter: 'Days you check in tend to be lighter.', heavier: 'You check in more on heavier days. Good to have somewhere to put it.' },
];

export function buildRhythms(moods: DayMood[], wins: DayWin[]): string[] {
  const out: string[] = [];
  const byDay = new Map(moods.map(m => [m.day, m.value]));
  for (const p of PATTERNS) {
    const winDays = new Set(wins.filter(w => w.kind === p.kind).map(w => w.day));
    const withIt: number[] = [];
    const without: number[] = [];
    for (const [day, v] of byDay) (winDays.has(day) ? withIt : without).push(v);
    if (withIt.length < MIN_POINTS || without.length < MIN_POINTS) continue;
    const gap = mean(withIt) - mean(without);
    if (gap >= MIN_GAP) out.push(p.lighter);
    else if (gap <= -MIN_GAP) out.push(p.heavier);
  }
  return out;
}
