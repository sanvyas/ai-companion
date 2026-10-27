import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { COOKIE, changePassword, completeTotp, cookieOptions, login, logout } from '../auth.js';
import { permissionsOf } from '../rbac.js';
import { body, guard, record } from './util.js';

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const lim = (n: number) => n * ctx.cfg.RATE_LIMIT_SCALE;

  app.post('/auth/login', { config: { rateLimit: { max: lim(10), timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = body(z.object({ email: z.string().email().max(120), password: z.string().min(1).max(200) }), req.body);
    const r = await login(ctx, req, b.email, b.password);
    reply.setCookie(COOKIE, r.token, cookieOptions(ctx));
    return { step: r.step, enrol: r.enrol };
  });

  app.post('/auth/totp', { config: { rateLimit: { max: lim(10), timeWindow: '1 minute' } } }, async req => {
    const b = body(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    return completeTotp(ctx, req, b.code);
  });

  app.get('/auth/me', guard(ctx), async req => {
    const a = req.admin!;
    return { admin: { id: a.id, email: a.email, name: a.name, role: a.role }, csrf: a.csrf, permissions: permissionsOf(a.role), environment: ctx.cfg.NODE_ENV };
  });

  app.post('/auth/logout', async (req, reply) => {
    await logout(ctx, req);
    reply.clearCookie(COOKIE, { path: '/admin' });
    return reply.code(204).send();
  });

  app.post('/auth/password', guard(ctx), async req => {
    const b = body(z.object({ current: z.string().max(200), next: z.string().max(200) }), req.body);
    await changePassword(ctx, req.admin!, b.current, b.next);
    await record(ctx, req, 'admin.password_changed', req.admin!.email);
    return { ok: true };
  });
}
