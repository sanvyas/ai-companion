import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { Crypto } from './crypto/envelope.js';
import type { Db } from './db/pool.js';
import type { LlmProvider } from './providers/llm.js';
import type { OtpProvider } from './providers/otp.js';
import type { PushProvider } from './providers/push.js';
import type { SttProvider, Transcriber, TtsProvider } from './providers/voice.js';
import type { TelephonyProvider } from './providers/telephony.js';
import type { Runtime } from './runtime/index.js';

export interface Ctx {
  cfg: Config;
  db: Db;
  crypto: Crypto;
  /** Settings, flags, credentials, prompts and prices that the admin portal can change while the app runs. */
  rt: Runtime;
  llm: LlmProvider;
  otp: OtpProvider;
  push: PushProvider;
  stt: SttProvider | null;
  tts: TtsProvider | null;
  /** Speech-to-text for short recordings (journal dictation). */
  transcriber: Transcriber | null;
  telephony: TelephonyProvider | null;
  log: FastifyBaseLogger;
  /** Outbound HTTP for the Developer page. Tests replace it; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}
