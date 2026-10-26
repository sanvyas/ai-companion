import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { badRequest, unauthorized } from './errors.js';

export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest('validation_failed', 'Some of that didn’t look right.', r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function uid(req: FastifyRequest): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export const noContent = (reply: FastifyReply) => reply.code(204).send();

/** Cursor = base64url(JSON). Opaque to clients. */
export const encodeCursor = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try { return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as T; } catch { throw badRequest('bad_cursor', 'That page link isn’t valid.'); }
}
