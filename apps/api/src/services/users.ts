import { randomUUID } from 'node:crypto';
import type { Ctx } from '../context.js';
import { withSystem, withUser, type Tx } from '../db/pool.js';
import { AppError, forbidden } from '../errors.js';

/** Data key for a user, from cache or unwrapped from users.dek_wrapped. */
export async function getDek(ctx: Ctx, userId: string, tx?: Tx): Promise<Buffer> {
  const hit = ctx.crypto.cachedKey(userId);
  if (hit) return hit;
  const run = async (t: Tx) => {
    const { rows } = await t.query<{ dek_wrapped: Buffer }>('SELECT dek_wrapped FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new AppError(401, 'unauthorized', 'Please sign in again.');
    return ctx.crypto.unwrapUserKey(userId, rows[0].dek_wrapped);
  };
  return tx ? run(tx) : withUser(ctx.db, userId, run);
}

export interface Identity { kind: 'phone' | 'google'; value: string }

export interface Resolved { userId: string; isNew: boolean; pendingDeletion: boolean }

/**
 * Find the account for a verified identity, or create it. New accounts require the 18+ confirmation
 * (PRD 8.1) and get default consent (everything off), privacy, companion and notification rows.
 */
export async function resolveUser(ctx: Ctx, id: Identity, opts: { ageConfirmed18: boolean; nickname?: string }): Promise<Resolved> {
  const hash = ctx.crypto.lookupHash(id.kind, id.value);
  const col = id.kind === 'phone' ? 'phone_hash' : 'google_hash';
  const find = (tx: Tx) => tx.query<{ id: string; deleted_at: Date | null; deletion_requested_at: Date | null; age_confirmed_18: boolean; suspended_at: Date | null }>(`SELECT id, deleted_at, deletion_requested_at, age_confirmed_18, suspended_at FROM users WHERE ${col} = $1`, [hash]);

  return withSystem(ctx.db, async tx => {
    const existing = (await find(tx)).rows[0];
    if (existing && !existing.deleted_at) {
      if (!existing.age_confirmed_18) throw forbidden('under18', 'Saathi is for adults. This account is paused.');
      if (existing.suspended_at) throw forbidden('suspended', 'This account is paused. Please contact support.');
      return { userId: existing.id, isNew: false, pendingDeletion: !!existing.deletion_requested_at };
    }
    if (!opts.ageConfirmed18) throw forbidden('under18', 'Saathi is for adults.');
    if (!ctx.rt.settings.bool('access.signups_open')) throw forbidden('signups_closed', 'New sign-ups are paused right now. Please try again later.');

    const userId = randomUUID();
    const { dek, wrapped } = ctx.crypto.newUserKey(userId);
    const phoneEnc = id.kind === 'phone' ? ctx.crypto.encrypt(dek, userId, 'phone', id.value) : null;
    try {
      await tx.query('SAVEPOINT create_user');
      await tx.query(
        `INSERT INTO users (id, ${col}, phone_enc, dek_wrapped, nickname, age_confirmed_18) VALUES ($1,$2,$3,$4,$5,true)`,
        [userId, hash, phoneEnc, wrapped, (opts.nickname ?? '').slice(0, 24)],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        // Concurrent first sign-in for the same identity: use the row that won.
        await tx.query('ROLLBACK TO SAVEPOINT create_user');
        ctx.crypto.forget(userId);
        const again = (await find(tx)).rows[0];
        if (again) return { userId: again.id, isNew: false, pendingDeletion: false };
      }
      throw e;
    }
    for (const t of ['consents', 'privacy_settings', 'companions', 'notification_prefs']) {
      await tx.query(`INSERT INTO ${t} (user_id) VALUES ($1)`, [userId]);
    }
    return { userId, isNew: true, pendingDeletion: false };
  });
}

/** PUT /me/age with confirmed18=false: pause the account and cut every session. No content is deleted here. */
export async function pauseAsMinor(ctx: Ctx, userId: string): Promise<void> {
  await withSystem(ctx.db, async tx => {
    await tx.query('UPDATE users SET age_confirmed_18 = false WHERE id = $1', [userId]);
    await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  });
}

export async function assertAdult(ctx: Ctx, userId: string): Promise<void> {
  const ok = await withUser(ctx.db, userId, async tx => (await tx.query('SELECT age_confirmed_18 AND deleted_at IS NULL AS ok FROM users WHERE id = $1', [userId])).rows[0]?.ok);
  if (!ok) throw forbidden('under18', 'Saathi is for adults. This account is paused.');
}
