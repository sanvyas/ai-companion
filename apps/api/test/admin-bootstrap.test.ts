import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { bootstrapAdmin } from '../src/admin/bootstrap.js';
import { createPool, withSystem, type Db } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { testConfig } from './helpers.js';

// Needs a database that has no admins at all, so it gets its own rather than sharing the suite's.
const name = `bootstrap_${Date.now()}`;
let admin: pg.Client;
let db: Db;
const count = async () => (await withSystem(db, tx => tx.query('SELECT count(*)::int AS n FROM admin_users'))).rows[0].n as number;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = `/${name}`;
  db = createPool({ ...testConfig(), DATABASE_URL: url.toString() });
  await migrate(db, () => undefined);
});

afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin?.end();
});

describe('first admin from the environment', () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

  it('does nothing without both variables', async () => {
    await bootstrapAdmin(db, () => undefined, env({ ADMIN_BOOTSTRAP_EMAIL: 'a@example.com' }));
    expect(await count()).toBe(0);
  });

  it('reports a weak password without throwing or creating anyone', async () => {
    const logs: string[] = [];
    await bootstrapAdmin(db, m => logs.push(m), env({ ADMIN_BOOTSTRAP_EMAIL: 'a@example.com', ADMIN_BOOTSTRAP_PASSWORD: 'short' }));
    expect(logs[0]).toMatch(/Could not create/);
    expect(await count()).toBe(0);
  });

  it('creates one owner when none exists, never logs the password, and never runs again', async () => {
    const logs: string[] = [];
    const vars = { ADMIN_BOOTSTRAP_EMAIL: 'Founder@Example.com', ADMIN_BOOTSTRAP_PASSWORD: 'Correct-Horse-Battery-9' };
    await bootstrapAdmin(db, m => logs.push(m), env(vars));
    const rows = (await withSystem(db, tx => tx.query('SELECT email, role, totp_enabled FROM admin_users'))).rows;
    expect(rows).toEqual([{ email: 'founder@example.com', role: 'owner', totp_enabled: false }]);
    expect(logs.join()).not.toContain('Correct-Horse');
    await bootstrapAdmin(db, m => logs.push(m), env({ ...vars, ADMIN_BOOTSTRAP_EMAIL: 'other@example.com' }));
    expect(await count()).toBe(1);
  });
});
