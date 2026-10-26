import { z } from 'zod';

export const PhoneInput = z.string().trim().min(8).max(20);

export const OtpStartBody = z.object({
  phone: PhoneInput,
  /** The age gate is asked before sign-in (PRD 8.1). A false never reaches the server as an account. */
  ageConfirmed18: z.boolean(),
});
export const OtpStartResponse = z.object({
  challengeId: z.string().uuid(),
  expiresInSeconds: z.number(),
  resendAfterSeconds: z.number(),
  /** Present only when OTP_PROVIDER=console (development). Never in production. */
  devCode: z.string().optional(),
});

export const OtpVerifyBody = z.object({
  phone: PhoneInput,
  code: z.string().regex(/^\d{6}$/),
  challengeId: z.string().uuid().optional(),
  ageConfirmed18: z.boolean(),
  nickname: z.string().trim().min(1).max(24).optional(),
  deviceLabel: z.string().max(80).optional(),
});

export const GoogleBody = z.object({
  idToken: z.string().min(20),
  ageConfirmed18: z.boolean(),
  nickname: z.string().trim().min(1).max(24).optional(),
  deviceLabel: z.string().max(80).optional(),
});

export const RefreshBody = z.object({ refreshToken: z.string().min(20) });

export const Session = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number(),
  isNewUser: z.boolean(),
  pendingDeletion: z.boolean().default(false),
});

export type OtpStartBody = z.infer<typeof OtpStartBody>;
export type OtpStartResponse = z.infer<typeof OtpStartResponse>;
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;
export type Session = z.infer<typeof Session>;
