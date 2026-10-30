// How someone says they are, and what the design offers back. Five moods, from the heaviest (0) to the lightest (4).

export interface MoodDef { label: string; hint: string; color: string; tint: string; shape: string }
export const MOODS: MoodDef[] = [
  { label: 'Rough', hint: 'Heavy day', color: '#6F6BB8', tint: '#E6E4F5', shape: '46% 54% 52% 48% / 58% 46% 54% 42%' },
  { label: 'Anxious', hint: 'Mind racing', color: '#E8896B', tint: '#FBE4DA', shape: '38% 62% 40% 60% / 60% 38% 62% 40%' },
  { label: 'Meh', hint: 'Low energy', color: '#B9A88D', tint: '#F0EADF', shape: '50% 50% 50% 50% / 60% 60% 40% 40%' },
  { label: 'Okay', hint: 'Getting by', color: '#7DB394', tint: '#E0EFE5', shape: '50%' },
  { label: 'Great', hint: 'Good day', color: '#F0B93A', tint: '#FCEFCF', shape: '30%' },
];
export const NO_MOOD = { tint: '#ECE8F8', color: '#D9D2C5', shape: '50%' };

export const WHY = ['Work', 'Sleep', 'Family', 'Friends', 'Love', 'Health', 'Money', 'Studies', 'Not sure'];

export const greetFor = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

/** The line on the check-in card: gentle, and about how they said they were. */
export const checkLine = (mood: number | null, nick: string) => {
  const L = ['I’m sorry today’s rough. Want to tell me what happened?', 'Mind racing? A slow breath might help. Want to try, or just talk?', 'Low days happen. Did you eat something nice today?', 'Glad it’s steady. Anything small you’d like to do with the day?', 'Love that. What made today good?'];
  return mood === null ? `Hey${nick ? ` ${nick}` : ''}. How’s today going so far?` : L[mood];
};

export type SuggestId = 'sit' | 'write' | 'speak' | 'rain' | 'balloon' | 'racing' | 'walk' | 'fruit' | 'room' | 'event' | 'month' | 'breathe';
export interface Hero { title: string; sub: string; cta: string; bg: string; fg: string; id: 'talk' | 'breathe' | 'rangoli' | 'step' | 'write' | 'checkin'; more: [SuggestId, SuggestId, SuggestId] }
export const HEROES: Hero[] = [
  { title: 'Want to get it off your chest?', sub: 'Say anything. I’m listening.', cta: 'Talk to me', bg: '#5B57A6', fg: '#FFFFFF', id: 'talk', more: ['sit', 'write', 'rain'] },
  { title: 'Let’s slow your breath.', sub: 'One minute. Just follow the circle.', cta: 'Breathe with me', bg: '#B04F36', fg: '#FFFFFF', id: 'breathe', more: ['balloon', 'racing', 'walk'] },
  { title: 'A small distraction?', sub: 'Make a rangoli. No rules.', cta: 'Play', bg: '#6F5F48', fg: '#FFFFFF', id: 'rangoli', more: ['walk', 'fruit', 'speak'] },
  { title: 'One tiny step?', sub: '', cta: 'Done it', bg: '#34703F', fg: '#FFFFFF', id: 'step', more: ['room', 'event', 'speak'] },
  { title: 'Keep this feeling.', sub: 'Note what went well today.', cta: 'Write it down', bg: '#F0B93A', fg: '#1E2430', id: 'write', more: ['event', 'fruit', 'month'] },
];
export const CHECKIN_HERO: Hero = { title: 'How are you, right now?', sub: 'One tap, and I’ll suggest what might help.', cta: 'Check in', bg: '#2F2A5E', fg: '#FFFFFF', id: 'checkin', more: ['breathe', 'walk', 'write'] };

export const NOTE_BG = ['#FFE9A8', '#FFD5C7', '#D4EBDD', '#E3DDF7'];
export const NOTE_ROT = ['-2deg', '1.5deg', '-1deg', '2deg'];
