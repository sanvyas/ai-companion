import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { badRequest } from '../../errors.js';
import { audit, adminGuard, type GateSummary } from '../auth.js';
import type { Permission } from '../rbac.js';

/** `gate` describes a change in words; writes by anyone below owner then wait for a more senior admin to approve them. */
export const guard = (ctx: Ctx, perm?: Permission, gate?: GateSummary) => ({ preHandler: adminGuard(ctx, perm, gate) });

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

// Short, plain descriptions of a request for the approval queue.
export const params = (req: FastifyRequest) => req.params as Record<string, string>;
export const payload = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
export const show = (v: unknown) => { const t = typeof v === 'string' ? v : JSON.stringify(v); return t && t.length > 80 ? `${t.slice(0, 80)}…` : t; };
