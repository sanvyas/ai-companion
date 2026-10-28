import { describe, expect, it } from 'vitest';
import { blendMood, detectMood, valenceToTap, type Emotion } from './mood';

// Hand-labelled phrases in English, Hinglish and Hindi, written the way people actually talk: short, indirect, mixed
// with other things. 'neg' means the reading must be at least slightly heavy, 'pos' at least slightly light, 'neu'
// neither. When an emotion is given it must be among those detected. The corpus is the author's own, so a high score
// here shows the rules do what they were written to do; it is not a measurement on strangers' words.
type Band = 'neg' | 'pos' | 'neu';
const CASES: [string, Band, Emotion?][] = [
  // sad / low
  ['I feel so low today', 'neg', 'sad'],
  ['honestly I have been crying all evening', 'neg', 'sad'],
  ['everything feels heavy and grey', 'neg'],
  ['I am really sad about how things ended', 'neg', 'sad'],
  ['I miss my old friends so much', 'neg', 'lonely'],
  ['my heart is broken', 'neg', 'sad'],
  ['I am feeling miserable', 'neg', 'sad'],
  ['not a good day, not a good day at all', 'neg'],
  // lonely
  ['nobody really understands me', 'neg', 'lonely'],
  ['I feel so alone in this city', 'neg', 'lonely'],
  ['I ate dinner alone again', 'neg', 'lonely'],
  ['no one calls me anymore', 'neg', 'lonely'],
  // anxious
  ['I am so nervous about tomorrow’s interview', 'neg', 'anxious'],
  ['my mind will not stop racing, I am panicking', 'neg', 'anxious'],
  ['I am worried I will fail the exam', 'neg', 'anxious'],
  ['I feel on edge all the time', 'neg', 'anxious'],
  ['stressed out of my mind with deadlines', 'neg', 'anxious'],
  ['I keep overthinking everything', 'neg', 'anxious'],
  // angry
  ['I am so angry with my brother', 'neg', 'angry'],
  ['my boss really irritates me', 'neg', 'angry'],
  ['I am fed up with all of this', 'neg', 'angry'],
  ['so frustrated, nothing is working', 'neg', 'angry'],
  // overwhelmed
  ['it is all too much right now', 'neg', 'overwhelmed'],
  ['I can not cope with everything', 'neg', 'overwhelmed'],
  ['I am overwhelmed with work and home', 'neg', 'overwhelmed'],
  // tired
  ['I am so tired, I have no energy', 'neg', 'tired'],
  ['completely drained after today', 'neg', 'tired'],
  ['I am burnt out', 'neg', 'tired'],
  ['too exhausted to even eat', 'neg', 'tired'],
  // numb / flat
  ['I feel empty inside', 'neg', 'numb'],
  ['just numb, I do not feel anything', 'neg', 'numb'],
  ['meh. same as always', 'neg', 'numb'],
  ['bored and nothing is fun anymore', 'neg', 'numb'],
  // shame
  ['I feel so stupid for saying that', 'neg', 'ashamed'],
  ['I am ashamed of how I reacted', 'neg', 'ashamed'],
  ['I feel guilty about leaving her', 'neg', 'ashamed'],
  ['I feel like a failure', 'neg', 'ashamed'],
  // happy / excited / grateful / calm / hopeful
  ['I am so happy today!', 'pos', 'happy'],
  ['I got the job, I am thrilled!!', 'pos', 'excited'],
  ['feeling really grateful for my family', 'pos', 'grateful'],
  ['I feel calm and relaxed after the walk', 'pos', 'calm'],
  ['things are looking up, I feel hopeful', 'pos', 'hopeful'],
  ['I am proud of myself today', 'pos', 'happy'],
  ['what a wonderful evening, I loved it', 'pos', 'happy'],
  ['finally some peace and quiet, I feel good', 'pos'],
  ['I feel so much better than yesterday', 'pos'],
  ['I am excited for the trip', 'pos', 'excited'],
  ['so relieved it is over', 'pos'],
  ['I slept well and feel energetic', 'pos'],
  // negation and intensity
  ['I am not happy at all', 'neg'],
  ['I am not sad anymore', 'neu'],
  ['not feeling good today', 'neg'],
  ['I am a little tired but okay', 'neu'],
  ['not bad, not great', 'neu'],
  ['I do not feel anxious right now', 'neu'],
  // mixed: the later clause leads
  ['I was upset this morning but now I feel lighter', 'pos'],
  ['work went well but I feel so alone tonight', 'neg', 'lonely'],
  ['I am happy for her, but I wish it was me and I feel jealous and low', 'neg'],
  // neutral / informational
  ['what time is the walk on Saturday', 'neu'],
  ['can you tell me a story', 'neu'],
  ['I woke up at seven and made tea', 'neu'],
  ['I am going to the market', 'neu'],
  ['okay', 'neu'],
  ['hello', 'neu'],
  // emoji
  ['today 😭', 'neg'],
  ['so done 😡', 'neg'],
  ['best day ever 😊🎉', 'pos'],
  ['😔', 'neg'],
  // Hinglish
  ['aaj bahut udaas hoon', 'neg', 'sad'],
  ['mujhe bahut akela lag raha hai', 'neg', 'lonely'],
  ['bahut tension ho rahi hai kal ke liye', 'neg', 'anxious'],
  ['main thak gaya hoon yaar', 'neg', 'tired'],
  ['mujhe gussa aa raha hai uspe', 'neg', 'angry'],
  ['aaj mood bahut kharab hai', 'neg'],
  ['dil bahut bhaari hai', 'neg'],
  ['ghabrahat ho rahi hai', 'neg', 'anxious'],
  ['bahut khush hoon aaj', 'pos', 'happy'],
  ['aaj ka din mast tha', 'pos'],
  ['mujhe sukoon mil raha hai', 'pos', 'calm'],
  ['main theek nahi hoon', 'neg'],
  ['mujhe achha nahi lag raha', 'neg'],
  ['bore ho raha hoon, kuch karne ka mann nahi', 'neg'],
  ['kal result aa raha hai, dar lag raha hai', 'neg', 'anxious'],
  ['sab kuch bahut zyada ho gaya hai', 'neg', 'overwhelmed'],
  ['papa ne daanta aur main ro padi', 'neg', 'sad'],
  ['thoda thaka hoon par theek hoon', 'neu'],
  ['select ho gaya! bahut accha lag raha hai', 'pos'],
  ['kal kya plan hai', 'neu'],
  // Hindi (Devanagari)
  ['आज मैं बहुत उदास हूँ', 'neg', 'sad'],
  ['मुझे बहुत अकेलापन लग रहा है', 'neg', 'lonely'],
  ['मुझे घबराहट हो रही है', 'neg', 'anxious'],
  ['मैं बहुत थक गया हूँ', 'neg', 'tired'],
  ['मुझे बहुत गुस्सा आ रहा है', 'neg', 'angry'],
  ['आज मैं बहुत खुश हूँ', 'pos', 'happy'],
  ['मन को सुकून मिला', 'pos', 'calm'],
  ['मुझे अच्छा नहीं लग रहा', 'neg'],
  ['सब कुछ बहुत ज़्यादा हो गया है', 'neg', 'overwhelmed'],
  ['कल की क्या योजना है', 'neu'],
];

describe('reading the mood from what someone says', () => {
  const miss: string[] = [];
  for (const [text, band, emotion] of CASES) {
    const r = detectMood(text);
    const ok = (band === 'neg' ? r.valence <= -1 : band === 'pos' ? r.valence >= 1 : r.valence === 0) && (!emotion || r.emotions.includes(emotion));
    if (!ok) miss.push(`${band}${emotion ? '/' + emotion : ''}: "${text}" -> ${r.valence} [${r.emotions.join(',')}]`);
  }

  it(`gets at least 95% of ${CASES.length} labelled phrases right`, () => {
    const score = (CASES.length - miss.length) / CASES.length;
    expect(miss, `accuracy ${(score * 100).toFixed(1)}%`).toEqual(miss.slice(0, Math.floor(CASES.length * 0.05)));
  });

  it('never calls a clearly heavy phrase light, or a clearly light phrase heavy', () => {
    const flips = CASES.filter(([t, b]) => (b === 'neg' && detectMood(t).valence > 0) || (b === 'pos' && detectMood(t).valence < 0)).map(c => c[0]);
    expect(flips).toEqual([]);
  });

  it('says how sure it is: plain words with no feeling in them are low confidence', () => {
    expect(detectMood('what time is the walk on Saturday').confidence).toBeLessThan(0.3);
    expect(detectMood('I am so happy today!').confidence).toBeGreaterThan(0.5);
    expect(detectMood('').valence).toBe(0);
  });

  it('reads arousal: panic is high, exhaustion is low', () => {
    expect(detectMood('I am panicking, my heart is racing').arousal).toBe('high');
    expect(detectMood('I am so tired and drained').arousal).toBe('low');
  });

  it('is stronger for "very" than for "a bit"', () => {
    expect(detectMood('I am very sad').valence).toBeLessThanOrEqual(detectMood('I am a bit sad').valence);
    expect(detectMood('I am extremely sad').valence).toBe(-2);
  });
});

describe('the mood of a conversation, not one sentence', () => {
  it('lets recent turns count more than older ones', () => {
    const early = detectMood('I feel so low and alone');
    const late = detectMood('actually talking helped, I feel a bit better');
    expect(blendMood([early, late]).score).toBeGreaterThan(blendMood([late, early]).score);
    expect(blendMood([late, early]).valence).toBeLessThan(0);
  });

  it('ignores turns with nothing in them, and says unknown when there is nothing at all', () => {
    expect(blendMood([detectMood('okay'), detectMood('hello')]).confidence).toBeLessThan(0.3);
    expect(blendMood([]).valence).toBe(0);
    expect(blendMood([detectMood('I feel awful'), detectMood('what time is it')]).valence).toBeLessThan(0);
  });

  it('maps a reading onto the same 0 to 4 scale as the mood tap', () => {
    expect(valenceToTap(-2)).toBe(0);
    expect(valenceToTap(0)).toBe(2);
    expect(valenceToTap(2)).toBe(4);
  });
});
