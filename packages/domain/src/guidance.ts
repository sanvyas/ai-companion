// What Saathi suggests comes from what the person has said and done lately, and every suggestion carries its reason so they can
// see why ("Why this?") and switch it off. The themes are found on the device from words that are already decrypted for them;
// nothing here is sent anywhere or stored as a profile.

export type ThemeKey = 'work' | 'sleep' | 'lonely' | 'family' | 'anxious' | 'tired' | 'joy';

export interface ThemeDef { key: ThemeKey; label: string; color: string; re: RegExp }

export const THEMES: readonly ThemeDef[] = [
  { key: 'work', label: 'Work', color: '#F2A25E', re: /work|meeting|boss|office|deadline|job|interview|colleague|kaam|exam|study|padhai/ },
  { key: 'sleep', label: 'Sleep', color: '#8D93D8', re: /sleep|neend|awake|insomnia|can.t sleep|nightmare|so nahi/ },
  { key: 'lonely', label: 'Feeling alone', color: '#86B3D1', re: /alone|lonely|akela|akeli|miss(ing)? |no one to talk/ },
  { key: 'family', label: 'Family', color: '#F3A6B8', re: /mum|mom|dad|family|sister|brother|ghar|mother|father|husband|wife|in-laws|papa|mummy|bhai|didi/ },
  { key: 'anxious', label: 'Worry', color: '#B79BE0', re: /anxious|anxiety|worr|panic|tight|racing|can.t stop|ghabra|nervous|scared|switch off|tension|chinta/ },
  { key: 'tired', label: 'Tiredness', color: '#7F9BD6', re: /tired|exhaust|thak|drained|no energy|too loud|burnt out|burnout/ },
  { key: 'joy', label: 'Good things', color: '#F0D84F', re: /good|glad|happy|grateful|chai|proud|better than|felt nice|khush|enjoyed|laughed/ },
];

export const themeDef = (k: ThemeKey) => THEMES.find(t => t.key === k)!;
export const themesOf = (text: string): ThemeKey[] => { const t = text.toLowerCase(); return THEMES.filter(h => h.re.test(t)).map(h => h.key); };

export interface Said { /** ISO time it was written or said. */ at: string; text: string }
export type ThemeCounts = Partial<Record<ThemeKey, number>>;

/** How many times each theme came up in the last `days` days. Each entry counts a theme once, however many times it says it. */
export function weekThemes(said: readonly Said[], now: Date, days = 7): ThemeCounts {
  const from = now.getTime() - days * 86_400_000;
  const out: ThemeCounts = {};
  for (const s of said) {
    const t = new Date(s.at).getTime();
    if (!(t >= from && t <= now.getTime() + 60_000)) continue;
    for (const k of themesOf(s.text)) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** The theme that came up most, ignoring good things. */
export function topTheme(c: ThemeCounts): ThemeKey | null {
  const keys = (Object.keys(c) as ThemeKey[]).filter(k => k !== 'joy' && (c[k] ?? 0) > 0).sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0));
  return keys[0] ?? null;
}

const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
export const cameUp = (k: ThemeKey, n: number) => `${themeDef(k).label} came up ${times(n)} this week`;

export type OneThingId = 'voice' | 'breathe' | 'walk' | 'meditate' | 'plan' | 'sleep' | 'boat' | 'rangoli' | 'jar';
export interface OneThing { id: OneThingId; title: string; sub: string; cta: string; icon: 'mic' | 'wave' | 'pin' | 'lotus' | 'list' | 'moon' | 'leaf' | 'flower' | 'star'; why: string }

const BY_MOOD: Record<number, Omit<OneThing, 'why'>> = {
  0: { id: 'voice', title: 'Talk it out with Saathi', sub: 'No fixing. Just someone listening.', cta: 'Start talking', icon: 'mic' },
  1: { id: 'breathe', title: 'One minute of slow breathing', sub: 'Breathe out a little longer than you breathe in.', cta: 'Breathe with me', icon: 'wave' },
  2: { id: 'walk', title: 'Ten minutes outside', sub: 'Saathi walks with you and talks softly.', cta: 'Go for a walk', icon: 'pin' },
  3: { id: 'meditate', title: 'A short guided meditation', sub: 'Five quiet minutes. Nothing to fix.', cta: 'Start meditating', icon: 'lotus' },
  4: { id: 'plan', title: 'Plan one nice thing', sub: 'Pick one small plan for tomorrow.', cta: 'Make a plan', icon: 'list' },
};
const NIGHT: Omit<OneThing, 'why'> = { id: 'sleep', title: 'A sleep story', sub: 'A slow story to help you wind down.', cta: 'Play a story', icon: 'moon' };
const BOAT: Omit<OneThing, 'why'> = { id: 'boat', title: 'Float a worry away', sub: 'Write it, fold it into a paper boat, let it go. Nothing is saved.', cta: 'Make a boat', icon: 'leaf' };
const RANGOLI: Omit<OneThing, 'why'> = { id: 'rangoli', title: 'Draw a small rangoli', sub: 'Colour and pattern. No skill needed.', cta: 'Start drawing', icon: 'flower' };
const JAR: Omit<OneThing, 'why'> = { id: 'jar', title: 'Add a good thing to your jar', sub: 'One small good thing from today, for the days you need it.', cta: 'Add to the jar', icon: 'star' };
const WALK_FOR_LONELY: Omit<OneThing, 'why'> = { id: 'walk', title: 'A short walk with Saathi', sub: 'Fresh air, and company on the way.', cta: 'Go for a walk', icon: 'pin' };

export interface OneThingInput {
  /** Today's mood, 0 (heaviest) to 4 (lightest), or null if they have not checked in. */
  mood: number | null;
  night: boolean;
  themes: ThemeCounts;
  /** When false, only today's mood is used: nothing from what they have said. */
  useConversations: boolean;
}

/** The one small thing for today, and why. Safe by design: a heavy day always gets someone to talk to and nothing to complete. */
export function oneThing(i: OneThingInput): OneThing | null {
  if (i.mood === null || i.mood < 0 || i.mood > 4) return null;
  const base = BY_MOOD[i.mood];
  const themes = i.useConversations ? i.themes : {};
  const top = topTheme(themes);
  const n = top ? themes[top] ?? 0 : 0;
  if (i.mood === 0) return { ...base, why: 'You said today feels heavy. Talking helps, with nothing to fix.' };
  if (i.night) return { ...NIGHT, why: themes.sleep ? `${cameUp('sleep', themes.sleep)}.` : 'It is late. A slow story helps the day let go.' };
  if (i.mood === 1) return { ...base, why: top === 'work' ? `${cameUp('work', n)}, and your mind feels fast today.` : 'Your mind feels fast today. Breathing out longer slows it.' };
  if ((top === 'anxious' || top === 'work') && n >= 2) return { ...BOAT, why: `${cameUp(top, n)}.` };
  if (top === 'lonely' && n >= 1) return { ...(base.id === 'walk' ? base : WALK_FOR_LONELY), why: `${cameUp('lonely', n)}.` };
  if (top === 'tired' && n >= 2) return { ...BY_MOOD[3], why: `${cameUp('tired', n)}.` };
  if (i.mood === 4) return { ...JAR, why: 'A good day. Save a bit of it for a harder one.' };
  if (i.mood === 2) return { ...RANGOLI, why: 'Flat days like colour and small, easy things.' };
  return { ...base, why: 'Based on how you feel today.' };
}

export interface NoteLine { when: string; text: string; why: string }

/** What the next gentle messages will say, and why, so a notification never feels like it came from nowhere. */
export function nextNotes(themes: ThemeCounts, checkin: 'morning' | 'evening' | 'off'): NoteLine[] {
  const t = topTheme(themes);
  const line = ({ work: 'How did work go today? No need to explain.', sleep: 'How did you sleep? Want a slow story tonight?', lonely: 'Thinking of you. How is today going?', anxious: 'A quiet moment before the day starts?', tired: 'Be gentle with yourself today. How are you?', family: 'How is everyone at home? And how are you?' } as Partial<Record<ThemeKey, string>>)[t ?? 'joy'] ?? 'A quiet moment for you?';
  const out: NoteLine[] = [];
  if (checkin !== 'off') out.push({ when: `Tomorrow, ${checkin === 'morning' ? 'morning' : 'evening'}`, text: line, why: t ? `Because ${themeDef(t).label.toLowerCase()} ${cameUp(t, themes[t] ?? 1).replace(`${themeDef(t).label} `, '')}.` : 'Your usual daily check-in.' });
  if (themes.sleep || themes.tired || themes.anxious) out.push({ when: 'Tomorrow, 10 pm', text: 'A story for tonight.', why: 'Because your mind has been busy at night.' });
  return out;
}

export interface Rankable { id: string; tags: readonly ThemeKey[] }
export interface Ranked<T> { item: T; why: string }

/** Order things (events, stories) by how well they fit what came up this week, keeping the original order for ties. */
export function rankByThemes<T extends Rankable>(items: readonly T[], themes: ThemeCounts, label: (k: ThemeKey, n: number) => string): Ranked<T>[] {
  return items
    .map((item, i) => {
      const hit = item.tags.filter(k => themes[k]).sort((a, b) => (themes[b] ?? 0) - (themes[a] ?? 0))[0];
      return { item, i, score: hit ? themes[hit] ?? 0 : 0, why: hit ? label(hit, themes[hit] ?? 1) : '' };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ item, why }) => ({ item, why }));
}
