import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { unauthorized } from '../errors.js';

const ISS = 'saathi-api';
const AUD = 'saathi-app';
const key = (ctx: Pick<Ctx, 'cfg'>) => new TextEncoder().encode(ctx.cfg.JWT_SECRET);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function signAccess(ctx: Pick<Ctx, 'cfg'>, userId: string, familyId: string): Promise<string> {
  return new SignJWT({ fid: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${ctx.cfg.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key(ctx));
}

export async function verifyAccess(ctx: Pick<Ctx, 'cfg'>, token: string): Promise<{ userId: string; familyId: string }> {
  try {
    const { payload } = await jwtVerify(token, key(ctx), { issuer: ISS, audience: AUD, algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.fid !== 'string') throw new Error('claims');
    return { userId: payload.sub, familyId: payload.fid };
  } catch {
    throw unauthorized();
  }
}

export interface IssuedSession { accessToken: string; refreshToken: string; expiresInSeconds: number }

/** New refresh token in a new (sign-in) or existing (rotation) family. The raw token is never stored. */
export async function issueSession(ctx: Ctx, userId: string, opts: { deviceLabel?: string; familyId?: string } = {}): Promise<IssuedSession> {
  const familyId = opts.familyId ?? randomUUID();
  const refresh = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ctx.cfg.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await withSystem(ctx.db, tx =>
    tx.query('INSERT INTO refresh_tokens (user_id, family_id, token_hash, device_label, expires_at) VALUES ($1,$2,$3,$4,$5)', [userId, familyId, sha(refresh), opts.deviceLabel ?? null, expires]),
  );
  return { accessToken: await signAccess(ctx, userId, familyId), refreshToken: refresh, expiresInSeconds: ctx.cfg.ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Rotating refresh tokens with reuse detection: presenting a token that was already rotated means it leaked,
 * so the whole family is revoked and the real user signs in again.
 */
export async function rotateSession(ctx: Ctx, presented: string): Promise<{ session: IssuedSession; userId: string }> {
  const hash = sha(presented);
  const outcome = await withSystem(ctx.db, async tx => {
    const { rows } = await tx.query<{ id: string; user_id: string; family_id: string; expires_at: Date; revoked_at: Date | null; replaced_by: string | null; device_label: string | null }>(
      'SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by, device_label FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [hash]);
    const t = rows[0];
    if (!t) return { ok: false as const };
    if (t.revoked_at || t.replaced_by) {
      await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
      return { ok: false as const };
    }
    if (t.expires_at.getTime() < Date.now()) return { ok: false as const };
    const u = await tx.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL AND age_confirmed_18', [t.user_id]);
    if (!u.rowCount) return { ok: false as const };
    const next = randomBytes(32).toString('base64url');
    const nextId = randomUUID();
    await tx.query('INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, device_label, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [nextId, t.user_id, t.family_id, sha(next), t.device_label, new Date(Date.now() + ctx.cfg.REFRESH_TOKEN_TTL_DAYS * 86_400_000)]);
    await tx.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [t.id, nextId]);
    return { ok: true as const, userId: t.user_id, familyId: t.family_id, refresh: next };
  });
  if (!outcome.ok) throw unauthorized();
  return {
    userId: outcome.userId,
    session: { accessToken: await signAccess(ctx, outcome.userId, outcome.familyId), refreshToken: outcome.refresh, expiresInSeconds: ctx.cfg.ACCESS_TOKEN_TTL_SECONDS },
  };
}

export async function revokeFamilyByRefresh(ctx: Ctx, presented: string): Promise<void> {
  await withSystem(ctx.db, tx =>
    tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)', [sha(presented)]));
}

export async function revokeAllForUser(ctx: Ctx, userId: string): Promise<void> {
  await withSystem(ctx.db, tx => tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]));
}
