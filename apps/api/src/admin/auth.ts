import { createHash, randomBytes } from 'node:crypto';
import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { AppError, badRequest, forbidden, unauthorized } from '../errors.js';
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from './password.js';
import { hmacHex } from '../crypto/envelope.js';
import { can, isHigher, ROLES, type Permission, type Role } from './rbac.js';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp.js';

export const COOKIE = 'saathi_admin';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const IDLE_MINUTES = 60;

export interface AdminPrincipal { id: string; email: string; name: string; role: Role; sessionId: string; csrf: string }

declare module 'fastify' {
  interface FastifyRequest { admin?: AdminPrincipal }
}

const sha = (v: string) => createHash('sha256').update(v).digest();
const ip = (req: FastifyRequest) => req.ip;

export function cookieOptions(ctx: Ctx) {
  return { httpOnly: true, sameSite: 'strict' as const, secure: ctx.cfg.isProd, path: '/admin', maxAge: ctx.cfg.ADMIN_SESSION_HOURS * 3600 };
}

// ------------------------------------------------------------------------------------------------ accounts
export async function createAdmin(ctx: Ctx, input: { email: string; name: string; role: Role; password: string; createdBy?: string }) {
  const email = z.string().email().parse(input.email.trim().toLowerCase());
  const problem = passwordProblem(input.password);
  if (problem) throw badRequest('weak_password', problem);
  const hash = await hashPassword(input.password);
  try {
    const r = await withSystem(ctx.db, tx => tx.query(`INSERT INTO admin_users (email, name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id`, [email, input.name.trim().slice(0, 60) || email, input.role, hash]));
    return { id: r.rows[0].id as string, email };
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw badRequest('exists', 'An admin with that email already exists.');
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------ login
interface AdminRow { id: string; email: string; name: string; role: Role; password_hash: string; totp_secret_enc: Buffer | null; totp_enabled: boolean; active: boolean; failed_logins: number; locked_until: Date | null; totp_last_step: string | null }

/** Step one: email + password. Creates a session that cannot do anything until the second factor passes. */
export async function login(ctx: Ctx, req: FastifyRequest, email: string, password: string) {
  const row = (await withSystem(ctx.db, tx => tx.query<AdminRow>('SELECT * FROM admin_users WHERE email = $1', [email.trim().toLowerCase()]))).rows[0];
  if (row?.locked_until && row.locked_until > new Date()) throw new AppError(429, 'locked', `Too many attempts. Try again in a few minutes.`);
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.active || !ok) {
    if (row) await withSystem(ctx.db, tx => tx.query(`UPDATE admin_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id = $1`, [row.id, MAX_FAILS, String(LOCK_MINUTES)]));
    throw unauthorized('That email and password don’t match.');
  }

  let enrol: { secret: string; uri: string } | undefined;
  if (!row.totp_enabled) {
    // First sign-in: mint a secret, store it sealed, and make the admin prove they can read codes from it.
    const secret = newTotpSecret();
    await withSystem(ctx.db, tx => tx.query('UPDATE admin_users SET totp_secret_enc = $2 WHERE id = $1', [row.id, ctx.crypto.sealPlatform(`totp:${row.id}`, secret)]));
    enrol = { secret, uri: otpauthUri(row.email, secret) };
  }
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  await withSystem(ctx.db, tx => tx.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, csrf_token, expires_at, ip, user_agent) VALUES ($1,$2,$3, now() + ($4 || ' hours')::interval, $5, $6)`,
    [sha(token), row.id, csrf, String(ctx.cfg.ADMIN_SESSION_HOURS), ip(req), String(req.headers['user-agent'] ?? '').slice(0, 200)]));
  return { token, csrf, step: row.totp_enabled ? ('totp' as const) : ('enrol' as const), enrol };
}

/** Step two: the six-digit code. Also completes enrolment on first sign-in. */
export async function completeTotp(ctx: Ctx, req: FastifyRequest, code: string) {
  const token = req.cookies[COOKIE];
  if (!token) throw unauthorized();
  const s = (await withSystem(ctx.db, tx => tx.query<{ id: string; admin_id: string; csrf_token: string }>(
    `SELECT id, admin_id, csrf_token FROM admin_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND NOT mfa_done`, [sha(token)]))).rows[0];
  if (!s) throw unauthorized();
  const a = (await withSystem(ctx.db, tx => tx.query<AdminRow>('SELECT * FROM admin_users WHERE id = $1', [s.admin_id]))).rows[0];
  if (!a?.active || !a.totp_secret_enc) throw unauthorized();
  if (a.locked_until && a.locked_until > new Date()) throw new AppError(429, 'locked', 'Too many attempts. Try again in a few minutes.');
  const secret = ctx.crypto.openPlatform(`totp:${a.id}`, a.totp_secret_enc);
  const step = verifyTotp(secret, code.trim());
  if (step === null || (a.totp_last_step !== null && step <= Number(a.totp_last_step))) {
    await withSystem(ctx.db, tx => tx.query(`UPDATE admin_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id = $1`, [a.id, MAX_FAILS, String(LOCK_MINUTES)]));
    throw unauthorized('That code didn’t work. Codes change every 30 seconds.');
  }
  await withSystem(ctx.db, async tx => {
    await tx.query('UPDATE admin_users SET totp_enabled = true, totp_last_step = $2, failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [a.id, step]);
    await tx.query('UPDATE admin_sessions SET mfa_done = true WHERE id = $1', [s.id]);
  });
  await audit(ctx, { id: a.id, email: a.email }, req, 'admin.login', a.email);
  return { csrf: s.csrf_token };
}

export async function logout(ctx: Ctx, req: FastifyRequest) {
  const token = req.cookies[COOKIE];
  if (token) await withSystem(ctx.db, tx => tx.query('UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1', [sha(token)]));
}

export async function changePassword(ctx: Ctx, admin: AdminPrincipal, current: string, next: string) {
  const row = (await withSystem(ctx.db, tx => tx.query<AdminRow>('SELECT * FROM admin_users WHERE id = $1', [admin.id]))).rows[0];
  if (!row || !(await verifyPassword(current, row.password_hash))) throw unauthorized('Your current password is wrong.');
  const problem = passwordProblem(next);
  if (problem) throw badRequest('weak_password', problem);
  const hash = await hashPassword(next);
  await withSystem(ctx.db, async tx => {
    await tx.query('UPDATE admin_users SET password_hash = $2 WHERE id = $1', [admin.id, hash]);
    await tx.query('UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND id <> $2', [admin.id, admin.sessionId]);
  });
}

// ------------------------------------------------------------------------------------------------ request guard
/** Describes a change in words, for the approval queue. Return null to let a particular request through ungated. */
export type GateSummary = (req: FastifyRequest) => string | null | Promise<string | null>;

const replaySig = (ctx: Ctx, changeId: string, approverId: string) => hmacHex(ctx.cfg.JWT_SECRET, `replay:${changeId}:${approverId}`);
/** Header carried only by the in-process replay of an approved change. It is signed, single-use and loopback-only. */
export const replayHeader = (ctx: Ctx, changeId: string, approverId: string) => `${changeId}.${approverId}.${replaySig(ctx, changeId, approverId)}`;

/** Who could approve something asked for by `role` that needs `permission`: strictly more senior, and allowed to do it. */
export const approverRoles = (role: Role, permission?: Permission): Role[] => ROLES.filter(r => isHigher(r, role) && (!permission || can(r, permission)));

/**
 * Resolves the session cookie, enforces the second factor, idle timeout and the CSRF header on writes.
 * With `gate`, a write from anyone below owner is parked in the approval queue instead of running.
 */
export function adminGuard(ctx: Ctx, permission?: Permission, gate?: GateSummary) {
  return async (req: FastifyRequest, reply?: FastifyReply) => {
    const replay = req.headers['x-approved-change'];
    if (typeof replay === 'string') return replayAs(ctx, req, replay, permission);

    const token = req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const r = (await withSystem(ctx.db, tx => tx.query<{ session_id: string; csrf_token: string; last_seen_at: Date; id: string; email: string; name: string; role: Role; active: boolean }>(
      `SELECT s.id AS session_id, s.csrf_token, s.last_seen_at, a.id, a.email, a.name, a.role, a.active
         FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND s.mfa_done`, [sha(token)]))).rows[0];
    if (!r || !r.active) throw unauthorized();
    if (Date.now() - r.last_seen_at.getTime() > IDLE_MINUTES * 60_000) throw unauthorized('You were signed out after a while. Please sign in again.');
    const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (writes && req.headers['x-csrf-token'] !== r.csrf_token) throw forbidden('csrf', 'That request didn’t come from the portal.');
    req.admin = { id: r.id, email: r.email, name: r.name, role: r.role, sessionId: r.session_id, csrf: r.csrf_token };
    if (Date.now() - r.last_seen_at.getTime() > 60_000) void withSystem(ctx.db, tx => tx.query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [r.session_id])).catch(() => undefined);
    if (permission && !can(r.role, permission)) throw forbidden('forbidden', 'Your role can’t do that.');

    const summary = gate && writes ? await gate(req) : null;
    if (summary && r.role !== 'owner' && ctx.rt.settings.bool('governance.require_approval')) {
      const approvers = approverRoles(r.role, permission);
      const id = (await withSystem(ctx.db, tx => tx.query<{ id: string }>(
        `INSERT INTO change_requests (summary, permission, method, url, body, requested_by, requested_email, requested_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [summary.slice(0, 300), permission ?? '', req.method, req.url, req.body === undefined ? null : JSON.stringify(req.body), r.id, r.email, r.role]))).rows[0].id;
      await audit(ctx, r, req, 'change.requested', id, undefined, { summary });
      return reply!.code(202).send({ pending: true, id, summary, approvers, message: `Sent to ${approvers.join(' or ') || 'an owner'} for approval. It reaches the app once approved.` });
    }
  };
}

/** The in-process replay of an approved change. It runs as the approver, so every existing check still applies. */
async function replayAs(ctx: Ctx, req: FastifyRequest, header: string, permission?: Permission) {
  const [changeId, approverId, sig] = header.split('.');
  const loopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (!loopback || !changeId || !approverId || !sig || sig !== replaySig(ctx, changeId, approverId)) throw unauthorized();
  const r = (await withSystem(ctx.db, tx => tx.query<{ id: string; email: string; name: string; role: Role; active: boolean }>(
    `SELECT a.id, a.email, a.name, a.role, a.active FROM change_requests c JOIN admin_users a ON a.id = c.decided_by
      WHERE c.id = $1 AND c.status = 'applying' AND c.decided_by = $2`, [changeId, approverId]))).rows[0];
  if (!r || !r.active) throw unauthorized();
  req.admin = { id: r.id, email: r.email, name: r.name, role: r.role, sessionId: '', csrf: '' };
  if (permission && !can(r.role, permission)) throw forbidden('forbidden', 'Your role can’t do that.');
}

// ------------------------------------------------------------------------------------------------ audit
/** Every admin write lands here. Never pass secrets in before/after: callers redact. */
export async function audit(ctx: Ctx, who: { id: string; email: string }, req: FastifyRequest | null, action: string, target?: string, before?: unknown, after?: unknown) {
  await withSystem(ctx.db, tx => tx.query(
    `INSERT INTO admin_audit (admin_id, admin_email, action, target, before, after, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [who.id, who.email, action, target ?? null, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), req ? ip(req) : null]));
}
