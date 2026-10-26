// Demo persona (Aarav, 26, Bengaluru; sister Priya). This is prototype seed data.
// TODO(api): replace with GET /me, /memories, /journal, /plan/today, /insights, /letters/latest.
export type Theme = 'People' | 'Work and study' | 'Sleep' | 'What helps' | 'Feelings' | 'Plans';

export interface Memory {
  id: number;
  theme: Theme;
  text: string;
  hidden: boolean;
}

export interface JournalEntry {
  id: number;
  date: string;
  mode: 'spoken' | 'written';
  mood: number;
  shared: boolean;
  text: string;
}

export interface PlanItem {
  id: number;
  label: string;
  done: boolean;
}

export const SEED_MEMORIES: Memory[] = [
  { id: 1, theme: 'People', text: 'Your sister Priya lives in Pune. You usually talk on Sundays.', hidden: false },
  { id: 2, theme: 'People', text: 'Rohan is a college friend you’ve been meaning to call.', hidden: false },
  { id: 3, theme: 'Work and study', text: 'You have a design studio interview next Thursday.', hidden: false },
  { id: 4, theme: 'What helps', text: 'Chai on the balcony helps you slow down.', hidden: false },
  { id: 5, theme: 'What helps', text: 'Walking is easier with music than with podcasts.', hidden: false },
  { id: 6, theme: 'Sleep', text: 'You often fall asleep after 3 a.m. and want to change that.', hidden: true },
];

export const SEED_JOURNAL: JournalEntry[] = [
  { id: 1, date: 'Thu, 23 Oct', mode: 'spoken', mood: 1, shared: true, text: 'Couldn’t sleep again. Kept replaying the interview questions. I think I’m scared of being found out as not good enough. Priya says I always do this before big things.' },
  { id: 2, date: 'Tue, 21 Oct', mode: 'written', mood: 4, shared: true, text: 'Walked to the chai stall and actually talked to the uncle there. Small thing but it felt nice to be out.' },
  { id: 3, date: 'Sun, 19 Oct', mode: 'written', mood: 2, shared: false, text: 'Some things I just want to write and not talk about yet.' },
];

export const SEED_PLAN: PlanItem[] = [
  { id: 1, label: 'Walk, 10 minutes', done: false },
  { id: 2, label: 'Lunch', done: true },
  { id: 3, label: 'Message Priya', done: false },
];

export const SEED_RECENT = [
  { text: 'You talked about work and your sister', when: 'Yesterday' },
  { text: 'A quiet night, mostly about sleep', when: 'Thursday' },
  { text: 'The interview, and what worries you about it', when: 'Monday' },
];

export const MOOD_SERIES = [.45, .4, .36, .42, .33, .28, .34, .4, .47, .44, .5, .46, .4, .36, .45, .52, .56, .5, .46, .53, .58, .62, .55, .5, .58, .63, .6, .66];

export const WEEK_DAYS: [string, string][] = [
  ['M', 'Monday. You talked about the interview and felt a little steadier after.'],
  ['T', 'Tuesday. You walked to the chai stall. A lighter day.'],
  ['W', 'Wednesday. Tired, and up late. A heavier day.'],
  ['T', 'Thursday. You called Priya for twenty minutes.'],
  ['F', 'Friday. Quiet. We talked mostly about sleep.'],
  ['S', 'Saturday. You sketched for a bit before bed.'],
  ['S', 'Today, so far.'],
];

export const RHYTHMS = [
  { label: 'Sleep', value: '5h 40m a night', pct: '55%', color: '#B7B1E6' },
  { label: 'Meals', value: 'About 2 a day', pct: '67%', color: '#9FCFC3' },
  { label: 'Movement', value: '3 short walks', pct: '50%', color: '#9FCFC3' },
  { label: 'Time with others', value: '2 calls', pct: '40%', color: '#F1C79B' },
];

export const WINS = [
  { text: 'Walked to the chai stall', when: 'Tue' },
  { text: 'Called Priya, twenty minutes', when: 'Thu' },
  { text: 'Sketched before bed', when: 'Sat' },
];

export const SAFETY_PLAN = [
  { label: 'Warning signs', text: 'Not sleeping for days. Skipping meals. Wanting to stay in my room.' },
  { label: 'Things that help', text: 'Chai on the balcony. Walking with music. Sketching.' },
  { label: 'People I can reach', text: 'Priya (sister), Rohan (friend)' },
  { label: 'Professionals', text: 'Tele-MANAS, 14416, any time' },
  { label: 'Making my space safer', text: 'Ask Priya to keep my medicines when things feel heavy.' },
];

export const TRUSTED_CONTACT = { name: 'Priya', relation: 'sister', phone: '' as string };
