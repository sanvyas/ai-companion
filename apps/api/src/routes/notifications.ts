import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { DeviceBody, NotificationPrefsUpdate } from '@saathi/contracts';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { withSystem, withUser } from '../db/pool.js';
import { notFound } from '../errors.js';
import { parse, uid } from '../http.js';
import { getPrefs, updatePrefs } from '../services/daily.js';
import { getDek } from '../services/users.js';

export function notificationRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = { preHandler: app.auth };

  app.get('/notifications/prefs', auth, async req => getPrefs(ctx, uid(req)));
  app.put('/notifications/prefs', auth, async req => updatePrefs(ctx, uid(req), parse(NotificationPrefsUpdate, req.body)));

  // The browser needs the public VAPID key to create a push subscription.
  app.get('/notifications/vapid-key', auth, async () => ({ publicKey: ctx.push.publicKey, enabled: ctx.push.enabled }));

  app.post('/devices', auth, async (req, reply) => {
    const userId = uid(req);
    const b = parse(DeviceBody, req.body);
    const raw = typeof b.subscription === 'string' ? b.subscription : JSON.stringify(b.subscription);
    const hash = createHash('sha256').update(raw).digest();
    const id = await withUser(ctx.db, userId, async tx => {
      const dek = await getDek(ctx, userId, tx);
      const r = await tx.query<{ id: string }>(
        `INSERT INTO devices (user_id, platform, token_enc, token_hash) VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, token_hash) DO UPDATE SET last_seen_at = now() RETURNING id`, [userId, b.platform, ctx.crypto.encrypt(dek, userId, 'device', raw), hash]);
      return r.rows[0].id;
    });
    return reply.code(201).send({ id });
  });

  app.delete('/devices/:id', auth, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const n = await withUser(ctx.db, uid(req), tx => tx.query('DELETE FROM devices WHERE id = $1', [id]));
    if (!n.rowCount) throw notFound('That device');
    return reply.code(204).send();
  });
}

export function inboxRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = { preHandler: app.auth };

  // App open: counts as "back" for the quiet-week rule, and returns any soft cards waiting on Today.
  app.get('/inbox', auth, async req => {
    const userId = uid(req);
    return withUser(ctx.db, userId, async tx => {
      await tx.query(`UPDATE users SET last_active_at = now() WHERE id = $1 AND last_active_at < now() - interval '10 minutes'`, [userId]);
      const { rows } = await tx.query(`SELECT id, kind, created_at FROM inbox_cards WHERE dismissed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 5`);
      return { cards: rows.map(r => ({ id: r.id, kind: r.kind, createdAt: r.created_at.toISOString() })) };
    });
  });

  app.post('/inbox/:id/dismiss', auth, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await withUser(ctx.db, uid(req), tx => tx.query('UPDATE inbox_cards SET dismissed_at = now() WHERE id = $1', [id]));
    return reply.code(204).send();
  });

  // The service worker reports a tap so "ignored" is measured honestly (3 ignored halves the frequency).
  app.post('/notifications/opened', auth, async (req, reply) => {
    const b = parse(z.object({ kind: z.enum(['checkin', 'plan', 'leave', 'followup', 'quietweek', 'letter']) }), req.body);
    await withSystem(ctx.db, tx => tx.query(`INSERT INTO notification_log (user_id, kind, channel, outcome) VALUES ($1,$2,'push','opened')`, [uid(req), b.kind]));
    return reply.code(204).send();
  });
}
