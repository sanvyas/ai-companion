import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp, type TestApp } from './app-helpers.js';

let t: TestApp;
beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'saathi-static-'));
  const web = join(root, 'web'), admin = join(root, 'admin');
  for (const [dir, title] of [[web, 'citizen'], [admin, 'portal']] as const) {
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${title}</title>`);
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  }
  writeFileSync(join(web, 'sw.js'), '// sw');
  t = await makeApp({ STATIC_WEB_DIR: web, STATIC_ADMIN_DIR: admin });
});
afterAll(async () => { await t.app.close(); });

describe('API-served front ends', () => {
  it('serves the citizen app at the root', async () => {
    const r = await t.app.inject('/');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('citizen');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect((await t.app.inject('/assets/app-abc123.js')).headers['cache-control']).toContain('immutable');
    expect((await t.app.inject('/sw.js')).headers['cache-control']).toBe('no-cache');
  });

  it('serves the portal under /portal/ and never lets it be framed or cached', async () => {
    const r = await t.app.inject('/portal/');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('portal');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['x-robots-tag']).toContain('noindex');
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await t.app.inject('/portal/assets/app-abc123.js')).statusCode).toBe(200);
    const redirect = await t.app.inject('/portal');
    expect(redirect.statusCode).toBe(301);
    expect(redirect.headers.location).toBe('/portal/');
  });

  it('leaves the API alone, and unknown paths still get the JSON 404', async () => {
    expect((await t.app.inject('/healthz')).json()).toEqual({ ok: true });
    const missing = await t.app.inject('/nope');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect((await t.app.inject('/admin/api/auth/me')).statusCode).toBe(401);
  });

  it('keeps the UI reachable in maintenance mode while API calls are paused', async () => {
    await t.ctx.rt.settings.set('access.maintenance', true, 'test');
    try {
      expect((await t.app.inject('/')).statusCode).toBe(200);
      expect((await t.app.inject('/portal/')).statusCode).toBe(200);
      expect((await t.app.inject({ method: 'POST', url: '/auth/otp/request', payload: {} })).statusCode).toBe(503);
    } finally {
      await t.ctx.rt.settings.set('access.maintenance', false, 'test');
    }
  });
});
