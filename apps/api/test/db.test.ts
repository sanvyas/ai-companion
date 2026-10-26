import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Db } from '../src/db/pool.js';
import { withSystem, withUser } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { Crypto, maskPhone, normalizePhone } from '../src/crypto/envelope.js';
import { testConfig, testDb } from './helpers.js';

let db: Db;
let crypto: Crypto;
const cfg = testConfig();

async function makeUser(label: string) {
  const id = randomUUID();
  const { dek, wrapped } = crypto.newUserKey(id);
  await withSystem(db, tx => tx.query('INSERT INTO users (id, phone_hash, dek_wrapped, nickname) VALUES ($1,$2,$3,$4)', [id, crypto.lookupHash('phone', `+9190000${label}`), wrapped, label]));
  return { id, dek };
}

beforeAll(() => { db = testDb(); crypto = new Crypto(cfg.DATA_KEK, cfg.PHONE_HASH_KEY); });
afterAll(async () => { await db.end(); });

describe('migrations', () => {
  it('are idempotent and seed the reference data', async () => {
    expect(await migrate(db)).toEqual([]);
    const { rows } = await withSystem(db, tx => tx.query('SELECT count(*)::int AS n FROM helplines WHERE active'));
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
    const calm = await withSystem(db, tx => tx.query('SELECT count(*)::int AS n FROM calm_items'));
    expect(calm.rows[0].n).toBe(9);
  });
});

describe('row-level security', () => {
  it("a user sees only their own rows and cannot write another user's", async () => {
    const a = await makeUser('1111');
    const b = await makeUser('2222');
    const insert = (u: { id: string; dek: Buffer }, text: string) =>
      withUser(db, u.id, tx => tx.query(`INSERT INTO memories (user_id, theme, text_enc, source) VALUES ($1,'People',$2,'chat')`, [u.id, crypto.encrypt(u.dek, u.id, 'memory', text)]));
    await insert(a, 'a-secret');
    await insert(b, 'b-secret');

    const seenByA = await withUser(db, a.id, tx => tx.query('SELECT user_id FROM memories'));
    expect(seenByA.rows).toHaveLength(1);
    expect(seenByA.rows[0].user_id).toBe(a.id);

    // Forging user_id is rejected by WITH CHECK.
    await expect(withUser(db, a.id, tx => tx.query(`INSERT INTO memories (user_id, theme, text_enc, source) VALUES ($1,'People','\\x00','chat')`, [b.id]))).rejects.toThrow(/row-level security/);

    // Updating or deleting B's rows from A's context touches nothing.
    const upd = await withUser(db, a.id, tx => tx.query(`UPDATE memories SET hidden = true WHERE user_id = $1`, [b.id]));
    expect(upd.rowCount).toBe(0);
    const del = await withUser(db, a.id, tx => tx.query(`DELETE FROM memories WHERE user_id = $1`, [b.id]));
    expect(del.rowCount).toBe(0);
    const stillB = await withSystem(db, tx => tx.query(`SELECT count(*)::int n FROM memories WHERE user_id=$1`, [b.id]));
    expect(stillB.rows[0].n).toBe(1);
  });

  it('with no user context the app role sees nothing', async () => {
    const rows = await withSystem(db, async tx => {
      await tx.query('SET LOCAL ROLE saathi_app');
      return (await tx.query('SELECT * FROM memories')).rows;
    });
    expect(rows).toEqual([]);
  });

  it('the app role cannot touch system tables or escalate', async () => {
    const u = await makeUser('3333');
    for (const t of ['otp_challenges', 'refresh_tokens', 'jobs', 'usage_events', 'notification_log']) {
      await expect(withUser(db, u.id, tx => tx.query(`SELECT 1 FROM ${t}`))).rejects.toThrow(/permission denied/);
    }
    await expect(withUser(db, u.id, tx => tx.query(`UPDATE users SET subscription='plus' WHERE id=$1`, [u.id]))).rejects.toThrow(/permission denied/);
    await expect(withUser(db, u.id, tx => tx.query(`UPDATE users SET phone_hash='\\x01' WHERE id=$1`, [u.id]))).rejects.toThrow(/permission denied/);
    await expect(withUser(db, u.id, tx => tx.query(`DELETE FROM users WHERE id=$1`, [u.id]))).rejects.toThrow(/permission denied/);
    await expect(withUser(db, u.id, tx => tx.query(`INSERT INTO users (dek_wrapped, phone_hash) VALUES ('\\x00','\\x02')`))).rejects.toThrow(/permission denied/);
    // can edit own nickname
    const ok = await withUser(db, u.id, tx => tx.query(`UPDATE users SET nickname='Asha' WHERE id=$1`, [u.id]));
    expect(ok.rowCount).toBe(1);
  });

  it('safety_events is write-only and audit_log is append-only for the app role', async () => {
    const u = await makeUser('4444');
    await withUser(db, u.id, tx => tx.query(`INSERT INTO safety_events (user_id, level, mode, source) VALUES ($1,3,'text','prefilter')`, [u.id]));
    await expect(withUser(db, u.id, tx => tx.query('SELECT * FROM safety_events'))).rejects.toThrow(/permission denied/);
    await withUser(db, u.id, tx => tx.query(`INSERT INTO audit_log (user_id, action, after) VALUES ($1,'consent.update','{}')`, [u.id]));
    await expect(withUser(db, u.id, tx => tx.query(`UPDATE audit_log SET action='x'`))).rejects.toThrow(/permission denied/);
    await expect(withUser(db, u.id, tx => tx.query(`DELETE FROM audit_log`))).rejects.toThrow(/permission denied/);
    const sys = await withSystem(db, tx => tx.query('SELECT count(*)::int n FROM safety_events WHERE user_id=$1', [u.id]));
    expect(sys.rows[0].n).toBe(1);
  });

  it('rejects malformed user ids before touching the database', () => {
    expect(() => withUser(db, "x'; DROP TABLE users;--", async () => 1)).toThrow('invalid user id');
  });
});

describe('envelope encryption', () => {
  it('round-trips and never stores plaintext', async () => {
    const u = await makeUser('5555');
    const secret = 'I could not sleep, I keep thinking about the interview.';
    const blob = crypto.encrypt(u.dek, u.id, 'journal', secret);
    expect(blob.toString('utf8')).not.toContain('interview');
    expect(crypto.decrypt(u.dek, u.id, 'journal', blob)).toBe(secret);
    await withUser(db, u.id, tx => tx.query(`INSERT INTO journal_entries (user_id, mode, text_enc) VALUES ($1,'written',$2)`, [u.id, blob]));
    const raw = await withSystem(db, tx => tx.query(`SELECT text_enc FROM journal_entries WHERE user_id=$1`, [u.id]));
    expect(Buffer.from(raw.rows[0].text_enc).includes(Buffer.from('interview'))).toBe(false);
  });

  it('binds ciphertext to its owner and purpose', async () => {
    const a = await makeUser('6666');
    const b = await makeUser('7777');
    const blob = crypto.encrypt(a.dek, a.id, 'journal', 'private');
    expect(() => crypto.decrypt(a.dek, b.id, 'journal', blob)).toThrow();
    expect(() => crypto.decrypt(a.dek, a.id, 'memory', blob)).toThrow();
    expect(() => crypto.decrypt(b.dek, a.id, 'journal', blob)).toThrow();
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 1;
    expect(() => crypto.decrypt(a.dek, a.id, 'journal', tampered)).toThrow();
  });

  it('wraps the data key so a different KEK cannot open it', async () => {
    const id = randomUUID();
    const { wrapped } = crypto.newUserKey(id);
    const other = new Crypto(testConfig().DATA_KEK, cfg.PHONE_HASH_KEY);
    expect(() => other.unwrapUserKey(id, wrapped)).toThrow();
    crypto.forget(id);
    expect(crypto.unwrapUserKey(id, wrapped)).toHaveLength(32);
  });

  it('phone hashing is stable, keyed, and domain separated', () => {
    expect(crypto.lookupHash('phone', '+919876543210').equals(crypto.lookupHash('phone', '+919876543210'))).toBe(true);
    expect(crypto.lookupHash('phone', 'x').equals(crypto.lookupHash('google', 'x'))).toBe(false);
  });
});

describe('phone helpers', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('normalises %s', (raw, out) => expect(normalizePhone(raw)).toBe(out));
  it.each(['12345', '5876543210', 'abcdefghij', ''])('rejects %s', raw => expect(normalizePhone(raw)).toBeNull());
  it('masks all but the edges', () => expect(maskPhone('+919876543210')).toBe('+91 ••••• 210'));
});
