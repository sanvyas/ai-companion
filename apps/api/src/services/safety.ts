import { z } from 'zod';
import { checkAiOutput, classify, detectsMinor, SAFE_FALLBACK_LINE, type OutputVerdict, type RiskLevel } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import type { LlmMessage } from '../providers/llm.js';
import { classifierSystem, outputCheckSystem } from './prompts.js';

// Server safety pipeline (PRD 6.4): keyword pre-filter, then a separate model on every user turn, then an
// output check on every AI draft. The classifier errs high: unsure means the higher level, and a classifier
// outage never lowers what the pre-filter found.

const RiskSchema = z.object({ level: z.number().int().min(0).max(3) });
const RISK_JSON = { type: 'object', properties: { level: { type: 'integer', enum: [0, 1, 2, 3] } }, required: ['level'], additionalProperties: false };
const CheckSchema = z.object({ ok: z.boolean() });
const CHECK_JSON = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };

export interface TurnAssessment { level: RiskLevel; minor: boolean; prefilter: RiskLevel; usedClassifier: boolean }

export const wrapUser = (text: string) => `<user_message>\n${text.replace(/<\/?user_message>/gi, '')}\n</user_message>`;

export function prefilter(text: string): { level: RiskLevel; minor: boolean } {
  return { level: classify(text), minor: detectsMinor(text) };
}

/** Run the server classifier. Returns null if it is unavailable so the caller can fall back to the pre-filter. */
export async function classifyWithModel(ctx: Ctx, userId: string, text: string, recent: LlmMessage[], timeoutMs = 3500): Promise<RiskLevel | null> {
  if (!ctx.llm.configured) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const ctxLines = recent.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content.slice(0, 400)}`).join('\n');
    const out = await ctx.llm.json({
      task: 'classify', model: ctx.rt.model('safety'), userId, signal: ac.signal, maxTokens: 64, effort: 'low',
      system: { stable: classifierSystem() },
      messages: [{ role: 'user', content: `${ctxLines ? `Recent turns:\n${ctxLines}\n\n` : ''}Latest message:\n${wrapUser(text)}` }],
      schemaName: 'risk', jsonSchema: RISK_JSON, parse: v => RiskSchema.parse(v),
    });
    return out.level as RiskLevel;
  } catch (e) {
    ctx.log.warn({ err: (e as Error).message }, 'safety classifier unavailable, using pre-filter only');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function assessTurn(ctx: Ctx, userId: string, text: string, recent: LlmMessage[]): Promise<TurnAssessment> {
  const pre = prefilter(text);
  if (pre.level === 3) return { level: 3, minor: pre.minor, prefilter: 3, usedClassifier: false };
  const model = await classifyWithModel(ctx, userId, text, recent);
  const level = Math.max(pre.level, model ?? 0) as RiskLevel;
  return { level, minor: pre.minor, prefilter: pre.level, usedClassifier: model !== null };
}

/** Rule check always; model check as well when the conversation is at elevated risk. */
export async function reviewDraft(ctx: Ctx, userId: string, draft: string, elevated: boolean): Promise<OutputVerdict> {
  const rules = checkAiOutput(draft);
  if (!rules.ok) return rules;
  if (!elevated || !ctx.llm.configured) return { ok: true };
  try {
    const out = await ctx.llm.json({
      task: 'output_check', model: ctx.rt.model('safety'), userId, maxTokens: 64, effort: 'low',
      system: { stable: outputCheckSystem() },
      messages: [{ role: 'user', content: `Draft reply:\n"""\n${draft}\n"""` }],
      schemaName: 'output_check', jsonSchema: CHECK_JSON, parse: v => CheckSchema.parse(v),
    });
    return out.ok ? { ok: true } : { ok: false, reason: 'method' };
  } catch {
    // If the reviewer is down at elevated risk, do not ship free text: the caller falls back to the fixed line.
    return { ok: false, reason: 'method' };
  }
}

export async function logSafetyEvent(ctx: Ctx, userId: string, level: RiskLevel, mode: string, source: 'prefilter' | 'classifier' | 'output_check' | 'journal' | 'user_action', action?: string) {
  await withUser(ctx.db, userId, tx =>
    tx.query('INSERT INTO safety_events (user_id, level, mode, source, action) VALUES ($1,$2,$3,$4,$5)', [userId, level, mode, source, action ?? null]));
}

export { SAFE_FALLBACK_LINE };
