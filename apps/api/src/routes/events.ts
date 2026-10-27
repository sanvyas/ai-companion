import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { withSystem, withUser } from '../db/pool.js';
import { parse, uid } from '../http.js';
import { assertAdult } from '../services/users.js';

// Product analytics ingestion. Collected only from people who switched on "Share how I use Saathi", and only things
// that cannot hold personal content: a screen name, a tagged button id, a named step, a duration. Free text is
// refused by the shape of the schema, not by trust.

const Id = z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/i);
const Event = z.object({
  name: z.enum(['screen_view', 'click', 'step', 'error']),
  screen: Id.optional(),
  el: Id.optional(),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  step: Id.optional(),
  result: Id.optional(),
  at: z.number().int().optional(),
});
export const EventsBody = z.object({
  sessionId: z.string().regex(/^[\w-]{8,40}$/),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
  appVersion: z.string().max(20).optional(),
  events: z.array(Event).min(1).max(50),
});

/** A one-way id: the same person always maps to the same value, but the user id cannot be read back from it. */
export const anonId = (ctx: Pick<Ctx, 'crypto'>, userId: string) => ctx.crypto.lookupHash('analytics', userId).toString('hex').slice(0, 32);

export function eventRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/events', { preHandler: app.auth, config: { rateLimit: { max: 60 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = uid(req);
    const b = parse(EventsBody, req.body);
    if (!ctx.rt.settings.bool('analytics.enabled')) return reply.code(202).send({ accepted: 0 });
    await assertAdult(ctx, userId);
    const consented = await withUser(ctx.db, userId, async tx => (await tx.query('SELECT analytics FROM consents WHERE user_id = $1', [userId])).rows[0]?.analytics === true);
    if (!consented) return reply.code(202).send({ accepted: 0 });

    const anon = anonId(ctx, userId);
    const now = Date.now();
    await withSystem(ctx.db, async tx => {
      for (const e of b.events) {
        // Client clocks are not trusted: an event time is only used if it is recent, otherwise the server time stands.
        const at = e.at && Math.abs(now - e.at) < 10 * 60_000 ? new Date(e.at) : new Date(now);
        const props: Record<string, string> = {};
        if (e.step) props.step = e.step;
        if (e.result) props.result = e.result;
        await tx.query(
          `INSERT INTO analytics_events (created_at, anon_id, session_id, name, screen, el, duration_ms, props, app_version, platform) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [at, anon, b.sessionId, e.name, e.screen ?? null, e.el ?? null, e.durationMs ?? null, JSON.stringify(props), b.appVersion ?? null, b.platform]);
      }
    });
    return reply.code(202).send({ accepted: b.events.length });
  });
}
