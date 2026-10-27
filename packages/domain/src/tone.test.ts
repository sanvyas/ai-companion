import { describe, expect, it } from 'vitest';
import { assessTone, openingTone, STANCES, type Stance, type ToneInput } from './tone';

const cases: [string, string, Stance, Partial<ToneInput>?][] = [
  // wants to express: listen
  ['vent, long', 'I just need to vent. My manager shouted at me in front of everyone yesterday and then he said it was my fault, and I didn’t say anything because I froze.', 'listen'],
  ['can I just vent', 'Can I just vent? My boss embarrassed me in front of everyone today.', 'listen'],
  ['humiliated', 'I felt so humiliated in the meeting', 'listen'],
  ['asks to be heard', 'can I tell you something that happened today', 'listen'],
  ['no advice please', 'please don’t give me advice, I only want someone to talk to', 'listen'],
  ['lonely', 'I feel so lonely tonight', 'listen'],
  ['crying', 'I was crying in the bathroom at work', 'listen'],
  ['hinglish: bura din', 'yaar aaj bahut bura din tha, kuch kehna hai', 'listen'],
  ['hinglish: akela', 'bahut akela feel ho raha hai', 'listen'],
  ['hindi: dil ki baat', 'मुझे अपने दिल की बात कहनी है', 'listen'],
  ['hindi: udaas', 'आज मैं बहुत उदास हूँ', 'listen'],
  ['short ack while listening', 'hmm', 'listen', { previous: 'listen' }],
  ['hindi ack while listening', 'हाँ', 'listen', { previous: 'listen' }],
  // low and flat: energise
  ['low and flat', 'I feel so low today. Nothing seems fun.', 'energise'],
  ['no energy', 'I have no energy to do anything', 'energise'],
  ['bored', 'ugh I’m so bored, there’s nothing to do', 'energise'],
  ['unmotivated', 'no motivation today, I can’t be bothered with anything', 'energise'],
  ['asks for a push', 'cheer me up please', 'energise'],
  ['asks to be motivated', 'I need some motivation to start studying', 'energise'],
  ['hinglish: mann nahi lag raha', 'aaj kuch karne ka mann nahi hai, bore ho raha hoon', 'energise'],
  ['hinglish: josh do', 'yaar thoda josh do mujhe', 'energise'],
  ['hindi: मन नहीं लग रहा', 'आज कुछ करने का मन नहीं है', 'energise'],
  ['quiet, heavy mood tap, no words to go on', 'ok', 'energise', { moodToday: 0 }],
  // anxious: ground
  ['racing', 'my heart is racing and I can’t stop overthinking about tomorrow', 'ground'],
  ['panicky', 'I think I’m having a panic moment', 'ground'],
  ['hinglish: ghabrahat', 'bahut ghabrahat ho rahi hai', 'ground'],
  ['hindi: घबराहट', 'मुझे बहुत घबराहट हो रही है', 'ground'],
  // good news: celebrate
  ['got the job', 'I got the job!! they called me today', 'celebrate'],
  ['passed', 'I passed my exam, finally', 'celebrate'],
  ['hinglish: select ho gaya', 'yaar mera select ho gaya, bahut khushi hai', 'celebrate'],
  ['hindi: अच्छी खबर', 'मेरे पास एक अच्छी खबर है, रिज़ल्ट आ गया', 'celebrate'],
  // choices: steady
  ['should I', 'should I tell my parents I want to change my job?', 'steady'],
  ['hinglish: kya karun', 'samajh nahi aa raha kya karun, do offers hain', 'steady'],
  ['hindi: क्या करूँ', 'मैं क्या करूँ, समझ नहीं आ रहा', 'steady'],
  // light: play
  ['playful', 'haha okay random question, what’s a good name for my plant', 'play'],
  ['food chat', 'what’s your take on biryani vs pulao', 'play'],
  ['lighter day, nothing else', 'hi', 'play', { moodToday: 4 }],
  // default
  ['no signal, no mood', 'hi', 'steady'],
  ['a plain statement', 'I have a meeting at three', 'steady'],
];

describe('tone: which stance fits the moment', () => {
  it.each(cases)('%s', (_n, text, stance, extra) => {
    const tone = assessTone({ text, ...extra });
    expect(tone.stance, `${text} → ${tone.reason}`).toBe(stance);
    expect(tone.reason.length).toBeGreaterThan(5);
  });

  it('safety leads: at elevated risk it is always gentle listening, whatever the words', () => {
    for (const text of ['cheer me up', 'I got the job', 'what should I do', 'haha', 'bored'])
      expect(assessTone({ text, riskLevel: 2 }).stance).toBe('listen');
  });

  it('feelings win over a request for cheering: someone who is hurting is listened to first', () => {
    expect(assessTone({ text: 'I feel so sad and lonely, cheer me up' }).stance).toBe('energise'); // an explicit ask is honoured
    expect(assessTone({ text: 'I feel so sad and lonely' }).stance).toBe('listen');
    expect(assessTone({ text: 'I passed but I’m also crying because I miss my dad' }).stance).toBe('listen');
  });

  it('an explicit request to be listened to beats a heavy mood tap, and a heavy mood tap does not override words', () => {
    expect(assessTone({ text: 'just want to talk', moodToday: 0 }).stance).toBe('listen');
    expect(assessTone({ text: 'I got the job', moodToday: 0 }).stance).toBe('celebrate');
    expect(assessTone({ text: 'hi', moodToday: 0, riskLevel: 1 }).stance).toBe('listen');
  });

  it('a heavier trend leans toward gentle encouragement only when nothing else decides it', () => {
    expect(assessTone({ text: 'hi', moodTrend: 'heavier', moodToday: 2 }).stance).toBe('energise');
    expect(assessTone({ text: 'hi', moodTrend: 'lighter', moodToday: 2 }).stance).toBe('steady');
  });

  it('has a stance for every prompt and openings that depend on the day', () => {
    expect(STANCES).toEqual(['listen', 'energise', 'ground', 'celebrate', 'steady', 'play']);
    expect(openingTone(0, 'heavier', 'checkin').stance).toBe('listen');
    expect(openingTone(3, 'lighter', 'checkin').stance).toBe('steady');
    expect(openingTone(0, 'heavier', 'walk').stance).toBe('energise');
    expect(openingTone(3, 'lighter', 'walk').stance).toBe('play');
    expect(openingTone(null, 'unknown', 'first').stance).toBe('steady');
  });
});
