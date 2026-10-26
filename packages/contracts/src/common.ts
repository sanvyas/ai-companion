import { z } from 'zod';

export const Language = z.enum(['en', 'hinglish', 'hi']);
export const Look = z.enum(['orb', 'asha', 'dev', 'noor', 'kabir']);
export const Voice = z.enum(['warm', 'steady', 'bright']);
export const ConversationMode = z.enum(['voice', 'video', 'text', 'sit', 'checkin', 'walk']);
export const RiskLevel = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const Theme = z.enum(['People', 'Work and study', 'Sleep', 'What helps', 'Feelings', 'Plans']);
export const Mood = z.number().int().min(0).max(4);
export const Emotion = z.enum(['idle', 'listening', 'thinking', 'concerned', 'smiling']);
export const Uuid = z.string().uuid();
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export const Page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export type Language = z.infer<typeof Language>;
export type Look = z.infer<typeof Look>;
export type Voice = z.infer<typeof Voice>;
export type ConversationMode = z.infer<typeof ConversationMode>;
export type RiskLevel = z.infer<typeof RiskLevel>;
export type Theme = z.infer<typeof Theme>;
export type Emotion = z.infer<typeof Emotion>;
