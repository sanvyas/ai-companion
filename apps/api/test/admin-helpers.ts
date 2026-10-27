import { createAdmin } from '../src/admin/auth.js';
import { hotp, totpStep } from '../src/admin/totp.js';
import type { Role } from '../src/admin/rbac.js';
import type { TestApp } from './app-helpers.js';

let n = 0;
export const PASSWORD = 'Correct-Horse-Battery-9';

export interface AdminSession { headers: Record<string, string>; email: string; csrf: string; id: string; cookie: string; secret: string }

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const sc = res.headers['set-cookie'];
  const first = Array.isArray(sc) ? sc[0] : (sc as string | undefined);
  return first?.split(';')[0] ?? '';
};

/** A signed-in admin with the given role: real login, real authenticator code. */
export async function adminLogin(t: TestApp, role: Role = 'owner'): Promise<AdminSession> {
  const email = `admin${Date.now()}${++n}@example.com`;
  const { id } = await createAdmin(t.ctx, { email, name: 'Test Admin', role, password: PASSWORD });
  const login = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: PASSWORD } });
  if (login.statusCode !== 200) throw new Error(`admin login failed: ${login.body}`);
  const cookie = cookieOf(login);
  const secret = login.json().enrol.secret as string;
  const totp = await t.app.inject({ method: 'POST', url: '/admin/api/auth/totp', headers: { cookie }, payload: { code: hotp(secret, totpStep()) } });
  if (totp.statusCode !== 200) throw new Error(`admin totp failed: ${totp.body}`);
  const csrf = totp.json().csrf as string;
  return { headers: { cookie, 'x-csrf-token': csrf }, email, csrf, id, cookie, secret };
}

export { hotp, totpStep, cookieOf };
