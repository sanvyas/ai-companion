import { z } from 'zod';

const b64key = (name: string) =>
  z
    .string({ required_error: `${name} is required. Run \`npm run gen:secrets -w @saathi/api\` and paste the output into .env` })
    .refine(v => Buffer.from(v, 'base64').length === 32, `${name} must be 32 random bytes, base64-encoded`);

const bool = z.enum(['0', '1', 'true', 'false']).transform(v => v === '1' || v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),

  /** Postgres connection string. Supabase: Project Settings > Database > Connection string (Mumbai region). */
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  DATABASE_SSL: bool.default('false'),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  /** Browser origin(s) allowed to call the API, comma separated. */
  WEB_ORIGINS: z.string().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  /** 32-byte keys, base64. DATA_KEK wraps each user's data key. PHONE_HASH_KEY makes phone lookups possible without storing phones in clear. */
  DATA_KEK: b64key('DATA_KEK'),
  PHONE_HASH_KEY: b64key('PHONE_HASH_KEY'),
  OTP_PEPPER: z.string().min(16, 'OTP_PEPPER must be at least 16 characters'),

  /** 'none' = sending is not configured (sign-in is refused in production). 'console' = dev only, prints the code. */
  OTP_PROVIDER: z.enum(['none', 'console']).optional(),
  OTP_TTL_SECONDS: z.coerce.number().default(300),

  GOOGLE_CLIENT_ID: z.string().optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'mock']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Live conversation turns. Voice has a ~1.2s first-audio budget (PRD 4), so this defaults to a fast model. */
  MODEL_COMPANION: z.string().default('claude-sonnet-5-5'),
  /** Server-side safety classifier on every user turn and AI draft. */
  MODEL_SAFETY: z.string().default('claude-haiku-5-5'),
  /** Journal analysis, summaries, memory proposals, weekly letter. */
  MODEL_ANALYSIS: z.string().default('claude-opus-5-5'),

  STT_PROVIDER: z.enum(['none']).default('none'),
  TTS_PROVIDER: z.enum(['none']).default('none'),
  TELEPHONY_PROVIDER: z.enum(['none']).default('none'),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@example.com'),

  BASIC_VOICE_MINUTES_PER_DAY: z.coerce.number().default(10),
  RUN_WORKER: bool.default('true'),
  /** Multiplies every HTTP rate limit. Leave at 1 outside tests. */
  RATE_LIMIT_SCALE: z.coerce.number().min(1).default(1),
});

export type Config = z.infer<typeof schema> & {
  otpProvider: 'none' | 'console';
  llmProvider: 'anthropic' | 'mock' | 'none';
  webOrigins: string[];
  isProd: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  const otpProvider = c.OTP_PROVIDER ?? (isProd ? 'none' : 'console');
  if (isProd && otpProvider === 'console') throw new Error('OTP_PROVIDER=console is development only and refused in production');
  const llmProvider = c.LLM_PROVIDER ?? (c.ANTHROPIC_API_KEY ? 'anthropic' : 'none');
  if (isProd && llmProvider === 'mock') throw new Error('LLM_PROVIDER=mock is for tests and local development only');
  if (llmProvider === 'anthropic' && !c.ANTHROPIC_API_KEY) throw new Error('LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY');
  return { ...c, otpProvider, llmProvider, isProd, webOrigins: c.WEB_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) };
}
