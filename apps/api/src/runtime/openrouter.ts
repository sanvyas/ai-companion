// OpenRouter helpers for the portal: check a key, list the models it offers, and try one model with a tiny request.
// The chat adapter itself lives in providers/llm.ts.
import type { TestResult } from './integrations.js';

const BASE = 'https://openrouter.ai/api/v1';
const HEADERS = (key?: string) => ({ ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', 'HTTP-Referer': 'https://saathi.app', 'X-Title': 'Saathi' });

/** Model ids that cannot answer a chat request. */
export const isBatchModel = (id: string) => /:batch\b/i.test(id);

export interface OrModel { id: string; name: string; contextLength: number; promptPerM: number; completionPerM: number; structured: boolean; vendor: string }

interface RawModel { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[]; modality?: string }; supported_parameters?: string[] }

const usd = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10_000) / 10_000 : 0; };

export function normaliseModels(raw: RawModel[]): OrModel[] {
  return raw
    .filter(m => typeof m.id === 'string' && /^[\w.-]+\/[\w.:+-]+$/.test(m.id))
    // `:batch` models only work through OpenRouter's batch interface; a chat request to one always fails.
    .filter(m => !isBatchModel(m.id))
    // Only models that answer in text. Image and audio generators can't run a conversation.
    .filter(m => (m.architecture?.output_modalities ? m.architecture.output_modalities.includes('text') : (m.architecture?.modality ?? 'text->text').endsWith('->text')))
    .map(m => ({
      id: m.id, name: m.name ?? m.id, contextLength: m.context_length ?? 0,
      promptPerM: usd(m.pricing?.prompt), completionPerM: usd(m.pricing?.completion),
      structured: !!m.supported_parameters?.some(p => p === 'structured_outputs' || p === 'response_format'),
      vendor: m.id.split('/')[0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

let cache: { at: number; items: OrModel[] } | null = null;
export const forgetModelCache = () => { cache = null; };

/** The model list barely changes, so keep it for ten minutes. `fresh` forces a reload. */
export async function listModels(f: typeof fetch, key: string | undefined, fresh = false): Promise<OrModel[]> {
  if (!fresh && cache && Date.now() - cache.at < 10 * 60_000) return cache.items;
  const r = await f(`${BASE}/models`, { headers: HEADERS(key), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status} when listing models.`);
  const items = normaliseModels(((await r.json()) as { data?: RawModel[] }).data ?? []);
  cache = { at: Date.now(), items };
  return items;
}

/** “Test connection”: is the key accepted, and what does it have left? */
export async function testOpenRouter(v: Record<string, string>, f: typeof fetch, companionModel?: string): Promise<TestResult> {
  try {
    const r = await f(`${BASE}/auth/key`, { headers: HEADERS(v.api_key), signal: AbortSignal.timeout(15_000) });
    if (r.status === 401 || r.status === 403) return { ok: false, note: 'OpenRouter rejected this key.' };
    if (!r.ok) return { ok: false, note: `OpenRouter answered ${r.status}.` };
    const d = ((await r.json()) as { data?: { label?: string; usage?: number; limit?: number | null; limit_remaining?: number | null; is_free_tier?: boolean } }).data ?? {};
    const spent = typeof d.usage === 'number' ? `$${d.usage.toFixed(2)} used` : null;
    const left = typeof d.limit_remaining === 'number' ? `$${d.limit_remaining.toFixed(2)} left of the key’s limit` : d.limit === null ? 'no spending limit on this key' : null;
    const note = ['Key accepted', d.label ? `(${d.label})` : '', [spent, left, d.is_free_tier ? 'free tier' : null].filter(Boolean).join(', ')].filter(Boolean).join(' ') + '.';
    // An accepted key says nothing about whether the account can pay for the model people talk to. Ask that model one thing.
    if (companionModel) {
      const t = await tryModel(f, v.api_key, companionModel);
      if (!t.ok) return { ok: false, note: `${note} But the companion model ${companionModel} failed: ${t.error ?? 'no answer'}${/credit|afford|payment/i.test(t.error ?? '') ? ' (add credit at openrouter.ai/settings/credits)' : ''}. Conversations will not work until this is fixed.` };
      return { ok: true, note: `${note} The companion model ${companionModel} answered in ${(t.latencyMs / 1000).toFixed(1)} s.` };
    }
    return { ok: true, note };
  } catch (e) {
    return { ok: false, note: `Couldn’t reach OpenRouter: ${(e as Error).message}` };
  }
}

export interface TryResult { ok: boolean; text?: string; error?: string; latencyMs: number; costUsd?: number; inTokens?: number; outTokens?: number }

/** One small real request, so a model can be judged on speed, cost and tone before it serves anyone. */
export async function tryModel(f: typeof fetch, key: string, model: string): Promise<TryResult> {
  const started = Date.now();
  try {
    const r = await f(`${BASE}/chat/completions`, {
      method: 'POST', headers: HEADERS(key), signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model, max_tokens: 60, usage: { include: true }, messages: [{ role: 'system', content: 'You are a warm, calm companion. Answer in one short sentence.' }, { role: 'user', content: 'I had a long day and I feel a bit flat.' }] }),
    });
    const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
    if (!r.ok || j.error) return { ok: false, error: j.error?.message ?? `OpenRouter answered ${r.status}.`, latencyMs: Date.now() - started };
    return { ok: true, text: (j.choices?.[0]?.message?.content ?? '').trim(), latencyMs: Date.now() - started, costUsd: j.usage?.cost, inTokens: j.usage?.prompt_tokens, outTokens: j.usage?.completion_tokens };
  } catch (e) {
    return { ok: false, error: (e as Error).message, latencyMs: Date.now() - started };
  }
}
