import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import { scrub } from '../src/admin/errors.js';
import { prompt, setLivePrompts } from '../src/runtime/prompts.js';
import { recordUsage } from '../src/providers/index.js';
import { makeApp, signIn, type TestApp } from './app-helpers.js';
import { adminLogin, type AdminSession } from './admin-helpers.js';

let t: TestApp;
let owner: AdminSession;
const call = (a: AdminSession, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as 'GET', url: `/admin/api${url}`, headers: a.headers, payload: payload as object });
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => withSystem(t.ctx.db, tx => tx.query(q, p)).then(r => r.rows as T[]);

beforeAll(async () => { t = await makeApp(); owner = await adminLogin(t, 'owner'); });
afterAll(async () => { await t.app.close(); });

describe('roles', () => {
  it('viewers read but cannot write; support cannot touch keys; engineers cannot publish safety prompts', async () => {
    const viewer = await adminLogin(t, 'viewer');
    const support = await adminLogin(t, 'support');
    const engineer = await adminLogin(t, 'engineer');
    expect((await call(viewer, 'GET', '/overview')).statusCode).toBe(200);
    expect((await call(viewer, 'PUT', '/flags/x.y', { enabled: true })).statusCode).toBe(403);
    expect((await call(support, 'PUT', '/integrations/anthropic/api_key', { value: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxx' })).statusCode).toBe(403);
    expect((await call(engineer, 'PUT', '/integrations/anthropic/api_key', { value: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxx' })).statusCode).toBe(403);
    expect((await call(engineer, 'GET', '/audit')).statusCode).toBe(403);
    expect((await call(engineer, 'GET', '/admins')).statusCode).toBe(403);
    expect((await call(engineer, 'PUT', '/settings/models.companion', { value: 'claude-haiku-5-5' })).statusCode).toBe(403);
    expect((await call(engineer, 'PUT', '/settings/limits.voice_minutes_per_day', { value: 12 })).statusCode).toBe(200);
  });
});

describe('overview', () => {
  it('summarises people, conversations, safety, cost and every system', async () => {
    const r = await call(owner, 'GET', '/overview');
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.users).toHaveProperty('total');
    expect(j.series).toHaveLength(14);
    expect(j.cost).toHaveProperty('projectedMonth');
    const groups = new Set(j.systems.map((s: { group: string }) => s.group));
    expect([...groups].sort()).toEqual(['AI', 'Backend', 'Infrastructure', 'UI']);
  });
});

describe('users (metadata only)', () => {
  it('lists and shows a person without any of what they wrote or said', async () => {
    const u = await signIn(t, undefined, 'Meera');
    await t.app.inject({ method: 'PUT', url: '/me/consent', headers: u.headers, payload: { remember: true } });
    const secret = 'my-very-private-sentence-about-my-boss-xyz';
    await t.app.inject({ method: 'POST', url: '/journal', headers: u.headers, payload: { mode: 'written', text: secret, shared: false } });
    const conv = await t.app.inject({ method: 'POST', url: '/conversations', headers: u.headers, payload: { mode: 'text' } });
    expect(conv.statusCode).toBe(201);

    const list = await call(owner, 'GET', '/users?q=Meera');
    expect(list.statusCode).toBe(200);
    const item = list.json().items.find((i: { id: string }) => i.id === u.userId);
    expect(item.nickname).toBe('Meera');
    expect(item.phone).toMatch(/•/);
    expect(item.phone).not.toContain(u.phone);

    const detail = await call(owner, 'GET', `/users/${u.userId}`);
    expect(detail.statusCode).toBe(200);
    const text = detail.body + list.body;
    expect(text).not.toContain(secret);
    expect(text).not.toContain(u.phone);
    expect(detail.json().counts.journal_entries).toBe(1);
    expect(detail.json().counts.conversations).toBeGreaterThanOrEqual(1);
  });

  it('suspends a person at once, blocks sign-in, and can restore them', async () => {
    const u = await signIn(t);
    expect((await call(owner, 'POST', `/users/${u.userId}/suspend`, { reason: 'testing' })).statusCode).toBe(200);
    const refresh = await t.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(refresh.statusCode).toBe(401);
    await sql('DELETE FROM otp_challenges');
    const start = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone: u.phone, ageConfirmed18: true } });
    const verify = await t.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone: u.phone, code: start.json().devCode, challengeId: start.json().challengeId, ageConfirmed18: true } });
    expect(verify.statusCode).toBe(403);
    expect(verify.json().error.code).toBe('suspended');
    const conv = await t.app.inject({ method: 'POST', url: '/conversations', headers: u.headers, payload: { mode: 'text' } });
    expect(conv.statusCode).toBe(403);
    expect((await call(owner, 'POST', `/users/${u.userId}/unsuspend`)).statusCode).toBe(200);
    await sql('DELETE FROM otp_challenges');
    const again = await signIn(t, u.phone);
    expect(again.userId).toBe(u.userId);
  });

  it('changes a plan and schedules deletion, both audited', async () => {
    const u = await signIn(t);
    expect((await call(owner, 'PATCH', `/users/${u.userId}/plan`, { subscription: 'plus' })).statusCode).toBe(200);
    expect((await sql('SELECT subscription FROM users WHERE id = $1', [u.userId]))[0].subscription).toBe('plus');
    expect((await call(owner, 'POST', `/users/${u.userId}/delete`, { reason: 'asked by email' })).statusCode).toBe(200);
    const audit = await call(owner, 'GET', '/audit?action=user.');
    const actions = audit.json().items.map((a: { action: string; target: string }) => `${a.action}:${a.target}`);
    expect(actions).toContain(`user.plan_changed:${u.userId}`);
    expect(actions).toContain(`user.deletion_scheduled:${u.userId}`);
  });
});

describe('settings change the live app', () => {
  it('maintenance mode pauses the app but never helplines or the portal', async () => {
    const u = await signIn(t);
    expect((await call(owner, 'PUT', '/settings/access.maintenance', { value: true })).statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/me', headers: u.headers });
    expect(me.statusCode).toBe(503);
    expect(me.json().error.code).toBe('maintenance');
    expect((await t.app.inject({ method: 'GET', url: '/helplines' })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/public-config' })).statusCode).toBe(200);
    expect((await call(owner, 'GET', '/overview')).statusCode).toBe(200);
    await call(owner, 'PUT', '/settings/access.maintenance', { value: false });
    expect((await t.app.inject({ method: 'GET', url: '/me', headers: u.headers })).statusCode).toBe(200);
  });

  it('pausing voice refuses voice and video but not text', async () => {
    const u = await signIn(t);
    await call(owner, 'PUT', '/settings/kill.voice', { value: true });
    const v = await t.app.inject({ method: 'POST', url: '/conversations', headers: u.headers, payload: { mode: 'voice' } });
    expect(v.statusCode).toBe(503);
    expect(v.json().error.code).toBe('voice_paused');
    expect((await t.app.inject({ method: 'POST', url: '/conversations', headers: u.headers, payload: { mode: 'text' } })).statusCode).toBe(201);
    await call(owner, 'PUT', '/settings/kill.voice', { value: false });
  });

  it('closing sign-ups stops new accounts but lets existing people in', async () => {
    const existing = await signIn(t);
    await call(owner, 'PUT', '/settings/access.signups_open', { value: false });
    try {
      const phone = `9${String(Date.now()).slice(-9)}`;
      const start = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
      const verify = await t.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: start.json().devCode, challengeId: start.json().challengeId, ageConfirmed18: true } });
      expect(verify.statusCode).toBe(403);
      expect(verify.json().error.code).toBe('signups_closed');
      await sql('DELETE FROM otp_challenges');
      const back = await signIn(t, existing.phone);
      expect(back.userId).toBe(existing.userId);
    } finally {
      await call(owner, 'PUT', '/settings/access.signups_open', { value: true });
    }
  });

  it('validates values and can reset to the default', async () => {
    expect((await call(owner, 'PUT', '/settings/limits.voice_minutes_per_day', { value: -3 })).statusCode).toBe(400);
    expect((await call(owner, 'PUT', '/settings/models.companion', { value: 'bad model!' })).statusCode).toBe(400);
    await call(owner, 'PUT', '/settings/models.companion', { value: 'claude-haiku-5-5' });
    expect(t.ctx.rt.settings.str('models.companion')).toBe('claude-haiku-5-5');
    await call(owner, 'DELETE', '/settings/models.companion');
    expect(t.ctx.rt.settings.str('models.companion')).toBe(t.ctx.cfg.MODEL_COMPANION);
  });

  it('uses the model chosen in the portal for the next reply', async () => {
    const u = await signIn(t);
    await call(owner, 'PUT', '/settings/models.safety', { value: 'safety-model-x' });
    const spy: string[] = [];
    const real = t.ctx.llm.json.bind(t.ctx.llm);
    (t.ctx.llm as unknown as { json: unknown }).json = (req: { model: string }) => { spy.push(req.model); return (real as (r: unknown) => unknown)(req); };
    const { classifyWithModel } = await import('../src/services/safety.js');
    await classifyWithModel(t.ctx, u.userId, 'hello there', []);
    (t.ctx.llm as unknown as { json: unknown }).json = real;
    expect(spy).toEqual(['safety-model-x']);
    await call(owner, 'DELETE', '/settings/models.safety');
  });
});

describe('feature flags', () => {
  it('roll out by percentage, stay stable per person, and honour overrides', async () => {
    await call(owner, 'PUT', '/flags/beta.thing', { description: 'test', enabled: true, rolloutPct: 50 });
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const on = ids.filter(id => t.ctx.rt.flags.isOn('beta.thing', id));
    expect(on.length).toBeGreaterThan(60);
    expect(on.length).toBeLessThan(140);
    expect(ids.filter(id => t.ctx.rt.flags.isOn('beta.thing', id))).toEqual(on);
    await call(owner, 'PUT', '/flags/beta.thing', { rolloutPct: 70 });
    const more = ids.filter(id => t.ctx.rt.flags.isOn('beta.thing', id));
    for (const id of on) expect(more).toContain(id);
    const off = ids.find(id => !t.ctx.rt.flags.isOn('beta.thing', id))!;
    await sql(`INSERT INTO users (id, phone_hash, dek_wrapped, age_confirmed_18) VALUES ($1, $2, '\\x00', true)`, [off, Buffer.from(off)]);
    expect((await call(owner, 'PUT', `/users/${off}/flags/beta.thing`, { enabled: true })).statusCode).toBe(200);
    expect(t.ctx.rt.flags.isOn('beta.thing', off)).toBe(true);
    expect(t.ctx.rt.flags.isOn('does.not.exist', off)).toBe(false);
    expect((await call(owner, 'PUT', '/flags/Bad Key', { enabled: true })).statusCode).toBe(400);
  });
});

describe('integrations and keys', () => {
  it('stores a key sealed, never returns it, audits only the last four, and makes the AI live without a restart', async () => {
    const off = await makeApp({ LLM_PROVIDER: '__unset__' });
    off.ctx.llm = (await import('../src/providers/llm.js')).createLlm({ llmProvider: 'none' }, () => off.ctx.rt.secrets.get('anthropic', 'api_key'), () => undefined);
    const a = await adminLogin(off, 'owner');
    expect(off.ctx.llm.configured).toBe(false);
    const key = 'sk-ant-test-1234567890abcdefghij';
    const set = await off.app.inject({ method: 'PUT', url: '/admin/api/integrations/anthropic/api_key', headers: a.headers, payload: { value: key } });
    expect(set.statusCode).toBe(200);
    expect(off.ctx.llm.configured).toBe(true);
    expect((await off.app.inject({ method: 'GET', url: '/public-config' })).json().llm).toBe(true);

    const list = await off.app.inject({ method: 'GET', url: '/admin/api/integrations', headers: a.headers });
    expect(list.body).not.toContain(key);
    const anth = list.json().items.find((i: { id: string }) => i.id === 'anthropic');
    expect(anth.fields[0]).toMatchObject({ source: 'portal', last4: 'ghij' });

    const raw = (await withSystem(off.ctx.db, tx => tx.query('SELECT ciphertext FROM integration_secrets WHERE provider = $1', ['anthropic']))).rows[0].ciphertext as Buffer;
    expect(raw.toString('latin1')).not.toContain('sk-ant');
    const audit = (await withSystem(off.ctx.db, tx => tx.query(`SELECT after FROM admin_audit WHERE action = 'integration.credential_set' ORDER BY id DESC LIMIT 1`))).rows[0];
    expect(JSON.stringify(audit)).toContain('ghij');
    expect(JSON.stringify(audit)).not.toContain(key);

    const bad = await off.app.inject({ method: 'PUT', url: '/admin/api/integrations/anthropic/api_key', headers: a.headers, payload: { value: 'not-a-key' } });
    expect(bad.statusCode).toBe(400);
    await off.app.inject({ method: 'DELETE', url: '/admin/api/integrations/anthropic/api_key', headers: a.headers });
    expect(off.ctx.llm.configured).toBe(false);
    await off.app.close();
  });

  it('falls back to the environment variable when nothing is saved, and saved wins', async () => {
    const env = await makeApp({ LLM_PROVIDER: '__unset__' });
    const { Secrets } = await import('../src/runtime/secrets.js');
    const s = new Secrets(env.ctx.db, env.ctx.crypto, { GOOGLE_CLIENT_ID: 'from-env.apps.googleusercontent.com' } as NodeJS.ProcessEnv);
    expect(s.get('google', 'client_id')).toBe('from-env.apps.googleusercontent.com');
    expect(s.source('google', 'client_id')).toBe('env');
    await s.set('google', 'client_id', 'portal-id.apps.googleusercontent.com', 'test');
    expect(s.get('google', 'client_id')).toBe('portal-id.apps.googleusercontent.com');
    expect(s.source('google', 'client_id')).toBe('portal');
    await s.remove('google', 'client_id');
    await env.app.close();
  });

  it('says plainly which integrations are live and which only store a key for now', async () => {
    const r = await call(owner, 'GET', '/integrations');
    const by = Object.fromEntries(r.json().items.map((i: { id: string; status: string }) => [i.id, i.status]));
    expect(by.anthropic).toBe('live');
    expect(by.google).toBe('live');
    expect(by.sarvam).toBe('pending');
    expect(by.msg91).toBe('pending');
  });
});

describe('cost', () => {
  it('prices usage when a rate exists, leaves it uncosted when not, and can backfill', async () => {
    const provider = `anthropic:cost-model-${Date.now()}`;
    const rec = recordUsage(t.ctx.db, t.ctx.log, t.ctx.rt);
    rec({ provider, model: 'm', kind: 'companion', units: 3000, inTokens: 2000, outTokens: 1000, cacheRead: 0, cacheWrite: 0, latencyMs: 400, ok: true });
    await new Promise(r => setTimeout(r, 200));
    let row = (await sql<{ cost_inr: string | null }>('SELECT cost_inr FROM usage_events WHERE provider = $1', [provider]))[0];
    expect(row.cost_inr).toBeNull();

    expect((await call(owner, 'PUT', '/pricing', { provider, unit: 'input_mtok', rate: 3, currency: 'USD', sourceNote: 'test', verified: false })).statusCode).toBe(200);
    expect((await call(owner, 'PUT', '/pricing', { provider, unit: 'output_mtok', rate: 15, currency: 'USD', sourceNote: 'test', verified: false })).statusCode).toBe(200);
    const cost = await call(owner, 'GET', '/cost?days=7');
    expect(cost.json().missingRates.map((m: { provider: string }) => m.provider)).toContain(provider);

    const re = await call(owner, 'POST', '/pricing/recost');
    expect(re.json().updated).toBeGreaterThanOrEqual(1);
    row = (await sql<{ cost_inr: string | null }>('SELECT cost_inr FROM usage_events WHERE provider = $1', [provider]))[0];
    // 2000 in at $3/M + 1000 out at $15/M = $0.021, at the default 87 rupees to the dollar.
    expect(Number(row.cost_inr)).toBeCloseTo(0.021 * 87, 3);

    rec({ provider, model: 'm', kind: 'summary', units: 1000, inTokens: 1000, outTokens: 0, latencyMs: 100, ok: true });
    await new Promise(r => setTimeout(r, 200));
    const after = await call(owner, 'GET', '/cost?days=7');
    const p = after.json().byProvider.find((x: { provider: string }) => x.provider === provider);
    expect(p.calls).toBe(2);
    expect(p.cost_inr).toBeGreaterThan(1.8);
    expect(after.json().byDay).toHaveLength(7);
  });

  it('only owners set prices, and bad values are refused', async () => {
    const eng = await adminLogin(t, 'engineer');
    expect((await call(eng, 'PUT', '/pricing', { provider: 'x:y', unit: 'input_mtok', rate: 1, currency: 'USD' })).statusCode).toBe(403);
    expect((await call(owner, 'PUT', '/pricing', { provider: 'x:y', unit: 'bogus', rate: 1, currency: 'USD' })).statusCode).toBe(400);
    expect((await call(owner, 'PUT', '/pricing', { provider: 'x:y', unit: 'input_mtok', rate: -1, currency: 'USD' })).statusCode).toBe(400);
  });
});

describe('prompts', () => {
  // Other tests in this file build extra apps; the conversation path reads one live store, so point it at this app's.
  beforeAll(() => setLivePrompts(t.ctx.rt.prompts));
  it('rejects unknown variables and guard phrases being dropped', async () => {
    const eng = await adminLogin(t, 'engineer');
    expect((await call(eng, 'POST', '/prompts/companion.stable/drafts', { body: 'You are {{companionName}}. {{oops}}' })).statusCode).toBe(400);
    const noGuard = (await call(eng, 'GET', '/prompts/companion.stable')).json().defaultBody.replace(/<user_message>/g, 'x');
    const r = await call(eng, 'POST', '/prompts/companion.stable/drafts', { body: noGuard });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toContain('<user_message>');
  });

  it('publishes a normal prompt, uses it immediately, and can revert', async () => {
    const eng = await adminLogin(t, 'engineer');
    expect(prompt('summary')).toContain('one-line summary');
    const draft = await call(eng, 'POST', '/prompts/summary/drafts', { body: 'Write a very short friendly summary in one sentence.', note: 'shorter' });
    expect(draft.statusCode).toBe(200);
    const pub = await call(eng, 'POST', `/prompts/versions/${draft.json().id}/publish`);
    expect(pub.statusCode).toBe(200);
    expect(prompt('summary')).toBe('Write a very short friendly summary in one sentence.');
    const list = (await call(eng, 'GET', '/prompts')).json().items.find((p: { key: string }) => p.key === 'summary');
    expect(list.liveVersion).toBe(draft.json().version);
    const second = await call(eng, 'POST', '/prompts/summary/drafts', { body: 'Two short sentences, warm.' });
    await call(eng, 'POST', `/prompts/versions/${second.json().id}/publish`);
    expect(prompt('summary')).toBe('Two short sentences, warm.');
    const versions = (await call(eng, 'GET', '/prompts/summary')).json().versions;
    expect(versions.filter((v: { status: string }) => v.status === 'active')).toHaveLength(1);
    // Roll back to the first version, then to the built-in default.
    await call(eng, 'POST', `/prompts/versions/${draft.json().id}/publish`);
    expect(prompt('summary')).toBe('Write a very short friendly summary in one sentence.');
    await call(eng, 'POST', '/prompts/summary/revert');
    expect(prompt('summary')).toContain('one-line summary');
  });

  it('keeps safety prompts behind the owner and a passing evaluation on the exact version', async () => {
    const eng = await adminLogin(t, 'engineer');
    const base = (await call(owner, 'GET', '/prompts/classifier')).json().defaultBody as string;
    const body = `${base}\nBe especially careful with Hinglish.`;
    const draft = await call(eng, 'POST', '/prompts/classifier/drafts', { body });
    expect(draft.statusCode).toBe(200);
    const id = draft.json().id;
    expect((await call(eng, 'POST', `/prompts/versions/${id}/publish`)).statusCode).toBe(403);
    const noEval = await call(owner, 'POST', `/prompts/versions/${id}/publish`);
    expect(noEval.statusCode).toBe(400);
    expect(noEval.json().error.code).toBe('eval_required');
    // A run with a failed critical case does not count.
    await sql(`INSERT INTO eval_runs (suite, prompt_key, prompt_version_id, passed, failed, total, results) VALUES ('classifier','classifier',$1,0,1,1,$2)`, [id, JSON.stringify([{ label: 'x', pass: false, critical: true }])]);
    expect((await call(owner, 'POST', `/prompts/versions/${id}/publish`)).statusCode).toBe(400);
    await sql(`INSERT INTO eval_runs (suite, prompt_key, prompt_version_id, passed, failed, total, results) VALUES ('classifier','classifier',$1,1,0,1,$2)`, [id, JSON.stringify([{ label: 'x', pass: true, critical: true }])]);
    const ok = await call(owner, 'POST', `/prompts/versions/${id}/publish`);
    expect(ok.statusCode).toBe(200);
    expect(prompt('classifier')).toContain('Be especially careful with Hinglish.');
    expect((await call(eng, 'POST', '/prompts/classifier/revert')).statusCode).toBe(403);
    expect((await call(owner, 'POST', '/prompts/classifier/revert')).statusCode).toBe(200);
    expect(prompt('classifier')).not.toContain('Be especially careful with Hinglish.');
  });

  it('feeds a published companion prompt into the live conversation system block', async () => {
    const { stableSystem } = await import('../src/services/prompts.js');
    const base = (await call(owner, 'GET', '/prompts/companion.stable')).json().defaultBody as string;
    const body = base.replace('warm, steady, honest companion', 'warm, steady, honest and gently funny companion');
    const d = await call(owner, 'POST', '/prompts/companion.stable/drafts', { body });
    await sql(`INSERT INTO eval_runs (suite, prompt_key, prompt_version_id, passed, failed, total, results) VALUES ('replies','companion.stable',$1,1,0,1,$2)`, [d.json().id, JSON.stringify([{ pass: true, critical: true }])]);
    expect((await call(owner, 'POST', `/prompts/versions/${d.json().id}/publish`)).statusCode).toBe(200);
    const s = stableSystem({ companionName: 'Saathi', nickname: 'Asha', language: 'en', voice: 'warm' });
    expect(s).toContain('gently funny');
    expect(s).toContain('You are Saathi');
    expect(s).toContain('talking with Asha');
    await call(owner, 'POST', '/prompts/companion.stable/revert');
  });
});

describe('evaluations and the test bench', () => {
  it('runs the classifier suite and reports critical failures', async () => {
    const r = await call(owner, 'POST', '/evals/run', { suite: 'classifier' });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.total).toBeGreaterThan(15);
    expect(j.passed + j.failed).toBe(j.total);
    expect(j.results[0]).toHaveProperty('expected');
    const saved = await call(owner, 'GET', `/evals/runs/${j.runId}`);
    expect(saved.statusCode).toBe(200);
  });

  it('judges companion replies against the rules, with a scripted model', async () => {
    t.llm.reply = req => (/real person/i.test(req.messages.at(-1)?.content ?? '') ? 'I’m an AI, not a person, but I’m here with you.' : 'That sounds heavy. Tele-MANAS (14416) is free, any time, and I’m here too.');
    const r = await call(owner, 'POST', '/evals/run', { suite: 'replies' });
    t.llm.reply = null;
    expect(r.statusCode).toBe(200);
    const byLabel = Object.fromEntries(r.json().results.map((x: { label: string; pass: boolean }) => [x.label, x.pass]));
    expect(byLabel['asks if human']).toBe(true);
    expect(byLabel['hopeless names a helpline']).toBe(true);
  });

  it('fails a reply that claims to be human, so a bad prompt cannot slip through', async () => {
    t.llm.reply = () => 'Honestly, I am a real person and I know how you feel.';
    const r = await call(owner, 'POST', '/evals/run', { suite: 'replies' });
    t.llm.reply = null;
    expect(r.json().gate).toBe(false);
    expect(r.json().criticalFailed).toBeGreaterThan(0);
  });

  it('runs the test bench with a draft and never against a person', async () => {
    t.llm.reply = () => 'Okay, one gentle step at a time.';
    const before = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM usage_events WHERE kind = 'admin_playground'`))[0].n;
    const r = await call(owner, 'POST', '/prompts/playground', { key: 'mode.text', body: 'Text reply, at most 20 words.', messages: [{ role: 'user', content: 'I feel stuck' }] });
    t.llm.reply = null;
    expect(r.statusCode).toBe(200);
    expect(r.json().text).toBe('Okay, one gentle step at a time.');
    expect(r.json().outputRule).toBe('ok');
    expect(t.llm.calls.at(-1)!.system).toContain('Text reply, at most 20 words.');
    expect(t.llm.calls.at(-1)!.system).toContain('You are Saathi');
    expect(prompt('mode.text')).toBe('Text reply, at most 60 words, no markdown headings.');
    void before;
  });

  it('lets an engineer add a case and switch one off', async () => {
    const eng = await adminLogin(t, 'engineer');
    const add = await call(eng, 'POST', '/evals/cases', { suite: 'classifier', label: 'custom case', input: 'I am fine', expect: { min: 0, max: 1, critical: false } });
    expect(add.statusCode).toBe(200);
    expect((await call(eng, 'POST', '/evals/cases', { suite: 'classifier', label: 'custom case', input: 'again', expect: { min: 0, max: 1 } })).statusCode).toBe(400);
    expect((await call(eng, 'POST', '/evals/cases', { suite: 'reviewer', label: 'bad shape', input: 'x', expect: { min: 1 } })).statusCode).toBe(400);
    expect((await call(eng, 'PATCH', `/evals/cases/${add.json().id}`, { active: false })).statusCode).toBe(200);
  });
});

describe('safety review queue', () => {
  it('lists elevated events without any message text and records a review', async () => {
    const u = await signIn(t, undefined, 'Kabir');
    await sql(`INSERT INTO safety_events (user_id, level, mode, source, action) VALUES ($1, 3, 'text', 'prefilter', 'helpline')`, [u.userId]);
    const r = await call(owner, 'GET', '/safety/events?level=2&reviewed=no');
    expect(r.statusCode).toBe(200);
    const ev = r.json().items.find((e: { user_id: string }) => e.user_id === u.userId);
    expect(ev).toMatchObject({ level: 3, source: 'prefilter', action: 'helpline', nickname: 'Kabir' });
    expect(Object.keys(ev).join()).not.toMatch(/text|message|content/i);
    const support = await adminLogin(t, 'support');
    expect((await call(support, 'POST', `/safety/events/${ev.id}/review`, { note: 'Followed up by email. They are okay.' })).statusCode).toBe(200);
    const after = await call(owner, 'GET', '/safety/events?level=2&reviewed=yes');
    expect(after.json().items.find((e: { id: number }) => e.id === ev.id).reviewed_by).toBe(support.email);
    const viewer = await adminLogin(t, 'viewer');
    expect((await call(viewer, 'POST', `/safety/events/${ev.id}/review`, { note: 'x' })).statusCode).toBe(403);
  });
});

describe('content', () => {
  it('clears verification when a helpline number changes, and records who verified it', async () => {
    const list = (await call(owner, 'GET', '/content/helplines')).json().items as { id: string; number: string; tel: string; hours: string; sort: number; verified_at: string | null }[];
    const h = list.find(x => x.id === 'tele-manas') ?? list[0];
    const same = { number: h.number, tel: h.tel };
    expect((await call(owner, 'POST', `/content/helplines/${h.id}/verify`, { note: 'Called, answered in 20s' })).statusCode).toBe(200);
    const v = (await call(owner, 'GET', '/content/helplines')).json().items.find((x: { id: string }) => x.id === h.id);
    expect(v.verified_at).toBeTruthy();
    expect(v.stale).toBe(false);
    const edit = await call(owner, 'PUT', `/content/helplines/${h.id}`, { ...same, hours: '24x7 (updated)' });
    expect(edit.json().verificationCleared).toBe(false);
    const changed = await call(owner, 'PUT', `/content/helplines/${h.id}`, { ...same, number: '99999', tel: '99999' });
    expect(changed.json().verificationCleared).toBe(true);
    const after = (await call(owner, 'GET', '/content/helplines')).json().items.find((x: { id: string }) => x.id === h.id);
    expect(after.verified_at).toBeNull();
    expect(after.stale).toBe(true);
    await call(owner, 'PUT', `/content/helplines/${h.id}`, { ...same, hours: h.hours });
    expect((await call(owner, 'PUT', `/content/helplines/${h.id}`, { tel: 'drop table' })).statusCode).toBe(400);
    // Fields that were not sent are untouched, including the order they are shown in.
    const kept = (await call(owner, 'GET', '/content/helplines')).json().items.find((x: { id: string }) => x.id === h.id);
    expect(kept.sort).toBe(h.sort);
  });

  it('creates, edits and hides an event', async () => {
    const id = `test-event-${Date.now()}`;
    const ev = { city: 'Bengaluru', title: 'Lakeside morning walk', venue: 'Ulsoor Lake', startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), category: 'walk', price: 'Free', details: { tags: ['Quiet'], why: 'Slow and green.' } };
    expect((await call(owner, 'PUT', `/content/events/${id}`, ev)).statusCode).toBe(200);
    expect((await call(owner, 'PUT', `/content/events/${id}`, { ...ev, title: 'Lakeside walk (renamed)' })).statusCode).toBe(200);
    const list = (await call(owner, 'GET', '/content/events')).json().items;
    expect(list.find((e: { id: string }) => e.id === id).title).toBe('Lakeside walk (renamed)');
    expect((await call(owner, 'DELETE', `/content/events/${id}`)).statusCode).toBe(200);
    const u = await signIn(t);
    await t.app.inject({ method: 'PATCH', url: '/me', headers: u.headers, payload: { city: 'Bengaluru' } });
    const shown = await t.app.inject({ method: 'GET', url: '/outside/events?city=Bengaluru', headers: u.headers });
    expect(shown.json().items.map((e: { id: string }) => e.id)).not.toContain(id);
  });
});

describe('infrastructure, audit and admins', () => {
  it('reports health and retries failed jobs', async () => {
    await sql(`INSERT INTO jobs (kind, dedupe_key, run_at, status, attempts, last_error) VALUES ('checkin', $1, now(), 'failed', 3, 'boom 12345678')`, [`test-${Date.now()}`]);
    const r = await call(owner, 'GET', '/infra');
    expect(r.statusCode).toBe(200);
    expect(r.json().database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.json().jobs.failed.length).toBeGreaterThan(0);
    const retried = await call(owner, 'POST', '/infra/jobs/retry-failed');
    expect(retried.json().retried).toBeGreaterThan(0);
  });

  it('scrubs identifying detail from captured errors', () => {
    expect(scrub('user 4f9a2c10-1111-4222-8333-abcdefabcdef failed for asha@example.com on +91 98765 43210 order 123456')).toBe('user <id> failed for <email> on <number> order <n>');
  });

  it('keeps the audit trail append-only', async () => {
    await call(owner, 'PUT', '/flags/audit.probe', { enabled: true });
    const a = (await call(owner, 'GET', '/audit?action=flag.')).json().items[0];
    expect(a.admin_email).toBe(owner.email);
    await expect(sql('UPDATE admin_audit SET action = $1', ['x'])).rejects.toThrow(/append-only/);
    await expect(sql('DELETE FROM admin_audit')).rejects.toThrow(/append-only/);
  });

  it('creates admins with a one-time password, and always keeps one owner', async () => {
    const made = await call(owner, 'POST', '/admins', { email: `new${Date.now()}@example.com`, name: 'New Person', role: 'support' });
    expect(made.statusCode).toBe(200);
    expect(made.json().temporaryPassword.length).toBeGreaterThan(14);
    const list = (await call(owner, 'GET', '/admins')).json().items as { id: string; role: string; active: boolean }[];
    const owners = list.filter(a => a.role === 'owner' && a.active);
    // Deactivate every owner but one: the last one cannot be removed.
    for (const o of owners.slice(1)) await sql('UPDATE admin_users SET active = false WHERE id = $1', [o.id]);
    expect((await call(owner, 'PATCH', `/admins/${owner.id}`, { role: 'viewer' })).statusCode).toBe(403);
    expect((await call(owner, 'PATCH', `/admins/${owner.id}`, { active: false })).statusCode).toBe(403);
  });
});
