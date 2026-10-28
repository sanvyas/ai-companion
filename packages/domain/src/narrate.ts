// Turning a written line into something a person would say aloud, with the pauses a person would leave.
//
// A script read in one breath sounds like a script. People pause after a thought, take a longer breath at "…", slow
// down at the end of a sentence, and leave more room when the aim is to help someone settle or sleep. This splits a
// line into short phrases and says how long to wait after each. The server uses it to stitch natural-sounding audio and
// the phone's own voice uses the same plan, so both breathe the same way.

export type NarrationKind = 'sleep' | 'meditation';
export interface Phrase { text: string; /** Silence to leave after this phrase, in milliseconds. */ pauseMs: number; /** Slightly slower for the last words of a line, as a person trails off. */ slow: boolean }

export interface Rhythm {
  /** After a sentence. */ sentence: number;
  /** After a question (it hangs a little longer). */ question: number;
  /** After a comma-sized break inside a sentence. */ clause: number;
  /** After “…”: a breath, or a held moment. */ breath: number;
}

/** How long to wait, by kind of session and how the person has been feeling (a heavier stretch gets more room). */
export function rhythmFor(kind: NarrationKind, heavier = false): Rhythm {
  const r: Rhythm = kind === 'sleep' ? { sentence: 1300, question: 1700, clause: 480, breath: 2100 } : { sentence: 850, question: 1200, clause: 340, breath: 1500 };
  const f = heavier ? 1.2 : 1;
  return { sentence: Math.round(r.sentence * f), question: Math.round(r.question * f), clause: Math.round(r.clause * f), breath: Math.round(r.breath * f) };
}

const MAX_PHRASE = 90;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** The same line always gets the same small variation (±14%), so a pause is never mechanical and audio can still be cached. */
const vary = (ms: number, seed: string) => Math.round(ms * (0.86 + (hash(seed) % 29) / 100));

/** Cuts a long sentence at commas, dashes and conjunctions into pieces that are comfortable to say in one go. */
function clauses(sentence: string): string[] {
  if (sentence.length <= MAX_PHRASE) return [sentence];
  const parts = sentence.match(/[^,;:—–]+[,;:—–]?/g) ?? [sentence];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && (cur + p).length > MAX_PHRASE) { out.push(cur.trim()); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [sentence];
}

export function phrasesOf(line: string, rhythm: Rhythm): Phrase[] {
  // “…” and “...” are breaths: the thought is held, then continues. Mark them, then cut into sentences.
  const marked = line.replace(/\s+/g, ' ').trim().replace(/(?:…|\.{3})\s*/g, ' ¶ ');
  const raw = marked.split('¶').map(s => s.trim());
  const out: Phrase[] = [];
  raw.forEach((chunk, ci) => {
    if (!chunk) return;
    const sentences = chunk.match(/[^.!?।]+[.!?।]*/g)?.map(s => s.trim()).filter(Boolean) ?? [chunk];
    sentences.forEach((s, si) => {
      const cl = clauses(s);
      cl.forEach((c, k) => {
        const lastClause = k === cl.length - 1;
        const lastSentence = si === sentences.length - 1;
        const endsBreath = lastClause && lastSentence && ci < raw.length - 1 && raw.slice(ci + 1).some(Boolean);
        let pause = rhythm.clause;
        if (lastClause) pause = /\?$/.test(c) ? rhythm.question : rhythm.sentence;
        if (endsBreath) pause = Math.max(pause, rhythm.breath);
        out.push({ text: c, pauseMs: vary(pause, c), slow: false });
      });
    });
  });
  if (out.length) { out[out.length - 1].pauseMs = 0; out[out.length - 1].slow = out.length > 1 || out[out.length - 1].text.length > 30; }
  return out;
}

/** Total length of the pauses in a plan, for tests and for estimating how long a line takes. */
export const pauseTotalMs = (p: Phrase[]) => p.reduce((a, x) => a + x.pauseMs, 0);
