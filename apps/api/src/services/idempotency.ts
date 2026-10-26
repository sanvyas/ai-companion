import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { uid } from '../http.js';

/**
 * POST idempotency (PRD section 7): a repeat of the same Idempotency-Key replays the stored response instead
 * of creating a second journal entry, conversation, and so on. Without a key the handler just runs.
 */
export async function withIdempotency(ctx: Ctx, req: FastifyRequest, reply: FastifyReply, run: () => Promise<{ status: number; body: unknown }>) {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key || key.length > 80) {
    const r = await run();
    return reply.code(r.status).send(r.body);
  }
  const userId = uid(req);
  const hit = await withUser(ctx.db, userId, async tx => (await tx.query('SELECT status, response FROM idempotency_keys WHERE user_id = $1 AND key = $2', [userId, key])).rows[0] ?? null);
  if (hit) { reply.header('Idempotent-Replay', 'true'); return reply.code(hit.status).send(hit.response); }
  const r = await run();
  await withUser(ctx.db, userId, tx => tx.query('INSERT INTO idempotency_keys (user_id, key, method, path, status, response) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [userId, key, req.method, req.url.split('?')[0], r.status, JSON.stringify(r.body)]));
  return reply.code(r.status).send(r.body);
}
