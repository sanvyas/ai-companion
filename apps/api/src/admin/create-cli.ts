import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import type { Ctx } from '../context.js';
import { createAdmin } from './auth.js';
import { randomPassword } from './password.js';
import { ROLES, type Role } from './rbac.js';

// Create the first admin (or any later one) from the command line:
//   npm run admin:create -w @saathi/api -- --email you@example.com --name "Your Name" [--role owner] [--password ...]
// With no --password a strong one is generated and printed once. On first sign-in the admin sets up an authenticator app.

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg('email'), name = arg('name') ?? email;
const role = (arg('role') ?? 'owner') as Role;
if (!email) { console.error('Usage: admin:create --email <email> --name <name> [--role owner|engineer|support|viewer] [--password <pw>]'); process.exit(1); }
if (!ROLES.includes(role)) { console.error(`Role must be one of ${ROLES.join(', ')}`); process.exit(1); }

const cfg = loadConfig();
const db = createPool(cfg);
try {
  const password = arg('password') ?? randomPassword();
  const a = await createAdmin({ db } as unknown as Ctx, { email, name: name!, role, password });
  console.log(`Created ${role} ${a.email}`);
  if (!arg('password')) console.log(`Temporary password (shown once): ${password}`);
  console.log('Sign in at the admin portal. You will be asked to set up an authenticator app.');
} finally {
  await db.end();
}
