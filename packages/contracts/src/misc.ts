import { z } from 'zod';
import { IsoDate, Mood, Theme, Uuid } from './common.js';

// ---- memory
export const MemoryItem = z.object({
  id: Uuid, theme: Theme, text: z.string(), sensitive: z.boolean(), hidden: z.boolean(),
  source: z.enum(['chat', 'call', 'journal', 'onboarding']), createdAt: z.string(),
});
export const MemoryPatch = z.object({ text: z.string().trim().min(1).max(120).optional(), hidden: z.boolean().optional() });
export const MemoryBulkBody = z.object({
  items: z.array(z.object({ theme: Theme, text: z.string().trim().min(1).max(120), sensitive: z.boolean().default(false) })).min(1).max(10),
  source: z.enum(['chat', 'call', 'journal']).default('chat'),
  sourceId: Uuid.optional(),
});

// ---- mood, plan, insights
export const MoodBody = z.object({ value: Mood, source: z.enum(['tap', 'checkin', 'journal']).default('tap') });
export const PlanItem = z.object({ id: Uuid, label: z.string(), done: z.boolean(), source: z.enum(['ai', 'user', 'journal', 'checkin']) });
export const PlanCreateBody = z.object({ label: z.string().trim().min(1).max(120), source: z.enum(['user', 'journal', 'checkin']).default('user') });
export const PlanPatchBody = z.object({ done: z.boolean() });
export const Insights = z.object({
  moodSeries: z.array(z.object({ day: IsoDate, value: Mood })),
  rhythms: z.array(z.string()),
  wins: z.array(z.object({ id: Uuid, kind: z.string(), label: z.string(), createdAt: z.string() })),
  daysOfData: z.number().int(),
});
export const Letter = z.object({ id: Uuid, weekStart: IsoDate, body: z.string(), createdAt: z.string() });

// ---- safety
export const SafetyPlan = z.object({
  warningSigns: z.array(z.string().max(200)).max(10),
  copingSteps: z.array(z.string().max(200)).max(10),
  people: z.array(z.object({ name: z.string().max(60), phone: z.string().max(20).optional() })).max(10),
  places: z.array(z.string().max(120)).max(10),
  professionals: z.array(z.string().max(200)).max(10),
  makingSpaceSafer: z.array(z.string().max(200)).max(10).default([]),
});
export const Helpline = z.object({ id: z.string(), name: z.string(), description: z.string(), number: z.string(), tel: z.string(), kind: z.enum(['crisis', 'emergency', 'youth', 'ngo']), hours: z.string(), languages: z.array(z.string()), city: z.string().nullable(), stale: z.boolean() });
export const SafetyAckBody = z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), action: z.enum(['helpline', 'contact', 'safe', 'emergency']) });

// ---- calm
export const CalmItem = z.object({ id: z.string(), kind: z.enum(['meditation', 'sleep']), category: z.string(), title: z.string(), minutes: z.number(), description: z.string(), tint: z.string(), defaultBg: z.string().nullable(), hasTranscript: z.boolean(), audioUrl: z.string().nullable() });
export const CalmItemFull = CalmItem.extend({ lines: z.array(z.string()).nullable() });
export const CalmSessionBody = z.object({ itemId: z.string().max(64), bgSound: z.string().max(32).optional(), timerMinutes: z.number().int().min(1).max(240).optional() });
export const CalmSessionPatch = z.object({ completedPct: z.number().int().min(0).max(100) });

// ---- outside
export const OutsideEvent = z.object({ id: z.string(), city: z.string(), title: z.string(), venue: z.string(), startsAt: z.string(), beginnerFriendly: z.boolean(), groupSize: z.string().nullable(), category: z.string(), price: z.string(), organiser: z.string().nullable(), details: z.record(z.unknown()), interested: z.boolean() });

// ---- notifications
export const NotificationPrefs = z.object({
  quietCards: z.boolean(), push: z.boolean(), calls: z.boolean(), sundayLetter: z.boolean(),
  checkinTime: z.enum(['morning', 'evening', 'off']),
  quietHours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  followUpAfterHardDay: z.boolean(),
});
export const NotificationPrefsUpdate = NotificationPrefs.partial();
export const DeviceBody = z.object({
  platform: z.enum(['web', 'ios', 'android']),
  /** Web: the PushSubscription JSON. Native: the device token string. */
  subscription: z.union([z.string().min(8).max(4096), z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) })]),
});

// ---- billing
export const Plan = z.object({ id: z.enum(['basic', 'plus']), name: z.string(), priceInr: z.number().nullable(), features: z.array(z.string()) });

export type MemoryItem = z.infer<typeof MemoryItem>;
export type PlanItem = z.infer<typeof PlanItem>;
export type Insights = z.infer<typeof Insights>;
export type SafetyPlan = z.infer<typeof SafetyPlan>;
export type Helpline = z.infer<typeof Helpline>;
export type CalmItem = z.infer<typeof CalmItem>;
export type OutsideEvent = z.infer<typeof OutsideEvent>;
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;
