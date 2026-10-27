import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { maskPhone } from '../../crypto/envelope.js';
import { notFound } from '../../errors.js';
import { body, guard, intParam, record, uuid } from './util.js';

// People, as the business sees them: who they are in the system, what they use and what it costs. Never what they
// wrote or said. No query here selects a column that holds journal text, messages, memories, summaries or letters.

export function userRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);

  const maskedPhone = (id: string, dekWrapped: Buffer, phoneEnc: Buffer | null): string | null => {
    if (!phoneEnc) return null;
    try { return maskPhone(ctx.crypto.decrypt(ctx.crypto.unwrapUserKey(id, dekWrapped), id, 'phone', phoneEnc)); } catch { return null; }
  };

  app.get('/users', guard(ctx, 'users.read'), async req => {
    const { q: search, cursor, status } = req.query as { q?: string; cursor?: string; status?: string };
    const limit = intParam((req.query as { limit?: string }).limit, 30, 1, 100);
    const where: string[] = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (search?.trim()) { params.push(`${search.trim().replace(/[%_]/g, '')}%`); where.push(`(u.nickname ILIKE $${params.length} OR u.id::text ILIKE $${params.length})`); }
    if (status === 'suspended') where.push('u.suspended_at IS NOT NULL');
    if (status === 'pending_deletion') where.push('u.deletion_requested_at IS NOT NULL');
    if (status === 'plus') where.push(`u.subscription = 'plus'`);
    if (cursor) { const [ts, id] = cursor.split('|'); params.push(ts, id); where.push(`(u.created_at, u.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`); }
    params.push(limit + 1);
    const rows = await q<{ id: string; nickname: string; created_at: Date; last_active_at: Date; subscription: string; onboarded_at: Date | null; suspended_at: Date | null; deletion_requested_at: Date | null; language: string; city: string | null; dek_wrapped: Buffer; phone_enc: Buffer | null; google: boolean; convs: number; remember: boolean | null; notifications: boolean | null; analytics: boolean | null }>(
      `SELECT u.id, u.nickname, u.created_at, u.last_active_at, u.subscription, u.onboarded_at, u.suspended_at, u.deletion_requested_at, u.language, u.city, u.dek_wrapped, u.phone_enc,
              (u.google_hash IS NOT NULL) AS google,
              (SELECT count(*)::int FROM conversations c WHERE c.user_id = u.id AND c.started_at > now() - interval '30 days') AS convs,
              c.remember, c.notifications, c.analytics
         FROM users u LEFT JOIN consents c ON c.user_id = u.id
        WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC, u.id DESC LIMIT $${params.length}`, params);
    const page = rows.slice(0, limit);
    return {
      items: page.map(r => ({
        id: r.id, nickname: r.nickname, phone: maskedPhone(r.id, r.dek_wrapped, r.phone_enc), signIn: r.phone_enc ? (r.google ? 'phone+google' : 'phone') : 'google',
        createdAt: r.created_at, lastActiveAt: r.last_active_at, plan: r.subscription, onboarded: !!r.onboarded_at, language: r.language, city: r.city,
        status: r.suspended_at ? 'suspended' : r.deletion_requested_at ? 'pending_deletion' : 'active', conversations30d: r.convs,
        consent: { remember: !!r.remember, notifications: !!r.notifications, analytics: !!r.analytics },
      })),
      nextCursor: rows.length > limit ? `${page[page.length - 1].created_at.toISOString()}|${page[page.length - 1].id}` : null,
    };
  });

  app.get('/users/:id', guard(ctx, 'users.read'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const u = (await q<Record<string, unknown> & { dek_wrapped: Buffer; phone_enc: Buffer | null }>(
      `SELECT u.id, u.nickname, u.language, u.timezone, u.city, u.subscription, u.created_at, u.onboarded_at, u.last_active_at, u.suspended_at, u.deletion_requested_at, u.age_confirmed_18, u.dek_wrapped, u.phone_enc, (u.google_hash IS NOT NULL) AS google FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`, [id]))[0];
    if (!u) throw notFound('That person');
    const one = async <T>(sql: string) => (await q<T>(sql, [id]))[0];
    const [consent, privacy, prefs, counts, usage, safety, overrides, byMode] = await Promise.all([
      one(`SELECT remember, notifications, calls, health_data, location, improve_models, analytics, accepted_at FROM consents WHERE user_id = $1`),
      one(`SELECT lock_screen_previews, discreet_mode, app_lock, quick_hide, transcript_retention_days FROM privacy_settings WHERE user_id = $1`),
      one(`SELECT push, calls, sunday_letter, checkin_time FROM notification_prefs WHERE user_id = $1`),
      // Counts only. The rows behind these numbers are encrypted and not selected.
      one(`SELECT (SELECT count(*)::int FROM conversations WHERE user_id = $1) AS conversations,
                  (SELECT count(*)::int FROM journal_entries WHERE user_id = $1) AS journal_entries,
                  (SELECT count(*)::int FROM memories WHERE user_id = $1) AS memories,
                  (SELECT count(*)::int FROM wins WHERE user_id = $1) AS wins,
                  (SELECT count(*)::int FROM mood_logs WHERE user_id = $1) AS mood_logs,
                  (SELECT count(*)::int FROM devices WHERE user_id = $1) AS devices,
                  (SELECT count(*)::int FROM calm_sessions WHERE user_id = $1) AS calm_sessions`),
      one(`SELECT COALESCE(sum(units),0)::int AS tokens, COALESCE(sum(cost_inr),0)::float AS cost_inr, count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS failed
             FROM usage_events WHERE user_id = $1 AND created_at > now() - interval '30 days'`),
      q(`SELECT e.id, e.level, e.mode, e.source, e.action, e.created_at, (r.event_id IS NOT NULL) AS reviewed FROM safety_events e LEFT JOIN safety_reviews r ON r.event_id = e.id WHERE e.user_id = $1 ORDER BY e.id DESC LIMIT 10`, [id]),
      q(`SELECT key, enabled FROM flag_overrides WHERE user_id = $1 ORDER BY key`, [id]),
      q(`SELECT mode, count(*)::int AS n FROM conversations WHERE user_id = $1 GROUP BY mode ORDER BY n DESC`, [id]),
    ]);
    const { dek_wrapped, phone_enc, ...profile } = u;
    return { profile: { ...profile, phone: maskedPhone(id, dek_wrapped, phone_enc) }, consent, privacy, notifications: prefs, counts, usage30d: usage, conversationsByMode: byMode, safetyEvents: safety, flagOverrides: overrides, flags: ctx.rt.flags.forUser(id) };
  });

  app.patch('/users/:id/plan', guard(ctx, 'users.write'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const b = body(z.object({ subscription: z.enum(['basic', 'plus']) }), req.body);
    const before = (await q<{ subscription: string }>('SELECT subscription FROM users WHERE id = $1', [id]))[0];
    if (!before) throw notFound('That person');
    await q('UPDATE users SET subscription = $2 WHERE id = $1', [id, b.subscription]);
    await record(ctx, req, 'user.plan_changed', id, { plan: before.subscription }, { plan: b.subscription });
    return { ok: true };
  });

  app.post('/users/:id/suspend', guard(ctx, 'users.write'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const b = body(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    const r = await q('UPDATE users SET suspended_at = now() WHERE id = $1 AND suspended_at IS NULL RETURNING id', [id]);
    if (!r.length) throw notFound('That active person');
    // Cut every session: refresh tokens stop working at once, access tokens run out within minutes.
    await q('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await record(ctx, req, 'user.suspended', id, undefined, { reason: b.reason });
    return { ok: true };
  });

  app.post('/users/:id/unsuspend', guard(ctx, 'users.write'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const r = await q('UPDATE users SET suspended_at = NULL WHERE id = $1 AND suspended_at IS NOT NULL RETURNING id', [id]);
    if (!r.length) throw notFound('That suspended person');
    await record(ctx, req, 'user.unsuspended', id);
    return { ok: true };
  });

  /** Starts the same 30-day removal the person can start themselves. The scheduler does the deletion. */
  app.post('/users/:id/delete', guard(ctx, 'users.write'), async req => {
    const id = body(uuid, (req.params as { id: string }).id);
    const b = body(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    const r = await q('UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, now()) WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
    if (!r.length) throw notFound('That person');
    await q('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await record(ctx, req, 'user.deletion_scheduled', id, undefined, { reason: b.reason });
    return { ok: true };
  });

  app.put('/users/:id/flags/:key', guard(ctx, 'flags.write'), async req => {
    const { id, key } = req.params as { id: string; key: string };
    body(uuid, id);
    const b = body(z.object({ enabled: z.boolean().nullable() }), req.body);
    await ctx.rt.flags.setOverride(key, id, b.enabled);
    await record(ctx, req, 'user.flag_override', id, undefined, { key, enabled: b.enabled });
    return { ok: true };
  });
}
