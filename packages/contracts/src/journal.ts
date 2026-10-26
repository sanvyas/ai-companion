import { z } from 'zod';
import { Mood, Theme, Uuid, RiskLevel } from './common.js';

export const JournalCreateBody = z.object({
  mode: z.enum(['written', 'spoken']),
  prompt: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(20000),
  shared: z.boolean(),
});

export const JournalEntry = z.object({
  id: Uuid,
  mode: z.enum(['written', 'spoken']),
  prompt: z.string().nullable(),
  text: z.string(),
  mood: Mood,
  shared: z.boolean(),
  createdAt: z.string(),
});

export const JournalCreated = z.object({ entry: JournalEntry, riskLevel: RiskLevel });

export const JournalAnalysis = z.object({
  mood: z.enum(['heavier', 'in between', 'lighter']),
  noticed: z.string(),
  memories: z.array(z.object({ id: z.number().int(), theme: Theme, text: z.string(), sensitive: z.boolean() })).max(3),
  hook: z.string(),
  step: z.string(),
  careFlag: z.boolean(),
  riskLevel: RiskLevel,
});

export const JournalCommitBody = z.object({
  savedMemoryIds: z.array(z.number().int()).max(3),
  useHook: z.boolean(),
  addStep: z.boolean(),
});

export const JournalPatchBody = z.object({ shared: z.boolean() });

export type JournalEntry = z.infer<typeof JournalEntry>;
export type JournalAnalysis = z.infer<typeof JournalAnalysis>;
export type JournalCreateBody = z.infer<typeof JournalCreateBody>;
