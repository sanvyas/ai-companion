import { createHash } from 'node:crypto';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';

/** Strip anything that could identify a person or split one problem into many rows. */
export function scrub(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '<number>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .slice(0, 300);
}

/** Group failures by what went wrong and where. Fire and forget: reporting an error must never cause one. */
export function captureError(ctx: Ctx, e: { source: 'api' | 'worker' | 'web'; route?: string; code?: string; message: string }) {
  const message = scrub(e.message);
  const route = e.route?.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\/\d+/g, '/:n');
  const fp = createHash('sha1').update(`${e.source}|${route ?? ''}|${e.code ?? ''}|${message.slice(0, 120)}`).digest('hex');
  withSystem(ctx.db, tx => tx.query(
    `INSERT INTO error_log (fingerprint, source, route, code, message) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (fingerprint) DO UPDATE SET count = error_log.count + 1, last_seen = now(), resolved = false`, [fp, e.source, route ?? null, e.code ?? null, message]))
    .catch(() => undefined);
}
