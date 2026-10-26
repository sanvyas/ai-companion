// Rule-based check on AI output (PRD 6.4 step 3). Runs on every sentence before it reaches the user.
// It blocks content that gives method or means information, encourages harm, diagnoses, gives dosing
// advice, or claims to be human. Style rules from the PRD (no guilt, no "you should") live in the prompt.
// A model-based check (apps/api services/safety.ts) additionally runs whenever risk is elevated.

export type OutputVerdict = { ok: true } | { ok: false; reason: 'human_claim' | 'diagnosis' | 'medication' | 'method' | 'encourages_harm' | 'romance' };

const RULES: { reason: Exclude<OutputVerdict, { ok: true }>['reason']; re: RegExp }[] = [
  { reason: 'human_claim', re: /\b(i am|i'm|i’m) (a |an )?(real |actual )?(human|person|woman|man|girl|boy|therapist|doctor|counsel+or)\b(?! (like|and then)\b)/i },
  { reason: 'human_claim', re: /\b(when i was (young|a kid|a child|little|growing up)|my (mother|father|mom|dad|childhood|school days)|as a human|being human myself|i (once )?(felt|went through) (the same|that) (myself|too))\b/i },
  { reason: 'diagnosis', re: /\byou (have|likely have|probably have|seem to have|are suffering from|suffer from|are diagnosed with) (clinical )?(depression|anxiety disorder|bipolar|ptsd|adhd|ocd|schizophrenia|borderline|an? (anxiety|panic|eating|personality) disorder)\b/i },
  { reason: 'diagnosis', re: /\byou(?:'re|’re| are) (clinically )?(depressed|bipolar|schizophrenic|psychotic|mentally ill|anorexic|suicidal)\b/i },
  { reason: 'medication', re: /\b(take|taking|increase|decrease|stop|skip|double) (your|the|a|an) ?[\w-]* ?(dose|dosage|medication|medicine|tablets?|pills?|antidepressants?|sertraline|fluoxetine|escitalopram|alprazolam|clonazepam)\b/i },
  { reason: 'medication', re: /\b\d+\s?(mg|milligrams?)\b/i },
  { reason: 'method', re: /\b(lethal dose|fatal dose|how (much|many) (pills|tablets) (would|will|to)|ways? to (kill|hurt|harm|cut) (yourself|myself)|(hang|hanging|drown|drowning|overdose on|overdosing on|jump(ing)? (off|from)) (yourself|a bridge|a building|a rope))\b/i },
  { reason: 'method', re: /\b(cut(ting)? (yourself(?! (some|a |more|off|loose|free|short))|your (wrists?|arms?|skin|legs?))|hang(ing)? yourself|overdos(e|ing)\b|jump(ing)? (off|from) (a |the )?(bridge|building|roof|balcony|terrace)|starv(e|ing) yourself)\b/i },
  { reason: 'encourages_harm', re: /\b(you (should|ought to|deserve to) (die|disappear|hurt yourself|end it)|better off (dead|gone|without you)|go ahead and (do it|end it)|no one would (miss|care))\b/i },
  { reason: 'romance', re: /\b(i love you|i'm in love with you|i’m in love with you|you are my (girlfriend|boyfriend|soulmate)|i('| a)m your (girlfriend|boyfriend|lover))\b/i },
];

export function checkAiOutput(text: string): OutputVerdict {
  for (const r of RULES) if (r.re.test(text)) return { ok: false, reason: r.reason };
  return { ok: true };
}

/** Fixed, reviewed line used when generation fails the check twice (PRD 6.4 step 3). Never model output. */
export const SAFE_FALLBACK_LINE =
  'I’m here with you. I want to be careful to say this the right way, so I’ll keep it simple. If you’d like to talk to a real person right now, Tele-MANAS is free on 14416, any time. I’m still here too.';
