import { z } from 'zod';
import { Mood, Uuid } from './common.js';

export const PlantKindId = z.enum(['marigold', 'sunflower', 'jasmine', 'mango', 'banyan']);

export const GardenPlant = z.object({
  id: Uuid,
  kind: PlantKindId,
  slot: z.number().int().min(0).max(7),
  /** 0 to 1: how far it has grown, in days they showed up. */
  growth: z.number().min(0).max(1),
  ready: z.boolean(),
  daysLeft: z.number().int().min(0),
  picks: z.number().int().min(0),
});

export const Garden = z.object({
  sunlight: z.number().int().min(0),
  stage: z.number().int().min(0).max(4),
  stageName: z.string(),
  nextAt: z.number().int().nullable(),
  activeDays: z.number().int().min(0),
  treeLevel: z.number().int().min(0).max(4),
  /** What they have done, by kind, over all time. */
  counts: z.record(z.number().int()),
  /** What today already has: the three parts of a day. */
  today: z.object({ checkin: z.boolean(), body: z.boolean(), words: z.boolean(), golden: z.boolean(), mood: Mood.nullable() }),
  /** One flower per journal entry (the latest 12), by the weather of the day it was written on. Oldest first. */
  flowers: z.array(Mood),
  visitors: z.object({ butterflies: z.number().int(), bulbul: z.boolean(), squirrel: z.boolean(), kingfisher: z.boolean() }),
  /** Seeds in the greenhouse: planted on heavy days, sprouted once the day is over. */
  seeds: z.object({ planted: z.number().int(), sprouted: z.number().int() }),
  slots: z.number().int(),
  plants: z.array(GardenPlant),
  /** Plays for each quiet game that they have earned and not yet used. Never expire. */
  tokens: z.object({ gold: z.number().int(), thread: z.number().int(), sky: z.number().int() }),
  /** Which games they have ever earned, so locked ones can say how to unlock. */
  unlocked: z.object({ pot: z.boolean(), thread: z.boolean(), sky: z.boolean() }),
  keepsakes: z.object({ potSeams: z.number().int().min(0).max(6), pots: z.number().int(), flags: z.number().int(), skies: z.array(z.number().int()) }),
  jarCount: z.number().int(),
  boats: z.number().int(),
  rangolis: z.number().int(),
  /** The long road: where they are and roughly how many days of showing up to each isle at their own pace. */
  road: z.object({ perActiveDay: z.number(), current: z.number().int(), isles: z.array(z.object({ name: z.string(), theme: z.string(), at: z.number().int(), days: z.number().int() })) }),
});

export const PlantBody = z.object({ kind: PlantKindId, slot: z.number().int().min(0).max(7) });
/** A paper boat is let go ('boat'); the others are paid for by the game that was played. */
export const KeepsakeBody = z.object({ kind: z.enum(['seam', 'flag', 'sky', 'boat']) });
/** A small JPEG of a rangoli as a data URL. */
export const CreationBody = z.object({ kind: z.literal('rangoli'), image: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).max(90_000) });
export const Creation = z.object({ id: Uuid, kind: z.literal('rangoli'), image: z.string(), createdAt: z.string() });
export const JarBody = z.object({ text: z.string().trim().min(1).max(140) });
export const JarItem = z.object({ id: Uuid, text: z.string(), createdAt: z.string() });

export type Garden = z.infer<typeof Garden>;
export type GardenPlant = z.infer<typeof GardenPlant>;
export type PlantBody = z.infer<typeof PlantBody>;
export type Creation = z.infer<typeof Creation>;
export type JarItem = z.infer<typeof JarItem>;
