import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import type { Runtime } from '../runtime/index.js';
import { createLlm, type LlmUsage } from './llm.js';
import { createOtp } from './otp.js';
import { createPush } from './push.js';

/** Records every provider call with its token counts and, when a rate is set, its cost in rupees. */
export function recordUsage(db: Db, log: FastifyBaseLogger, rt: Runtime) {
  return (u: LlmUsage) => {
    const cost = u.ok ? rt.pricing.costInr({ provider: u.provider, inTokens: u.inTokens, outTokens: u.outTokens, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite }) : null;
    // Fire and forget: usage accounting must never slow or fail a conversation.
    withSystem(db, tx => tx.query(
      'INSERT INTO usage_events (user_id, provider, kind, units, latency_ms, ok, model, in_tokens, out_tokens, cache_read, cache_write, cost_inr) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [u.userId ?? null, u.provider, u.kind, u.units, u.latencyMs, u.ok, u.model ?? null, u.inTokens ?? null, u.outTokens ?? null, u.cacheRead ?? null, u.cacheWrite ?? null, cost]))
      .catch(e => log.warn({ err: (e as Error).message }, 'usage_event write failed'));
  };
}

export function createProviders(cfg: Config, db: Db, log: FastifyBaseLogger, rt: Runtime) {
  return {
    llm: createLlm(cfg, () => rt.secrets.get('anthropic', 'api_key'), recordUsage(db, log, rt)),
    otp: createOtp(cfg.otpProvider, log),
    push: createPush(name => rt.secrets.get('webpush', name)),
    // No vendor chosen: voice runs through the browser's own speech engines, and no calls are placed.
    stt: null,
    tts: null,
    telephony: null,
  };
}
