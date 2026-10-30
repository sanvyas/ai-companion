import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { listHelplines } from '../services/helplines.js';
import { hasAnyInvite } from '../services/invites.js';
import { buildInfo } from '../admin/routes/overview.js';

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  // What the sign-in screen needs before anyone is signed in.
  app.get('/public-config', async () => ({ otp: ctx.otp.canSend || (await hasAnyInvite(ctx)), google: !!ctx.rt.secrets.get('google', 'client_id'), googleClientId: ctx.rt.secrets.get('google', 'client_id') ?? null, llm: ctx.llm.configured, stt: !!ctx.stt, dictation: !!ctx.transcriber?.configured, tts: !!ctx.tts?.configured, push: ctx.push.enabled, signupsOpen: ctx.rt.settings.bool('access.signups_open'), voicePaused: ctx.rt.settings.bool('kill.voice'), analytics: ctx.rt.settings.bool('analytics.enabled'), uiV2: ctx.rt.flags.isOn('ui.v2'), uiV3: ctx.rt.flags.isOn('ui.v3') }));
  // Google sign-in happens in the person's browser, so a failure never reaches the server on its own. The page reports the
  // step it got stuck on (no words, no tokens, nothing about the person) so a stuck sign-in shows up in the logs.
  const GOOGLE_STAGES = new Set(['script_failed', 'button_not_drawn', 'origin_rejected', 'in_app_browser', 'tapped_while_not_ready', 'popup_blocked', 'sign_in_error']);
  app.post('/diag/google', { config: { rateLimit: { max: 20 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = (req.body ?? {}) as { stage?: unknown; note?: unknown };
    const stage = typeof b.stage === 'string' && GOOGLE_STAGES.has(b.stage) ? b.stage : null;
    if (!stage) return reply.code(400).send({ error: 'unknown_stage' });
    const note = typeof b.note === 'string' ? b.note.replace(/[^\x20-\x7E]/g, '').slice(0, 200) : undefined;
    req.log.warn({ diag: 'google_sign_in', stage, note, origin: req.headers.origin ?? null, ua: String(req.headers['user-agent'] ?? '').slice(0, 160) }, 'google sign-in problem reported by the page');
    return { ok: true };
  });
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
