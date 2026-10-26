import type { Theme } from '../data/seed';
import { classify, type RiskLevel } from './safety';

// JournalAnalysis shape from PRD §5.1 / §6.5.
export interface ProposedMemory {
  theme: Theme;
  text: string;
  sensitive: boolean;
}

export interface JournalAnalysis {
  mood: 'heavier' | 'in between' | 'lighter';
  noticed: string;
  memories: ProposedMemory[];
  hook: string;
  step: string;
  careFlag: boolean;
  riskLevel: RiskLevel;
  source: string;
}

export const moodIndexFor = (m: JournalAnalysis['mood']) => ({ heavier: 1, 'in between': 2, lighter: 4 })[m];

// PRD §5.2: health, mental-health history, trauma, sexuality, religion, caste, politics,
// finances and third-party detail are sensitive and default to NOT saved.
const SENSITIVE =
  /(medicine|medication|tablet|therap|psychiat|depress|anxiety|panic|diagnos|trauma|abuse|assault|harass|sexual|gay|lesbian|queer|religio|church|mosque|temple|caste|politic|vote|salary|debt|loan|emi\b|pregnan|period|illness|cancer|surgery)/i;

const toSecondPerson = (x: string) =>
  x
    .replace(/\bI am\b/g, 'You are')
    .replace(/\bI’m\b|\bI'm\b/g, 'You’re')
    .replace(/\bI’ve\b|\bI've\b/g, 'You’ve')
    .replace(/\bI\b/g, 'you')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/g, 'you')
    .replace(/^you/, 'You')
    .trim();

/**
 * On-device stand-in for the PRD §6.5 journal analysis prompt.
 * Safety runs on the entry BEFORE analysis (PRD §6.5); the caller decides whether to show the
 * care card (level >= 2) or the crisis screen (level 3).
 * TODO(llm-adapter): replace with POST /journal/{id}/analyze behind the providers/llm adapter.
 */
export function analyzeJournalLocally(text: string): JournalAnalysis {
  const l = text.toLowerCase();
  const riskLevel = classify(text);
  const has = (re: RegExp) => re.test(l);
  const heavy = has(/(tired|a lot|scared|anxious|couldn|can't|cant|alone|sad|stress|didn’t say|didn't say)/);
  const light = has(/(nice|good|laughed|happy|better|okay|calm)/);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pick = (re: RegExp, theme: Theme): ProposedMemory | null => {
    const s = sentences.find(x => re.test(x));
    return s ? { theme, text: toSecondPerson(s), sensitive: SENSITIVE.test(s) } : null;
  };
  const memories = [
    pick(/(manager|work|deadline|interview|office|college)/i, 'Work and study'),
    pick(/(priya|sister|friend|mom|mother|dad|rohan)/i, 'People'),
    pick(/(sleep|bed|night)/i, 'Sleep'),
  ]
    .filter((m): m is ProposedMemory => !!m)
    .slice(0, 3);
  const topic = has(/(manager|work|deadline)/) ? 'work' : has(/(sleep)/) ? 'sleep' : has(/(priya|sister|friend)/) ? 'the people around you' : 'what you wrote';
  return {
    mood: heavy && !light ? 'heavier' : light && !heavy ? 'lighter' : 'in between',
    noticed: heavy ? 'It sounds like today asked a lot of you, and some of it is still sitting with you.' : 'It sounds like there was something good in today, even if it was small.',
    memories,
    hook: topic === 'work' ? 'Last time you wrote about the deadline. How is work sitting now?' : topic === 'sleep' ? 'You wanted to sleep earlier. How did last night go?' : `You wrote about ${topic}. Want to pick that up?`,
    step: has(/(sleep|night|bed)/) ? 'Phone down by 12:30, then a wind-down story.' : has(/(manager|work)/) ? 'Write the one sentence you’d like to say.' : 'Two minutes on the balcony.',
    careFlag: riskLevel >= 2,
    riskLevel,
    source: 'Read on this device in the demo. Nothing is saved until you choose.',
  };
}
