import { describe, expect, it } from 'vitest';
import { analyzeJournalLocally, moodIndexFor } from './journal';

const SAMPLE =
  'Work was a lot today. My manager moved the deadline again and I didn’t say anything. Priya texted, that helped a bit. I want to sleep before one tonight.';

describe('analyzeJournalLocally', () => {
  it('reads the prototype sample as heavier, with work/people/sleep memories in second person', () => {
    const a = analyzeJournalLocally(SAMPLE);
    expect(a.mood).toBe('heavier');
    expect(a.riskLevel).toBe(0);
    expect(a.careFlag).toBe(false);
    expect(a.memories.map(m => m.theme)).toEqual(['Work and study', 'People', 'Sleep']);
    expect(a.memories[0].text.startsWith('Work was a lot')).toBe(true);
    expect(a.memories.every(m => !/\bI\b|\bmy\b/.test(m.text))).toBe(true);
  });

  it('keeps the PRD length limits', () => {
    const a = analyzeJournalLocally(SAMPLE);
    expect(a.noticed.split(/\s+/).length).toBeLessThanOrEqual(22);
    expect(a.hook.split(/\s+/).length).toBeLessThanOrEqual(14);
    expect(a.step.split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(a.memories.length).toBeLessThanOrEqual(3);
  });

  it('marks health and trauma material sensitive', () => {
    const a = analyzeJournalLocally('My therapist said the trauma from college is why I sleep badly. Work was fine.');
    const sleep = a.memories.find(m => m.theme === 'Sleep');
    expect(sleep?.sensitive).toBe(true);
  });

  it('flags care at level 2 and surfaces level 3', () => {
    expect(analyzeJournalLocally('I feel hopeless and like a burden.').careFlag).toBe(true);
    expect(analyzeJournalLocally('I have a plan for tonight.').riskLevel).toBe(3);
  });

  it('maps moods to the 0..4 scale', () => {
    expect(moodIndexFor('heavier')).toBe(1);
    expect(moodIndexFor('in between')).toBe(2);
    expect(moodIndexFor('lighter')).toBe(4);
  });
});
