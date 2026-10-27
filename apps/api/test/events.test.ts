import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem, withUser } from '../src/db/pool.js';
import { anonId } from '../src/routes/events.js';
import { makeApp, signIn, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });

const post = (a: { headers: { authorization: string } }, payload: unknown) => t.app.inject({ method: 'POST', url: '/events', headers: a.headers, payload: payload as object });
const rows = (anon: string) => withSystem(t.ctx.db, tx => tx.query('SELECT * FROM analytics_events WHERE anon_id = $1 ORDER BY id', [anon])).then(r => r.rows);
const batch = (events: unknown[]) => ({ sessionId: 'session-12345678', platform: 'web', appVersion: '0.1.0', events });

describe('product analytics', () => {
  it('records nothing until the person opts in', async () => {
    const u = await signIn(t);
    const r = await post(u, batch([{ name: 'screen_view', screen: 'today', durationMs: 4000 }]));
    expect(r.statusCode).toBe(202);
    expect(r.json().accepted).toBe(0);
    expect(await rows(anonId(t.ctx, u.userId))).toHaveLength(0);
  });

  it('records screens, taps and steps after opt-in, under a one-way id', async () => {
    const u = await signIn(t);
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { analytics: true } });
    const r = await post(u, batch([
      { name: 'screen_view', screen: 'today', durationMs: 4200 },
      { name: 'click', screen: 'today', el: 'tile.calm' },
      { name: 'step', step: 'consent_done' },
    ]));
    expect(r.json().accepted).toBe(3);
    const got = await rows(anonId(t.ctx, u.userId));
    expect(got.map(x => x.name)).toEqual(['screen_view', 'click', 'step']);
    expect(got[0].duration_ms).toBe(4200);
    expect(got[2].props).toEqual({ step: 'consent_done' });
    expect(got[0].anon_id).not.toContain(u.userId.slice(0, 8));
    expect(JSON.stringify(got)).not.toContain(u.userId);
  });

  it('refuses anything that could be free text', async () => {
    const u = await signIn(t);
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { analytics: true } });
    for (const bad of [
      { name: 'click', el: 'My plan: call mum about the loan' },
      { name: 'click', el: 'x'.repeat(41) },
      { name: 'screen_view', screen: 'journal compose' },
      { name: 'custom', screen: 'today' },
      { name: 'step', step: 'a b' },
    ]) expect((await post(u, batch([bad]))).statusCode).toBe(400);
    expect((await post(u, batch([]))).statusCode).toBe(400);
    expect((await post(u, batch(Array.from({ length: 51 }, () => ({ name: 'click', el: 'a' }))))).statusCode).toBe(400);
    // Unknown keys such as a text field are dropped, not stored.
    await post(u, batch([{ name: 'click', el: 'tile.calm', text: 'private words' }]));
    expect(JSON.stringify(await rows(anonId(t.ctx, u.userId)))).not.toContain('private words');
  });

  it('is switched off by the portal setting even for people who opted in', async () => {
    const u = await signIn(t);
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { analytics: true } });
    await t.ctx.rt.settings.set('analytics.enabled', false, 'test');
    expect((await post(u, batch([{ name: 'click', el: 'a' }]))).json().accepted).toBe(0);
    await t.ctx.rt.settings.set('analytics.enabled', true, 'test');
    expect((await post(u, batch([{ name: 'click', el: 'a' }]))).json().accepted).toBe(1);
  });

  it('needs a signed-in person, and stops when consent is withdrawn', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/events', payload: batch([{ name: 'click', el: 'a' }]) })).statusCode).toBe(401);
    const u = await signIn(t);
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { analytics: true } });
    await post(u, batch([{ name: 'click', el: 'a' }]));
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { analytics: false } });
    await post(u, batch([{ name: 'click', el: 'b' }]));
    expect((await rows(anonId(t.ctx, u.userId))).map(r => r.el)).toEqual(['a']);
  });

  it('shows the portal exactly what was collected', async () => {
    const { adminLogin } = await import('./admin-helpers.js');
    const a = await adminLogin(t, 'viewer');
    const r = await t.app.inject({ method: 'GET', url: '/admin/api/analytics?days=7', headers: a.headers });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.screens.find((s: { screen: string }) => s.screen === 'today').avg_seconds).toBeGreaterThan(0);
    expect(j.clicks.find((c: { el: string }) => c.el === 'tile.calm').clicks).toBeGreaterThanOrEqual(1);
    expect(j.optIn.opted_in).toBeGreaterThan(0);
    expect(j.signInFunnel.accounts).toBeGreaterThan(0);
  });

  it('exposes flags and the new consent in /me', async () => {
    await t.ctx.rt.flags.upsert('ui.new_home', { enabled: true, rolloutPct: 100 }, 'test');
    const u = await signIn(t);
    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: u.headers })).json();
    expect(me.flags['ui.new_home']).toBe(true);
    expect(me.consent.analytics).toBe(false);
  });
});

describe('the app role cannot read platform tables', () => {
  it.each(['admin_users', 'admin_sessions', 'admin_audit', 'app_settings', 'feature_flags', 'flag_overrides', 'integration_secrets', 'prompt_versions', 'eval_cases', 'eval_runs', 'pricing_rates', 'analytics_events', 'error_log', 'safety_reviews'])('%s', async table => {
    const u = await signIn(t);
    await expect(withUser(t.ctx.db, u.userId, tx => tx.query(`SELECT 1 FROM ${table}`))).rejects.toThrow(/permission denied/);
  });
});
