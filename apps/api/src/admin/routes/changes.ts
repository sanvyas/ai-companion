import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { forbidden, notFound, badRequest } from '../../errors.js';
import { audit, replayHeader } from '../auth.js';
import { approverRoles } from '../auth.js';
import { can, isHigher, type Permission, type Role } from '../rbac.js';
import { body, guard, record, uuid } from './util.js';

interface Row {
  id: string; summary: string; permission: string; method: string; url: string; body: unknown;
  requested_by: string | null; requested_email: string; requested_role: Role; status: string;
  decided_by: string | null; decided_email: string | null; decision_note: string | null; decided_at: Date | null; result: unknown; created_at: Date;
}

const COLS = 'id, summary, permission, method, url, body, requested_by, requested_email, requested_role, status, decided_by, decided_email, decision_note, decided_at, result, created_at';

/**
 * Changes by anyone below owner wait here. Someone strictly more senior (who is allowed to do the thing) approves or
 * rejects. Approving runs the very same request again, as the approver, so every existing check, audit entry and live
 * reload applies exactly as if the approver had made the change.
 */
export function changeRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Row>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);

  const canDecide = (a: { id: string; role: Role }, r: Row) =>
    r.status === 'pending' && r.requested_by !== a.id && isHigher(a.role, r.requested_role) && can(a.role, r.permission as Permission);

  const view = (a: { id: string; role: Role }, r: Row) => ({
    id: r.id, summary: r.summary, method: r.method, path: r.url.replace(/^\/admin\/api/, ''), body: r.body, status: r.status,
    requestedBy: r.requested_email, requestedRole: r.requested_role, requestedAt: r.created_at,
    decidedBy: r.decided_email, decidedAt: r.decided_at, note: r.decision_note,
    error: r.status === 'failed' ? ((r.result as { message?: string } | null)?.message ?? 'The change could not be applied.') : null,
    canDecide: canDecide(a, r), canWithdraw: r.status === 'pending' && r.requested_by === a.id,
    approvers: approverRoles(r.requested_role, r.permission as Permission),
  });

  app.get('/changes', guard(ctx, 'changes.read'), async req => {
    const a = req.admin!;
    const rows = await q(`SELECT ${COLS} FROM change_requests ORDER BY created_at DESC LIMIT 200`);
    const items = rows.map(r => view(a, r));
    return {
      required: ctx.rt.settings.bool('governance.require_approval'),
      inbox: items.filter(i => i.canDecide),
      waiting: items.filter(i => i.status === 'pending' && !i.canDecide),
      history: items.filter(i => i.status !== 'pending').slice(0, 60),
    };
  });

  app.get('/changes/count', guard(ctx, 'changes.read'), async req => {
    const a = req.admin!;
    const rows = await q(`SELECT ${COLS} FROM change_requests WHERE status = 'pending'`);
    return { inbox: rows.filter(r => canDecide(a, r)).length, mine: rows.filter(r => r.requested_by === a.id).length };
  });

  const load = async (id: string) => { const r = (await q(`SELECT ${COLS} FROM change_requests WHERE id = $1`, [id]))[0]; if (!r) throw notFound('That change'); return r; };

  app.post('/changes/:id/approve', guard(ctx, 'changes.read'), async req => {
    const a = req.admin!;
    const id = body(uuid, (req.params as { id: string }).id);
    const note = body(z.object({ note: z.string().trim().max(300).optional() }), req.body).note ?? null;
    const r = await load(id);
    if (r.requested_by === a.id) throw forbidden('own_change', 'You can’t approve your own change. Someone more senior has to.');
    if (!canDecide(a, r)) throw forbidden('forbidden', r.status === 'pending' ? 'Only someone more senior than the person who asked, and allowed to make this change, can approve it.' : 'That change has already been decided.');

    // Claim it atomically so two approvers can't both apply it.
    const claimed = await q<{ id: string }>(
      `UPDATE change_requests SET status = 'applying', decided_by = $2, decided_email = $3, decision_note = $4, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`,
      [id, a.id, a.email, note]);
    if (!claimed.length) throw badRequest('already_decided', 'Someone else just decided that change.');

    const res = await app.inject({
      method: r.method as 'PUT',
      url: r.url,
      headers: { ...(r.body === null ? {} : { 'content-type': 'application/json' }), 'x-approved-change': replayHeader(ctx, id, a.id) },
      payload: r.body === null ? undefined : JSON.stringify(r.body),
    });
    let out: unknown; try { out = res.json(); } catch { out = undefined; }
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const message = ok ? undefined : ((out as { error?: { message?: string } } | undefined)?.error?.message ?? `The server answered ${res.statusCode}.`);
    await q(`UPDATE change_requests SET status = $2, result = $3 WHERE id = $1`, [id, ok ? 'applied' : 'failed', JSON.stringify(ok ? { status: res.statusCode } : { status: res.statusCode, message })]);
    await record(ctx, req, ok ? 'change.approved' : 'change.approved_but_failed', id, undefined, { summary: r.summary, requestedBy: r.requested_email, note, ...(message ? { message } : {}) });
    if (!ok) throw badRequest('apply_failed', `Approved, but it couldn’t be applied: ${message}`);
    return { ok: true, applied: true };
  });

  app.post('/changes/:id/reject', guard(ctx, 'changes.read'), async req => {
    const a = req.admin!;
    const id = body(uuid, (req.params as { id: string }).id);
    const note = body(z.object({ note: z.string().trim().min(3, 'Say why, so they know what to change.').max(300) }), req.body).note;
    const r = await load(id);
    if (!canDecide(a, r)) throw forbidden('forbidden', 'You can’t decide this one.');
    const done = await q(`UPDATE change_requests SET status = 'rejected', decided_by = $2, decided_email = $3, decision_note = $4, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`, [id, a.id, a.email, note]);
    if (!done.length) throw badRequest('already_decided', 'Someone else just decided that change.');
    await record(ctx, req, 'change.rejected', id, undefined, { summary: r.summary, requestedBy: r.requested_email, note });
    return { ok: true };
  });

  app.post('/changes/:id/withdraw', guard(ctx, 'changes.read'), async req => {
    const a = req.admin!;
    const id = body(uuid, (req.params as { id: string }).id);
    const r = await load(id);
    if (r.requested_by !== a.id || r.status !== 'pending') throw forbidden('forbidden', 'Only the person who asked can withdraw a change that is still waiting.');
    await q(`UPDATE change_requests SET status = 'withdrawn', decided_at = now() WHERE id = $1 AND status = 'pending'`, [id]);
    await audit(ctx, a, req, 'change.withdrawn', id, undefined, { summary: r.summary });
    return { ok: true };
  });
}
