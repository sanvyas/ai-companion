import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.js';
import { verifyAccess } from '../auth/tokens.js';
import { unauthorized } from '../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    familyId?: string;
  }
}

export function authenticate(ctx: Ctx) {
  return async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized();
    const { userId, familyId } = await verifyAccess(ctx, h.slice(7));
    req.userId = userId;
    req.familyId = familyId;
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
