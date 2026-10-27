import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { notFound } from '../../errors.js';
import { body, guard, intParam, record } from './util.js';

// The safety review queue. It lists that something elevated happened, when, how it was caught and what the person did
// next (called a helpline, said they were safe). It never contains what was said: message text is encrypted per
// person and is not selected anywhere in the portal.

export function safetyRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);

  app.get('/safety/events', guard(ctx, 'safety.read'), async req => {
    const { level, reviewed } = req.query as { level?: string; reviewed?: string };
    const limit = intParam((req.query as { limit?: string }).limit, 50, 1, 200);
    const where = ['e.level >= $1'];
    const params: unknown[] = [Math.min(3, Math.max(1, Number(level) || 2))];
    if (reviewed === 'yes') where.push('r.event_id IS NOT NULL');
    if (reviewed === 'no') where.push('r.event_id IS NULL');
    params.push(limit);
    const rows = await q(`SELECT e.id, e.level, e.mode, e.source, e.action, e.created_at, e.user_id, u.nickname, r.reviewed_by, r.note, r.reviewed_at
                            FROM safety_events e JOIN users u ON u.id = e.user_id LEFT JOIN safety_reviews r ON r.event_id = e.id
                           WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT $${params.length}`, params);
    const stats = (await q(`SELECT level, count(*)::int AS n, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM safety_reviews r WHERE r.event_id = e.id))::int AS unreviewed FROM safety_events e WHERE created_at > now() - interval '30 days' GROUP BY level ORDER BY level`));
    return { items: rows, stats };
  });

  app.post('/safety/events/:id/review', guard(ctx, 'safety.review'), async req => {
    const id = Number((req.params as { id: string }).id);
    const b = body(z.object({ note: z.string().trim().max(500).default('') }), req.body);
    const exists = await q('SELECT 1 FROM safety_events WHERE id = $1', [id]);
    if (!exists.length) throw notFound('That event');
    await q(`INSERT INTO safety_reviews (event_id, reviewed_by, note) VALUES ($1,$2,$3) ON CONFLICT (event_id) DO UPDATE SET reviewed_by = EXCLUDED.reviewed_by, note = EXCLUDED.note, reviewed_at = now()`, [id, req.admin!.email, b.note]);
    await record(ctx, req, 'safety.reviewed', String(id), undefined, { note: b.note });
    return { ok: true };
  });
}
