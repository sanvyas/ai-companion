import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hotp, totpStep, base32, base32decode, verifyTotp } from '../src/admin/totp.js';
import { hashPassword, verifyPassword, passwordProblem } from '../src/admin/password.js';
import { can, ROLES } from '../src/admin/rbac.js';
import { makeApp, type TestApp } from './app-helpers.js';
import { PASSWORD, adminLogin, cookieOf } from './admin-helpers.js';
import { createAdmin } from '../src/admin/auth.js';
import { withSystem } from '../src/db/pool.js';

describe('totp', () => {
  // RFC 6238 appendix B, SHA-1, secret "12345678901234567890".
  const secret = base32(Buffer.from('12345678901234567890'));
  it('matches the RFC 6238 test vectors', () => {
    expect(hotp(secret, Math.floor(59 / 30))).toBe('287082');
    expect(hotp(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(hotp(secret, Math.floor(20000000000 / 30))).toBe('353130');
  });
  it('round-trips base32', () => expect(base32decode(base32(Buffer.from('hello world'))).toString()).toBe('hello world'));
  it('accepts one step of drift and nothing wider', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, hotp(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, hotp(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });
});

describe('passwords and roles', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword(PASSWORD);
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword(PASSWORD, h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('rejects weak passwords', () => {
    expect(passwordProblem('short')).toBeTruthy();
    expect(passwordProblem('alllowercaseletters')).toBeTruthy();
    expect(passwordProblem(PASSWORD)).toBeNull();
  });
  it('keeps the role ladder honest', () => {
    for (const r of ROLES) expect(can(r, 'overview.read')).toBe(true);
    expect(can('viewer', 'users.write')).toBe(false);
    expect(can('support', 'users.write')).toBe(true);
    expect(can('support', 'integrations.write')).toBe(false);
    expect(can('engineer', 'integrations.write')).toBe(false);
    expect(can('engineer', 'prompts.publish_safety')).toBe(false);
    expect(can('owner', 'prompts.publish_safety')).toBe(true);
    expect(can('owner', 'admins.manage')).toBe(true);
  });
});

describe('admin sign-in', () => {
  let t: TestApp;
  beforeAll(async () => { t = await makeApp(); });
  afterAll(async () => { await t.app.close(); });

  it('needs the password, then the authenticator code, before anything works', async () => {
    const email = `flow${Date.now()}@example.com`;
    await createAdmin(t.ctx, { email, name: 'Flow', role: 'owner', password: PASSWORD });
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/overview' })).statusCode).toBe(401);

    const login = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    expect(login.json().step).toBe('enrol');
    const cookie = cookieOf(login);
    expect(login.headers['set-cookie']).toMatch(/HttpOnly/i);
    expect(login.headers['set-cookie']).toMatch(/SameSite=Strict/i);
    // Password alone is not a session.
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/overview', headers: { cookie } })).statusCode).toBe(401);

    const secret = login.json().enrol.secret as string;
    const bad = await t.app.inject({ method: 'POST', url: '/admin/api/auth/totp', headers: { cookie }, payload: { code: '000000' } });
    expect(bad.statusCode).toBe(401);
    const ok = await t.app.inject({ method: 'POST', url: '/admin/api/auth/totp', headers: { cookie }, payload: { code: hotp(secret, totpStep()) } });
    expect(ok.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/overview', headers: { cookie } })).statusCode).toBe(200);
  });

  it('refuses a replayed authenticator code', async () => {
    const email = `replay${Date.now()}@example.com`;
    await createAdmin(t.ctx, { email, name: 'Replay', role: 'owner', password: PASSWORD });
    const l1 = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: PASSWORD } });
    const secret = l1.json().enrol.secret as string;
    const code = hotp(secret, totpStep());
    expect((await t.app.inject({ method: 'POST', url: '/admin/api/auth/totp', headers: { cookie: cookieOf(l1) }, payload: { code } })).statusCode).toBe(200);
    const l2 = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: PASSWORD } });
    expect(l2.json().step).toBe('totp');
    expect((await t.app.inject({ method: 'POST', url: '/admin/api/auth/totp', headers: { cookie: cookieOf(l2) }, payload: { code } })).statusCode).toBe(401);
  });

  it('gives the same answer for a wrong password and an unknown email, and locks after repeated failures', async () => {
    const email = `lock${Date.now()}@example.com`;
    await createAdmin(t.ctx, { email, name: 'Lock', role: 'viewer', password: PASSWORD });
    const wrong = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: 'nope-nope-nope-1A' } });
    const unknown = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email: `ghost${Date.now()}@example.com`, password: 'nope-nope-nope-1A' } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
    for (let i = 0; i < 5; i++) await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: 'nope-nope-nope-1A' } });
    const locked = await t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { email, password: PASSWORD } });
    expect(locked.statusCode).toBe(429);
  });

  it('requires the CSRF header on writes and rejects a wrong one', async () => {
    const a = await adminLogin(t);
    const noHeader = await t.app.inject({ method: 'PUT', url: '/admin/api/flags/test.csrf', headers: { cookie: a.cookie }, payload: { enabled: true } });
    expect(noHeader.statusCode).toBe(403);
    const wrong = await t.app.inject({ method: 'PUT', url: '/admin/api/flags/test.csrf', headers: { cookie: a.cookie, 'x-csrf-token': 'nope' }, payload: { enabled: true } });
    expect(wrong.statusCode).toBe(403);
    const ok = await t.app.inject({ method: 'PUT', url: '/admin/api/flags/test.csrf', headers: a.headers, payload: { enabled: true } });
    expect(ok.statusCode).toBe(200);
  });

  it('ends the session on sign-out and when the admin is deactivated', async () => {
    const a = await adminLogin(t);
    expect((await t.app.inject({ method: 'POST', url: '/admin/api/auth/logout', headers: a.headers })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/overview', headers: a.headers })).statusCode).toBe(401);
    const b = await adminLogin(t);
    await withSystem(t.ctx.db, tx => tx.query('UPDATE admin_users SET active = false WHERE id = $1', [b.id]));
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/overview', headers: b.headers })).statusCode).toBe(401);
  });

  it('never accepts a normal user token', async () => {
    const { signIn } = await import('./app-helpers.js');
    const u = await signIn(t);
    const r = await t.app.inject({ method: 'GET', url: '/admin/api/overview', headers: u.headers });
    expect(r.statusCode).toBe(401);
  });
});
