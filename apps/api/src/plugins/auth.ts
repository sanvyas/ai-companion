import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.js';
import { verifyAccess } from '../auth/tokens.js';
import { withSystem } from '../db/pool.js';
import { unauthorized } from '../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    familyId?: string;
  }
}

const touched = new Map<string, number>();

export function authenticate(ctx: Ctx) {
  return async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized();
    const { userId, familyId } = await verifyAccess(ctx, h.slice(7));
    req.userId = userId;
    req.familyId = familyId;
    // Last active, at most every 10 minutes per person, off the request path.
    const now = Date.now();
    if (now - (touched.get(userId) ?? 0) > 600_000) {
      touched.set(userId, now);
      if (touched.size > 20_000) touched.clear();
      void withSystem(ctx.db, tx => tx.query('UPDATE users SET last_active_at = now() WHERE id = $1', [userId])).catch(() => undefined);
    }
  };
}

export function registerAuth(app: FastifyInstance, ctx: Ctx) {
  app.decorate('auth', authenticate(ctx));
}

declare module 'fastify' {
  interface FastifyInstance {
    auth: (req: FastifyRequest) => Promise<void>;
  }
}
