import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import { createLlm, type LlmUsage } from './llm.js';
import { createOtp } from './otp.js';
import { createPush } from './push.js';

export function recordUsage(db: Db, log: FastifyBaseLogger) {
  return (u: LlmUsage) => {
    // Fire and forget: usage accounting must never slow or fail a conversation.
    withSystem(db, tx => tx.query('INSERT INTO usage_events (user_id, provider, kind, units, latency_ms, ok) VALUES ($1,$2,$3,$4,$5,$6)', [u.userId ?? null, u.provider, u.kind, u.units, u.latencyMs, u.ok]))
      .catch(e => log.warn({ err: (e as Error).message }, 'usage_event write failed'));
  };
}

export function createProviders(cfg: Config, db: Db, log: FastifyBaseLogger) {
  return {
    llm: createLlm(cfg, recordUsage(db, log)),
    otp: createOtp(cfg.otpProvider, log),
    push: createPush(cfg),
    // No vendor chosen: voice runs through the browser's own speech engines, and no calls are placed.
    stt: null,
    tts: null,
    telephony: null,
  };
}
