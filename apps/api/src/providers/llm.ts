import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import { analyzeJournalLocally, classify } from '@saathi/domain';

// Adapter boundary for the language model (PRD section 4/6). Every call is tagged with a task so usage can be
// recorded per purpose and so the mock can answer deterministically in tests.

export type LlmTask = 'companion' | 'sit' | 'classify' | 'output_check' | 'summary' | 'memories' | 'checkin' | 'journal' | 'plan' | 'letter' | 'admin_playground' | 'admin_eval';
export interface LlmMessage { role: 'user' | 'assistant'; content: string }

export interface LlmBase {
  task: LlmTask;
  model: string;
  /** `stable` is cached across turns; `dynamic` (memories, plan, safety block) changes every turn. */
  system: { stable: string; dynamic?: string };
  messages: LlmMessage[];
  maxTokens: number;
  userId?: string;
  signal?: AbortSignal;
  effort?: 'low' | 'medium' | 'high';
}
export interface LlmJson<T> extends LlmBase {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: (v: unknown) => T;
}
export interface LlmUsage {
  provider: string; kind: string; units: number; latencyMs: number; ok: boolean; userId?: string;
  model?: string; inTokens?: number; outTokens?: number; cacheRead?: number; cacheWrite?: number;
  /** What the vendor itself says the call cost, in US dollars (OpenRouter reports this exactly). */
  costUsd?: number;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'openrouter' | 'mock' | 'none';
  readonly configured: boolean;
  stream(req: LlmBase): AsyncGenerator<string, void, void>;
  text(req: LlmBase): Promise<string>;
  json<T>(req: LlmJson<T>): Promise<T>;
}

export class LlmUnavailable extends Error { constructor(msg = 'The companion model is not configured.') { super(msg); } }
export class LlmRefusal extends Error { constructor(public readonly category: string | null) { super('The model declined this request.'); } }
export class LlmFailure extends Error {}

// ------------------------------------------------------------------------------------------ Anthropic
// Latency-sensitive calls: turn thinking down. Sonnet 5.5 can switch to between-tools thinking at <= high effort;
// Opus 5.5 and Haiku 5.5 keep adaptive thinking and are steered with effort alone.
function tuning(model: string, effort: 'low' | 'medium' | 'high'): { thinking?: Anthropic.ThinkingConfigParam; output_config: { effort: 'low' | 'medium' | 'high' } } {
  if (/sonnet-5-5/.test(model)) return { thinking: { type: 'between_tools' }, output_config: { effort } };
  return { output_config: { effort } };
}

function sys(s: LlmBase['system']): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [{ type: 'text', text: s.stable, cache_control: { type: 'ephemeral' } }];
  if (s.dynamic) blocks.push({ type: 'text', text: s.dynamic });
  return blocks;
}

function msgs(m: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = m.map(x => ({ role: x.role, content: x.content }));
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(The conversation has just opened.)' });
  return out;
}

function tokens(u: Anthropic.Usage) {
  const cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
  return { units: u.input_tokens + u.output_tokens + cacheRead + cacheWrite, inTokens: u.input_tokens, outTokens: u.output_tokens, cacheRead, cacheWrite };
}

class AnthropicLlm implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly configured = true;
  private readonly client: Anthropic;
  constructor(apiKey: string, private readonly onUsage: (u: LlmUsage) => void) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  private base(req: LlmBase) {
    return { model: req.model, max_tokens: req.maxTokens, system: sys(req.system), messages: msgs(req.messages), ...tuning(req.model, req.effort ?? 'low') };
  }

  private guard(msg: Anthropic.Message) {
    if (msg.stop_reason === 'refusal') throw new LlmRefusal(msg.stop_details?.category ?? null);
  }

  async *stream(req: LlmBase): AsyncGenerator<string, void, void> {
    const started = Date.now();
    let ok = false;
    const stream = this.client.messages.stream(this.base(req), { signal: req.signal });
    try {
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
      }
      const final = await stream.finalMessage();
      this.guard(final);
      ok = true;
      this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, ...tokens(final.usage), latencyMs: Date.now() - started, ok, userId: req.userId });
    } catch (e) {
      if (!ok) this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
      throw wrap(e);
    }
  }

  async text(req: LlmBase): Promise<string> {
    const started = Date.now();
    try {
      const m = await this.client.messages.create(this.base(req), { signal: req.signal });
      this.guard(m);
      this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, ...tokens(m.usage), latencyMs: Date.now() - started, ok: true, userId: req.userId });
      return m.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    } catch (e) {
      this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
      throw wrap(e);
    }
  }

  async json<T>(req: LlmJson<T>): Promise<T> {
    const started = Date.now();
    try {
      const b = this.base(req);
      const m = await this.client.messages.create({ ...b, output_config: { ...b.output_config, format: { type: 'json_schema', schema: req.jsonSchema } } }, { signal: req.signal });
      this.guard(m);
      if (m.stop_reason === 'max_tokens') throw new LlmFailure('structured output was cut off');
      const raw = m.content.flatMap(x => (x.type === 'text' ? [x.text] : [])).join('');
      const out = req.parse(JSON.parse(raw));
      this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, ...tokens(m.usage), latencyMs: Date.now() - started, ok: true, userId: req.userId });
      return out;
    } catch (e) {
      this.onUsage({ provider: `anthropic:${req.model}`, model: req.model, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
      throw wrap(e);
    }
  }
}

function wrap(e: unknown): Error {
  if (e instanceof LlmRefusal || e instanceof LlmFailure) return e;
  if (e instanceof Anthropic.AuthenticationError) return new LlmUnavailable('The Anthropic API key was rejected.');
  if (e instanceof Anthropic.RateLimitError) return new LlmFailure('The model is busy right now.');
  if (e instanceof Error && e.name === 'AbortError') return e;
  return new LlmFailure(e instanceof Error ? e.message : 'model call failed');
}


// ------------------------------------------------------------------------------------------ OpenRouter
// One key, many models, through an OpenAI-compatible API. Useful for trying other vendors' models and for price
// comparison. OpenRouter reports the exact cost of each call, which is recorded as-is.
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

interface OrChoice { message?: { content?: string | null }; delta?: { content?: string | null }; finish_reason?: string | null }
interface OrUsage { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }
interface OrBody { choices?: OrChoice[]; usage?: OrUsage; error?: { message?: string; code?: number | string } }

export class OpenRouterLlm implements LlmProvider {
  readonly name = 'openrouter' as const;
  readonly configured = true;
  constructor(private readonly apiKey: string, private readonly onUsage: (u: LlmUsage) => void, private readonly f: typeof fetch = fetch, private readonly referer = 'https://saathi.app') {}

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': this.referer, 'X-Title': 'Saathi' };
  }

  private payload(req: LlmBase, extra: Record<string, unknown> = {}) {
    const system = req.system.dynamic ? `${req.system.stable}\n\n${req.system.dynamic}` : req.system.stable;
    return { model: req.model, max_tokens: req.maxTokens, messages: [{ role: 'system', content: system }, ...msgs(req.messages).map(m => ({ role: m.role, content: m.content as string }))], usage: { include: true }, ...extra };
  }

  private async post(body: unknown, signal?: AbortSignal, attempt = 0): Promise<Response> {
    const res = await this.f(`${OPENROUTER_BASE}/chat/completions`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
    if ((res.status === 429 || res.status >= 500) && attempt < 1) { await new Promise(r => setTimeout(r, 400)); return this.post(body, signal, attempt + 1); }
    if (!res.ok) throw await this.failure(res);
    return res;
  }

  private async failure(res: Response): Promise<Error> {
    let msg = `OpenRouter answered ${res.status}.`;
    try { const j = (await res.json()) as OrBody; if (j.error?.message) msg = j.error.message; } catch { /* keep the status message */ }
    if (res.status === 401 || res.status === 403) return new LlmUnavailable('The OpenRouter API key was rejected.');
    if (res.status === 402) return new LlmUnavailable('OpenRouter has no credit left for this key.');
    if (res.status === 429) return new LlmFailure('The model is busy right now.');
    return new LlmFailure(msg);
  }

  private usage(req: LlmBase, started: number, ok: boolean, u?: OrUsage): LlmUsage {
    const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
    const inTokens = Math.max(0, (u?.prompt_tokens ?? 0) - cached), outTokens = u?.completion_tokens ?? 0;
    return { provider: `openrouter:${req.model}`, model: req.model, kind: req.task, units: ok ? inTokens + outTokens + cached : 0, inTokens: ok ? inTokens : undefined, outTokens: ok ? outTokens : undefined, cacheRead: ok && cached ? cached : undefined, costUsd: ok ? u?.cost : undefined, latencyMs: Date.now() - started, ok, userId: req.userId };
  }

  async *stream(req: LlmBase): AsyncGenerator<string, void, void> {
    const started = Date.now();
    let usage: OrUsage | undefined, ok = false;
    try {
      const res = await this.post(this.payload(req, { stream: true }), req.signal);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let j: OrBody; try { j = JSON.parse(data); } catch { continue; }
          if (j.error) throw new LlmFailure(j.error.message ?? 'The model stopped midway.');
          if (j.usage) usage = j.usage;
          const c = j.choices?.[0];
          if (c?.finish_reason === 'content_filter') throw new LlmRefusal(null);
          const t = c?.delta?.content;
          if (t) yield t;
        }
      }
      ok = true;
      this.onUsage(this.usage(req, started, true, usage));
    } catch (e) {
      if (!ok) this.onUsage(this.usage(req, started, false));
      throw wrapOr(e);
    }
  }

  private async complete(req: LlmBase, extra?: Record<string, unknown>): Promise<{ text: string; usage?: OrUsage; finish?: string | null }> {
    const res = await this.post(this.payload(req, extra), req.signal);
    const j = (await res.json()) as OrBody;
    if (j.error) throw new LlmFailure(j.error.message ?? 'The model failed.');
    const c = j.choices?.[0];
    if (c?.finish_reason === 'content_filter') throw new LlmRefusal(null);
    return { text: c?.message?.content ?? '', usage: j.usage, finish: c?.finish_reason };
  }

  async text(req: LlmBase): Promise<string> {
    const started = Date.now();
    try {
      const r = await this.complete(req);
      this.onUsage(this.usage(req, started, true, r.usage));
      return r.text;
    } catch (e) {
      this.onUsage(this.usage(req, started, false));
      throw wrapOr(e);
    }
  }

  async json<T>(req: LlmJson<T>): Promise<T> {
    const started = Date.now();
    try {
      let r: Awaited<ReturnType<OpenRouterLlm['complete']>>;
      try {
        r = await this.complete(req, { response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema } }, provider: { require_parameters: true } });
      } catch (e) {
        // Not every model supports structured output. Fall back to asking for JSON in words.
        if (!(e instanceof LlmFailure) || e instanceof LlmRefusal) throw e;
        const ask = { ...req, system: { ...req.system, dynamic: `${req.system.dynamic ?? ''}\n\nReply with only a JSON object that matches this JSON schema, with no other text:\n${JSON.stringify(req.jsonSchema)}` } };
        r = await this.complete(ask);
      }
      if (r.finish === 'length') throw new LlmFailure('structured output was cut off');
      const out = req.parse(JSON.parse(extractJson(r.text)));
      this.onUsage(this.usage(req, started, true, r.usage));
      return out;
    } catch (e) {
      this.onUsage(this.usage(req, started, false));
      throw wrapOr(e);
    }
  }
}

/** Models sometimes wrap JSON in prose or a code fence. Take the outermost object. */
export function extractJson(text: string): string {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new LlmFailure('the model did not return JSON');
  return text.slice(a, b + 1);
}

function wrapOr(e: unknown): Error {
  if (e instanceof LlmRefusal || e instanceof LlmFailure || e instanceof LlmUnavailable) return e;
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return e.name === 'AbortError' ? e : new LlmFailure('The model took too long to answer.');
  if (e instanceof SyntaxError) return new LlmFailure('the model did not return valid JSON');
  return new LlmFailure(e instanceof Error ? e.message : 'model call failed');
}

// ------------------------------------------------------------------------------------------ none / mock
class NoLlm implements LlmProvider {
  readonly name = 'none' as const;
  readonly configured = false;
  // eslint-disable-next-line require-yield
  async *stream(): AsyncGenerator<string, void, void> { throw new LlmUnavailable(); }
  async text(): Promise<string> { throw new LlmUnavailable(); }
  async json<T>(): Promise<T> { throw new LlmUnavailable(); }
}

/** Deterministic stand-in for tests and offline development. Refused in production by loadConfig. */
export class MockLlm implements LlmProvider {
  readonly name = 'mock' as const;
  readonly configured = true;
  readonly calls: { task: LlmTask; schemaName?: string; system: string; messages: LlmMessage[] }[] = [];
  /** Tests can force the next model call to throw, or replace a reply. */
  failNext: Error | null = null;
  /** If set, failNext only applies to calls with this task. */
  failTask: LlmTask | null = null;
  reply: ((req: LlmBase) => string) | null = null;

  private record(req: LlmBase, schemaName?: string) {
    this.calls.push({ task: req.task, schemaName, system: `${req.system.stable}\n${req.system.dynamic ?? ''}`, messages: req.messages });
    if (this.failNext && (!this.failTask || this.failTask === req.task)) { const e = this.failNext; this.failNext = null; this.failTask = null; throw e; }
  }

  private say(req: LlmBase): string {
    if (this.reply) return this.reply(req);
    const last = req.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
    if (req.task === 'sit') return 'I’m here.';
    if (/\bnap\b|sleep/i.test(last)) return 'That sounds tiring. What do you think is keeping you up?';
    return 'That sounds like a lot to carry. What part is sitting with you most?';
  }

  async *stream(req: LlmBase): AsyncGenerator<string, void, void> {
    this.record(req);
    const text = this.say(req);
    for (const part of text.match(/.{1,12}/gs) ?? []) yield part;
  }

  async text(req: LlmBase): Promise<string> {
    this.record(req);
    return this.say(req);
  }

  async json<T>(req: LlmJson<T>): Promise<T> {
    this.record(req, req.schemaName);
    let user = req.messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
    // Classify only the latest message, not the recent-turns context that precedes it.
    const tagged = [...user.matchAll(/<user_message>\n([\s\S]*?)\n<\/user_message>/g)].at(-1);
    if (req.schemaName === 'risk' && tagged) user = tagged[1];
    let v: unknown;
    switch (req.schemaName) {
      case 'risk': v = { level: classify(user) }; break;
      case 'output_check': v = { ok: !/\b(i am a human|i'm a real person)\b/i.test(user) }; break;
      case 'journal_analysis': { const a = analyzeJournalLocally(user.replace(/^[\s\S]*?"""|"""[\s\S]*$/g, '')); v = { ...a, memories: a.memories.map((m, i) => ({ ...m, id: i + 1 })) }; break; }
      case 'summary': v = { summary: 'You talked about work and how tired you have been.' }; break;
      case 'memories': v = { memories: [{ theme: 'Work and study', text: 'You have a deadline that has been stressing you.', sensitive: false }] }; break;
      case 'checkin': v = { sleep: 'About six hours', food: 'Lunch', people: 'A call with a friend', okayThing: 'Chai on the balcony', mood: 2, intentions: ['Balcony chai, 8 a.m.', 'Short walk after lunch'] }; break;
      case 'plan': v = { items: ['A glass of water', 'Two minutes at the window', 'Message someone you like'] }; break;
      case 'letter': v = { body: 'This week you stepped out and you rested. One small invitation for next week: a short walk.' }; break;
      default: throw new LlmFailure(`mock has no answer for ${req.schemaName}`);
    }
    return req.parse(v);
  }
}

/**
 * Chooses the vendor at call time: the key and the “AI provider” setting are read from the live runtime, so changing
 * either in the admin portal takes effect on the next message with no restart.
 */
export interface LiveLlmSource {
  provider(): 'anthropic' | 'openrouter';
  key(provider: 'anthropic' | 'openrouter'): string | undefined;
  fetchImpl?: typeof fetch;
}

class LiveLlm implements LlmProvider {
  private cache = new Map<string, LlmProvider>();
  constructor(private readonly src: LiveLlmSource, private readonly onUsage: (u: LlmUsage) => void) {}
  get configured() { return !!this.src.key(this.src.provider()); }
  get name(): 'anthropic' | 'openrouter' | 'none' { return this.configured ? this.src.provider() : 'none'; }
  private use(): LlmProvider {
    const p = this.src.provider();
    const key = this.src.key(p);
    if (!key) throw new LlmUnavailable(p === 'openrouter' ? 'OpenRouter is selected but has no API key.' : undefined);
    const id = `${p}:${key}`;
    let inner = this.cache.get(id);
    if (!inner) {
      this.cache.clear();
      inner = p === 'openrouter' ? new OpenRouterLlm(key, this.onUsage, this.src.fetchImpl) : new AnthropicLlm(key, this.onUsage);
      this.cache.set(id, inner);
    }
    return inner;
  }
  async *stream(req: LlmBase): AsyncGenerator<string, void, void> { yield* this.use().stream(req); }
  async text(req: LlmBase) { return this.use().text(req); }
  async json<T>(req: LlmJson<T>) { return this.use().json(req); }
}

export function createLlm(cfg: Pick<Config, 'llmProvider'>, src: LiveLlmSource | (() => string | undefined), onUsage: (u: LlmUsage) => void): LlmProvider {
  if (cfg.llmProvider === 'mock') return new MockLlm();
  // A bare key getter means Anthropic only.
  const source: LiveLlmSource = typeof src === 'function' ? { provider: () => 'anthropic', key: () => src() } : src;
  return new LiveLlm(source, onUsage);
}

export { NoLlm };
