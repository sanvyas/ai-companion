import { z } from 'zod';
import { Language, Look, Voice } from './common.js';

export const Consent = z.object({
  version: z.number().int(),
  acceptedAt: z.string().nullable(),
  remember: z.boolean(),
  notifications: z.boolean(),
  calls: z.boolean(),
  healthData: z.boolean(),
  location: z.enum(['off', 'city', 'precise']),
  improveModels: z.boolean(),
  /** Share which screens and buttons are used (never what is written or said) so the product can improve. */
  analytics: z.boolean(),
});
export const ConsentUpdate = Consent.omit({ version: true, acceptedAt: true }).partial();

export const Privacy = z.object({
  lockScreenPreviews: z.boolean(),
  discreetMode: z.boolean(),
  appLock: z.enum(['off', 'biometric', 'pin']),
  quickHide: z.boolean(),
  transcriptRetentionDays: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90), z.literal(36500)]),
});
export const PrivacyUpdate = Privacy.partial();

export const Companion = z.object({
  name: z.string().trim().min(1).max(24),
  look: Look,
  voice: Voice,
});
export const CompanionUpdate = Companion.partial();

export const TrustedContact = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(20),
  relation: z.string().trim().max(40).default(''),
});

export const Me = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  language: Language,
  timezone: z.string(),
  city: z.string().nullable(),
  phoneMasked: z.string().nullable(),
  subscription: z.enum(['basic', 'plus']),
  ageConfirmed18: z.boolean(),
  onboarded: z.boolean(),
  pendingDeletion: z.boolean(),
  consent: Consent,
  privacy: Privacy,
  companion: Companion,
  trustedContact: z.object({ name: z.string(), relation: z.string(), phoneMasked: z.string() }).nullable(),
  /** Feature flags that apply to this person, set from the admin portal. */
  flags: z.record(z.boolean()),
  features: z.object({ otp: z.boolean(), google: z.boolean(), llm: z.boolean(), stt: z.boolean(), tts: z.boolean(), push: z.boolean(), calls: z.boolean() }),
});

export const MeUpdate = z.object({
  nickname: z.string().trim().min(1).max(24).optional(),
  language: Language.optional(),
  timezone: z.string().max(64).optional(),
  city: z.string().trim().max(60).nullable().optional(),
  onboarded: z.boolean().optional(),
});

export const AgeBody = z.object({ confirmed18: z.boolean(), dobYear: z.number().int().min(1900).max(2100).optional() });

export type Consent = z.infer<typeof Consent>;
export type ConsentUpdate = z.infer<typeof ConsentUpdate>;
export type Privacy = z.infer<typeof Privacy>;
export type PrivacyUpdate = z.infer<typeof PrivacyUpdate>;
export type Companion = z.infer<typeof Companion>;
export type TrustedContact = z.infer<typeof TrustedContact>;
export type Me = z.infer<typeof Me>;
export type MeUpdate = z.infer<typeof MeUpdate>;
