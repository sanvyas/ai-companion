import type { Companion, Consent, ConsentUpdate, Me, MeUpdate, Privacy, PrivacyUpdate, TrustedContact } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withSystem, withUser, type Tx } from '../db/pool.js';
import { maskPhone } from '../crypto/envelope.js';
import { notFound } from '../errors.js';
import { audit } from './audit.js';
import { getDek } from './users.js';

type Row = Record<string, unknown>;

const toConsent = (r: Row): Consent => ({
  version: r.version as number, acceptedAt: r.accepted_at ? (r.accepted_at as Date).toISOString() : null,
  remember: r.remember as boolean, notifications: r.notifications as boolean, calls: r.calls as boolean,
  healthData: r.health_data as boolean, location: r.location as Consent['location'], improveModels: r.improve_models as boolean,
});
const toPrivacy = (r: Row): Privacy => ({
  lockScreenPreviews: r.lock_screen_previews as boolean, discreetMode: r.discreet_mode as boolean,
  appLock: r.app_lock as Privacy['appLock'], quickHide: r.quick_hide as boolean,
  transcriptRetentionDays: r.transcript_retention_days as Privacy['transcriptRetentionDays'],
});
const toCompanion = (r: Row): Companion => ({ name: r.name as string, look: r.look as Companion['look'], voice: r.voice as Companion['voice'] });

export async function getConsent(tx: Tx, userId: string): Promise<Consent> {
  return toConsent((await tx.query('SELECT * FROM consents WHERE user_id = $1', [userId])).rows[0]);
}
export async function getPrivacy(tx: Tx, userId: string): Promise<Privacy> {
  return toPrivacy((await tx.query('SELECT * FROM privacy_settings WHERE user_id = $1', [userId])).rows[0]);
}
export async function getCompanion(tx: Tx, userId: string): Promise<Companion> {
  return toCompanion((await tx.query('SELECT * FROM companions WHERE user_id = $1', [userId])).rows[0]);
}

export async function getTrusted(ctx: Ctx, tx: Tx, userId: string): Promise<TrustedContact | null> {
  const r = (await tx.query<{ data_enc: Buffer }>('SELECT data_enc FROM trusted_contacts WHERE user_id = $1', [userId])).rows[0];
  if (!r) return null;
  return ctx.crypto.decryptJson<TrustedContact>(await getDek(ctx, userId, tx), userId, 'trusted', r.data_enc);
}

export async function getMe(ctx: Ctx, userId: string): Promise<Me> {
  return withUser(ctx.db, userId, async tx => {
    const u = (await tx.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0] as Row | undefined;
    if (!u) throw notFound('Your account');
    const dek = await getDek(ctx, userId, tx);
    const trusted = await getTrusted(ctx, tx, userId);
    return {
      id: userId,
      nickname: u.nickname as string,
      language: u.language as Me['language'],
      timezone: u.timezone as string,
      city: (u.city as string | null) ?? null,
      phoneMasked: u.phone_enc ? maskPhone(ctx.crypto.decrypt(dek, userId, 'phone', u.phone_enc as Buffer)) : null,
      subscription: u.subscription as Me['subscription'],
      ageConfirmed18: u.age_confirmed_18 as boolean,
      onboarded: !!u.onboarded_at,
      pendingDeletion: !!u.deletion_requested_at,
      consent: await getConsent(tx, userId),
      privacy: await getPrivacy(tx, userId),
      companion: await getCompanion(tx, userId),
      trustedContact: trusted ? { name: trusted.name, relation: trusted.relation, phoneMasked: maskPhone(trusted.phone) } : null,
      features: {
        otp: ctx.otp.canSend, google: !!ctx.rt.secrets.get('google', 'client_id'), llm: ctx.llm.configured,
        stt: !!ctx.stt, tts: !!ctx.tts, push: ctx.push.enabled, calls: !!ctx.telephony,
      },
    };
  });
}

export async function updateMe(ctx: Ctx, userId: string, b: MeUpdate): Promise<void> {
  await withUser(ctx.db, userId, async tx => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.nickname !== undefined) add('nickname', b.nickname);
    if (b.language !== undefined) add('language', b.language);
    if (b.timezone !== undefined) add('timezone', b.timezone);
    if (b.city !== undefined) add('city', b.city);
    if (b.onboarded) sets.push('onboarded_at = COALESCE(onboarded_at, now())');
    if (!sets.length) return;
    vals.push(userId);
    await tx.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  });
}

const CONSENT_COLS: Record<keyof ConsentUpdate, string> = {
  remember: 'remember', notifications: 'notifications', calls: 'calls', healthData: 'health_data', location: 'location', improveModels: 'improve_models',
};

export async function updateConsent(ctx: Ctx, userId: string, b: ConsentUpdate): Promise<Consent> {
  return withUser(ctx.db, userId, async tx => {
    const before = await getConsent(tx, userId);
    const sets: string[] = ['updated_at = now()', 'accepted_at = COALESCE(accepted_at, now())'];
    const vals: unknown[] = [];
    for (const k of Object.keys(b) as (keyof ConsentUpdate)[]) { vals.push(b[k]); sets.push(`${CONSENT_COLS[k]} = $${vals.length}`); }
    vals.push(userId);
    await tx.query(`UPDATE consents SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
    const after = await getConsent(tx, userId);
    await audit(tx, userId, 'consent.update', before, after);
    return after;
  });
}

const PRIVACY_COLS: Record<keyof PrivacyUpdate, string> = {
  lockScreenPreviews: 'lock_screen_previews', discreetMode: 'discreet_mode', appLock: 'app_lock', quickHide: 'quick_hide', transcriptRetentionDays: 'transcript_retention_days',
};

export async function updatePrivacy(ctx: Ctx, userId: string, b: PrivacyUpdate): Promise<Privacy> {
  return withUser(ctx.db, userId, async tx => {
    const before = await getPrivacy(tx, userId);
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    for (const k of Object.keys(b) as (keyof PrivacyUpdate)[]) { vals.push(b[k]); sets.push(`${PRIVACY_COLS[k]} = $${vals.length}`); }
    vals.push(userId);
    await tx.query(`UPDATE privacy_settings SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
    const after = await getPrivacy(tx, userId);
    await audit(tx, userId, 'privacy.update', before, after);
    return after;
  });
}

export async function updateCompanion(ctx: Ctx, userId: string, b: Partial<Companion>): Promise<Companion> {
  return withUser(ctx.db, userId, async tx => {
    const before = await getCompanion(tx, userId);
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    for (const k of ['name', 'look', 'voice'] as const) if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${k} = $${vals.length}`); }
    vals.push(userId);
    await tx.query(`UPDATE companions SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
    const after = await getCompanion(tx, userId);
    await audit(tx, userId, 'companion.update', before, after);
    return after;
  });
}

export async function putTrusted(ctx: Ctx, userId: string, b: TrustedContact): Promise<void> {
  await withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const had = await getTrusted(ctx, tx, userId);
    await tx.query(
      `INSERT INTO trusted_contacts (user_id, data_enc) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET data_enc = EXCLUDED.data_enc, updated_at = now()`,
      [userId, ctx.crypto.encryptJson(dek, userId, 'trusted', b)]);
    await audit(tx, userId, 'trusted_contact.update', had ? { name: had.name } : null, { name: b.name });
  });
}

export async function deleteTrusted(ctx: Ctx, userId: string): Promise<void> {
  await withUser(ctx.db, userId, async tx => {
    await tx.query('DELETE FROM trusted_contacts WHERE user_id = $1', [userId]);
    await audit(tx, userId, 'trusted_contact.delete', null, null);
  });
}

/** Account removal: stop access now, remove data within 30 days (PRD 5.2). The purge job runs in jobs/. */
export async function requestDeletion(ctx: Ctx, userId: string): Promise<void> {
  await withSystem(ctx.db, async tx => {
    await tx.query('UPDATE users SET deletion_requested_at = now() WHERE id = $1 AND deletion_requested_at IS NULL', [userId]);
    await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await tx.query(
      `INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('account.purge', $1, $2, now() + interval '30 days') ON CONFLICT (dedupe_key) DO NOTHING`,
      [`account.purge:${userId}`, userId]);
    await tx.query(`UPDATE jobs SET status = 'skipped' WHERE user_id = $1 AND status = 'pending' AND kind <> 'account.purge'`, [userId]);
  });
}

export async function cancelDeletion(ctx: Ctx, userId: string): Promise<void> {
  await withSystem(ctx.db, async tx => {
    await tx.query('UPDATE users SET deletion_requested_at = NULL WHERE id = $1 AND deleted_at IS NULL', [userId]);
    await tx.query(`DELETE FROM jobs WHERE dedupe_key = $1 AND status = 'pending'`, [`account.purge:${userId}`]);
  });
}
