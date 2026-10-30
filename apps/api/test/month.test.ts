import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });

const j = (a: Auth | null, method: 'GET' | 'POST', url: string, payload?: unknown) => t.app.inject({ method, url, headers: a?.headers, payload: payload as never });
const month = async (a: Auth) => (await j(a, 'GET', '/month')).json();

describe('the third design’s Month', () => {
  it('needs a signed-in person', async () => {
    expect((await j(null, 'GET', '/month')).statusCode).toBe(401);
    expect((await j(null, 'POST', '/activity', { kind: 'play' })).statusCode).toBe(401);
  });

  it('starts empty, and fills with what was done today', async () => {
    const a = await signIn(t);
    const m0 = await month(a);
    expect(m0.days).toEqual([]);
    expect(m0.help).toEqual([]);
    expect(m0.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m0.signedUp).toBe(m0.today);

    await j(a, 'POST', '/mood', { value: 1, source: 'tap' });
    expect((await month(a)).days).toEqual([{ day: m0.today, kinds: ['show'], mood: 1 }]);

    await j(a, 'POST', '/breaths');
    await j(a, 'POST', '/journal', { mode: 'written', text: 'A long day, but I got through it.', shared: false });
    const m1 = await month(a);
    expect(m1.days).toHaveLength(1);
    expect(m1.days[0].kinds.sort()).toEqual(['breathe', 'journal']);
  });

  it('keeps what they tell us, and what helped when they felt a certain way', async () => {
    const a = await signIn(t);
    expect((await j(a, 'POST', '/activity', { kind: 'friend' })).statusCode).toBe(204);
    expect((await j(a, 'POST', '/activity', { kind: 'play' })).statusCode).toBe(204);
    expect((await j(a, 'POST', '/activity', { kind: 'breathe', feeling: 'anxious', helped: true })).statusCode).toBe(204);
    expect((await j(a, 'POST', '/activity', { kind: 'walk', feeling: 'anxious', helped: false })).statusCode).toBe(204);
    const m = await month(a);
    expect(m.days).toHaveLength(1);
    expect(m.days[0].kinds.sort()).toEqual(['breathe', 'friend', 'play', 'walk']);
    expect(m.help).toEqual([{ feeling: 'anxious', kind: 'breathe', helped: true }, { feeling: 'anxious', kind: 'walk', helped: false }]);
  });

  it('refuses things it does not know about', async () => {
    const a = await signIn(t);
    expect((await j(a, 'POST', '/activity', { kind: 'flying' })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/activity', { kind: 'walk', feeling: 'furious' })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/activity', {})).statusCode).toBe(400);
  });

  it('keeps one person’s month away from another’s', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    await j(a, 'POST', '/activity', { kind: 'friend', feeling: 'lonely', helped: true });
    const mb = await month(b);
    expect(mb.days).toEqual([]);
    expect(mb.help).toEqual([]);
  });

  it('shows days from earlier weeks and ignores older ones', async () => {
    const a = await signIn(t);
    await withSystem(t.ctx.db, async tx => {
      await tx.query(`INSERT INTO activity_log (user_id, kind, created_at) VALUES ($1, 'friend', now() - interval '10 days'), ($1, 'play', now() - interval '200 days')`, [a.userId]);
    });
    const m = await month(a);
    expect(m.days).toHaveLength(1);
    expect(m.days[0].kinds).toEqual(['friend']);
  });
});
