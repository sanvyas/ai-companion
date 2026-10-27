import { z } from 'zod';
import type { CheckinResult, ConversationItem, ConversationMode, Emotion, EndConversationResponse, ProposedMemory, ServerMsg } from '@saathi/contracts';
import { SentenceSplitter, nextRisk, takeEmotion, level3Script, type RiskLevel, type RiskState, initialRisk } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { withUser, type Tx } from '../db/pool.js';
import { AppError, forbidden, notFound } from '../errors.js';
import { LlmFailure, LlmRefusal, LlmUnavailable, type LlmMessage } from '../providers/llm.js';
import { checkinExtractSystem, dynamicSystem, memoryProposalSystem, stableSystem, summarySystem } from './prompts.js';
import { SAFE_FALLBACK_LINE, classifyWithModel, logSafetyEvent, prefilter, reviewDraft, wrapUser } from './safety.js';
import { retrieveMemories } from './memory.js';
import { getCompanion, getTrusted } from './profile.js';
import { getDek } from './users.js';
import { isServerVoice } from './voices.js';

const HISTORY_LIMIT = 24;

export interface LiveSession {
  conversationId: string;
  userId: string;
  mode: ConversationMode;
  language: 'en' | 'hinglish' | 'hi';
  nickname: string;
  timezone: string;
  companion: { name: string; look: string; voice: string };
  remember: boolean;
  persist: boolean;
  hasSafetyPlan: boolean;
  trustedFirst: string | null;
  trustedName: string | null;
  opening: string | null;
  priorSummary: string | null;
  history: LlmMessage[];
  risk: RiskState;
  silences: number;
  abort: AbortController | null;
  startedAt: number;
  lastSeen: number;
  sentenceIndex: number;
  firstRun: boolean;
}

const live = new Map<string, LiveSession>();
export const getLive = (id: string) => live.get(id);
export const liveSessionCount = () => live.size;

// Drop sessions nobody has touched for 45 minutes so memory cannot grow without bound.
setInterval(() => { const cut = Date.now() - 45 * 60_000; for (const [k, v] of live) if (v.lastSeen < cut) live.delete(k); }, 5 * 60_000).unref();

type Emit = (m: ServerMsg) => void;

// ------------------------------------------------------------------------------------------ create / open
export async function createConversation(ctx: Ctx, userId: string, mode: ConversationMode, continueFrom?: string, first = false) {
  return withUser(ctx.db, userId, async tx => {
    const u = (await tx.query<{ subscription: string; age_confirmed_18: boolean; suspended_at: Date | null }>('SELECT subscription, age_confirmed_18, suspended_at FROM users WHERE id = $1', [userId])).rows[0];
    if (!u?.age_confirmed_18) throw forbidden('under18', 'Saathi is for adults. This account is paused.');
    if (u.suspended_at) throw forbidden('suspended', 'This account is paused. Please contact support.');
    if (['voice', 'video'].includes(mode) && ctx.rt.settings.bool('kill.voice')) throw new AppError(503, 'voice_paused', 'Voice calls are paused for a moment. Text chat still works.');
    if (!ctx.llm.configured) throw new AppError(503, 'llm_unavailable', 'Your companion isn’t connected yet. Helplines and breathing exercises still work.');

    // Basic plan: limited voice minutes per day (PRD 8.7.5). Never applied while the user may be struggling,
    // and text is always open. Safety features are never gated.
    if (['voice', 'video', 'walk'].includes(mode) && u.subscription === 'basic') {
      const used = (await tx.query<{ s: number }>('SELECT COALESCE(sum(voice_seconds),0)::int AS s FROM usage_daily WHERE day = current_date')).rows[0].s;
      const distress = (await tx.query(`SELECT 1 FROM conversations WHERE risk_max >= 1 AND started_at > now() - interval '24 hours' LIMIT 1`)).rowCount;
      if (used >= ctx.rt.settings.num('limits.voice_minutes_per_day') * 60 && !distress) {
        throw new AppError(402, 'plus_required', 'You’ve used today’s voice time. Text is always open, and Plus has unlimited voice.');
      }
    }
    if (continueFrom) {
      const ok = await tx.query('SELECT 1 FROM conversations WHERE id = $1', [continueFrom]);
      if (!ok.rowCount) throw notFound('That conversation');
    }
    const { rows } = await tx.query<{ id: string }>('INSERT INTO conversations (user_id, mode, continued_from, first_run) VALUES ($1,$2,$3,$4) RETURNING id', [userId, mode, continueFrom ?? null, first]);
    const voice = (await tx.query<{ voice: string }>('SELECT voice FROM companions WHERE user_id = $1', [userId])).rows[0]?.voice ?? 'warm';
    return { id: rows[0].id, mode, rtcToken: null as null, voice: { serverStt: !!ctx.stt, serverTts: !!ctx.tts?.configured && mode !== 'text' && isServerVoice(voice) } };
  });
}

/** Load everything the live session needs. Claims the one-time journal hook so it opens exactly one conversation. */
export async function openSession(ctx: Ctx, userId: string, conversationId: string): Promise<LiveSession> {
  const existing = live.get(conversationId);
  if (existing && existing.userId === userId) { existing.lastSeen = Date.now(); return existing; }

  return withUser(ctx.db, userId, async tx => {
    const conv = (await tx.query<{ mode: ConversationMode; ended_at: Date | null; continued_from: string | null; risk_max: number; first_run: boolean }>('SELECT mode, ended_at, continued_from, risk_max, first_run FROM conversations WHERE id = $1', [conversationId])).rows[0];
    if (!conv) throw notFound('That conversation');
    if (conv.ended_at) throw new AppError(409, 'conversation_ended', 'That conversation has ended.');
    const dek = await getDek(ctx, userId, tx);
    const u = (await tx.query('SELECT nickname, language, timezone, age_confirmed_18 FROM users WHERE id = $1', [userId])).rows[0];
    if (!u.age_confirmed_18) throw forbidden('under18', 'Saathi is for adults. This account is paused.');
    const companion = await getCompanion(tx, userId);
    const consent = (await tx.query('SELECT remember FROM consents WHERE user_id = $1', [userId])).rows[0];
    const priv = (await tx.query('SELECT transcript_retention_days FROM privacy_settings WHERE user_id = $1', [userId])).rows[0];
    const trusted = await getTrusted(ctx, tx, userId);
    const hasPlan = !!(await tx.query('SELECT 1 FROM safety_plans WHERE user_id = $1', [userId])).rowCount;

    let priorSummary: string | null = null;
    if (conv.continued_from) {
      const r = (await tx.query<{ summary_enc: Buffer | null }>('SELECT summary_enc FROM conversations WHERE id = $1', [conv.continued_from])).rows[0];
      if (r?.summary_enc) priorSummary = ctx.crypto.decrypt(dek, userId, 'summary', r.summary_enc);
    }

    // One-time hook from "Next time we talk". Deleted as it is claimed; never offered twice.
    let opening: string | null = null;
    if (consent.remember && conv.mode !== 'sit') {
      const h = (await tx.query<{ hook_enc: Buffer }>('DELETE FROM pending_hooks WHERE user_id = $1 RETURNING hook_enc', [userId])).rows[0];
      if (h) opening = ctx.crypto.decrypt(dek, userId, 'hook', h.hook_enc);
    }

    const history: LlmMessage[] = [];
    const retention = priv.transcript_retention_days as number;
    const persist = retention > 0;
    if (persist) {
      const msgs = (await tx.query<{ role: string; text_enc: Buffer }>('SELECT role, text_enc FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2', [conversationId, HISTORY_LIMIT])).rows.reverse();
      for (const m of msgs) if (m.role !== 'system') history.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: ctx.crypto.decrypt(dek, userId, 'message', m.text_enc) });
    }
    if (opening) {
      history.push({ role: 'assistant', content: opening });
      if (persist) await tx.query(`INSERT INTO messages (user_id, conversation_id, role, text_enc) VALUES ($1,$2,'ai',$3)`, [userId, conversationId, ctx.crypto.encrypt(dek, userId, 'message', opening)]);
    }

    const s: LiveSession = {
      conversationId, userId, mode: conv.mode, language: u.language, nickname: u.nickname, timezone: u.timezone,
      companion: { name: companion.name, look: companion.look, voice: companion.voice },
      remember: consent.remember, persist, hasSafetyPlan: hasPlan,
      trustedFirst: trusted ? trusted.name.split(' ')[0] : null, trustedName: trusted?.name ?? null,
      opening, priorSummary, history,
      risk: { ...initialRisk, level: conv.risk_max as RiskLevel, max: conv.risk_max as RiskLevel },
      silences: 0, abort: null, startedAt: Date.now(), lastSeen: Date.now(), sentenceIndex: 0, firstRun: conv.first_run,
    };
    live.set(conversationId, s);
    return s;
  });
}

// ------------------------------------------------------------------------------------------ persistence
async function persistMessage(ctx: Ctx, s: LiveSession, role: 'user' | 'ai', text: string, level: RiskLevel): Promise<string | null> {
  if (!s.persist) return null;
  return withUser(ctx.db, s.userId, async tx => {
    const dek = await getDek(ctx, s.userId, tx);
    const r = await tx.query<{ id: string }>('INSERT INTO messages (user_id, conversation_id, role, text_enc, risk_level) VALUES ($1,$2,$3,$4,$5) RETURNING id', [s.userId, s.conversationId, role, ctx.crypto.encrypt(dek, s.userId, 'message', text), level]);
    if (level > 0) await tx.query('UPDATE conversations SET risk_max = GREATEST(risk_max, $2) WHERE id = $1', [s.conversationId, level]);
    return r.rows[0].id;
  });
}

async function bumpRisk(ctx: Ctx, s: LiveSession, level: RiskLevel) {
  s.risk = nextRisk(s.risk, level);
  if (level > 0) {
    await withUser(ctx.db, s.userId, tx => tx.query('UPDATE conversations SET risk_max = GREATEST(risk_max, $2) WHERE id = $1', [s.conversationId, level]));
  }
}

const push = (s: LiveSession, m: LlmMessage) => { s.history.push(m); if (s.history.length > HISTORY_LIMIT) s.history.splice(0, s.history.length - HISTORY_LIMIT); };

// ------------------------------------------------------------------------------------------ context
async function turnContext(ctx: Ctx, s: LiveSession, text: string) {
  const lastAi = [...s.history].reverse().find(m => m.role === 'assistant')?.content ?? '';
  const [memories, plan, mood] = await Promise.all([
    s.remember ? retrieveMemories(ctx, s.userId, `${text} ${lastAi}`) : Promise.resolve([] as string[]),
    withUser(ctx.db, s.userId, async tx => {
      const dek = await getDek(ctx, s.userId, tx);
      return (await tx.query<{ label_enc: Buffer }>('SELECT label_enc FROM plan_items WHERE day = (now() AT TIME ZONE $1)::date ORDER BY created_at LIMIT 5', [s.timezone])).rows.map(r => ctx.crypto.decrypt(dek, s.userId, 'plan', r.label_enc));
    }),
    withUser(ctx.db, s.userId, async tx => {
      const r = (await tx.query<{ avg: string | null; n: number }>(`SELECT avg(value)::numeric(3,1) AS avg, count(*)::int AS n FROM mood_logs WHERE day >= current_date - 7`)).rows[0];
      if (!r.n || r.avg === null) return 'unknown';
      const a = Number(r.avg);
      return a < 1.5 ? 'heavier lately' : a < 2.7 ? 'somewhere in between' : 'lighter lately';
    }),
  ]);
  return { memories, plan, mood };
}

const localTime = (tz: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(new Date());

function buildRequest(ctx: Ctx, s: LiveSession, c: Awaited<ReturnType<typeof turnContext>>, userText: string, level: 0 | 1 | 2, strict = false) {
  const messages: LlmMessage[] = [...s.history.map(m => (m.role === 'user' ? { role: m.role, content: wrapUser(m.content) } : m)), { role: 'user', content: wrapUser(userText) }];
  return {
    model: ctx.rt.model('companion'),
    system: {
      stable: stableSystem({ companionName: s.companion.name, nickname: s.nickname, language: s.language, voice: s.companion.voice }),
      dynamic: dynamicSystem({ mode: s.mode, localTime: localTime(s.timezone), planItems: c.plan, moodTrend: c.mood, memories: c.memories, hasSafetyPlan: s.hasSafetyPlan, trustedFirstName: s.trustedFirst, riskLevel: level, priorSummary: s.priorSummary, openingHookSpoken: s.opening, strict, firstRun: s.firstRun && s.history.length === 0 }),
    },
    messages,
    maxTokens: s.mode === 'text' ? 400 : 260,
    userId: s.userId,
    effort: 'low' as const,
  };
}

// ------------------------------------------------------------------------------------------ the turn
const VALID_EMOTIONS = new Set(['idle', 'listening', 'thinking', 'concerned', 'smiling']);

export async function handleTurn(ctx: Ctx, s: LiveSession, text: string, emit: Emit, clientId?: string): Promise<void> {
  s.lastSeen = Date.now();
  s.abort?.abort();
  const ac = (s.abort = new AbortController());
  const { signal } = ac;
  const pre = prefilter(text);

  // Under 18, said mid-conversation (PRD 10): be kind, pause the account, show youth resources.
  if (pre.minor) {
    const { pauseAsMinor } = await import('./users.js');
    await pauseAsMinor(ctx, s.userId);
    await logSafetyEvent(ctx, s.userId, pre.level, s.mode, 'prefilter');
    emit({ type: 'ack', clientId, riskLevel: pre.level });
    emit({ type: 'minor' });
    return;
  }

  // Level 3 by pre-filter: no model call at all. The reviewed script replaces the AI turn.
  if (pre.level === 3) return crisis(ctx, s, text, emit, clientId, 'prefilter');

  emit({ type: 'thinking' });
  // The request builder adds this user turn itself; it joins s.history after the reply.
  const userMsgP = persistMessage(ctx, s, 'user', text, pre.level).catch(e => ctx.log.error({ err: (e as Error).message }, 'persist user message failed'));

  const c = await turnContext(ctx, s, text);
  const classifier = classifyWithModel(ctx, s.userId, text, s.history).then(m => (m === null ? pre.level : (Math.max(pre.level, m) as RiskLevel)));
  const strictFromStart = pre.level >= 2 || s.risk.level >= 2;

  let finalLevel: RiskLevel = pre.level;
  let sentences: string[] = [];
  let emotion: Emotion | undefined;

  try {
    if (strictFromStart) {
      finalLevel = await classifier;
      if (finalLevel === 3) { await userMsgP; return crisis(ctx, s, text, emit, clientId, 'classifier', true); }
      emit({ type: 'ack', clientId, riskLevel: finalLevel });
      sentences = await strictReply(ctx, s, c, text, 2, signal);
      for (const sent of sentences) emit({ type: 'sentence', text: sent, index: s.sentenceIndex++ });
    } else {
      // Normal path: stream sentence by sentence, but release nothing until the classifier has answered.
      const split = new SentenceSplitter();
      let acked = false;
      let first = true;
      const release = async (sent: string): Promise<'ok' | 'stop'> => {
        if (!acked) {
          finalLevel = await classifier;
          acked = true;
          emit({ type: 'ack', clientId, riskLevel: finalLevel });
          if (finalLevel === 3) return 'stop';
          if (finalLevel === 2) return 'stop';
        }
        const v = await reviewDraft(ctx, s.userId, sent, false);
        if (!v.ok) {
          await logSafetyEvent(ctx, s.userId, finalLevel, s.mode, 'output_check');
          return 'stop';
        }
        let t = sent;
        if (first && s.mode === 'video') {
          const e = takeEmotion(t);
          if (e.emotion && VALID_EMOTIONS.has(e.emotion)) emotion = e.emotion as Emotion;
          t = e.rest;
        }
        first = false;
        if (!t) return 'ok';
        sentences.push(t);
        emit({ type: 'sentence', text: t, emotion, index: s.sentenceIndex++ });
        return 'ok';
      };

      let stopped: 'ok' | 'stop' = 'ok';
      // Video replies start with a tag: hold the first fragment until the tag is complete.
      const gen = ctx.llm.stream({ task: 'companion', ...buildRequest(ctx, s, c, text, Math.min(pre.level, 1) as 0 | 1), signal });
      let pendingTag = s.mode === 'video' ? '' : null;
      outer: for await (const delta of gen) {
        let d = delta;
        if (pendingTag !== null) {
          pendingTag += d;
          if (!/<emotion>[^<]*<\/emotion>/.test(pendingTag) && pendingTag.length < 40 && /^\s*</.test(pendingTag)) continue;
          d = pendingTag;
          pendingTag = null;
        }
        for (const sent of split.push(d)) { stopped = await release(sent); if (stopped === 'stop') break outer; }
      }
      if (stopped === 'ok') for (const sent of split.end()) { stopped = await release(sent); if (stopped === 'stop') break; }
      if (!acked) { finalLevel = await classifier; emit({ type: 'ack', clientId, riskLevel: finalLevel }); }

      if (finalLevel === 3) { ac.abort(); await userMsgP; return crisis(ctx, s, text, emit, clientId, 'classifier', true); }
      if (stopped === 'stop') {
        ac.abort();
        // Either the classifier raised the level (regenerate with the safety block) or a sentence failed the check.
        if (finalLevel >= 2) {
          const again = await strictReply(ctx, s, c, text, 2, new AbortController().signal);
          for (const sent of again) { sentences.push(sent); emit({ type: 'sentence', text: sent, index: s.sentenceIndex++ }); }
        } else {
          sentences.push(SAFE_FALLBACK_LINE);
          emit({ type: 'sentence', text: SAFE_FALLBACK_LINE, index: s.sentenceIndex++ });
        }
      }
    }
  } catch (e) {
    if (signal.aborted) return; // barge-in or a newer turn replaced this one
    await userMsgP;
    const failed = e instanceof LlmUnavailable || e instanceof LlmFailure || e instanceof LlmRefusal;
    if (!failed) throw e;
    ctx.log.warn({ err: (e as Error).message }, 'companion generation failed');
    // At elevated risk the user must never be left with silence: the fixed line goes out. Otherwise report the outage.
    if (strictFromStart) {
      await bumpRisk(ctx, s, pre.level);
      emit({ type: 'sentence', text: SAFE_FALLBACK_LINE, index: s.sentenceIndex++ });
      emit({ type: 'care_card' });
      emit({ type: 'done', messageId: null, riskLevel: pre.level, text: SAFE_FALLBACK_LINE });
      return;
    }
    emit({ type: 'error', code: e instanceof LlmUnavailable ? 'llm_unavailable' : 'llm_failed', message: 'I couldn’t find my words just then. Try again in a moment.' });
    return;
  }

  await userMsgP;
  const reply = sentences.join(' ').trim();
  push(s, { role: 'user', content: text });
  push(s, { role: 'assistant', content: reply });
  await bumpRisk(ctx, s, finalLevel);
  if (finalLevel >= 1) await logSafetyEvent(ctx, s.userId, finalLevel, s.mode, 'classifier');
  const messageId = await persistMessage(ctx, s, 'ai', reply, finalLevel).catch(() => null);
  if (finalLevel >= 2) emit({ type: 'care_card' });
  emit({ type: 'done', messageId, riskLevel: finalLevel, text: reply });
}

/** Buffered generation with the output check on the whole draft. Regenerates once, then the fixed fallback. */
async function strictReply(ctx: Ctx, s: LiveSession, c: Awaited<ReturnType<typeof turnContext>>, text: string, level: 2, signal: AbortSignal): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = (await ctx.llm.text({ task: 'companion', ...buildRequest(ctx, s, c, text, level, attempt > 0), signal })).replace(/<emotion>[^<]*<\/emotion>\s*/g, '').trim();
    const verdict = await reviewDraft(ctx, s.userId, draft, true);
    if (verdict.ok && draft) return splitForEmit(draft);
    await logSafetyEvent(ctx, s.userId, level, s.mode, 'output_check');
  }
  return [SAFE_FALLBACK_LINE];
}

const splitForEmit = (t: string) => { const sp = new SentenceSplitter(); return [...sp.push(t + ' '), ...sp.end()]; };

async function crisis(ctx: Ctx, s: LiveSession, text: string, emit: Emit, clientId: string | undefined, source: 'prefilter' | 'classifier', userAlreadySaved = false) {
  const script = level3Script(s.trustedName);
  if (!userAlreadySaved) await persistMessage(ctx, s, 'user', text, 3).catch(() => null);
  await bumpRisk(ctx, s, 3);
  await logSafetyEvent(ctx, s.userId, 3, s.mode, source);
  push(s, { role: 'user', content: text });
  push(s, { role: 'assistant', content: script });
  const messageId = await persistMessage(ctx, s, 'ai', script, 3).catch(() => null);
  emit({ type: 'ack', clientId, riskLevel: 3 });
  emit({ type: 'crisis', script });
  emit({ type: 'done', messageId, riskLevel: 3, text: script });
}

/**
 * The companion speaks first on a first conversation, a check-in, or a walk (PRD 8.3.1, 8.3.4, 8.4). Nothing from
 * the user is involved, so there is no safety classification of input; the output still goes through the rule check.
 */
export function needsOpening(s: LiveSession): boolean {
  return s.history.length === 0 && !s.opening && (s.firstRun || s.mode === 'checkin' || s.mode === 'walk');
}

export async function handleOpening(ctx: Ctx, s: LiveSession, emit: Emit): Promise<void> {
  const cue = s.firstRun ? '(This is the first conversation.)' : s.mode === 'checkin' ? '(Begin the check-in now.)' : '(The walk has just started.)';
  const fixed = `Hi ${s.nickname || 'there'}. I’m ${s.companion.name}, an AI companion. I’m glad you’re here. What kind of day has it been?`;
  const ac = (s.abort = new AbortController());
  const out: string[] = [];
  try {
    const c = await turnContext(ctx, s, '');
    emit({ type: 'thinking' });
    const split = new SentenceSplitter();
    let first = true;
    let emotion: Emotion | undefined;
    const say = async (raw: string): Promise<boolean> => {
      let t = raw;
      if (first && s.mode === 'video') { const e = takeEmotion(t); if (e.emotion && VALID_EMOTIONS.has(e.emotion)) emotion = e.emotion as Emotion; t = e.rest; }
      first = false;
      if (!t) return true;
      if (!(await reviewDraft(ctx, s.userId, t, false)).ok) return false;
      out.push(t);
      emit({ type: 'sentence', text: t, emotion, index: s.sentenceIndex++ });
      return true;
    };
    let ok = true;
    for await (const d of ctx.llm.stream({ task: 'companion', ...buildRequest(ctx, s, c, cue, 0), signal: ac.signal })) {
      for (const sent of split.push(d)) { if (!(ok = await say(sent))) break; }
      if (!ok) break;
    }
    if (ok) for (const sent of split.end()) { if (!(ok = await say(sent))) break; }
    if (!ok && !out.length) { out.push(fixed); emit({ type: 'sentence', text: fixed, index: s.sentenceIndex++ }); }
  } catch (e) {
    if (ac.signal.aborted) return;
    ctx.log.warn({ err: (e as Error).message }, 'opening failed');
    if (!out.length) { out.push(fixed); emit({ type: 'sentence', text: fixed, index: s.sentenceIndex++ }); }
  }
  const reply = out.join(' ');
  push(s, { role: 'assistant', content: reply });
  const messageId = await persistMessage(ctx, s, 'ai', reply, 0).catch(() => null);
  emit({ type: 'done', messageId, riskLevel: 0, text: reply });
}

/** Sit mode: the companion speaks only after a long quiet, at most three times (PRD 6.2). */
export async function handleSilence(ctx: Ctx, s: LiveSession, seconds: number, emit: Emit): Promise<void> {
  if (s.mode !== 'sit' || s.silences >= 3 || seconds < 150) return;
  s.silences++;
  s.lastSeen = Date.now();
  try {
    const c = await turnContext(ctx, s, '');
    const line = (await ctx.llm.text({ task: 'sit', ...buildRequest(ctx, s, c, '(A few minutes of quiet have passed. Say one very short, soft line, or nothing.)', 0) })).trim();
    const v = await reviewDraft(ctx, s.userId, line, false);
    if (!line || !v.ok || line.length > 140) return;
    emit({ type: 'sentence', text: line, index: s.sentenceIndex++ });
    emit({ type: 'done', messageId: null, riskLevel: 0, text: line });
  } catch (e) {
    ctx.log.warn({ err: (e as Error).message }, 'silence line skipped');
  }
}

// ------------------------------------------------------------------------------------------ end
const SummarySchema = z.object({ summary: z.string().max(400) });
const SUMMARY_JSON = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };
const MemSchema = z.object({ memories: z.array(z.object({ theme: z.enum(['People', 'Work and study', 'Sleep', 'What helps', 'Feelings', 'Plans']), text: z.string().max(160), sensitive: z.boolean() })).max(3) });
const MEM_JSON = { type: 'object', properties: { memories: { type: 'array', maxItems: 3, items: { type: 'object', properties: { theme: { type: 'string', enum: ['People', 'Work and study', 'Sleep', 'What helps', 'Feelings', 'Plans'] }, text: { type: 'string' }, sensitive: { type: 'boolean' } }, required: ['theme', 'text', 'sensitive'], additionalProperties: false } } }, required: ['memories'], additionalProperties: false };
const CheckinSchema = z.object({ sleep: z.string(), food: z.string(), people: z.string(), okayThing: z.string(), mood: z.number().int().min(0).max(4).nullable(), intentions: z.array(z.string()).max(2) });
const CHECKIN_JSON = { type: 'object', properties: { sleep: { type: 'string' }, food: { type: 'string' }, people: { type: 'string' }, okayThing: { type: 'string' }, mood: { type: ['integer', 'null'], minimum: 0, maximum: 4 }, intentions: { type: 'array', maxItems: 2, items: { type: 'string' } } }, required: ['sleep', 'food', 'people', 'okayThing', 'mood', 'intentions'], additionalProperties: false };

async function loadHistory(ctx: Ctx, tx: Tx, userId: string, conversationId: string): Promise<LlmMessage[]> {
  const dek = await getDek(ctx, userId, tx);
  const rows = (await tx.query<{ role: string; text_enc: Buffer }>('SELECT role, text_enc FROM messages WHERE conversation_id = $1 AND role <> $2 ORDER BY created_at DESC LIMIT 60', [conversationId, 'system'])).rows.reverse();
  return rows.map(m => ({ role: m.role === 'ai' ? 'assistant' as const : 'user' as const, content: ctx.crypto.decrypt(dek, userId, 'message', m.text_enc) }));
}

const transcript = (h: LlmMessage[]) => h.map(m => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content}`).join('\n');

export async function endConversation(ctx: Ctx, userId: string, conversationId: string, feeling?: 'better' | 'same' | 'worse'): Promise<z.infer<typeof EndConversationResponse> | { summary: string; proposedMemories: ProposedMemory[]; checkinResult: CheckinResult | null }> {
  const sess = live.get(conversationId);
  if (sess && sess.userId !== userId) throw notFound('That conversation');
  sess?.abort?.abort();

  const meta = await withUser(ctx.db, userId, async tx => {
    const conv = (await tx.query<{ mode: ConversationMode; ended_at: Date | null; started_at: Date }>('SELECT mode, ended_at, started_at FROM conversations WHERE id = $1', [conversationId])).rows[0];
    if (!conv) throw notFound('That conversation');
    const consent = (await tx.query('SELECT remember FROM consents WHERE user_id = $1', [userId])).rows[0];
    const priv = (await tx.query('SELECT transcript_retention_days FROM privacy_settings WHERE user_id = $1', [userId])).rows[0];
    const history = sess?.history.length ? sess.history : await loadHistory(ctx, tx, userId, conversationId);
    return { conv, remember: consent.remember as boolean, retention: priv.transcript_retention_days as number, history };
  });

  const userTurns = meta.history.filter(m => m.role === 'user').length;
  let summary = '';
  let proposed: ProposedMemory[] = [];
  let checkin: CheckinResult | null = null;

  if (userTurns > 0 && ctx.llm.configured && !meta.conv.ended_at) {
    const text = transcript(meta.history);
    const base = { model: ctx.rt.model('analysis'), userId, maxTokens: 600, effort: 'low' as const };
    const [s1, m1, c1] = await Promise.allSettled([
      ctx.llm.json({ ...base, task: 'summary', system: { stable: summarySystem() }, messages: [{ role: 'user', content: `Conversation:\n${text}` }], schemaName: 'summary', jsonSchema: SUMMARY_JSON, parse: v => SummarySchema.parse(v) }),
      meta.remember
        ? ctx.llm.json({ ...base, task: 'memories', system: { stable: memoryProposalSystem() }, messages: [{ role: 'user', content: `Conversation:\n${text}` }], schemaName: 'memories', jsonSchema: MEM_JSON, parse: v => MemSchema.parse(v) })
        : Promise.resolve({ memories: [] }),
      meta.conv.mode === 'checkin'
        ? ctx.llm.json({ ...base, task: 'checkin', system: { stable: checkinExtractSystem() }, messages: [{ role: 'user', content: `Check-in conversation:\n${text}` }], schemaName: 'checkin', jsonSchema: CHECKIN_JSON, parse: v => CheckinSchema.parse(v) })
        : Promise.resolve(null),
    ]);
    if (s1.status === 'fulfilled') summary = s1.value.summary;
    if (m1.status === 'fulfilled') proposed = m1.value.memories.map(m => ({ ...m, text: m.text.slice(0, 120) }));
    if (c1.status === 'fulfilled') checkin = c1.value;
  }

  await withUser(ctx.db, userId, async tx => {
    if (!meta.conv.ended_at) {
      const dek = await getDek(ctx, userId, tx);
      await tx.query('UPDATE conversations SET ended_at = now(), summary_enc = $2, feeling = $3 WHERE id = $1', [conversationId, summary && meta.retention > 0 ? ctx.crypto.encrypt(dek, userId, 'summary', summary) : null, feeling ?? null]);
      // A walk is a win whatever was said on it (PRD 8.4).
      if (meta.conv.mode === 'walk') await tx.query(`INSERT INTO wins (user_id, kind, label_enc, source_id) VALUES ($1,'walk',$2,$3) ON CONFLICT DO NOTHING`, [userId, ctx.crypto.encrypt(dek, userId, 'win', 'Went for a walk'), conversationId]);
      if (['voice', 'video', 'walk'].includes(meta.conv.mode)) {
        const secs = Math.max(0, Math.round((Date.now() - meta.conv.started_at.getTime()) / 1000));
        await tx.query(`INSERT INTO usage_daily (user_id, day, voice_seconds, turns) VALUES ($1, current_date, $2, $3)
                        ON CONFLICT (user_id, day) DO UPDATE SET voice_seconds = usage_daily.voice_seconds + EXCLUDED.voice_seconds, turns = usage_daily.turns + EXCLUDED.turns`, [userId, secs, userTurns]);
      }
      if (checkin) {
        if (checkin.mood !== null) await tx.query(`INSERT INTO mood_logs (user_id, day, value, source) VALUES ($1, (now() AT TIME ZONE (SELECT timezone FROM users WHERE id=$1))::date, $2, 'checkin') ON CONFLICT (user_id, day) DO UPDATE SET value = EXCLUDED.value, source = 'checkin', updated_at = now()`, [userId, checkin.mood]);
        await tx.query(`INSERT INTO wins (user_id, kind, label_enc) VALUES ($1,'checkin',$2)`, [userId, ctx.crypto.encrypt(dek, userId, 'win', 'Checked in')]);
      }
    }
  });
  live.delete(conversationId);
  return { summary, proposedMemories: proposed, checkinResult: checkin };
}

// ------------------------------------------------------------------------------------------ lists
export async function listConversations(ctx: Ctx, userId: string, limit: number): Promise<ConversationItem[]> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const { rows } = await tx.query('SELECT id, mode, started_at, ended_at, summary_enc FROM conversations WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT $1', [limit]);
    return rows.map(r => ({ id: r.id, mode: r.mode, startedAt: r.started_at.toISOString(), endedAt: r.ended_at?.toISOString() ?? null, summary: r.summary_enc ? ctx.crypto.decrypt(dek, userId, 'summary', r.summary_enc) : null }));
  });
}

export async function listMessages(ctx: Ctx, userId: string, conversationId: string) {
  return withUser(ctx.db, userId, async tx => {
    const ok = await tx.query('SELECT 1 FROM conversations WHERE id = $1', [conversationId]);
    if (!ok.rowCount) throw notFound('That conversation');
    const dek = await getDek(ctx, userId, tx);
    const { rows } = await tx.query('SELECT id, role, text_enc, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at', [conversationId]);
    return rows.map(r => ({ id: r.id, role: r.role as 'user' | 'ai' | 'system', text: ctx.crypto.decrypt(dek, userId, 'message', r.text_enc), createdAt: r.created_at.toISOString() }));
  });
}
