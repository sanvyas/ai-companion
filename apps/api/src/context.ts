import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { Crypto } from './crypto/envelope.js';
import type { Db } from './db/pool.js';
import type { LlmProvider } from './providers/llm.js';
import type { OtpProvider } from './providers/otp.js';
import type { PushProvider } from './providers/push.js';
import type { SttProvider, TtsProvider } from './providers/voice.js';
import type { TelephonyProvider } from './providers/telephony.js';

export interface Ctx {
  cfg: Config;
  db: Db;
  crypto: Crypto;
  llm: LlmProvider;
  otp: OtpProvider;
  push: PushProvider;
  stt: SttProvider | null;
  tts: TtsProvider | null;
  telephony: TelephonyProvider | null;
  log: FastifyBaseLogger;
}
