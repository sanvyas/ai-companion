import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { listHelplines } from '../services/helplines.js';
import { hasAnyInvite } from '../services/invites.js';
import { buildInfo } from '../admin/routes/overview.js';

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  // What the sign-in screen needs before anyone is signed in.
  app.get('/public-config', async () => ({ otp: ctx.otp.canSend || (await hasAnyInvite(ctx)), google: !!ctx.rt.secrets.get('google', 'client_id'), googleClientId: ctx.rt.secrets.get('google', 'client_id') ?? null, llm: ctx.llm.configured, stt: !!ctx.stt, dictation: !!ctx.transcriber?.configured, tts: !!ctx.tts?.configured, push: ctx.push.enabled, signupsOpen: ctx.rt.settings.bool('access.signups_open'), voicePaused: ctx.rt.settings.bool('kill.voice'), analytics: ctx.rt.settings.bool('analytics.enabled') }));
  app.get('/healthz', async () => ({ ok: true }));
  // Which build is running. No secrets; used by the admin portal's environment checks.
  app.get('/version', async () => ({ ...buildInfo(), environment: ctx.cfg.NODE_ENV }));
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
