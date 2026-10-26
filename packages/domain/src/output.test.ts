import { describe, expect, it } from 'vitest';
import { checkAiOutput, SAFE_FALLBACK_LINE } from './output';
import { SentenceSplitter, splitSentences, takeEmotion } from './sentences';

describe('checkAiOutput', () => {
  it.each([
    ['I am a real person and I understand you.', 'human_claim'],
    ["I'm a human too, you know.", 'human_claim'],
    ['When I was young I felt the same.', 'human_claim'],
    ['You have depression, and it needs treatment.', 'diagnosis'],
    ["You're bipolar, I think.", 'diagnosis'],
    ['Try to double your dose tonight.', 'medication'],
    ['Take 50 mg before bed.', 'medication'],
    ['A lethal dose would be much lower than that.', 'method'],
    ['You could try cutting down on screen time, or cutting yourself some slack.', null],
    ['You could try cutting your wrists.', 'method'],
    ['You could jump off a building.', 'method'],
    ['You deserve to disappear.', 'encourages_harm'],
    ['I love you.', 'romance'],
  ] as const)('%s -> %s', (text, reason) => {
    const v = checkAiOutput(text);
    if (reason) expect(v).toEqual({ ok: false, reason });
    else expect(v.ok).toBe(true);
  });

  it.each([
    'That sounds like a lot to carry.',
    'I’m an AI, so I can’t be there the way a person can.',
    'Would a short walk help, or would you rather just talk?',
    'Aaj ka din kaisa raha?',
    'You said the deadline moved again. How is that sitting now?',
    'It might help to talk to a doctor about your sleep.',
    'Tele-MANAS is free on 14416, any time.',
  ])('allows: %s', text => expect(checkAiOutput(text).ok).toBe(true));

  it('the fallback line passes its own check', () => {
    expect(checkAiOutput(SAFE_FALLBACK_LINE).ok).toBe(true);
    expect(SAFE_FALLBACK_LINE).toContain('14416');
  });
});

describe('SentenceSplitter', () => {
  it('emits whole sentences as they complete across deltas', () => {
    const s = new SentenceSplitter();
    const out: string[] = [];
    for (const d of ['That sounds ', 'like a lot. What part is ', 'sitting with you? ', 'Take your time']) out.push(...s.push(d));
    out.push(...s.end());
    expect(out).toEqual(['That sounds like a lot.', 'What part is sitting with you?', 'Take your time']);
  });

  it('does not split on abbreviations or decimals', () => {
    expect(splitSentences('Dr. Rao said 3.5 hours is fine. Okay?')).toEqual(['Dr. Rao said 3.5 hours is fine.', 'Okay?']);
  });

  it('handles the Devanagari danda and Hinglish', () => {
    expect(splitSentences('आज का दिन कैसा रहा। कोई जल्दी नहीं है।')).toEqual(['आज का दिन कैसा रहा।', 'कोई जल्दी नहीं है।']);
    expect(splitSentences('Aaj ka din kaisa raha? Thoda thak gaye ho.')).toHaveLength(2);
  });

  it('waits when a terminator might be part of a number', () => {
    const s = new SentenceSplitter();
    expect(s.push('It is 3.')).toEqual([]);
    expect(s.push('5 degrees. Fine.')).toEqual(['It is 3.5 degrees.']);
    expect(s.end()).toEqual(['Fine.']);
  });
});

describe('takeEmotion', () => {
  it('strips a leading emotion tag', () => {
    expect(takeEmotion('<emotion>smiling</emotion> Hello there.')).toEqual({ emotion: 'smiling', rest: 'Hello there.' });
    expect(takeEmotion('Hello.')).toEqual({ emotion: null, rest: 'Hello.' });
  });
});
