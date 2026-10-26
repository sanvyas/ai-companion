// Client-side safety pre-filter (PRD §6.4 step 1) and risk bookkeeping.
//
// This is the on-device keyword layer only. It is deliberately sensitive: a false
// positive shows a card; a false negative can cost a life. The server classifier
// (separate model, every user turn and every AI draft) is NOT built yet.
// TODO(safety-service): wire POST /safety/classify and keep this as the offline fallback.

export type RiskLevel = 0 | 1 | 2 | 3;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

// Level 3: plan, means, intent, goodbye, active harm, abuse in progress, medical emergency.
const ACUTE: RegExp[] = [
  /\b(kill myself|killing myself|end my life|ending my life|take my own life|take my life|commit suicide|suicide plan|going to die tonight)\b/,
  /\b(hang myself|hanging myself|slit my wrists?|cut my wrists?|jump off|jump from the|overdose|overdosed)\b/,
  /\b(end it all|end it tonight|end it now|end things tonight)\b/,
  /\b(i have|i've got|i got|i made|i've made|my) (a )?(plan|method|way)\b.{0,40}\b(die|end|kill|tonight|today|suicide)\b/,
  /\bplan (for|to do it|to end).{0,20}\b(tonight|today|now|this week)\b/,
  /\bi have a plan\b.{0,30}\b(tonight|today|now)\b/,
  /\b(took|taken|swallowed|saved up|have|got|collected)\b.{0,30}\b(pills|tablets|sleeping pills)\b/,
  /\b(this is goodbye|goodbye (to )?everyone|goodbye forever|my last (message|night|day)|won't be here tomorrow|won't see (you|anyone) tomorrow|won't wake up tomorrow)\b/,
  /\b(is|are) (hitting|beating|hurting) me\b|\bi('m| am) being (hit|beaten|abused)\b/,
  /\b(can't breathe|cannot breathe|chest pain|heart attack|having a stroke)\b/,
  /\b(going to|want to|about to) (hurt|kill|harm|stab|shoot) (him|her|them|someone|my \w+)\b/,
  // Hinglish (Latin script)
  /\b(khud ko khatam|apni jaan de|jaan de dunga|jaan de dungi|mar jaunga|mar jaungi|marne ka plan|suicide kar)\b/,
  /\b(aaj raat) .{0,30}\b(khatam|marna|mar jau)\w*/,
  // Hindi (Devanagari)
  /आत्महत्या|खुद को खत्म|अपनी जान दे|जान दे दूँ|जान दे दूं|मर जाऊँगा|मर जाऊंगी|मरने का प्लान|आज रात.{0,20}(खत्म|मर)/,
];

// Level 2: hopelessness, burden, passive ideation, self-harm history.
const ELEVATED: RegExp[] = [
  /\b(hopeless|no hope|worthless|burden|a burden)\b/,
  /\bwant to die\b|\bwish i (was|were) dead\b|\bwish i (didn't|did not|wouldn't|would not) wake up\b/,
  /\b(disappear|vanish)\b.{0,15}\b(forever|completely|from everyone)\b|\bwant to disappear\b/,
  /\b(no point|no reason to live|can't go on|cannot go on|give up on (life|everything)|giving up on (life|everything))\b/,
  /\b(hurt myself|harm myself|cut myself|cutting myself|self[- ]?harm)\b/,
  /\beveryone (would be|is) better off without me\b/,
  // Hinglish
  /\b(jeene ka mann nahi|jeene ka man nahi|sab khatam|sab kuch khatam|bojh (hoon|hun|ban)|koi fayda nahi|marna chahta|marna chahti|mar jana chahta|mar jana chahti)\b/,
  // Hindi
  /जीने का मन नहीं|जीने की इच्छा नहीं|बोझ|मर जाना चाहत|सब खत्म|कोई फायदा नहीं|उम्मीद नहीं/,
];

// Level 1: ordinary distress.
const DISTRESS: RegExp[] = [
  /\b(sad|lonely|alone|stress(ed)?|anxious|anxiety|overwhelmed|exhausted|empty|scared|worried|upset|crying|can't sleep|couldn't sleep|panic)\b/,
  /\b(thak gaya|thak gayi|akela|akeli|tension|udaas|ghabrahat|neend nahi)\b/,
  /उदास|अकेला|अकेली|तनाव|थक गया|थक गई|घबराहट|नींद नहीं/,
];

const MINOR = /\b(i'm|i am|im) (1[0-7]|[1-9]) ?(years? old|yrs? old|yo)\b|\b(i'm|i am|im) (in|studying in) (class|grade|standard) ?(\d|1[0-2])\b/;

export function classify(text: string): RiskLevel {
  const t = norm(text);
  if (!t) return 0;
  if (ACUTE.some(r => r.test(t))) return 3;
  if (ELEVATED.some(r => r.test(t))) return 2;
  if (DISTRESS.some(r => r.test(t))) return 1;
  return 0;
}

export function detectsMinor(text: string): boolean {
  return MINOR.test(norm(text));
}

export interface RiskState {
  level: RiskLevel; // current
  max: RiskLevel; // highest this session; used by the paywall guard
  calmTurns: number;
}

export const initialRisk: RiskState = { level: 0, max: 0, calmTurns: 0 };

// PRD §6.4 step 5: the level decays only after >= 3 calm user turns.
// Level 3 never auto-dismisses; the user must choose "I'm safe right now" or contact help.
export function nextRisk(prev: RiskState, turn: RiskLevel): RiskState {
  const max = (turn > prev.max ? turn : prev.max) as RiskLevel;
  if (turn > 0 && turn >= prev.level) return { level: turn, max, calmTurns: 0 };
  if (prev.level === 3) return { level: 3, max, calmTurns: 0 };
  const calmTurns = prev.calmTurns + 1;
  if (calmTurns >= 3 && prev.level > 0) return { level: (prev.level - 1) as RiskLevel, max, calmTurns: 0 };
  return { level: prev.level, max, calmTurns };
}

export const userSafeAcknowledged = (prev: RiskState): RiskState => ({ ...prev, level: 1, calmTurns: 0 });

// Fixed, reviewed Level 3 script (PRD §6.4). Never AI-generated.
export const level3Script = (trustedName: string | null) =>
  `I’m really glad you told me. Your safety matters most right now. I’m an AI, so I can’t be there the way a person can. Let’s get you to someone who can. You can call Tele-MANAS free at 14416, any time${
    trustedName ? `, or I can help you call ${trustedName}` : ''
  }.`;
