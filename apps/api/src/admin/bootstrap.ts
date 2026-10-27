import type { Ctx } from '../context.js';
import { withSystem, type Db } from '../db/pool.js';
import { createAdmin } from './auth.js';

/**
 * Hosts without a shell (Render's free tier) cannot run `admin:create`. When no admin exists yet and both variables are
 * set, create the first owner from them. It never runs again once any admin exists, so remove the variables afterwards.
 * The admin still has to enrol an authenticator app on first sign-in.
 */
export async function bootstrapAdmin(db: Db, log: (m: string) => void, env: NodeJS.ProcessEnv = process.env) {
  const email = env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  const n = await withSystem(db, tx => tx.query('SELECT count(*)::int AS n FROM admin_users'));
  if (n.rows[0].n > 0) return;
  try {
    await createAdmin({ db } as unknown as Ctx, { email, name: env.ADMIN_BOOTSTRAP_NAME?.trim() || email, role: 'owner', password });
    log(`Created the first admin (${email}). Remove ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD now.`);
  } catch (e) {
    log(`Could not create the first admin: ${(e as Error).message}`);
  }
}
