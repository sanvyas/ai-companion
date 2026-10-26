import { randomInt, randomUUID } from 'node:crypto';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';
import { hmacHex, normalizePhone, safeEqualHex } from '../crypto/envelope.js';
import { badRequest, forbidden, tooMany } from '../errors.js';

const MAX_ATTEMPTS = 5;
const RESEND_AFTER_S = 30;
const MAX_PER_HOUR = 5;

const codeHash = (ctx: Ctx, challengeId: string, code: string) => hmacHex(ctx.cfg.OTP_PEPPER, `${challengeId}:${code}`);

export function parsePhone(raw: string): string {
  const p = normalizePhone(raw);
  if (!p) throw badRequest('invalid_phone', 'That phone number doesn’t look right. Include the country code if it isn’t an Indian number.');
  return p;
}

export async function startOtp(ctx: Ctx, rawPhone: string, ageConfirmed18: boolean, ip: string) {
  // Under-18: nothing is stored, no code is sent (PRD 8.1).
  if (!ageConfirmed18) throw forbidden('under18', 'Saathi is for adults.');
  const phone = parsePhone(rawPhone);
  if (!ctx.otp.canSend) await ctx.otp.send(phone, ''); // throws otp_unavailable
  const target = ctx.crypto.lookupHash('phone', phone);
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await withSystem(ctx.db, async tx => {
    const recent = await tx.query<{ created_at: Date }>(`SELECT created_at FROM otp_challenges WHERE target_hash = $1 AND created_at > now() - interval '1 hour' ORDER BY created_at DESC`, [target]);
    if (recent.rows.length >= MAX_PER_HOUR) throw tooMany('Too many codes requested. Please try again in a while.', 600);
    const last = recent.rows[0]?.created_at;
    if (last) {
      const wait = RESEND_AFTER_S - Math.floor((Date.now() - last.getTime()) / 1000);
      if (wait > 0) throw tooMany(`Please wait ${wait} seconds before asking for another code.`, wait);
    }
    await tx.query('INSERT INTO otp_challenges (id, target_hash, code_hash, expires_at, ip_hash) VALUES ($1,$2,$3,$4,$5)',
      [id, target, codeHash(ctx, id, code), new Date(Date.now() + ctx.cfg.OTP_TTL_SECONDS * 1000), hmacHex(ctx.cfg.OTP_PEPPER, ip)]);
  });

  await ctx.otp.send(phone, code);
  return {
    challengeId: id,
    expiresInSeconds: ctx.cfg.OTP_TTL_SECONDS,
    resendAfterSeconds: RESEND_AFTER_S,
    ...(ctx.otp.name === 'console' && !ctx.cfg.isProd ? { devCode: code } : {}),
  };
}

/** Returns the verified E.164 number. Every failure looks the same to the caller (no enumeration). */
export async function verifyOtp(ctx: Ctx, rawPhone: string, code: string, challengeId?: string): Promise<string> {
  const phone = parsePhone(rawPhone);
  const target = ctx.crypto.lookupHash('phone', phone);
  const fail = () => badRequest('invalid_code', 'That code didn’t work. Check it and try again, or ask for a new one.');

  const result = await withSystem(ctx.db, async tx => {
    const { rows } = await tx.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_challenges
        WHERE target_hash = $1 AND consumed_at IS NULL AND expires_at > now() ${challengeId ? 'AND id = $2' : ''}
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, challengeId ? [target, challengeId] : [target]);
    const c = rows[0];
    if (!c) return 'invalid' as const;
    if (c.attempts >= MAX_ATTEMPTS) {
      await tx.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [c.id]);
      return 'locked' as const;
    }
    if (!safeEqualHex(c.code_hash, codeHash(ctx, c.id, code))) {
      await tx.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [c.id]);
      return 'invalid' as const;
    }
    await tx.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [c.id]);
    return 'ok' as const;
  });
  if (result === 'locked') throw tooMany('Too many wrong codes. Ask for a new one.', 60);
  if (result !== 'ok') throw fail();
  return phone;
}
