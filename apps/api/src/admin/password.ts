import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt with a per-password salt. Format: scrypt$N$r$p$salt$hash (base64url parts).
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 32;

function derive(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? reject(e) : resolve(k))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Verified against when the email is unknown, so a missing account takes as long as a wrong password. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(KEYLEN).toString('base64url')}`;

/** At least 12 characters, not all one class. Admins are few, so we can be strict. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'Use at least 12 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z0-9]/.test(pw)) return 'Mix lower case with upper case or numbers.';
  return null;
}

export function randomPassword(): string {
  return `${randomBytes(6).toString('base64url')}-${randomBytes(6).toString('base64url')}-${randomBytes(3).toString('hex')}Aa1`;
}
