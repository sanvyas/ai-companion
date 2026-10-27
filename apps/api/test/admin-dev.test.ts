import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitHub, parseRepo } from '../src/admin/github.js';
import type { TestApp } from './app-helpers.js';
import { adminLogin, type AdminSession } from './admin-helpers.js';

interface Seen { url: string; method: string; headers: Record<string, string>; body?: string }
const seen: Seen[] = [];

/** A pretend GitHub and a pretend second environment. */
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  seen.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://staging.example.test')) return url.endsWith('/version') ? json({ version: '0.3.1', commit: 'abcdef1234567', environment: 'production', builtAt: '2026-10-27T10:00:00Z' }) : json({ ok: true });
  if (url.startsWith('https://down.example.test')) throw new Error('connect ECONNREFUSED');
  const p = url.replace('https://api.github.com/repos/acme/saathi', '');
  if (p === '') return json({ full_name: 'acme/saathi', default_branch: 'main', html_url: 'https://github.com/acme/saathi', private: true, pushed_at: '2026-10-27T09:00:00Z', open_issues_count: 2 });
  if (p.startsWith('/commits')) return json([{ sha: 'abcdef1234567890', html_url: 'u', commit: { message: 'feat: add thing\n\nlong body', author: { name: 'Asha', date: '2026-10-27T08:00:00Z' } } }]);
  if (p.startsWith('/pulls')) return json([{ number: 7, title: 'Add the thing', html_url: 'u', user: { login: 'asha' }, draft: false, updated_at: '2026-10-27T08:30:00Z', head: { ref: 'feat/thing' } }]);
  if (p.startsWith('/actions/runs?')) return json({ workflow_runs: [{ id: 99, name: 'CI', display_title: 'feat: add thing', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'abcdef1234567890', event: 'push', html_url: 'u', created_at: 'x', run_started_at: '2026-10-27T08:01:00Z', updated_at: '2026-10-27T08:05:00Z' }] });
  if (p.startsWith('/actions/workflows?') || p === '/actions/workflows') return json({ workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' }, { id: 2, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' }] });
  if (p === '/actions/workflows/deploy.yml/dispatches' || p === '/actions/runs/99/rerun') return new Response(null, { status: 204 });
  return json({ message: 'Not Found' }, 404);
}) as typeof fetch;

let t: TestApp;
let owner: AdminSession;
const call = (a: AdminSession, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as 'GET', url: `/admin/api${url}`, headers: a.headers, payload: payload as object });

beforeAll(async () => {
  delete process.env.GITHUB_TOKEN; // a token in the machine's environment would otherwise count as saved
  const { buildApp } = await import('../src/app.js');
  const { testConfig } = await import('./helpers.js');
  const built = await buildApp(testConfig(), { overrides: { fetchImpl: fakeFetch } });
  await built.app.ready();
  t = { app: built.app, ctx: built.ctx, llm: built.ctx.llm as never };
  owner = await adminLogin(t, 'owner');
});
afterAll(async () => { await t.app.close(); });

describe('the GitHub client', () => {
  it('parses owner/name and refuses anything else', () => {
    expect(parseRepo('acme/saathi')).toEqual({ owner: 'acme', name: 'saathi' });
    expect(parseRepo('acme')).toBeNull();
    expect(parseRepo('https://github.com/acme/saathi')).toBeNull();
  });
  it('sends the token and version headers, and starts the deploy workflow with the chosen inputs', async () => {
    seen.length = 0;
    await new GitHub('tok', { owner: 'acme', name: 'saathi' }, fakeFetch).dispatchDeploy('staging', 'main');
    expect(seen[0].url).toBe('https://api.github.com/repos/acme/saathi/actions/workflows/deploy.yml/dispatches');
    expect(seen[0].headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(seen[0].body!)).toEqual({ ref: 'main', inputs: { environment: 'staging', ref: 'main' } });
  });
});

describe('the Developer page', () => {
  it('asks for the repository and token before showing anything from GitHub', async () => {
    const r = await call(owner, 'GET', '/dev');
    expect(r.statusCode).toBe(200);
    expect(r.json().configured).toBe(false);
    expect(r.json().missing).toHaveLength(2);
  });

  it('shows commits, pull requests, runs and each environment’s version once connected', async () => {
    await call(owner, 'PUT', '/settings/dev.github_repo', { value: 'acme/saathi' });
    await call(owner, 'PUT', '/settings/dev.environments', { value: [{ name: 'staging', url: 'https://staging.example.test' }, { name: 'dev', url: 'https://down.example.test' }] });
    await call(owner, 'PUT', '/integrations/github/token', { value: 'github_pat_abcdefghijklmnop' });
    seen.length = 0;
    const r = await call(owner, 'GET', '/dev');
    const j = r.json();
    expect(j.configured).toBe(true);
    expect(j.repo.name).toBe('acme/saathi');
    expect(j.commits[0]).toMatchObject({ sha: 'abcdef1', message: 'feat: add thing', author: 'Asha' });
    expect(j.pulls[0].number).toBe(7);
    expect(j.runs[0]).toMatchObject({ workflow: 'CI', conclusion: 'success', sha: 'abcdef1' });
    expect(j.workflows.map((w: { file: string }) => w.file)).toContain('deploy.yml');
    const staging = j.environments.find((e: { name: string }) => e.name === 'staging');
    expect(staging).toMatchObject({ ok: true, version: '0.3.1', commit: 'abcdef1234567' });
    const down = j.environments.find((e: { name: string }) => e.name === 'dev');
    expect(down.ok).toBe(false);
    expect(down.error).toContain('ECONNREFUSED');
    expect(r.body).not.toContain('github_pat_');
    expect(seen.some(s => s.headers.Authorization === 'Bearer github_pat_abcdefghijklmnop')).toBe(true);
  });

  it('deploys to staging for an engineer, and to production only for an owner who types the word', async () => {
    const eng = await adminLogin(t, 'engineer');
    // An engineer's deploy waits for an owner, and nothing is dispatched until then.
    seen.length = 0;
    const ask = await call(eng, 'POST', '/dev/deploy', { environment: 'staging', ref: 'main' });
    expect(ask.statusCode).toBe(202);
    expect(seen).toHaveLength(0);
    expect((await call(owner, 'POST', `/changes/${ask.json().id}/approve`, {})).statusCode).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    expect((await call(owner, 'POST', '/dev/deploy', { environment: 'production', ref: 'main' })).json().error.code).toBe('confirm_required');
    seen.length = 0;
    expect((await call(owner, 'POST', '/dev/deploy', { environment: 'production', ref: 'release/1.0', confirm: 'production' })).statusCode).toBe(200);
    expect(JSON.parse(seen.at(-1)!.body!)).toEqual({ ref: 'release/1.0', inputs: { environment: 'production', ref: 'release/1.0' } });
    expect((await call(owner, 'POST', '/dev/deploy', { environment: 'production', ref: 'main; rm -rf', confirm: 'production' })).statusCode).toBe(400);
    const audit = (await call(owner, 'GET', '/audit?action=deploy.')).json().items.map((a: { action: string; target: string }) => `${a.action}:${a.target}`);
    expect(audit).toContain('deploy.started:production');
    const viewer = await adminLogin(t, 'viewer');
    expect((await call(viewer, 'POST', '/dev/deploy', { environment: 'staging' })).statusCode).toBe(403);
  });

  it('re-runs a CI run', async () => {
    const eng = await adminLogin(t, 'engineer');
    expect((await call(owner, 'POST', '/dev/runs/99/rerun')).statusCode).toBe(200);
    expect((await call(eng, 'POST', '/dev/runs/99/rerun')).statusCode).toBe(202);
  });
});
