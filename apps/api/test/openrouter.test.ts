import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmFailure, LlmRefusal, LlmUnavailable, OpenRouterLlm, createLlm, type LlmUsage } from '../src/providers/llm.js';
import { forgetModelCache, normaliseModels } from '../src/runtime/openrouter.js';
import { recordUsage } from '../src/providers/index.js';
import { withSystem } from '../src/db/pool.js';
import { makeApp, type TestApp } from './app-helpers.js';
import { adminLogin, type AdminSession } from './admin-helpers.js';

const KEY = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (frames: unknown[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const f of frames) c.enqueue(e.encode(`data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const base = { task: 'companion' as const, model: 'meta-llama/llama-3.3-70b-instruct', system: { stable: 'Be kind.', dynamic: 'Name: Asha' }, messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 50 };

describe('OpenRouter chat adapter', () => {
  it('sends an OpenAI-style request and records tokens and the cost OpenRouter reports', async () => {
    const used: LlmUsage[] = []; const seen: { url: string; body: any; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> }); return json({ choices: [{ message: { content: 'Hello there.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5, cost: 0.0004 } }); }) as unknown as typeof fetch;
    const llm = new OpenRouterLlm(KEY, u => used.push(u), f);
    expect(await llm.text(base)).toBe('Hello there.');
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(seen[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0].body.messages[0]).toEqual({ role: 'system', content: 'Be kind.\n\nName: Asha' });
    expect(seen[0].body.model).toBe(base.model);
    expect(used[0]).toMatchObject({ provider: `openrouter:${base.model}`, inTokens: 20, outTokens: 5, costUsd: 0.0004, ok: true });
  });

  it('streams text as it arrives and tolerates comments and a [DONE] marker', async () => {
    const used: LlmUsage[] = [];
    const f = (async () => sse([{ choices: [{ delta: { content: 'I am ' } }] }, ': keep-alive', { choices: [{ delta: { content: 'here.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4, cost: 0.0001 } }, '[DONE]'])) as unknown as typeof fetch;
    const out: string[] = [];
    for await (const t of new OpenRouterLlm(KEY, u => used.push(u), f).stream(base)) out.push(t);
    expect(out.join('')).toBe('I am here.');
    expect(used.at(-1)).toMatchObject({ ok: true, outTokens: 4, costUsd: 0.0001 });
  });

  it('asks for structured output, and falls back to JSON-in-words for models that cannot', async () => {
    const parse = (v: unknown) => v as { level: number };
    const calls: any[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string); calls.push(b);
      if (b.response_format) return json({ error: { message: 'No endpoints found that support response_format' } }, 400);
      return json({ choices: [{ message: { content: 'Sure! ```json\n{"level": 2}\n```' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 3 } });
    }) as unknown as typeof fetch;
    const out = await new OpenRouterLlm(KEY, () => undefined, f).json({ ...base, schemaName: 'risk', jsonSchema: { type: 'object' }, parse });
    expect(out).toEqual({ level: 2 });
    expect(calls[0].response_format.type).toBe('json_schema');
    expect(calls[1].messages[0].content).toContain('JSON schema');
  });

  it('turns failures into the errors the app already understands', async () => {
    const mk = (res: Response) => new OpenRouterLlm(KEY, () => undefined, (async () => res) as unknown as typeof fetch);
    await expect(mk(json({ error: { message: 'bad key' } }, 401)).text(base)).rejects.toBeInstanceOf(LlmUnavailable);
    await expect(mk(json({ error: { message: 'no credit' } }, 402)).text(base)).rejects.toThrow(/can’t pay for that model \(no credit\)/);
    await expect(mk(json({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] })).text(base)).rejects.toBeInstanceOf(LlmRefusal);
    await expect(mk(json({ error: { message: 'boom' } }, 400)).text(base)).rejects.toBeInstanceOf(LlmFailure);
  });
});

describe('choosing the vendor from the portal', () => {
  let t: TestApp; let owner: AdminSession;
  const call = (a: AdminSession, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as 'GET', url: `/admin/api${url}`, headers: a.headers, payload: payload as object });
  const MODELS = { data: [
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { output_modalities: ['text'] }, supported_parameters: ['structured_outputs', 'tools'] },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context_length: 131072, pricing: { prompt: '0.0000001', completion: '0.0000003' }, architecture: { output_modalities: ['text'] }, supported_parameters: [] },
    { id: 'black-forest-labs/flux-pro', name: 'Flux Pro', architecture: { output_modalities: ['image'] }, pricing: {} },
  ] };
  let fetched: { url: string; method: string }[] = [];

  beforeAll(async () => {
    t = await makeApp(); owner = await adminLogin(t, 'owner'); forgetModelCache();
    t.ctx.fetchImpl = (async (url: string, init?: RequestInit) => {
      fetched.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/models')) return json(MODELS);
      if (url.endsWith('/auth/key')) return (init?.headers as Record<string, string>)?.Authorization === `Bearer ${KEY}` ? json({ data: { label: 'saathi beta', usage: 1.234, limit: 10, limit_remaining: 8.766, is_free_tier: false } }) : json({ error: { message: 'No auth credentials found' } }, 401);
      if (url.endsWith('/chat/completions')) return json({ choices: [{ message: { content: 'Long days do that. I’m here.' } }], usage: { prompt_tokens: 30, completion_tokens: 9, cost: 0.0002 } });
      return json({}, 404);
    }) as unknown as typeof fetch;
  });
  afterAll(async () => { await t.app.close(); });

  it('accepts a key only if it looks like an OpenRouter key, never echoes it, and can test it', async () => {
    expect((await call(owner, 'PUT', '/integrations/openrouter/api_key', { value: 'sk-wrong' })).statusCode).toBe(400);
    expect((await call(owner, 'POST', '/integrations/openrouter/test')).json().note).toContain('Add API key first');
    expect((await call(owner, 'PUT', '/integrations/openrouter/api_key', { value: KEY })).statusCode).toBe(200);
    const list = (await call(owner, 'GET', '/integrations')).json().items.find((i: { id: string }) => i.id === 'openrouter');
    expect(JSON.stringify(list)).not.toContain(KEY);
    expect(list.fields[0]).toMatchObject({ source: 'portal', last4: 'wxyz' });
    const test = (await call(owner, 'POST', '/integrations/openrouter/test')).json();
    expect(test).toMatchObject({ ok: true });
    expect(test.note).toContain('saathi beta');
    expect(test.note).toContain('$8.77 left');
    expect(test.note).toContain('answered'); // it also asked the companion model one thing
  });

  it('says so when the key is accepted but the companion model cannot be paid for', async () => {
    const was = t.ctx.fetchImpl;
    t.ctx.fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/chat/completions')) return json({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' } }, 402);
      return (was as typeof fetch)(url, init);
    }) as unknown as typeof fetch;
    const test = (await call(owner, 'POST', '/integrations/openrouter/test')).json();
    t.ctx.fetchImpl = was;
    expect(test.ok).toBe(false);
    expect(test.note).toContain('Key accepted');
    expect(test.note).toMatch(/failed: Insufficient credits/);
    expect(test.note).toContain('Conversations will not work');
  });

  it('never offers or uses a :batch model', async () => {
    const items = normaliseModels([
      { id: 'anthropic/claude-haiku-4.5', architecture: { output_modalities: ['text'] } },
      { id: 'anthropic/claude-haiku-4.5:batch', architecture: { output_modalities: ['text'] } },
      { id: 'google/gemini-3.1-flash-lite:batch', architecture: { output_modalities: ['text'] } },
    ] as never);
    expect(items.map(i => i.id)).toEqual(['anthropic/claude-haiku-4.5']);
    expect((await call(owner, 'PUT', '/settings/openrouter.models.companion', { value: 'anthropic/claude-haiku-4.5:batch' })).statusCode).toBe(400);
    // A value saved before this rule is not trusted: the model falls back to the default instead of failing every conversation.
    try {
      await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO app_settings (key, value, updated_by) VALUES ('openrouter.models.companion', '"anthropic/claude-haiku-4.5:batch"', 'test'), ('llm.provider', '"openrouter"', 'test') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`));
      await t.ctx.rt.settings.refresh();
      expect(t.ctx.rt.model('companion')).not.toMatch(/:batch/);
    } finally {
      await withSystem(t.ctx.db, tx => tx.query(`DELETE FROM app_settings WHERE key IN ('openrouter.models.companion', 'llm.provider')`));
      await t.ctx.rt.settings.refresh();
    }
  });

  it('lists only text models, with prices per million tokens', async () => {
    const r = (await call(owner, 'GET', '/integrations/openrouter/models')).json();
    expect(r.keySet).toBe(true);
    expect(r.items.map((m: { id: string }) => m.id)).toEqual(['anthropic/claude-sonnet-4.5', 'meta-llama/llama-3.3-70b-instruct']);
    expect(r.items[0]).toMatchObject({ promptPerM: 3, completionPerM: 15, structured: true, vendor: 'anthropic' });
    const n = fetched.filter(x => x.url.endsWith('/models')).length;
    await call(owner, 'GET', '/integrations/openrouter/models');
    expect(fetched.filter(x => x.url.endsWith('/models')).length).toBe(n); // cached
    expect(normaliseModels([{ id: 'x' } as never])).toEqual([]);
  });

  it('tries a model with a real request and reports speed and cost in rupees', async () => {
    const r = (await call(owner, 'POST', '/integrations/openrouter/try', { model: 'meta-llama/llama-3.3-70b-instruct' })).json();
    expect(r).toMatchObject({ ok: true, text: expect.stringContaining('I’m here'), costUsd: 0.0002, inTokens: 30 });
    expect(r.costInr).toBeCloseTo(0.0002 * t.ctx.rt.settings.num('cost.usd_inr'), 3);
    const eng = await adminLogin(t, 'engineer');
    expect((await call(eng, 'POST', '/integrations/openrouter/try', { model: 'a/b' })).statusCode).toBe(403);
  });

  it('only lets a model be chosen if OpenRouter offers it, then serves the app from it', async () => {
    expect((await call(owner, 'PUT', '/settings/openrouter.models.companion', { value: 'made-up/model' })).statusCode).toBe(400);
    expect((await call(owner, 'PUT', '/settings/openrouter.models.companion', { value: 'not a model' })).statusCode).toBe(400);
    expect((await call(owner, 'PUT', '/settings/openrouter.models.companion', { value: 'meta-llama/llama-3.3-70b-instruct' })).statusCode).toBe(200);

    // Before switching, the app is still on Anthropic and its Claude model.
    expect(t.ctx.rt.llmProvider()).toBe('anthropic');
    expect(t.ctx.rt.model('companion')).toBe(t.ctx.cfg.MODEL_COMPANION);
    expect((await call(owner, 'PUT', '/settings/llm.provider', { value: 'openrouter' })).statusCode).toBe(200);
    expect(t.ctx.rt.model('companion')).toBe('meta-llama/llama-3.3-70b-instruct');

    // A live LLM now talks to OpenRouter with the stored key and records the reported cost in rupees.
    const used: LlmUsage[] = [];
    const llm = createLlm({ llmProvider: 'anthropic' }, { provider: () => t.ctx.rt.llmProvider(), key: p => t.ctx.rt.secrets.get(p, 'api_key'), fetchImpl: t.ctx.fetchImpl }, u => { used.push(u); recordUsage(t.ctx.db, t.ctx.log, t.ctx.rt)(u); });
    expect(llm.name).toBe('openrouter');
    await llm.text({ ...base, model: t.ctx.rt.model('companion') });
    await new Promise(r => setTimeout(r, 150));
    const row = (await withSystem(t.ctx.db, tx => tx.query(`SELECT provider, cost_inr FROM usage_events WHERE provider LIKE 'openrouter:%' ORDER BY id DESC LIMIT 1`))).rows[0];
    expect(row.provider).toBe('openrouter:meta-llama/llama-3.3-70b-instruct');
    expect(Number(row.cost_inr)).toBeGreaterThan(0);

    await call(owner, 'DELETE', '/settings/llm.provider');
    await call(owner, 'DELETE', '/settings/openrouter.models.companion');
    expect(t.ctx.rt.llmProvider()).toBe('anthropic');
  });

  it('says so when OpenRouter is selected but has no key', async () => {
    const src = { provider: () => 'openrouter' as const, key: () => undefined };
    const llm = createLlm({ llmProvider: 'anthropic' }, src, () => undefined);
    expect(llm.configured).toBe(false);
    await expect(llm.text(base)).rejects.toThrow(/OpenRouter is selected/);
  });
});
