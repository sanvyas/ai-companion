import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem, withUser } from '../src/db/pool.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });

const j = (a: Auth | null, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => t.app.inject({ method, url, headers: a?.headers, payload: payload as never });
const garden = async (a: Auth) => (await j(a, 'GET', '/garden')).json();
const mood = (a: Auth, value: number) => j(a, 'POST', '/mood', { value, source: 'tap' });
/** Pretend someone showed up on `n` earlier days, so plants have had time to grow. */
async function pastDays(a: Auth, n: number) {
  await withSystem(t.ctx.db, async tx => {
    for (let i = 1; i <= n; i++) await tx.query(`INSERT INTO mood_logs (user_id, day, value, source) VALUES ($1, (now() AT TIME ZONE (SELECT timezone FROM users WHERE id = $1))::date - $2::int, 3, 'tap') ON CONFLICT DO NOTHING`, [a.userId, i + 30]);
  });
}

describe('the garden', () => {
  it('needs a signed-in person', async () => {
    expect((await j(null, 'GET', '/garden')).statusCode).toBe(401);
    expect((await j(null, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 })).statusCode).toBe(401);
    expect((await j(null, 'GET', '/jar')).statusCode).toBe(401);
  });

  it('starts as a seedling and grows from what was done', async () => {
    const a = await signIn(t);
    const g0 = await garden(a);
    expect(g0).toMatchObject({ sunlight: 0, stage: 0, stageName: 'Seedling', activeDays: 0, slots: 2, plants: [], flowers: [] });
    expect(g0.today).toMatchObject({ checkin: false, body: false, words: false, golden: false, mood: null });
    expect(g0.road.isles).toHaveLength(6);

    await mood(a, 1);
    expect((await j(a, 'POST', '/journal', { mode: 'written', text: 'A long day, but I got through it.', shared: false })).statusCode).toBe(201);
    await j(a, 'POST', '/breaths');
    const g1 = await garden(a);
    expect(g1.sunlight).toBe(5 + 15 + 10 + 10); // check-in, journal, breathing, and the bonus for all three parts of the day
    expect(g1.today).toMatchObject({ checkin: true, body: true, words: true, golden: true, mood: 1 });
    expect(g1.flowers).toHaveLength(1);
    expect(g1.activeDays).toBe(1);
    expect(g1.treeLevel).toBe(1);
    expect(g1.visitors.kingfisher).toBe(true);
  });

  it('keeps one person’s garden away from another’s', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    await mood(a, 3);
    expect((await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 })).statusCode).toBe(201);
    expect((await garden(b)).plants).toEqual([]);
    const rows = await withUser(t.ctx.db, b.userId, tx => tx.query('SELECT * FROM garden_plants'));
    expect(rows.rows).toHaveLength(0);
    await expect(withUser(t.ctx.db, b.userId, tx => tx.query(`INSERT INTO garden_plants (user_id, kind, slot, at_days) VALUES ($1,'marigold',1,0)`, [a.userId]))).rejects.toThrow(/row-level security/);
  });
});

describe('planting and picking', () => {
  it('plants in an open place and refuses closed places, taken places and things not unlocked yet', async () => {
    const a = await signIn(t);
    const ok = await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().plants).toHaveLength(1);
    expect(ok.json().plants[0]).toMatchObject({ kind: 'marigold', slot: 0, ready: false, daysLeft: 3 });
    expect((await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 })).json().error.code).toBe('slot_taken');
    expect((await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 5 })).json().error.code).toBe('slot_closed');
    expect((await j(a, 'POST', '/garden/plants', { kind: 'mango', slot: 1 })).json().error.code).toBe('not_yet');
    expect((await j(a, 'POST', '/garden/plants', { kind: 'rose', slot: 1 })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 9 })).statusCode).toBe(400);
  });

  it('grows with the days they show up and can be picked once ready, then grows again', async () => {
    const a = await signIn(t);
    const planted = (await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 })).json().plants[0];
    expect((await j(a, 'POST', `/garden/plants/${planted.id}/pick`)).json().error.code).toBe('not_ready');
    await pastDays(a, 3);
    const grown = await garden(a);
    expect(grown.plants[0]).toMatchObject({ ready: true, growth: 1, daysLeft: 0 });
    const before = grown.sunlight;
    const picked = await j(a, 'POST', `/garden/plants/${planted.id}/pick`);
    expect(picked.statusCode).toBe(200);
    expect(picked.json().plants[0]).toMatchObject({ ready: false, picks: 1 });
    expect(picked.json().sunlight).toBe(before + 10);
  });

  it('does not let one person pick another’s plant', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    const p = (await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 })).json().plants[0];
    expect((await j(b, 'POST', `/garden/plants/${p.id}/pick`)).statusCode).toBe(404);
  });
});

describe('quiet games are paid for by something they did', () => {
  it('gives nothing to spend at first', async () => {
    const a = await signIn(t);
    for (const kind of ['seam', 'flag', 'sky']) expect((await j(a, 'POST', '/garden/keepsakes', { kind })).json().error.code).toBe('nothing_earned');
    expect((await garden(a)).unlocked).toEqual({ pot: false, thread: false, sky: false });
  });

  it('earns gold on a hard day when they still do something small, and each seam spends one', async () => {
    const a = await signIn(t);
    await mood(a, 0);
    expect((await garden(a)).tokens.gold).toBe(0); // checking in alone is not the small act
    await j(a, 'POST', '/breaths');
    const g = await garden(a);
    expect(g.tokens).toMatchObject({ gold: 1, thread: 1 });
    expect(g.unlocked).toMatchObject({ pot: true, thread: true });
    expect(g.seeds.planted).toBe(1);
    const seam = await j(a, 'POST', '/garden/keepsakes', { kind: 'seam' });
    expect(seam.statusCode).toBe(201);
    expect(seam.json().keepsakes.potSeams).toBe(1);
    expect(seam.json().tokens.gold).toBe(0);
    expect((await j(a, 'POST', '/garden/keepsakes', { kind: 'seam' })).json().error.code).toBe('nothing_earned');
    const flag = await j(a, 'POST', '/garden/keepsakes', { kind: 'flag' });
    expect(flag.json().keepsakes.flags).toBe(1);
    expect(flag.json().tokens.thread).toBe(0);
  });

  it('does not give gold on an ordinary day', async () => {
    const a = await signIn(t);
    await mood(a, 3);
    await j(a, 'POST', '/breaths');
    expect((await garden(a)).tokens.gold).toBe(0);
  });

  it('lets a paper boat go without keeping anything', async () => {
    const a = await signIn(t);
    const r = await j(a, 'POST', '/garden/keepsakes', { kind: 'boat' });
    expect(r.statusCode).toBe(201);
    expect(r.json().boats).toBe(1);
    expect(r.json().counts.create).toBe(1);
  });
});

describe('rangolis', () => {
  const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
  it('keeps a small picture, sealed, and shows it back only to its owner', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    const made = await j(a, 'POST', '/garden/creations', { kind: 'rangoli', image: img });
    expect(made.statusCode).toBe(201);
    expect(made.json().rangolis).toBe(1);
    const list = (await j(a, 'GET', '/garden/creations')).json().items;
    expect(list).toHaveLength(1);
    expect(list[0].image).toBe(img);
    const stored = await withSystem(t.ctx.db, tx => tx.query('SELECT image_enc FROM garden_creations WHERE user_id = $1', [a.userId]));
    expect(stored.rows[0].image_enc.toString('latin1')).not.toContain('base64');
    expect((await j(b, 'GET', '/garden/creations')).json().items).toEqual([]);
    expect((await j(b, 'DELETE', `/garden/creations/${list[0].id}`)).statusCode).toBe(404);
    expect((await j(a, 'DELETE', `/garden/creations/${list[0].id}`)).statusCode).toBe(204);
  });

  it('refuses anything that is not a small JPEG', async () => {
    const a = await signIn(t);
    expect((await j(a, 'POST', '/garden/creations', { kind: 'rangoli', image: 'data:text/html;base64,PGI+' })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/garden/creations', { kind: 'rangoli', image: `data:image/jpeg;base64,${'A'.repeat(100_000)}` })).statusCode).toBe(400);
  });
});

describe('the good-things jar', () => {
  it('keeps one line at a time, sealed, and lets them take any away', async () => {
    const a = await signIn(t);
    const b = await signIn(t);
    const one = await j(a, 'POST', '/jar', { text: 'The chai at the corner stall' });
    expect(one.statusCode).toBe(201);
    expect(one.json().text).toBe('The chai at the corner stall');
    const stored = await withSystem(t.ctx.db, tx => tx.query('SELECT text_enc FROM jar_items WHERE user_id = $1', [a.userId]));
    expect(stored.rows[0].text_enc.toString('utf8')).not.toContain('chai');
    expect((await j(a, 'GET', '/jar')).json().items).toHaveLength(1);
    expect((await j(b, 'GET', '/jar')).json().items).toEqual([]);
    expect((await j(b, 'DELETE', `/jar/${one.json().id}`)).statusCode).toBe(404);
    expect((await garden(a)).jarCount).toBe(1);
    expect((await j(a, 'DELETE', `/jar/${one.json().id}`)).statusCode).toBe(204);
    expect((await j(a, 'POST', '/jar', { text: '   ' })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/jar', { text: 'x'.repeat(141) })).statusCode).toBe(400);
  });

  it('is part of what they can download', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/jar', { text: 'A kind message' });
    await j(a, 'POST', '/garden/plants', { kind: 'marigold', slot: 0 });
    const out = (await j(a, 'GET', '/me/export')).json();
    expect(out.garden.goodThingsJar[0].text).toBe('A kind message');
    expect(out.garden.plants).toHaveLength(1);
  });
});
