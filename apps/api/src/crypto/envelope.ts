import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Envelope encryption for personal content (PRD section 4/5): every user has a random 256-bit data key (DEK),
// stored wrapped by the master key (KEK) from the environment. Journal text, memories, messages, summaries,
// phone numbers and the safety plan are encrypted with the DEK before they reach Postgres, so a leaked
// database dump, a Supabase dashboard login or a backup alone does not expose them.
//
// Wire format: [1 byte version][12 byte IV][16 byte GCM tag][ciphertext]. The AAD binds a value to its
// owner and purpose so ciphertext cannot be moved to another user or column.

const VERSION = 1;
const ALGO = 'aes-256-gcm';

export function randomKey(): Buffer {
  return randomBytes(32);
}

function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), ct]);
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 29 || blob[0] !== VERSION) throw new Error('unsupported ciphertext');
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(29)), d.final()]);
}

export class Crypto {
  private readonly kek: Buffer;
  private readonly phoneKey: Buffer;
  private readonly dekCache = new Map<string, Buffer>();

  constructor(kekB64: string, phoneKeyB64: string) {
    this.kek = Buffer.from(kekB64, 'base64');
    this.phoneKey = Buffer.from(phoneKeyB64, 'base64');
    if (this.kek.length !== 32 || this.phoneKey.length !== 32) throw new Error('keys must be 32 bytes');
  }

  /** Create a fresh DEK for a new user. Store `wrapped` in users.dek_wrapped. */
  newUserKey(userId: string): { dek: Buffer; wrapped: Buffer } {
    const dek = randomKey();
    const wrapped = seal(this.kek, dek, `dek:${userId}`);
    this.dekCache.set(userId, dek);
    return { dek, wrapped };
  }

  unwrapUserKey(userId: string, wrapped: Buffer): Buffer {
    const hit = this.dekCache.get(userId);
    if (hit) return hit;
    const dek = open(this.kek, wrapped, `dek:${userId}`);
    if (this.dekCache.size > 5000) this.dekCache.clear();
    this.dekCache.set(userId, dek);
    return dek;
  }

  forget(userId: string) {
    this.dekCache.delete(userId);
  }

  encrypt(dek: Buffer, userId: string, purpose: string, plaintext: string): Buffer {
    return seal(dek, Buffer.from(plaintext, 'utf8'), `${userId}:${purpose}`);
  }

  decrypt(dek: Buffer, userId: string, purpose: string, blob: Buffer): string {
    return open(dek, blob, `${userId}:${purpose}`).toString('utf8');
  }

  encryptJson(dek: Buffer, userId: string, purpose: string, value: unknown): Buffer {
    return this.encrypt(dek, userId, purpose, JSON.stringify(value));
  }

  decryptJson<T>(dek: Buffer, userId: string, purpose: string, blob: Buffer): T {
    return JSON.parse(this.decrypt(dek, userId, purpose, blob)) as T;
  }

  /** Keyed hash for lookups of values we do not store in clear (phone, Google subject). */
  lookupHash(kind: string, value: string): Buffer {
    return createHmac('sha256', this.phoneKey).update(`${kind}\0${value}`).digest();
  }
}

export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** E.164 normaliser. India-first: bare 10-digit mobiles starting 6-9 get +91. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const only = digits.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(only)) return `+91${only}`;
  if (/^0[6-9]\d{9}$/.test(only)) return `+91${only.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(only)) return `+${only}`;
  return null;
}

export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)} ••••• ${e164.slice(-3)}`;
}
