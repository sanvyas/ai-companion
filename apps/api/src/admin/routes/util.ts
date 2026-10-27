import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { badRequest } from '../../errors.js';
import { audit, adminGuard } from '../auth.js';
import type { Permission } from '../rbac.js';

export const guard = (ctx: Ctx, perm?: Permission) => ({ preHandler: adminGuard(ctx, perm) });

/** Record an admin write. Never pass a secret in `before` or `after`. */
export const record = (ctx: Ctx, req: FastifyRequest, action: string, target?: string, before?: unknown, after?: unknown) =>
  audit(ctx, req.admin!, req, action, target, before, after);

export function body<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) throw badRequest('validation_failed', r.error.issues.map(i => `${i.path.join('.') || 'value'}: ${i.message}`).join('; '));
  return r.data;
}

export const intParam = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};

export const uuid = z.string().uuid();
export const day = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
