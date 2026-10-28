import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { captureError } from '../admin/errors.js';
import { LlmUnavailable } from '../providers/llm.js';

/**
 * Writes a model outage to the portal's error log (grouped, so a hundred failed turns are one line with a count).
 * Only the vendor's own message is recorded, never anything a person said. Before this, a key that was accepted but
 * could not pay for its model made every conversation go silent while the portal looked healthy.
 */
export function reportLlmFailure(ctx: Ctx, where: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  captureError(ctx, { source: 'api', route: `llm/${where}`, code: err instanceof LlmUnavailable ? 'llm_unavailable' : 'llm_failed', message: err.message });
}

/** Milliseconds from the turn arriving to each stage. Missing stages did not happen (a turn without a model call has no first token). */
export interface TurnTiming { contextMs?: number; classifierMs?: number; firstTokenMs?: number; firstSentenceMs?: number; totalMs?: number }

/**
 * Keeps how long a turn took (time to the first sentence, and in total) beside the other usage records, so the portal can
 * show how fast conversations are and which stage is slow. It holds numbers only.
 */
export function recordTurnTiming(ctx: Ctx, userId: string, mode: string, t: TurnTiming) {
  if (t.firstSentenceMs === undefined) return;
  withSystem(ctx.db, tx => tx.query(`INSERT INTO usage_events (user_id, provider, kind, units, latency_ms, ok, model) VALUES ($1, 'turn', 'turn', $2, $3, true, $4)`, [userId, t.totalMs ?? 0, t.firstSentenceMs, `${mode}|ctx${t.contextMs ?? ''}|cls${t.classifierMs ?? ''}|tok${t.firstTokenMs ?? ''}`]))
    .catch(() => undefined);
}

/** The same turn as the person felt it: browser wait to decide they had finished, then reply to first sound. Numbers only. */
export function recordClientLatency(ctx: Ctx, userId: string, mode: string, endpointMs: number, replyMs: number) {
  withSystem(ctx.db, tx => tx.query(`INSERT INTO usage_events (user_id, provider, kind, units, latency_ms, ok, model) VALUES ($1, 'client', 'client_turn', $2, $3, true, $4)`, [userId, endpointMs, replyMs, mode]))
    .catch(() => undefined);
}
