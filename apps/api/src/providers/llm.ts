import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import { analyzeJournalLocally, classify } from '@saathi/domain';

// Adapter boundary for the language model (PRD section 4/6). Every call is tagged with a task so usage can be
// recorded per purpose and so the mock can answer deterministically in tests.

export type LlmTask = 'companion' | 'sit' | 'classify' | 'output_check' | 'summary' | 'memories' | 'checkin' | 'journal' | 'plan' | 'letter';
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
export interface LlmUsage { provider: string; kind: string; units: number; latencyMs: number; ok: boolean; userId?: string }

export interface LlmProvider {
  readonly name: 'anthropic' | 'mock' | 'none';
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
      this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: final.usage.input_tokens + final.usage.output_tokens, latencyMs: Date.now() - started, ok, userId: req.userId });
    } catch (e) {
      if (!ok) this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
      throw wrap(e);
    }
  }

  async text(req: LlmBase): Promise<string> {
    const started = Date.now();
    try {
      const m = await this.client.messages.create(this.base(req), { signal: req.signal });
      this.guard(m);
      this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: m.usage.input_tokens + m.usage.output_tokens, latencyMs: Date.now() - started, ok: true, userId: req.userId });
      return m.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    } catch (e) {
      this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
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
      this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: m.usage.input_tokens + m.usage.output_tokens, latencyMs: Date.now() - started, ok: true, userId: req.userId });
      return out;
    } catch (e) {
      this.onUsage({ provider: `anthropic:${req.model}`, kind: req.task, units: 0, latencyMs: Date.now() - started, ok: false, userId: req.userId });
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

export function createLlm(cfg: Pick<Config, 'llmProvider' | 'ANTHROPIC_API_KEY'>, onUsage: (u: LlmUsage) => void): LlmProvider {
  if (cfg.llmProvider === 'anthropic') return new AnthropicLlm(cfg.ANTHROPIC_API_KEY!, onUsage);
  if (cfg.llmProvider === 'mock') return new MockLlm();
  return new NoLlm();
}
