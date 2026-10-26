import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { listHelplines } from '../services/helplines.js';

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await withSystem(ctx.db, tx => tx.query('SELECT 1'));
      return { ok: true, llm: ctx.llm.name, otp: ctx.otp.name };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  // Public on purpose: the under-18 exit and the crisis screen must work before (and without) sign-in.
  app.get('/helplines', { config: { rateLimit: { max: 120 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async req => {
    const q = req.query as { lang?: string; city?: string; kind?: string };
    return { items: await listHelplines(ctx, { lang: q.lang, city: q.city, kind: q.kind }) };
  });
}
