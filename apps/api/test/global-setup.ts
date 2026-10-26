import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { seedReference } from '../src/db/seed.js';

// One throwaway database per test run. Point TEST_DATABASE_ADMIN_URL at any Postgres you can CREATE DATABASE on.
const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres@localhost:54329/postgres';
const NAME = `saathi_test_${process.pid}_${Date.now()}`;

export async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${NAME}`);
  await admin.end();
  const url = new URL(ADMIN);
  url.pathname = `/${NAME}`;
  process.env.TEST_DATABASE_URL = url.toString();
  const db = createPool({ DATABASE_URL: url.toString(), DATABASE_SSL: false, DATABASE_POOL_MAX: 2 });
  await migrate(db);
  await seedReference(db);
  await db.end();
  // vitest forks inherit env from this process
}

export async function teardown() {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
  await admin.end();
}
