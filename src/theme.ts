// Visual tokens from PRD §3.4 and the v2 prototype.
export const C = {
  paper: '#FBF7F0',
  ink: '#2A2E45',
  muted: '#5E6379',
  teal: '#3F7A70',
  tealSoft: '#DCEBE6',
  tealDark: '#2A5A52',
  tealLine: '#C9DCD6',
  sand: '#F3ECE1',
  sandDark: '#EDE4D6',
  peach: '#FBE3CF',
  peachDeep: '#F8D3B4',
  lavender: '#E6E2F6',
  lavenderDeep: '#D6D3EE',
  sky: '#CFE3F0',
  white: '#FFFFFF',
  amber: '#FFF1D6',
  amberLine: '#E8A93A',
  amberInk: '#5C3F0C',
  amberText: '#5E4A26',
  night: '#232C4B',
  nightDeep: '#12182B',
  nightMid: '#5A5493',
  moonText: '#EDEBF5',
  moonMuted: '#A9AEC8',
  moonSoft: '#C9CCE0',
  track: '#D8D1C5',
  chevron: '#A9AEC8',
  rule: '#F3ECE1',
  page: '#E9E2D6',
} as const;

export const serif = "'Newsreader', Georgia, serif";

export const shadow = {
  card: '0 12px 32px rgba(42,46,69,.06)',
  cardSoft: '0 12px 32px rgba(42,46,69,.05)',
  lift: '0 10px 28px rgba(42,46,69,.06)',
  primary: '0 10px 24px rgba(63,122,112,.25)',
  seg: '0 2px 8px rgba(42,46,69,.08)',
} as const;

export const ring = '0 0 0 3px #FBF7F0, 0 0 0 5px #3F7A70';

// Mood scale 0..4. Shape AND colour, never colour alone (PRD §3.2).
export const MOODS = [
  { label: 'A heavy day', color: '#5A5493', radius: '58% 42% 46% 54% / 52% 58% 42% 48%' },
  { label: 'A heavier day', color: '#8C86C9', radius: '50% 50% 42% 58% / 46% 54% 46% 54%' },
  { label: 'Somewhere in between', color: '#B7B1E6', radius: '50%' },
  { label: 'An okay day', color: '#9FCFC3', radius: '44% 56% 52% 48% / 56% 44% 56% 44%' },
  { label: 'A lighter day', color: '#F1C79B', radius: '62% 38% 54% 46% / 48% 60% 40% 52%' },
] as const;

export const BLOBS = [
  '50%',
  '58% 42% 55% 45% / 50% 58% 42% 50%',
  '44% 56% 48% 52% / 56% 44% 56% 44%',
  '62% 38% 54% 46% / 48% 60% 40% 52%',
];

export type TimeOfDay = 'dawn' | 'day' | 'evening';

export const TOD: Record<TimeOfDay, { bg: string; greet: string; line: string }> = {
  dawn: { bg: 'linear-gradient(180deg,#F7D6C2 0%,#FAE6D6 34%,#FBF7F0 62%)', greet: 'Good morning', line: 'No rush this morning.' },
  day: { bg: 'linear-gradient(180deg,#CFE3F0 0%,#E4EDEF 34%,#FBF7F0 62%)', greet: 'Good afternoon', line: 'The day can be a quiet one.' },
  evening: { bg: 'linear-gradient(180deg,#F4C3A0 0%,#DCCBE6 32%,#FBF7F0 62%)', greet: 'Good evening', line: 'A slow evening is fine.' },
};

export function timeOfDayFor(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h >= 4 && h < 12) return 'dawn';
  if (h >= 12 && h < 17) return 'day';
  return 'evening';
}
