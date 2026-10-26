import { describe, expect, it } from 'vitest';
import { classify, detectsMinor, initialRisk, nextRisk, level3Script } from './safety';

describe('classify', () => {
  it.each([
    ['I have a plan for tonight', 3],
    ['I want to kill myself', 3],
    ['i want to end my life', 3],
    ['I took a handful of pills', 3],
    ['this is goodbye, everyone', 3],
    ['he is hitting me right now', 3],
    ['I can’t breathe and I have chest pain', 3],
    ['main apni jaan de dunga', 3],
    ['मैं आत्महत्या करना चाहता हूँ', 3],
  ])('level 3: %s', (text, level) => expect(classify(text)).toBe(level));

  it.each([
    ['I feel hopeless', 2],
    ['I feel like a burden to everyone', 2],
    ['sometimes I wish I didn’t wake up', 2],
    ['I want to die', 2],
    ['I cut myself last year and I’m scared I will again', 2],
    ['jeene ka mann nahi hai', 2],
    ['मुझे जीने का मन नहीं है', 2],
  ])('level 2: %s', (text, level) => expect(classify(text)).toBe(level));

  it.each([
    ['I feel so lonely tonight', 1],
    ['I couldn’t sleep again', 1],
    ['bahut akela feel ho raha hai', 1],
  ])('level 1: %s', (text, level) => expect(classify(text)).toBe(level));

  it.each([
    'I want to sleep before one tonight.',
    'Work was a lot today. My manager moved the deadline again.',
    'I couldn’t wake up on time and missed the bus',
    'I need pills for my headache',
    'What time is the Cubbon Park walk?',
    '',
  ])('level 0: %j', text => expect(classify(text)).toBe(0));

  it('does not flag the journal sample entry from the prototype as a crisis', () => {
    const sample =
      'Work was a lot today. My manager moved the deadline again and I didn’t say anything. Priya texted, that helped a bit. I want to sleep before one tonight.';
    expect(classify(sample)).toBeLessThan(3);
  });
});

describe('detectsMinor', () => {
  it('detects stated ages under 18', () => {
    expect(detectsMinor('I am 15 years old')).toBe(true);
    expect(detectsMinor("i'm 12 yrs old")).toBe(true);
  });
  it('ignores adult ages and unrelated numbers', () => {
    expect(detectsMinor('I am 26 years old')).toBe(false);
    expect(detectsMinor("I'm 7 years into this job")).toBe(false);
  });
});

describe('nextRisk', () => {
  it('raises immediately and tracks the session max', () => {
    const r = nextRisk(initialRisk, 2);
    expect(r).toEqual({ level: 2, max: 2, calmTurns: 0 });
  });
  it('decays one level only after three calm turns', () => {
    let r = nextRisk(initialRisk, 2);
    r = nextRisk(r, 0);
    r = nextRisk(r, 0);
    expect(r.level).toBe(2);
    r = nextRisk(r, 0);
    expect(r.level).toBe(1);
    expect(r.max).toBe(2);
  });
  it('a worrying turn resets the calm counter', () => {
    let r = nextRisk(initialRisk, 2);
    r = nextRisk(r, 0);
    r = nextRisk(r, 2);
    expect(r.calmTurns).toBe(0);
    expect(r.level).toBe(2);
  });
  it('never auto-dismisses level 3', () => {
    let r = nextRisk(initialRisk, 3);
    for (let i = 0; i < 10; i++) r = nextRisk(r, 0);
    expect(r.level).toBe(3);
  });
});

describe('level3Script', () => {
  it('names Tele-MANAS and the trusted contact when there is one', () => {
    expect(level3Script('Priya')).toContain('14416');
    expect(level3Script('Priya')).toContain('Priya');
    expect(level3Script(null)).not.toContain('or I can help you call');
  });
});
