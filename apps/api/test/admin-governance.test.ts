import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import { makeApp, newPhone, type TestApp } from './app-helpers.js';
import { adminLogin, type AdminSession } from './admin-helpers.js';
import { bootstrapInvites } from '../src/services/invites.js';

let t: TestApp;
let owner: AdminSession, engineer: AdminSession, support: AdminSession, viewer: AdminSession;
const call = (a: AdminSession, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as 'GET', url: `/admin/api${url}`, headers: a.headers, payload: payload as object });
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => withSystem(t.ctx.db, tx => tx.query(q, p)).then(r => r.rows as T[]);

beforeAll(async () => {
  t = await makeApp();
  [owner, engineer, support, viewer] = [await adminLogin(t, 'owner'), await adminLogin(t, 'engineer'), await adminLogin(t, 'support'), await adminLogin(t, 'viewer')];
});
afterAll(async () => { await t.app.close(); });

describe('changes wait for someone more senior', () => {
  it('parks an engineer’s setting change, leaves the app untouched, and applies it once an owner approves', async () => {
    const before = t.ctx.rt.settings.get('limits.voice_minutes_per_day');
    const r = await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 17 });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ pending: true, approvers: ['owner'] });
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).toBe(before);

    // The engineer sees it waiting but cannot decide it; the owner sees it in the inbox.
    const mine = (await call(engineer, 'GET', '/changes')).json();
    expect(mine.waiting.map((c: { id: string }) => c.id)).toContain(r.json().id);
    expect(mine.inbox).toHaveLength(0);
    expect((await call(engineer, 'POST', `/changes/${r.json().id}/approve`, {})).statusCode).toBe(403);
    const inbox = (await call(owner, 'GET', '/changes')).json().inbox;
    expect(inbox.find((c: { id: string }) => c.id === r.json().id)).toMatchObject({ requestedBy: engineer.email, canDecide: true, summary: expect.stringContaining('17') });

    const ok = await call(owner, 'POST', `/changes/${r.json().id}/approve`, { note: 'fine' });
    expect(ok.statusCode).toBe(200);
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).toBe(17);

    const row = (await sql<{ status: string; decided_email: string }>('SELECT status, decided_email FROM change_requests WHERE id = $1', [r.json().id]))[0];
    expect(row).toMatchObject({ status: 'applied', decided_email: owner.email });
    const audit = await sql<{ action: string; admin_email: string }>(`SELECT action, admin_email FROM admin_audit WHERE action IN ('change.requested','setting.changed','change.approved') ORDER BY id DESC LIMIT 6`);
    expect(audit.map(a => a.action)).toEqual(expect.arrayContaining(['change.requested', 'setting.changed', 'change.approved']));
    await call(owner, 'DELETE', '/settings/limits.voice_minutes_per_day');
  });

  it('applies owner changes straight away, and an approval can’t be self-served', async () => {
    expect((await call(owner, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 9 })).statusCode).toBe(200);
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).toBe(9);
    const r = await call(support, 'PUT', '/flags/ui.new_home', { enabled: true, description: 'x' });
    expect(r.statusCode).toBe(403); // support has no flag permission at all: not even queued
    const req = await call(engineer, 'PUT', '/flags/ui.new_home', { enabled: true, description: 'New home' });
    expect(req.statusCode).toBe(202);
    expect((await call(engineer, 'POST', `/changes/${req.json().id}/approve`, {})).statusCode).toBe(403);
    expect(t.ctx.rt.flags.list().some(f => f.key === 'ui.new_home')).toBe(false);
    await call(owner, 'POST', `/changes/${req.json().id}/approve`, {});
    expect(t.ctx.rt.flags.list().some(f => f.key === 'ui.new_home')).toBe(true);
    await call(owner, 'DELETE', '/flags/ui.new_home');
    await call(owner, 'DELETE', '/settings/limits.voice_minutes_per_day');
  });

  it('lets an owner reject (with a reason) and the requester withdraw, and neither reaches the app', async () => {
    const a = await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 30 });
    expect((await call(owner, 'POST', `/changes/${a.json().id}/reject`, { note: 'x' })).statusCode).toBe(400); // reason too short
    expect((await call(owner, 'POST', `/changes/${a.json().id}/reject`, { note: 'Too generous for the beta' })).statusCode).toBe(200);
    expect((await call(owner, 'POST', `/changes/${a.json().id}/approve`, {})).statusCode).toBe(403); // already decided
    const b = await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 31 });
    expect((await call(support, 'POST', `/changes/${b.json().id}/withdraw`, {})).statusCode).toBe(403);
    expect((await call(engineer, 'POST', `/changes/${b.json().id}/withdraw`, {})).statusCode).toBe(200);
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).not.toBe(30);
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).not.toBe(31);
    const h = (await call(owner, 'GET', '/changes')).json().history.map((c: { status: string }) => c.status);
    expect(h).toEqual(expect.arrayContaining(['rejected', 'withdrawn']));
  });

  it('reports an approved change that can no longer be applied instead of pretending', async () => {
    const r = await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 9999 }); // out of range: validated only on apply
    expect(r.statusCode).toBe(202);
    const ok = await call(owner, 'POST', `/changes/${r.json().id}/approve`, {});
    expect(ok.statusCode).toBe(400);
    expect(ok.json().error.message).toContain('couldn’t be applied');
    const row = (await sql<{ status: string }>('SELECT status FROM change_requests WHERE id = $1', [r.json().id]))[0];
    expect(row.status).toBe('failed');
  });

  it('lets an engineer propose an owner-only change, which then runs with the owner’s authority', async () => {
    const r = await call(engineer, 'PUT', '/settings/models.companion', { value: 'claude-haiku-5-5' });
    expect(r.statusCode).toBe(202);
    expect(t.ctx.rt.settings.str('models.companion')).not.toBe('claude-haiku-5-5');
    expect((await call(owner, 'POST', `/changes/${r.json().id}/approve`, {})).statusCode).toBe(200);
    expect(t.ctx.rt.settings.str('models.companion')).toBe('claude-haiku-5-5');
    await call(owner, 'DELETE', '/settings/models.companion');
  });

  it('switches off when the owner turns approvals off', async () => {
    await call(owner, 'PUT', '/settings/governance.require_approval', { value: false });
    try { expect((await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 11 })).statusCode).toBe(200); }
    finally { await call(owner, 'PUT', '/settings/governance.require_approval', { value: true }); await call(owner, 'DELETE', '/settings/limits.voice_minutes_per_day'); }
  });

  it('cannot be forged from outside: the replay header needs a valid signature', async () => {
    const r = await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 20 });
    const forged = await t.app.inject({ method: 'PUT', url: '/admin/api/settings/limits.voice_minutes_per_day', headers: { 'x-approved-change': `${r.json().id}.${owner.id}.deadbeef`, 'content-type': 'application/json' }, payload: { value: 20 } });
    expect(forged.statusCode).toBe(401);
    expect(t.ctx.rt.settings.get('limits.voice_minutes_per_day')).not.toBe(20);
  });

  it('only counts as approvable by someone senior who is allowed to do it', async () => {
    const plan = await call(support, 'PATCH', `/users/${'00000000-0000-4000-8000-000000000001'}/plan`, { subscription: 'plus' });
    expect(plan.statusCode).toBe(202);
    expect(plan.json().approvers).toEqual(['owner']); // engineers can't change plans, so only an owner qualifies
    expect((await call(engineer, 'GET', '/changes')).json().inbox).toHaveLength(0);
    expect((await call(viewer, 'GET', '/changes')).statusCode).toBe(200);
  });
});

describe('invited sign-in codes', () => {
  it('lets an invited number sign in with its code even though no SMS vendor exists, and nobody else', async () => {
    const t2 = await makeApp({ OTP_PROVIDER: 'none' });
    try {
      const phone = newPhone();
      const stranger = await t2.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
      expect(stranger.statusCode).toBe(503);

      const admin = await adminLogin(t2, 'owner');
      const added = await t2.app.inject({ method: 'POST', url: '/admin/api/invites', headers: admin.headers, payload: { phone, label: 'Aarav' } });
      expect(added.statusCode).toBe(200);
      const { code } = added.json();
      expect(code).toMatch(/^\d{6}$/);

      const start = await t2.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
      expect(start.statusCode).toBe(200);
      const wrong = await t2.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: code === '000000' ? '111111' : '000000', ageConfirmed18: true, nickname: 'Aarav', challengeId: start.json().challengeId } });
      expect(wrong.statusCode).toBe(400);
      const ok = await t2.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code, ageConfirmed18: true, nickname: 'Aarav', challengeId: start.json().challengeId } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().isNewUser).toBe(true);

      const list = (await t2.app.inject({ method: 'GET', url: '/admin/api/invites', headers: admin.headers })).json().items;
      expect(list.find((i: { label: string }) => i.label === 'Aarav')).toMatchObject({ status: 'signed_in', phone: expect.stringMatching(/^•+\d{4}$/) });

      // Revoking stops it working again.
      const id = list.find((i: { label: string }) => i.label === 'Aarav').id;
      await t2.app.inject({ method: 'DELETE', url: `/admin/api/invites/${id}`, headers: admin.headers });
      const again = await t2.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
      expect(again.statusCode).toBe(503);
    } finally { await t2.app.close(); }
  });

  it('tells the app phone sign-in is available once someone is invited, so its button isn’t disabled', async () => {
    const t2 = await makeApp({ OTP_PROVIDER: 'none' });
    try {
      const { forgetInviteCache } = await import('../src/services/invites.js');
      await withSystem(t2.ctx.db, tx => tx.query('DELETE FROM invited_logins'));
      forgetInviteCache();
      expect((await t2.app.inject('/public-config')).json().otp).toBe(false);
      const admin = await adminLogin(t2, 'owner');
      await t2.app.inject({ method: 'POST', url: '/admin/api/invites', headers: admin.headers, payload: { phone: newPhone() } });
      expect((await t2.app.inject('/public-config')).json().otp).toBe(true);
    } finally { await t2.app.close(); }
  });

  it('locks after five wrong codes, resets with a new code, and is owner-only', async () => {
    const t2 = await makeApp({ OTP_PROVIDER: 'none' });
    try {
      const phone = newPhone();
      const admin = await adminLogin(t2, 'owner');
      const eng = await adminLogin(t2, 'engineer');
      expect((await t2.app.inject({ method: 'POST', url: '/admin/api/invites', headers: eng.headers, payload: { phone } })).statusCode).toBe(403);
      const { id, code } = (await t2.app.inject({ method: 'POST', url: '/admin/api/invites', headers: admin.headers, payload: { phone, code: '424242' } })).json();
      expect(code).toBe('424242');
      for (let i = 0; i < 5; i++) await t2.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: '000001', ageConfirmed18: true } });
      const locked = await t2.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: '424242', ageConfirmed18: true } });
      expect(locked.statusCode).toBe(429);
      const reset = (await t2.app.inject({ method: 'POST', url: `/admin/api/invites/${id}/reset`, headers: admin.headers, payload: {} })).json();
      const ok = await t2.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: reset.code, ageConfirmed18: true, nickname: 'Meera' } });
      expect(ok.statusCode).toBe(200);
    } finally { await t2.app.close(); }
  });

  it('bootstraps from the environment without overwriting an existing code', async () => {
    const logs: string[] = [];
    await bootstrapInvites(t.ctx, m => logs.push(m), '9812340001:123456, 9812340002:bad');
    expect(logs.some(l => l.includes('0001'))).toBe(true);
    expect(logs.some(l => l.includes('six digits'))).toBe(true);
    const n = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM invited_logins WHERE phone_last4 = '0001'`))[0].n;
    await bootstrapInvites(t.ctx, () => undefined, '9812340001:999999');
    expect((await sql<{ n: number }>(`SELECT count(*)::int AS n FROM invited_logins WHERE phone_last4 = '0001'`))[0].n).toBe(n);
  });
});

describe('model choices', () => {
  it('offers a list of models and rejects anything else', async () => {
    const s = (await call(owner, 'GET', '/settings')).json().items.find((i: { def: { key: string } }) => i.def.key === 'models.companion');
    expect(s.def.kind).toBe('select');
    expect(s.def.options.map((o: { value: string }) => o.value)).toEqual(expect.arrayContaining(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']));
    expect((await call(owner, 'PUT', '/settings/models.companion', { value: 'gpt-made-up' })).statusCode).toBe(400);
  });
});
