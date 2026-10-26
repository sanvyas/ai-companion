import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import { seedDemoEvents } from '../src/db/seed.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); await seedDemoEvents(t.ctx.db); });
afterAll(async () => { await t.app.close(); });

const j = (a: Auth, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => t.app.inject({ method, url, headers: a.headers, payload: payload as never });

const SAMPLE = 'Work was a lot today. My manager moved the deadline again and I didn’t say anything. Priya texted, that helped a bit. I want to sleep before one tonight.';

describe('journal', () => {
  it('private entries are stored encrypted and never reach the model', async () => {
    const a = await signIn(t);
    t.llm.calls.length = 0;
    const r = await j(a, 'POST', '/journal', { mode: 'written', text: 'Some things I want to keep to myself.', shared: false });
    expect(r.statusCode).toBe(201);
    expect(r.json().entry.shared).toBe(false);
    expect(t.llm.calls).toHaveLength(0);
    const raw = await withSystem(t.ctx.db, tx => tx.query('SELECT text_enc FROM journal_entries WHERE user_id=$1', [a.userId]));
    expect(Buffer.from(raw.rows[0].text_enc).includes(Buffer.from('keep to myself'))).toBe(false);
    const analyze = await j(a, 'POST', `/journal/${r.json().entry.id}/analyze`);
    expect(analyze.statusCode).toBe(409);
    expect(analyze.json().error.code).toBe('not_shared');
  });

  it('a private entry that is worrying still surfaces risk (keyword layer only)', async () => {
    const a = await signIn(t);
    const r = await j(a, 'POST', '/journal', { mode: 'written', text: 'I feel hopeless lately', shared: false });
    expect(r.json().riskLevel).toBe(2);
    expect(t.llm.calls.filter(c => c.task === 'classify')).toHaveLength(0);
  });

  it('review flow: nothing is saved until Done, sensitive stays off, hook is used once, analysis is deleted', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { remember: true });
    const created = (await j(a, 'POST', '/journal', { mode: 'spoken', text: SAMPLE, shared: true })).json();
    const analysis = (await j(a, 'POST', `/journal/${created.entry.id}/analyze`)).json();
    expect(analysis.riskLevel).toBe(0);
    expect(analysis.mood).toBe('heavier');
    expect(analysis.memories.length).toBeGreaterThan(0);
    expect(analysis.hook).toBeTruthy();

    // Reviewing alone writes nothing to Memory.
    expect((await j(a, 'GET', '/memories')).json().items).toHaveLength(0);
    // The analysis itself is encrypted at rest.
    const stored = await withSystem(t.ctx.db, tx => tx.query('SELECT analysis_enc FROM journal_entries WHERE id=$1', [created.entry.id]));
    expect(Buffer.from(stored.rows[0].analysis_enc).includes(Buffer.from('noticed'))).toBe(false);

    const keep = analysis.memories.slice(0, 1).map((m: { id: number }) => m.id);
    const done = await j(a, 'POST', `/journal/${created.entry.id}/commit`, { savedMemoryIds: keep, useHook: true, addStep: true });
    expect(done.json()).toEqual({ savedMemories: 1, hook: true, step: true });
    expect((await j(a, 'GET', '/memories')).json().items).toHaveLength(1);
    const after = await withSystem(t.ctx.db, tx => tx.query('SELECT analysis_enc, mood FROM journal_entries WHERE id=$1', [created.entry.id]));
    expect(after.rows[0].analysis_enc).toBeNull();
    expect(after.rows[0].mood).toBe(1);
    // Committing twice is refused: the analysis is gone.
    expect((await j(a, 'POST', `/journal/${created.entry.id}/commit`, { savedMemoryIds: [], useHook: false, addStep: false })).statusCode).toBe(409);

    // The hook is pending for exactly one conversation.
    const hooks = await withSystem(t.ctx.db, tx => tx.query('SELECT 1 FROM pending_hooks WHERE user_id=$1', [a.userId]));
    expect(hooks.rowCount).toBe(1);
    // The step landed on tomorrow's plan, not today's.
    const plan = (await j(a, 'GET', '/plan/today')).json().items.map((p: { label: string }) => p.label);
    expect(plan).not.toContain('Phone down by 12:30, then a wind-down story.');
  });

  it('"keep it just for me" discards the analysis and turns sharing off', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { remember: true });
    const c = (await j(a, 'POST', '/journal', { mode: 'written', text: SAMPLE, shared: true })).json();
    await j(a, 'POST', `/journal/${c.entry.id}/analyze`);
    expect((await j(a, 'POST', `/journal/${c.entry.id}/discard`)).statusCode).toBe(204);
    const r = await withSystem(t.ctx.db, tx => tx.query('SELECT analysis_enc, shared FROM journal_entries WHERE id=$1', [c.entry.id]));
    expect(r.rows[0]).toEqual({ analysis_enc: null, shared: false });
  });

  it('with Remember off the review proposes no memories and no hook', async () => {
    const a = await signIn(t);
    const c = (await j(a, 'POST', '/journal', { mode: 'written', text: SAMPLE, shared: true })).json();
    const an = (await j(a, 'POST', `/journal/${c.entry.id}/analyze`)).json();
    expect(an.memories).toEqual([]);
    expect(an.hook).toBe('');
    expect(an.noticed).toBeTruthy();
  });

  it('level 3 in a shared entry skips analysis and returns the crisis flag', async () => {
    const a = await signIn(t);
    const c = (await j(a, 'POST', '/journal', { mode: 'written', text: 'I have a plan for tonight.', shared: true })).json();
    t.llm.calls.length = 0;
    const an = (await j(a, 'POST', `/journal/${c.entry.id}/analyze`)).json();
    expect(an).toMatchObject({ riskLevel: 3, careFlag: true, memories: [] });
    expect(t.llm.calls.filter(x => x.task === 'journal')).toHaveLength(0);
  });

  it('the model being unavailable is reported, and the entry stays safe', async () => {
    const a = await signIn(t);
    const c = (await j(a, 'POST', '/journal', { mode: 'written', text: SAMPLE, shared: true })).json();
    const { LlmFailure } = await import('../src/providers/llm.js');
    t.llm.failNext = new LlmFailure('down');
    t.llm.failTask = 'journal';
    const r = await j(a, 'POST', `/journal/${c.entry.id}/analyze`);
    expect(r.statusCode).toBe(502);
    expect(r.json().error.code).toBe('llm_failed');
    expect((await j(a, 'GET', '/journal')).json().items).toHaveLength(1);
  });

  it('paginates by cursor and hard-deletes', async () => {
    const a = await signIn(t);
    for (let i = 0; i < 5; i++) await j(a, 'POST', '/journal', { mode: 'written', text: `entry ${i}`, shared: false });
    const p1 = (await j(a, 'GET', '/journal?limit=2')).json();
    expect(p1.items.map((e: { text: string }) => e.text)).toEqual(['entry 4', 'entry 3']);
    const p2 = (await j(a, 'GET', `/journal?limit=2&cursor=${p1.nextCursor}`)).json();
    expect(p2.items.map((e: { text: string }) => e.text)).toEqual(['entry 2', 'entry 1']);
    const p3 = (await j(a, 'GET', `/journal?limit=2&cursor=${p2.nextCursor}`)).json();
    expect(p3.nextCursor).toBeNull();
    expect((await j(a, 'DELETE', `/journal/${p1.items[0].id}`)).statusCode).toBe(204);
    expect((await j(a, 'DELETE', `/journal/${p1.items[0].id}`)).statusCode).toBe(404);
  });
});

describe('isolation through the API', () => {
  it('one user cannot read, change or delete another’s data by id', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    await j(a, 'PUT', '/me/consent', { remember: true });
    const entry = (await j(a, 'POST', '/journal', { mode: 'written', text: 'a only', shared: false })).json().entry;
    const mem = (await j(a, 'POST', '/memories/bulk', { items: [{ theme: 'People', text: 'A’s friend', sensitive: false }] })).json().items[0];
    const plan = (await j(a, 'POST', '/plan', { label: 'a plan' })).json();
    const conv = (await j(a, 'POST', '/conversations', { mode: 'text' })).json();

    expect((await j(b, 'PATCH', `/journal/${entry.id}`, { shared: true })).statusCode).toBe(404);
    expect((await j(b, 'DELETE', `/journal/${entry.id}`)).statusCode).toBe(404);
    expect((await j(b, 'PATCH', `/memories/${mem.id}`, { hidden: true })).statusCode).toBe(404);
    expect((await j(b, 'DELETE', `/memories/${mem.id}`)).statusCode).toBe(404);
    expect((await j(b, 'PATCH', `/plan/${plan.id}`, { done: true })).statusCode).toBe(404);
    expect((await j(b, 'GET', `/conversations/${conv.id}/messages`)).statusCode).toBe(404);
    expect((await j(b, 'POST', `/conversations/${conv.id}/end`, {})).statusCode).toBe(404);
    expect((await j(b, 'GET', '/journal')).json().items).toHaveLength(0);
    expect((await j(b, 'GET', '/memories')).json().items).toHaveLength(0);
    expect((await j(a, 'GET', '/memories')).json().items).toHaveLength(1);
  });
});

describe('memory', () => {
  it('requires consent, supports edit/hide/delete/forget-all and audits changes', async () => {
    const a = await signIn(t);
    const refused = await j(a, 'POST', '/memories/bulk', { items: [{ theme: 'People', text: 'x', sensitive: false }] });
    expect(refused.statusCode).toBe(409);
    await j(a, 'PUT', '/me/consent', { remember: true });
    const made = (await j(a, 'POST', '/memories/bulk', { items: [{ theme: 'Sleep', text: 'You fall asleep late.', sensitive: false }, { theme: 'Feelings', text: 'You feel low on Sundays.', sensitive: true }] })).json().items;
    const edited = await j(a, 'PATCH', `/memories/${made[0].id}`, { text: 'You often fall asleep after 2 a.m.', hidden: true });
    expect(edited.json()).toMatchObject({ text: 'You often fall asleep after 2 a.m.', hidden: true });
    expect((await j(a, 'PATCH', `/memories/${made[0].id}`, { text: 'x'.repeat(121) })).statusCode).toBe(400);
    expect((await j(a, 'DELETE', `/memories/${made[1].id}`)).statusCode).toBe(204);
    expect((await j(a, 'DELETE', '/memories')).json().deleted).toBe(1);
    const audit = await withSystem(t.ctx.db, tx => tx.query(`SELECT action FROM audit_log WHERE user_id=$1 AND action LIKE 'memory.%' ORDER BY id`, [a.userId]));
    expect(audit.rows.map(r => r.action)).toEqual(['memory.update', 'memory.delete', 'memory.forget_all']);
  });
});

describe('mood, plan, insights', () => {
  it('latest mood tap wins for the day; insights need data before claiming patterns', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/mood', { value: 1 });
    await j(a, 'POST', '/mood', { value: 3 });
    const ins = (await j(a, 'GET', '/insights?weeks=4')).json();
    expect(ins.moodSeries).toHaveLength(1);
    expect(ins.moodSeries[0].value).toBe(3);
    expect(ins.rhythms).toEqual([]);
    expect(ins.daysOfData).toBe(1);
    expect((await j(a, 'POST', '/mood', { value: 7 })).statusCode).toBe(400);
  });

  it('plan: fills on first open once, completion becomes one win, un-done does not erase it', async () => {
    const a = await signIn(t);
    const [first, second] = await Promise.all([j(a, 'GET', '/plan/today'), j(a, 'GET', '/plan/today')]);
    expect(first.json().items).toHaveLength(3);
    expect(second.json().items.map((i: { id: string }) => i.id).sort()).toEqual(first.json().items.map((i: { id: string }) => i.id).sort());
    const id = first.json().items[0].id;
    await j(a, 'PATCH', `/plan/${id}`, { done: true });
    await j(a, 'PATCH', `/plan/${id}`, { done: false });
    await j(a, 'PATCH', `/plan/${id}`, { done: true });
    const wins = (await j(a, 'GET', '/insights')).json().wins;
    expect(wins.filter((w: { kind: string }) => w.kind === 'plan')).toHaveLength(1);
  });

  it('carries unfinished items forward without calling them failures', async () => {
    const a = await signIn(t);
    const plan = (await j(a, 'GET', '/plan/today')).json().items;
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE plan_items SET day = day - 1 WHERE user_id = $1`, [a.userId]));
    await j(a, 'PATCH', `/plan/${plan[0].id}`, { done: true });
    const today = (await j(a, 'GET', '/plan/today')).json().items;
    expect(today).toHaveLength(2);
    expect(today.every((i: { done: boolean }) => !i.done)).toBe(true);
  });
});

describe('safety plan and acknowledgements', () => {
  it('stores the safety plan encrypted and reads it back', async () => {
    const a = await signIn(t);
    expect((await j(a, 'GET', '/safety-plan')).statusCode).toBe(204);
    const plan = { warningSigns: ['Not sleeping'], copingSteps: ['Chai on the balcony'], people: [{ name: 'Priya', phone: '+919811122233' }], places: ['Cubbon Park'], professionals: ['Tele-MANAS 14416'], makingSpaceSafer: [] };
    expect((await j(a, 'PUT', '/safety-plan', plan)).statusCode).toBe(204);
    expect((await j(a, 'GET', '/safety-plan')).json()).toEqual(plan);
    const raw = await withSystem(t.ctx.db, tx => tx.query('SELECT data_enc FROM safety_plans WHERE user_id=$1', [a.userId]));
    expect(Buffer.from(raw.rows[0].data_enc).includes(Buffer.from('Priya'))).toBe(false);
  });

  it('records acknowledgements and queues a follow-up only when opted in', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/safety/acknowledge', { level: 3, action: 'safe' });
    expect((await withSystem(t.ctx.db, tx => tx.query(`SELECT 1 FROM jobs WHERE user_id=$1 AND kind='followup.hard_day'`, [a.userId]))).rowCount).toBe(0);
    await j(a, 'PUT', '/notifications/prefs', { followUpAfterHardDay: true });
    await j(a, 'POST', '/safety/acknowledge', { level: 3, action: 'safe' });
    await j(a, 'POST', '/safety/acknowledge', { level: 3, action: 'safe' });
    expect((await withSystem(t.ctx.db, tx => tx.query(`SELECT 1 FROM jobs WHERE user_id=$1 AND kind='followup.hard_day'`, [a.userId]))).rowCount).toBe(1);
    const ev = await withSystem(t.ctx.db, tx => tx.query(`SELECT action FROM safety_events WHERE user_id=$1 AND source='user_action'`, [a.userId]));
    expect(ev.rowCount).toBe(3);
  });
});

describe('calm, outside, notifications, billing', () => {
  it('serves the catalogue and records a session as one win', async () => {
    const a = await signIn(t);
    const med = (await j(a, 'GET', '/calm/catalogue?tab=meditate')).json().items;
    expect(med.map((i: { id: string }) => i.id)).toContain('body');
    expect((await j(a, 'GET', '/calm/catalogue?tab=sleep')).json().items).toHaveLength(4);
    expect((await j(a, 'GET', '/calm/catalogue?tab=meditate&category=Stress')).json().items.every((i: { category: string }) => i.category === 'Stress')).toBe(true);
    const item = (await j(a, 'GET', '/calm/items/monsoon')).json();
    expect(item.lines.length).toBeGreaterThan(5);
    const s = (await j(a, 'POST', '/calm/sessions', { itemId: 'monsoon', bgSound: 'rain', timerMinutes: 30 })).json();
    await j(a, 'PATCH', `/calm/sessions/${s.id}`, { completedPct: 100 });
    await j(a, 'PATCH', `/calm/sessions/${s.id}`, { completedPct: 100 });
    expect((await j(a, 'GET', '/insights')).json().wins.filter((w: { kind: string }) => w.kind === 'calm')).toHaveLength(1);
    expect((await j(a, 'POST', '/calm/sessions', { itemId: 'nope' })).statusCode).toBe(404);
  });

  it('lists events for a city, marks interest once, adds to plan and queues the leave nudge', async () => {
    const a = await signIn(t);
    expect((await j(a, 'GET', '/outside/events')).json()).toEqual({ city: null, items: [] });
    const list = (await j(a, 'GET', '/outside/events?city=bengaluru')).json();
    expect(list.items.length).toBe(3);
    const ev = list.items[0];
    await j(a, 'POST', `/outside/events/${ev.id}/interest`);
    await j(a, 'POST', `/outside/events/${ev.id}/interest`);
    expect((await j(a, 'GET', `/outside/events/${ev.id}`)).json().interested).toBe(true);
    const jobs = await withSystem(t.ctx.db, tx => tx.query(`SELECT run_at FROM jobs WHERE user_id=$1 AND kind='event.leave'`, [a.userId]));
    expect(jobs.rowCount).toBe(1);
    expect(jobs.rows[0].run_at.getTime()).toBeLessThan(new Date(ev.startsAt).getTime());
    expect((await j(a, 'GET', '/outside/hobbies')).json().items).toHaveLength(4);
  });

  it('notification prefs validate, audit, and register devices without storing tokens in clear', async () => {
    const a = await signIn(t);
    const prefs = (await j(a, 'PUT', '/notifications/prefs', { push: true, checkinTime: 'morning', quietHours: { start: '23:00', end: '07:30' } })).json();
    expect(prefs).toMatchObject({ push: true, checkinTime: 'morning', quietHours: { start: '23:00', end: '07:30' }, calls: false });
    expect((await j(a, 'PUT', '/notifications/prefs', { checkinTime: 'noon' })).statusCode).toBe(400);
    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
    const d = await j(a, 'POST', '/devices', { platform: 'web', subscription: sub });
    expect(d.statusCode).toBe(201);
    const again = await j(a, 'POST', '/devices', { platform: 'web', subscription: sub });
    expect(again.json().id).toBe(d.json().id);
    const raw = await withSystem(t.ctx.db, tx => tx.query('SELECT token_enc FROM devices WHERE user_id=$1', [a.userId]));
    expect(Buffer.from(raw.rows[0].token_enc).includes(Buffer.from('push.example'))).toBe(false);
    expect((await j(a, 'DELETE', `/devices/${d.json().id}`)).statusCode).toBe(204);
  });

  it('billing is honest: plans listed, purchase not connected', async () => {
    const a = await signIn(t);
    expect((await j(a, 'GET', '/billing/plans')).json().items.map((p: { id: string }) => p.id)).toEqual(['basic', 'plus']);
    const r = await j(a, 'POST', '/billing/verify', { receipt: 'x' });
    expect(r.statusCode).toBe(501);
    expect(r.json().error.code).toBe('billing_unavailable');
  });
});

describe('app bootstrap helpers', () => {
  it('public config says what is connected, without sign-in', async () => {
    const r = (await t.app.inject({ method: 'GET', url: '/public-config' })).json();
    expect(r).toMatchObject({ otp: true, google: false, googleClientId: null, llm: true, stt: false, tts: false });
  });

  it('only the owner can fetch the trusted contact number to dial', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    expect((await j(a, 'GET', '/trusted-contact/dial')).statusCode).toBe(204);
    await j(a, 'PUT', '/trusted-contact', { name: 'Priya', phone: '+919811122233', relation: 'sister' });
    expect((await j(a, 'GET', '/trusted-contact/dial')).json()).toEqual({ name: 'Priya', phone: '+919811122233', relation: 'sister' });
    expect((await j(b, 'GET', '/trusted-contact/dial')).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: '/trusted-contact/dial' })).statusCode).toBe(401);
  });

  it('ending a walk records a win once, and the feeling tap is stored', async () => {
    const a = await signIn(t);
    const c = (await j(a, 'POST', '/walks')).json();
    expect(c.mode).toBe('walk');
    const end = await j(a, 'POST', `/conversations/${c.id}/end`, { feeling: 'better' });
    expect(end.statusCode).toBe(200);
    expect((await j(a, 'GET', '/insights')).json().wins.filter((w: { kind: string }) => w.kind === 'walk')).toHaveLength(1);
    const row = await withSystem(t.ctx.db, tx => tx.query('SELECT feeling FROM conversations WHERE id=$1', [c.id]));
    expect(row.rows[0].feeling).toBe('better');
  });
});
