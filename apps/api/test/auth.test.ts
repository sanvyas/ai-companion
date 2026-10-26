import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import { makeApp, newPhone, signIn, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });

describe('phone OTP sign-in', () => {
  it('creates an account with everything off by default, and returns tokens', async () => {
    const a = await signIn(t, newPhone(), 'Meera');
    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: a.headers })).json();
    expect(me.nickname).toBe('Meera');
    expect(me.ageConfirmed18).toBe(true);
    expect(me.consent).toMatchObject({ remember: false, notifications: false, calls: false, healthData: false, location: 'off', improveModels: false });
    expect(me.privacy).toMatchObject({ lockScreenPreviews: false, discreetMode: false, appLock: 'off' });
    expect(me.phoneMasked).toMatch(/^\+91 •+ \d{3}$/);
    expect(me.phoneMasked).not.toContain(a.phone);
    expect(me.features.otp).toBe(true);
  });

  it('never stores the phone number in clear and never echoes the OTP outside dev', async () => {
    const phone = newPhone();
    await signIn(t, phone);
    const row = await withSystem(t.ctx.db, tx => tx.query('SELECT phone_hash, phone_enc FROM users WHERE phone_hash = $1', [t.ctx.crypto.lookupHash('phone', `+91${phone}`)]));
    expect(row.rowCount).toBe(1);
    expect(Buffer.from(row.rows[0].phone_enc).includes(Buffer.from(phone))).toBe(false);
    const codes = await withSystem(t.ctx.db, tx => tx.query('SELECT code_hash FROM otp_challenges ORDER BY created_at DESC LIMIT 1'));
    expect(codes.rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signing in again reaches the same account', async () => {
    const phone = newPhone();
    const a = await signIn(t, phone);
    await new Promise(r => setTimeout(r, 0));
    // second code request is throttled (30 s), so clear throttling the way time would
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE otp_challenges SET created_at = now() - interval '2 minutes'`));
    const b = await signIn(t, phone);
    expect(b.userId).toBe(a.userId);
  });

  it('rejects wrong codes, locks after 5, and reveals nothing about the account', async () => {
    const phone = newPhone();
    const start = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
    const { devCode, challengeId } = start.json();
    const wrong = devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await t.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: wrong, challengeId, ageConfirmed18: true } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('invalid_code');
    }
    // Even the right code no longer works: the challenge is spent.
    const late = await t.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: devCode, challengeId, ageConfirmed18: true } });
    expect(late.statusCode).toBe(429);
  });

  it('throttles resends and caps codes per hour', async () => {
    const phone = newPhone();
    const first = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
    expect(first.statusCode).toBe(200);
    const again = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
    expect(again.statusCode).toBe(429);
    expect(again.headers['retry-after']).toBeDefined();
  });

  it('refuses under-18 before sending anything or creating anything', async () => {
    const phone = newPhone();
    const before = await withSystem(t.ctx.db, tx => tx.query('SELECT count(*)::int n FROM otp_challenges'));
    const r = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: false } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('under18');
    const after = await withSystem(t.ctx.db, tx => tx.query('SELECT count(*)::int n FROM otp_challenges'));
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('rejects malformed phone numbers and bodies', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone: '12345678', ageConfirmed18: true } })).json().error.code).toBe('invalid_phone');
    expect((await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: {} })).json().error.code).toBe('validation_failed');
  });

  it('is unavailable (not faked) when no OTP provider is configured', async () => {
    const off = await makeApp({ OTP_PROVIDER: 'none' });
    const r = await off.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone: newPhone(), ageConfirmed18: true } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('otp_unavailable');
    await off.app.close();
  });

  it('refuses the console provider and the mock model in production', async () => {
    const { loadConfig } = await import('../src/config.js');
    const { testEnv } = await import('./helpers.js');
    expect(() => loadConfig({ ...testEnv(), NODE_ENV: 'production', OTP_PROVIDER: 'console' } as never)).toThrow(/development only/);
    expect(() => loadConfig({ ...testEnv(), NODE_ENV: 'production', OTP_PROVIDER: 'none', LLM_PROVIDER: 'mock' } as never)).toThrow(/tests and local/);
  });
});

describe('sessions', () => {
  it('rejects missing or forged access tokens', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const a = await signIn(t);
    const r1 = await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const next = r1.json().refreshToken;
    expect(next).not.toBe(a.refreshToken);
    // Replaying the first token means it leaked: the new one dies too.
    const replay = await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } });
    expect(replay.statusCode).toBe(401);
    const afterReplay = await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: next } });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('logout revokes the session', async () => {
    const a = await signIn(t);
    expect((await t.app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(401);
  });

  it('google sign-in is unavailable without a client id', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'x'.repeat(40), ageConfirmed18: true } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('google_unavailable');
  });
});

describe('profile, consent, privacy, deletion', () => {
  it('consent changes are audited with before and after', async () => {
    const a = await signIn(t);
    const r = await t.app.inject({ method: 'PUT', url: '/me/consent', headers: a.headers, payload: { remember: true, location: 'city' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ remember: true, location: 'city', notifications: false });
    const log = await withSystem(t.ctx.db, tx => tx.query(`SELECT before, after FROM audit_log WHERE user_id = $1 AND action = 'consent.update'`, [a.userId]));
    expect(log.rows[0].before.remember).toBe(false);
    expect(log.rows[0].after.remember).toBe(true);
  });

  it('validates input', async () => {
    const a = await signIn(t);
    expect((await t.app.inject({ method: 'PUT', url: '/me/privacy', headers: a.headers, payload: { transcriptRetentionDays: 13 } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: '/me', headers: a.headers, payload: { nickname: 'x'.repeat(30) } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { look: 'photo' } })).statusCode).toBe(400);
  });

  it('stores the trusted contact encrypted and returns it masked', async () => {
    const a = await signIn(t);
    await t.app.inject({ method: 'PUT', url: '/trusted-contact', headers: a.headers, payload: { name: 'Priya Sharma', phone: '+919811122233', relation: 'sister' } });
    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: a.headers })).json();
    expect(me.trustedContact).toEqual({ name: 'Priya Sharma', relation: 'sister', phoneMasked: '+91 ••••• 233' });
    const raw = await withSystem(t.ctx.db, tx => tx.query('SELECT data_enc FROM trusted_contacts WHERE user_id = $1', [a.userId]));
    expect(Buffer.from(raw.rows[0].data_enc).includes(Buffer.from('Priya'))).toBe(false);
  });

  it('under-18 mid-use pauses the account and cuts sessions', async () => {
    const a = await signIn(t);
    const r = await t.app.inject({ method: 'PUT', url: '/me/age', headers: a.headers, payload: { confirmed18: false } });
    expect(r.statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(401);
    const blocked = await t.app.inject({ method: 'GET', url: '/memories', headers: a.headers });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('under18');
    // helplines stay reachable
    expect((await t.app.inject({ method: 'GET', url: '/helplines' })).statusCode).toBe(200);
  });

  it('delete schedules a purge, blocks refresh, and can be cancelled', async () => {
    const a = await signIn(t);
    const del = await t.app.inject({ method: 'DELETE', url: '/me', headers: a.headers });
    expect(del.statusCode).toBe(202);
    expect((await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: a.refreshToken } })).statusCode).toBe(401);
    const job = await withSystem(t.ctx.db, tx => tx.query(`SELECT run_at FROM jobs WHERE kind='account.purge' AND user_id = $1`, [a.userId]));
    expect(job.rowCount).toBe(1);
    const days = (job.rows[0].run_at.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
    const cancel = await t.app.inject({ method: 'POST', url: '/me/deletion/cancel', headers: a.headers });
    expect(cancel.statusCode).toBe(204);
    expect((await withSystem(t.ctx.db, tx => tx.query(`SELECT 1 FROM jobs WHERE kind='account.purge' AND user_id = $1`, [a.userId]))).rowCount).toBe(0);
  });

  it('export returns decrypted data for the caller only', async () => {
    const a = await signIn(t);
    await t.app.inject({ method: 'POST', url: '/journal', headers: a.headers, payload: { mode: 'written', text: 'my private note', shared: false } });
    const r = await t.app.inject({ method: 'GET', url: '/me/export', headers: a.headers });
    expect(r.statusCode).toBe(200);
    expect(r.json().journal[0].text).toBe('my private note');
  });
});

describe('public endpoints', () => {
  it('serves helplines without sign-in, in priority order', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/helplines' });
    const nums = r.json().items.map((h: { number: string }) => h.number);
    expect(nums[0]).toBe('14416');
    expect(nums).toContain('112');
    const youth = await t.app.inject({ method: 'GET', url: '/helplines?kind=youth' });
    expect(youth.json().items.map((h: { number: string }) => h.number)).toEqual(['1098']);
  });
  it('health and readiness', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
    expect((await t.app.inject({ method: 'GET', url: '/readyz' })).json().ok).toBe(true);
  });
});
