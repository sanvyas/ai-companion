import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from './app-helpers.js';

describe('the Android app', () => {
  let t: TestApp;
  beforeAll(async () => { t = await makeApp(); });
  afterAll(async () => { await t.app.close(); });

  it('proves the installed app and this site belong together, so it opens full screen', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/json/);
    const [s] = r.json();
    expect(s.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(s.target).toMatchObject({ namespace: 'android_app', package_name: 'app.flint.companion' });
    expect(s.target.sha256_cert_fingerprints).toHaveLength(1);
    expect(s.target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});
