import { randomInt, randomUUID } from 'node:crypto';
import type { Ctx } from '../context.js';
import { withSystem, type Db } from '../db/pool.js';
import { hmacHex, safeEqualHex } from '../crypto/envelope.js';
import { parsePhone } from './otp.js';

// People the founders have let in. Until an SMS vendor is connected, the code the owner gives them is how they sign in.
// Only a keyed hash of the phone and of the code is kept. A wrong code five times locks that person for 15 minutes.

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

// Keyed on the invite's id, not the number, so a code can be reset without knowing the phone again.
const codeHash = (ctx: Pick<Ctx, 'cfg'>, inviteId: string, code: string) => hmacHex(ctx.cfg.OTP_PEPPER, `invite:${inviteId}:${code}`);
export const newInviteCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export interface InviteRow { id: string; phone_last4: string; label: string; created_by: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null; locked_until: Date | null; signed_in: boolean }

export async function hasInvite(ctx: Ctx, phone: string): Promise<boolean> {
  const target = ctx.crypto.lookupHash('phone', phone);
  const r = await withSystem(ctx.db, tx => tx.query('SELECT 1 FROM invited_logins WHERE phone_hash = $1 AND revoked_at IS NULL', [target]));
  return r.rows.length > 0;
}

/** Create (or re-activate with a new code) an invite. Returns the code, which is shown once and never stored in clear. */
export async function createInvite(ctx: Pick<Ctx, 'cfg' | 'crypto' | 'db'>, input: { phone: string; label?: string; code?: string; by: string }) {
  const phone = parsePhone(input.phone);
  const code = input.code ?? newInviteCode();
  const target = ctx.crypto.lookupHash('phone', phone);
  const id = await withSystem(ctx.db, async tx => {
    const existing = (await tx.query<{ id: string }>('SELECT id FROM invited_logins WHERE phone_hash = $1', [target])).rows[0]?.id;
    const inviteId = existing ?? randomUUID();
    await tx.query(
      `INSERT INTO invited_logins (id, phone_hash, phone_last4, label, code_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (phone_hash) DO UPDATE SET code_hash = EXCLUDED.code_hash, label = CASE WHEN EXCLUDED.label = '' THEN invited_logins.label ELSE EXCLUDED.label END,
         failed_attempts = 0, locked_until = NULL, revoked_at = NULL`,
      [inviteId, target, phone.slice(-4), (input.label ?? '').trim().slice(0, 60), codeHash(ctx, inviteId, code), input.by]);
    return inviteId;
  });
  return { id, code, phoneLast4: phone.slice(-4) };
}

export type InviteCheck = 'ok' | 'bad' | 'locked' | 'none';

export async function checkInviteCode(ctx: Ctx, phone: string, code: string): Promise<InviteCheck> {
  const target = ctx.crypto.lookupHash('phone', phone);
  return withSystem(ctx.db, async tx => {
    const row = (await tx.query<{ id: string; code_hash: string; failed_attempts: number; locked_until: Date | null }>(
      'SELECT id, code_hash, failed_attempts, locked_until FROM invited_logins WHERE phone_hash = $1 AND revoked_at IS NULL FOR UPDATE', [target])).rows[0];
    if (!row) return 'none';
    if (row.locked_until && row.locked_until > new Date()) return 'locked';
    if (safeEqualHex(row.code_hash, codeHash(ctx, row.id, code))) {
      await tx.query('UPDATE invited_logins SET failed_attempts = 0, locked_until = NULL, last_used_at = now() WHERE id = $1', [row.id]);
      return 'ok';
    }
    const failures = row.failed_attempts + 1;
    await tx.query('UPDATE invited_logins SET failed_attempts = $2, locked_until = $3 WHERE id = $1',
      [row.id, failures >= MAX_FAILURES ? 0 : failures, failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null]);
    return 'bad';
  });
}

export async function listInvites(ctx: Pick<Ctx, 'db'>): Promise<InviteRow[]> {
  const r = await withSystem(ctx.db, tx => tx.query<InviteRow>(
    `SELECT i.id, i.phone_last4, i.label, i.created_by, i.created_at, i.last_used_at, i.revoked_at, i.locked_until,
            EXISTS (SELECT 1 FROM users u WHERE u.phone_hash = i.phone_hash AND u.deleted_at IS NULL) AS signed_in
       FROM invited_logins i ORDER BY i.created_at DESC LIMIT 500`));
  return r.rows;
}

/** BETA_LOGINS_BOOTSTRAP="9876543210:123456,9123456780:654321": adds invites that don't exist yet. Never overwrites. */
export async function bootstrapInvites(ctx: Pick<Ctx, 'cfg' | 'crypto' | 'db'>, log: (m: string) => void, env: string | undefined = process.env.BETA_LOGINS_BOOTSTRAP) {
  if (!env?.trim()) return;
  for (const pair of env.split(',').map(s => s.trim()).filter(Boolean)) {
    const [rawPhone, code] = pair.split(':');
    try {
      if (!code || !/^\d{6}$/.test(code)) throw new Error('code must be six digits');
      const phone = parsePhone(rawPhone);
      const target = ctx.crypto.lookupHash('phone', phone);
      const exists = await withSystem(ctx.db as Db, tx => tx.query('SELECT 1 FROM invited_logins WHERE phone_hash = $1', [target]));
      if (exists.rows.length) continue;
      await createInvite(ctx, { phone, code, label: 'Bootstrap', by: 'bootstrap' });
      log(`Added invited sign-in for ••••${phone.slice(-4)}`);
    } catch (e) {
      log(`Could not add an invited sign-in: ${(e as Error).message}`);
    }
  }
}

/** A new code for an existing invite. Returns null if the invite doesn't exist. */
export async function resetInviteCode(ctx: Pick<Ctx, 'cfg' | 'db'>, id: string, code = newInviteCode()) {
  const r = await withSystem(ctx.db, tx => tx.query<{ phone_last4: string }>(
    'UPDATE invited_logins SET code_hash = $2, failed_attempts = 0, locked_until = NULL, revoked_at = NULL WHERE id = $1 RETURNING phone_last4', [id, codeHash(ctx, id, code)]));
  return r.rows[0] ? { code, phoneLast4: r.rows[0].phone_last4 } : null;
}

let anyCache = { at: 0, value: false };
/** Whether anyone has been invited, so the app can offer phone sign-in. Cached briefly: the app asks on every launch. */
export async function hasAnyInvite(ctx: Pick<Ctx, 'db'>): Promise<boolean> {
  if (Date.now() - anyCache.at < 10_000) return anyCache.value;
  const r = await withSystem(ctx.db, tx => tx.query('SELECT 1 FROM invited_logins WHERE revoked_at IS NULL LIMIT 1'));
  anyCache = { at: Date.now(), value: r.rows.length > 0 };
  return anyCache.value;
}
export const forgetInviteCache = () => { anyCache = { at: 0, value: false }; };
