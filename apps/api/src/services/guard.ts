import { checkAiOutput, describeHits, findUnsafeLanguage } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { captureError } from '../admin/errors.js';
import { prompt } from '../runtime/prompts.js';

// Everything the model writes for a person to read passes through here, not only chat replies: plans, letters,
// summaries, memories, check-in notes, stories. The prompts ask for gentle, safe language; this makes sure that holds.
// A draft that trips the word list or the output rules gets one strict retry, then a fixed, reviewed fallback. What was
// wrong is recorded by category only, so the portal can show how often it happens without ever storing the words.

export interface Safe<T> { value: T; usedFallback: boolean; attempts: number }

/** True when every text is free of trigger words and passes the output rules. */
export const allClean = (texts: string[]) => texts.every(t => !t.trim() || (checkAiOutput(t).ok && findUnsafeLanguage(t).length === 0));

export async function generateSafe<T>(ctx: Ctx, o: {
  /** What this is, for the log: "plan", "letter", "story"... */
  label: string;
  /** Produce a draft. `hint` is null on the first try and the strict-rewrite instruction on the retry. */
  run: (hint: string | null) => Promise<T>;
  /** Every string in the draft that a person might read. */
  texts: (v: T) => string[];
  fallback: () => T;
}): Promise<Safe<T>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await o.run(attempt === 0 ? null : prompt('safety.strict'));
    const texts = o.texts(draft);
    if (allClean(texts)) return { value: draft, usedFallback: false, attempts: attempt + 1 };
    const cats = describeHits(texts.flatMap(t => findUnsafeLanguage(t)));
    ctx.log.warn({ label: o.label, attempt, categories: cats || 'output_rules' }, 'generated text was held back');
    captureError(ctx, { source: 'api', route: `content/${o.label}`, code: 'unsafe_language', message: `held back: ${cats || 'output rules'}` });
  }
  return { value: o.fallback(), usedFallback: true, attempts: 2 };
}

/** Keep only the strings that are clean (for lists where one bad item should not cost the others). */
export const keepClean = <T>(items: T[], text: (t: T) => string): T[] => items.filter(i => allClean([text(i)]));
