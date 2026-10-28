import { z } from 'zod';
import { detectMood, type Emotion, type MoodReading } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { prompt } from '../runtime/prompts.js';
import { wrapUser } from './safety.js';

// A second opinion on how a message feels, from a small fast model. The word list reads the message instantly and for
// free; this reads it the way a person would (what is meant, not just which words appear) and arrives a moment later,
// after the reply is already on its way. It only ever informs the tone of later turns and the mood summaries; it never
// delays a reply and it is allowed to fail quietly.

const EMOTIONS = ['sad', 'lonely', 'anxious', 'angry', 'overwhelmed', 'tired', 'numb', 'ashamed', 'happy', 'excited', 'grateful', 'calm', 'hopeful', 'neutral'] as const;
const Affect = z.object({ valence: z.number().int().min(-2).max(2), emotion: z.enum(EMOTIONS), arousal: z.enum(['low', 'steady', 'high']) });
const AFFECT_JSON = {
  type: 'object',
  properties: { valence: { type: 'integer', enum: [-2, -1, 0, 1, 2] }, emotion: { type: 'string', enum: [...EMOTIONS] }, arousal: { type: 'string', enum: ['low', 'steady', 'high'] } },
  required: ['valence', 'emotion', 'arousal'], additionalProperties: false,
};

/** The model's reading of the latest message, or null if there is no model or it did not answer. */
export async function readAffect(ctx: Ctx, userId: string, text: string, recent: string[]): Promise<MoodReading | null> {
  if (!ctx.llm.configured) return null;
  try {
    const out = await ctx.llm.json({
      task: 'affect', model: ctx.rt.model('safety'), userId, maxTokens: 40, effort: 'low',
      system: { stable: prompt('affect') },
      messages: [{ role: 'user', content: `${recent.length ? `Earlier in this conversation they said:\n${recent.map(r => `- ${r.slice(0, 200)}`).join('\n')}\n\n` : ''}Latest message:\n${wrapUser(text)}` }],
      schemaName: 'affect', jsonSchema: AFFECT_JSON, parse: v => Affect.parse(v),
    });
    const emotions: Emotion[] = out.emotion === 'neutral' ? [] : [out.emotion];
    return { valence: out.valence as MoodReading['valence'], score: out.valence, arousal: out.arousal, emotions, confidence: out.emotion === 'neutral' && out.valence === 0 ? 0.25 : 0.85 };
  } catch (e) {
    ctx.log.debug({ err: (e as Error).message }, 'affect reading unavailable');
    return null;
  }
}

/** The word-list reading, kept only when it actually found a feeling. */
export const wordReading = (text: string): MoodReading => detectMood(text);
