import { z } from 'zod';
import { Mood } from './common.js';

export const MonthKind = z.enum(['walk', 'friend', 'out', 'sleep', 'talk', 'breathe', 'journal', 'play', 'step', 'show']);
export const Feeling = z.enum(['anxious', 'low', 'tired', 'lonely', 'okay']);

/** Something only they can tell us: a friend they called, a game they played, a day they showed up, or whether something helped. */
export const ActivityBody = z.object({ kind: MonthKind, feeling: Feeling.optional(), helped: z.boolean().optional() });

/** The last four weeks as the third design shows them. What they did is worked out from what the app already counts. */
export const Month = z.object({
  /** Their local day, and the day they joined (which decides how the month is shown this time). */
  today: z.string(),
  signedUp: z.string(),
  /** One entry for each day with anything in it, oldest first. */
  days: z.array(z.object({ day: z.string(), kinds: z.array(MonthKind), mood: Mood.nullable() })),
  /** What they tried when they felt a certain way, and whether it helped. The latest few hundred. */
  help: z.array(z.object({ feeling: Feeling, kind: MonthKind, helped: z.boolean() })),
});

export type MonthT = z.infer<typeof Month>;
export type ActivityBodyT = z.infer<typeof ActivityBody>;
