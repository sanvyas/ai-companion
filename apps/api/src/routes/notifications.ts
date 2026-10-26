import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { DeviceBody, NotificationPrefsUpdate } from '@saathi/contracts';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
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
