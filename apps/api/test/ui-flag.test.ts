import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });

const cfg = async () => (await t.app.inject({ method: 'GET', url: '/public-config' })).json();

describe('the switch for the new design', () => {
  it('is off until someone turns it on, so nobody sees a change by surprise', async () => {
    expect((await cfg()).uiV2).toBe(false);
  });

  it('turns on for everyone when it is enabled at 100% and back off at once', async () => {
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: true, rolloutPct: 100 }, 'test');
    expect((await cfg()).uiV2).toBe(true);
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: false }, 'test');
    expect((await cfg()).uiV2).toBe(false);
  });

  it('does not show a partial rollout to people who are not signed in yet', async () => {
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: true, rolloutPct: 30 }, 'test');
    expect((await cfg()).uiV2).toBe(false);
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: false, rolloutPct: 100 }, 'test');
  });

  it('has its own switch for the third design, which is on by default (migration 0019), independent of the second, and can be turned off at once', async () => {
    const c = await cfg();
    expect(c.uiV3).toBe(true);
    expect(c.uiV2).toBe(false);
    await t.ctx.rt.flags.upsert('ui.v3', { enabled: false }, 'test');
    expect((await cfg()).uiV3).toBe(false);
    await t.ctx.rt.flags.upsert('ui.v3', { enabled: true }, 'test');
    expect((await cfg()).uiV3).toBe(true);
  });
});
