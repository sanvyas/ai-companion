import { z } from 'zod';
import type { StoryResponse, StoryTheme } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { generateSafe } from './guard.js';
import { recentMood } from './moodSummary.js';
import { storySystem } from './prompts.js';

// A short story to listen to, written for this person's evening. The theme comes from a fixed list (never free text, so
// nothing a person types can steer the writing), the mood comes from their recent taps, and every line passes the same
// word check as a chat reply. If the model is off or the draft cannot be made clean, a reviewed story is used instead.

/** Reviewed stories used when a fresh one cannot be written. Every line is checked by the lexicon test. */
export const FALLBACK_STORIES: Record<StoryTheme, { title: string; lines: string[] }> = {
  rain: {
    title: 'Rain on the veranda',
    lines: [
      'Tonight you are on a quiet veranda, and the first soft rain of the evening has just begun.',
      'There is nothing you need to do. Just listen, and let your body get heavy and warm.',
      'The air smells of wet earth. A string of small lamps glows along the railing.',
      'Someone has left a cup of ginger tea beside your chair. It is exactly warm enough.',
      'The rain taps on the roof, slow and even, like a friend knocking gently, again and again.',
      'You pull a soft shawl over your shoulders. Your breath slows to match the rain.',
      'Far off, a temple bell rings once, and the sound melts into the evening.',
      'The rain keeps its easy rhythm. You are warm, you are dry, and you are right where you should be.',
      'Let the sound carry the day away, a little at a time.',
      'Rest here as long as you like. Sleep well.',
    ],
  },
  garden: {
    title: 'A garden at dusk',
    lines: [
      'This evening you are walking through a quiet garden, just as the light turns golden.',
      'The path under your feet is soft. Each step is slow, and each step is enough.',
      'Jasmine is in bloom, and the air is cool and sweet.',
      'A gardener smiles at you and goes back to watering the roses. Nobody is in a hurry.',
      'You find a wooden bench beneath an old mango tree and sit down.',
      'The sky turns orange, then pink, then a gentle blue. The first star appears.',
      'Crickets begin their soft song. It rises and falls, rises and falls.',
      'Your shoulders drop. Your hands rest easy in your lap.',
      'The garden is settling for the night, and so are you.',
      'Rest here as long as you like. Sleep well.',
    ],
  },
  train: {
    title: 'The slow evening train',
    lines: [
      'Tonight you are on a slow train, heading somewhere gentle.',
      'Your seat is by the window, with a soft cushion behind you.',
      'The train pulls out gently. The station lights slide past, one by one.',
      'Outside, fields stretch out in the last of the light. Buffalo rest by a pond, and the water shines.',
      'The wheels keep a steady rhythm, over and over, like a lullaby.',
      'A chai seller passes through the carriage, and the smell of warm tea drifts by.',
      'You hold a small cup in both hands. The warmth settles in your chest.',
      'The carriage rocks you, side to side, as though you were being held.',
      'There is nowhere to be until morning. The train will carry you.',
      'Rest now. Sleep well.',
    ],
  },
  sea: {
    title: 'The shore at sunset',
    lines: [
      'Tonight you are on a quiet beach, as the day grows soft and slow.',
      'The sand is warm under your feet, and the breeze is gentle.',
      'Small waves roll in, spread out, and slip back again. In, and out. In, and out.',
      'You find a flat rock and sit. The sun is low and the water shines like a lamp.',
      'Somewhere down the shore, a family laughs quietly and then it is still.',
      'Your breath follows the waves. In with the water, out with the water.',
      'The sky turns pink and gold, then lavender.',
      'You pull your shawl around you. The sand holds the last of the day’s warmth.',
      'The sea keeps its patient rhythm. You do not have to do anything but listen.',
      'Rest here as long as you like. Sleep well.',
    ],
  },
  village: {
    title: 'Evening in a small village',
    lines: [
      'Tonight you are in a small village, at the hour when the day begins to slow.',
      'Warm light glows from the kitchen windows, and the air smells of fresh rotis.',
      'Cows wander home along the lane, their bells ringing low and soft.',
      'A woman at her doorway waves and smiles. You wave back.',
      'Children play a quiet game of marbles, and the sound of it is light and cheerful.',
      'You sit on a charpai beneath a neem tree. The evening breeze moves the leaves.',
      'Someone hands you a warm glass of milk. It tastes of cardamom and kindness.',
      'The sky turns orange, then violet. Lamps come on in the windows, one by one.',
      'The whole village settles around you, gentle and unhurried.',
      'Rest here as long as you like. Sleep well.',
    ],
  },
  courtyard: {
    title: 'A courtyard in the evening',
    lines: [
      'Tonight you are in a peaceful courtyard, at the end of a long day.',
      'The floor is cool and swept clean. A little lamp flickers in a niche in the wall.',
      'A tulsi plant stands in the middle, and its fragrance floats on the air.',
      'You settle onto a soft mat. A blanket is folded beside you, if you want it.',
      'Above you, the sky is a calm, clear blue turning to night.',
      'From a kitchen nearby comes the quiet sound of a spoon in a pot, and the smell of something warm.',
      'You breathe in, and the air is cool. You breathe out, and your shoulders drop.',
      'The day is finished. Everything that needed doing has been done enough.',
      'The lamp glows steadily. The courtyard holds you.',
      'Rest here as long as you like. Sleep well.',
    ],
  },
};

const THEME_WORDS: Record<StoryTheme, string> = {
  rain: 'soft rain on a veranda or a tin roof, with warm tea',
  garden: 'a quiet garden at dusk, with flowers, a bench and crickets',
  train: 'a slow, comfortable train in the evening, with a window seat',
  sea: 'a calm beach at sunset, with gentle waves',
  village: 'a small, friendly village in the evening, with lamps and kind neighbours',
  courtyard: 'a peaceful courtyard at night, with a lamp and a tulsi plant',
};

const StorySchema = z.object({ title: z.string().max(60), lines: z.array(z.string().max(500)).min(5).max(14) });
const STORY_JSON = {
  type: 'object',
  properties: { title: { type: 'string' }, lines: { type: 'array', minItems: 5, maxItems: 14, items: { type: 'string' } } },
  required: ['title', 'lines'], additionalProperties: false,
};

const LANG = { en: 'English', hinglish: 'Hinglish in Latin script', hi: 'Hindi (Devanagari)' } as const;

export async function makeStory(ctx: Ctx, userId: string, theme: StoryTheme): Promise<StoryResponse> {
  const fallback = () => ({ ...FALLBACK_STORIES[theme], generated: false });
  if (!ctx.llm.configured) return fallback();

  const language = (await withUser(ctx.db, userId, tx => tx.query<{ language: keyof typeof LANG }>('SELECT language FROM users WHERE id = $1', [userId]))).rows[0]?.language ?? 'en';
  const mood = (await recentMood(ctx, userId)).label;

  const system = storySystem({ language: LANG[language], theme: THEME_WORDS[theme], mood });
  try {
    const safe = await generateSafe(ctx, {
      label: 'story',
      run: hint => ctx.llm.json({
        task: 'story', model: ctx.rt.model('companion'), userId, maxTokens: 1400, effort: 'low',
        system: { stable: hint ? `${system}\n\n${hint}` : system },
        messages: [{ role: 'user', content: 'Write the story now.' }],
        schemaName: 'story', jsonSchema: STORY_JSON, parse: v => StorySchema.parse(v),
      }),
      texts: v => [v.title, ...v.lines],
      fallback: () => FALLBACK_STORIES[theme],
    });
    return { title: safe.value.title, lines: safe.value.lines, generated: !safe.usedFallback };
  } catch (err) {
    ctx.log.warn({ err: (err as Error).message }, 'story generation failed; using a reviewed story');
    return fallback();
  }
}
