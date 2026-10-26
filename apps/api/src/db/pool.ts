import pg from 'pg';
import type { Config } from '../config.js';

// Return timestamps/dates as strings and numerics as numbers where safe; keep bigint as string.
pg.types.setTypeParser(1082, v => v); // date -> 'YYYY-MM-DD', no timezone shifting

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(cfg: Pick<Config, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_POOL_MAX'>): Db {
  return new pg.Pool({
    connectionString: cfg.DATABASE_URL,
    ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: cfg.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run<T>(db: Db, fn: (tx: Tx) => Promise<T>, begin: (tx: Tx) => Promise<void>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await begin(tx);
    const out = await fn(tx);
    await tx.query('COMMIT');
    return out;
  } catch (e) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    tx.release();
  }
}

/**
 * All user-facing work. Drops to the saathi_app role (no BYPASSRLS) and sets app.user_id for this
 * transaction only (SET LOCAL semantics), so Postgres itself enforces isolation between users.
 */
export function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error('invalid user id');
  return run(db, fn, async tx => {
    await tx.query('SET LOCAL ROLE saathi_app');
    await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  });
}

/**
 * System work as the owning role: sign-in, token rotation, scheduler, account deletion.
 * Only auth/, jobs/ and services that must cross users call this. Never from a request handler that
 * has an authenticated user, except where listed in the service layer.
 */
export function withSystem<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(db, fn, async () => undefined);
}
