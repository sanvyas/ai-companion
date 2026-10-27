import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { createAdmin } from '../auth.js';
import { passwordProblem, randomPassword } from '../password.js';
import { ROLES } from '../rbac.js';
import { liveSessionCount } from '../../services/conversations.js';
import { body, guard, intParam, record, uuid } from './util.js';
import { buildInfo } from './overview.js';

export function infraRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);

  app.get('/infra', guard(ctx, 'infra.read'), async () => {
    const t0 = Date.now();
    await q('SELECT 1');
    const dbMs = Date.now() - t0;
    const [size, conns, jobs, kinds, failed, errors, migrations] = await Promise.all([
      q<{ bytes: string }>('SELECT pg_database_size(current_database())::text AS bytes'),
      q<{ n: number; max: number }>(`SELECT count(*)::int AS n, current_setting('max_connections')::int AS max FROM pg_stat_activity WHERE datname = current_database()`),
      q(`SELECT status, count(*)::int AS n FROM jobs GROUP BY status ORDER BY status`),
      q(`SELECT kind, count(*)::int AS n, count(*) FILTER (WHERE status = 'failed')::int AS failed FROM jobs WHERE created_at > now() - interval '7 days' GROUP BY kind ORDER BY n DESC`),
      q(`SELECT id, kind, attempts, left(COALESCE(last_error, ''), 200) AS error, run_at, status FROM jobs WHERE status = 'failed' ORDER BY id DESC LIMIT 20`),
      q(`SELECT id, source, route, code, message, count, first_seen, last_seen, resolved FROM error_log ORDER BY resolved, last_seen DESC LIMIT 50`),
      q(`SELECT count(*)::int AS n, max(name) AS latest FROM schema_migrations`).catch(() => [{ n: null, latest: null }]),
    ]);
    return {
      build: buildInfo(), environment: ctx.cfg.NODE_ENV, liveConversations: liveSessionCount(), uptimeMinutes: Math.round(process.uptime() / 60),
      database: { latencyMs: dbMs, bytes: Number(size[0].bytes), connections: conns[0], migrations: migrations[0] },
      jobs: { byStatus: jobs, byKind: kinds, failed }, errors,
      memory: { rssMb: Math.round(process.memoryUsage().rss / 1048576), heapMb: Math.round(process.memoryUsage().heapUsed / 1048576) },
    };
  });

  app.post('/infra/jobs/:id/retry', guard(ctx, 'infra.write'), async req => {
    const id = Number((req.params as { id: string }).id);
    const r = await q(`UPDATE jobs SET status = 'pending', attempts = 0, run_at = now(), locked_at = NULL WHERE id = $1 AND status = 'failed' RETURNING id`, [id]);
    if (!r.length) throw notFound('That failed job');
    await record(ctx, req, 'job.retried', String(id));
    return { ok: true };
  });

  app.post('/infra/jobs/retry-failed', guard(ctx, 'infra.write'), async req => {
    const r = await q(`UPDATE jobs SET status = 'pending', attempts = 0, run_at = now(), locked_at = NULL WHERE status = 'failed' AND created_at > now() - interval '7 days' RETURNING id`);
    await record(ctx, req, 'job.retried_all', undefined, undefined, { count: r.length });
    return { retried: r.length };
  });

  app.post('/infra/errors/:id/resolve', guard(ctx, 'infra.write'), async req => {
    const id = Number((req.params as { id: string }).id);
    const b = body(z.object({ resolved: z.boolean().default(true) }), req.body);
    await q('UPDATE error_log SET resolved = $2 WHERE id = $1', [id, b.resolved]);
    await record(ctx, req, b.resolved ? 'error.resolved' : 'error.reopened', String(id));
    return { ok: true };
  });

  // ------------------------------------------------------------------------------------------ audit trail
  app.get('/audit', guard(ctx, 'audit.read'), async req => {
    const { before, action, admin } = req.query as { before?: string; action?: string; admin?: string };
    const limit = intParam((req.query as { limit?: string }).limit, 100, 1, 500);
    const where: string[] = [];
    const params: unknown[] = [];
    if (before) { params.push(Number(before)); where.push(`id < $${params.length}`); }
    if (action) { params.push(`${action.replace(/[%_]/g, '')}%`); where.push(`action LIKE $${params.length}`); }
    if (admin) { params.push(admin); where.push(`admin_email = $${params.length}`); }
    params.push(limit);
    const rows = await q(`SELECT id, admin_email, action, target, before, after, ip, created_at FROM admin_audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT $${params.length}`, params);
    return { items: rows };
  });

  // ------------------------------------------------------------------------------------------ admins
  app.get('/admins', guard(ctx, 'admins.manage'), async () => ({
    items: await q(`SELECT a.id, a.email, a.name, a.role, a.active, a.totp_enabled, a.last_login_at, a.created_at, (SELECT count(*)::int FROM admin_sessions s WHERE s.admin_id = a.id AND s.revoked_at IS NULL AND s.expires_at > now() AND s.mfa_done) AS sessions FROM admin_users a ORDER BY a.created_at`),
    roles: ROLES,
  }));

  app.post('/admins', guard(ctx, 'admins.manage'), async req => {
    const b = body(z.object({ email: z.string().email().max(120), name: z.string().trim().min(1).max(60), role: z.enum(ROLES as [string, ...string[]]) }), req.body);
    const password = randomPassword();
    const a = await createAdmin(ctx, { email: b.email, name: b.name, role: b.role as never, password, createdBy: req.admin!.id });
    await record(ctx, req, 'admin.created', a.email, undefined, { role: b.role });
    // Shown once. They set their own on first sign-in and enrol an authenticator app.
    return { id: a.id, email: a.email, temporaryPassword: password };
  });

  app.patch('/admins/:id', guard(ctx, 'admins.manage'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const b = body(z.object({ role: z.enum(ROLES as [string, ...string[]]).optional(), active: z.boolean().optional() }), req.body);
    const cur = (await q<{ role: string; active: boolean; email: string }>('SELECT role, active, email FROM admin_users WHERE id = $1', [id]))[0];
    if (!cur) throw notFound('That admin');
    const nextRole = b.role ?? cur.role, nextActive = b.active ?? cur.active;
    if (cur.role === 'owner' && (nextRole !== 'owner' || !nextActive)) {
      const owners = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM admin_users WHERE role = 'owner' AND active`))[0].n;
      if (owners <= 1) throw forbidden('last_owner', 'There must always be one active owner.');
    }
    await q('UPDATE admin_users SET role = $2, active = $3 WHERE id = $1', [id, nextRole, nextActive]);
    if (!nextActive || nextRole !== cur.role) await q('UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL', [id]);
    await record(ctx, req, 'admin.updated', cur.email, { role: cur.role, active: cur.active }, { role: nextRole, active: nextActive });
    return { ok: true };
  });

  app.post('/admins/:id/reset', guard(ctx, 'admins.manage'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const cur = (await q<{ email: string }>('SELECT email FROM admin_users WHERE id = $1', [id]))[0];
    if (!cur) throw notFound('That admin');
    const password = randomPassword();
    const { hashPassword } = await import('../password.js');
    if (passwordProblem(password)) throw badRequest('weak_password', 'Try again.');
    await q('UPDATE admin_users SET password_hash = $2, totp_enabled = false, totp_secret_enc = NULL, totp_last_step = NULL, failed_logins = 0, locked_until = NULL WHERE id = $1', [id, await hashPassword(password)]);
    await q('UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL', [id]);
    await record(ctx, req, 'admin.credentials_reset', cur.email);
    return { temporaryPassword: password, note: 'They must set up their authenticator app again on next sign-in.' };
  });
}
