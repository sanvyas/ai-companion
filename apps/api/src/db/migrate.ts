import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const c of [join(here, 'migrations'), join(here, '..', 'migrations'), join(here, '..', 'src', 'db', 'migrations')]) {
    if (existsSync(c)) return c;
  }
  throw new Error('migrations folder not found');
}

/** Forward-only. A migration that changed after being applied is an error, never silently re-run. */
export async function migrate(db: Db, log: (m: string) => void = () => undefined): Promise<string[]> {
  const dir = migrationsDir();
  const files = readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort();
  const c = await db.connect();
  const applied: string[] = [];
  try {
    await c.query('SELECT pg_advisory_lock(7263541)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Map((await c.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')).rows.map(r => [r.name, r.checksum]));
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8');
      const sum = createHash('sha256').update(sql).digest('hex');
      if (done.has(f)) {
        if (done.get(f) !== sum) throw new Error(`Migration ${f} was edited after it was applied. Add a new migration instead.`);
        continue;
      }
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [f, sum]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
      applied.push(f);
      log(`applied ${f}`);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(7263541)').catch(() => undefined);
    c.release();
  }
  return applied;
}
