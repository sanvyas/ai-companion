import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CalmSessionBody, CalmSessionPatch, StoryBody, JournalCommitBody, JournalCreateBody, JournalPatchBody, MemoryBulkBody, MemoryPatch, MoodBody, PlanCreateBody, PlanPatchBody, SafetyAckBody, SafetyPlan, Plan } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { AppError } from '../errors.js';
import { parse, uid } from '../http.js';
import { assertAdult } from '../services/users.js';
import { addMemories, deleteMemory, forgetEverything, listMemories, patchMemory } from '../services/memory.js';
import { analyzeEntry, commitEntry, createEntry, deleteEntry, discardAnalysis, listEntries, setShared } from '../services/journal.js';
import { addPlanItem, getInsights, getPlanToday, getSafetyPlan, logMood, putSafetyPlan, queueJob, setPlanDone } from '../services/daily.js';
import { HOBBIES, getCalmItem, getEvent, listCalm, listEvents, markInterest, progressCalm, startCalm } from '../services/catalogue.js';
import { logSafetyEvent } from '../services/safety.js';
import { makeStory } from '../services/story.js';
import { getDek } from '../services/users.js';
import { withIdempotency } from '../services/idempotency.js';
import { getPrefs } from '../services/daily.js';

const Id = z.object({ id: z.string().uuid() });
const idOf = (req: { params: unknown }) => parse(Id, req.params).id;

export function dataRoutes(app: FastifyInstance, ctx: Ctx) {
  // Every route below needs a signed-in adult. Safety plan, helplines and acknowledgements stay open to paused accounts.
  const auth = { preHandler: app.auth };
  const adult = { preHandler: [app.auth, async (req: { userId?: string }) => assertAdult(ctx, uid(req as never))] };

  // ---- memory -------------------------------------------------------------------------------------------
  app.get('/memories', adult, async req => ({ items: await listMemories(ctx, uid(req)) }));
  app.patch('/memories/:id', adult, async req => patchMemory(ctx, uid(req), idOf(req), parse(MemoryPatch, req.body)));
  app.delete('/memories/:id', adult, async (req, reply) => { await deleteMemory(ctx, uid(req), idOf(req)); return reply.code(204).send(); });
  app.delete('/memories', adult, async req => ({ deleted: await forgetEverything(ctx, uid(req)) }));
  app.post('/memories/bulk', adult, async (req, reply) => withIdempotency(ctx, req, reply, async () => {
    const b = parse(MemoryBulkBody, req.body);
    const items = await addMemories(ctx, uid(req), b.items, b.source, b.sourceId);
    if (!items.length) throw new AppError(409, 'remember_off', 'Memories are turned off. Turn on “Remember things from our chats” first.');
    return { status: 201, body: { items } };
  }));

  // ---- journal ------------------------------------------------------------------------------------------
  app.get('/journal', adult, async req => {
    const q = parse(z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
    return listEntries(ctx, uid(req), q.cursor, q.limit);
  });
  app.post('/journal', adult, async (req, reply) => withIdempotency(ctx, req, reply, async () => ({ status: 201, body: await createEntry(ctx, uid(req), parse(JournalCreateBody, req.body)) })));
  app.post('/journal/:id/analyze', adult, async req => analyzeEntry(ctx, uid(req), idOf(req)));
  app.post('/journal/:id/commit', adult, async req => commitEntry(ctx, uid(req), idOf(req), parse(JournalCommitBody, req.body)));
  app.post('/journal/:id/discard', adult, async (req, reply) => { await discardAnalysis(ctx, uid(req), idOf(req)); return reply.code(204).send(); });
  app.patch('/journal/:id', adult, async req => setShared(ctx, uid(req), idOf(req), parse(JournalPatchBody, req.body).shared));
  app.delete('/journal/:id', adult, async (req, reply) => { await deleteEntry(ctx, uid(req), idOf(req)); return reply.code(204).send(); });
  // Short-lived streaming dictation token needs a server STT vendor; until then dictation runs in the browser.
  app.post('/stt/token', adult, async () => { throw new AppError(503, 'stt_unavailable', 'Server dictation isn’t connected. The app uses your browser’s dictation instead.'); });

  // ---- mood, plan, insights, letters --------------------------------------------------------------------
  app.post('/mood', adult, async (req, reply) => { const b = parse(MoodBody, req.body); await logMood(ctx, uid(req), b.value, b.source); return reply.code(204).send(); });
  app.get('/insights', adult, async req => getInsights(ctx, uid(req), parse(z.object({ weeks: z.coerce.number().int().min(1).max(12).default(4) }), req.query).weeks));
  app.get('/plan/today', adult, async req => ({ items: await getPlanToday(ctx, uid(req)) }));
  app.post('/plan', adult, async (req, reply) => withIdempotency(ctx, req, reply, async () => {
    const b = parse(PlanCreateBody, req.body);
    return { status: 201, body: await addPlanItem(ctx, uid(req), b.label, b.source) };
  }));
  app.patch('/plan/:id', adult, async req => setPlanDone(ctx, uid(req), idOf(req), parse(PlanPatchBody, req.body).done));
  app.get('/letters/latest', adult, async (req, reply) => {
    const userId = uid(req);
    const out = await withUser(ctx.db, userId, async tx => {
      const r = (await tx.query('SELECT id, week_start::text AS week_start, body_enc, created_at FROM letters ORDER BY week_start DESC LIMIT 1')).rows[0];
      return r ? { id: r.id, weekStart: r.week_start, body: ctx.crypto.decrypt(await getDek(ctx, userId, tx), userId, 'letter', r.body_enc), createdAt: r.created_at.toISOString() } : null;
    });
    return out ?? reply.code(204).send();
  });

  // ---- safety (open to paused accounts too) ----------------------------------------------------------------
  app.get('/safety-plan', auth, async (req, reply) => (await getSafetyPlan(ctx, uid(req))) ?? reply.code(204).send());
  app.put('/safety-plan', auth, async (req, reply) => { await putSafetyPlan(ctx, uid(req), parse(SafetyPlan, req.body)); return reply.code(204).send(); });
  app.post('/safety/acknowledge', auth, async (req, reply) => {
    const userId = uid(req);
    const b = parse(SafetyAckBody, req.body);
    await logSafetyEvent(ctx, userId, b.level, 'ack', 'user_action', b.action);
    // "I'm safe right now": a gentle follow-up tomorrow, only if the user opted in (PRD 8.10.3).
    if (b.action === 'safe' && (await getPrefs(ctx, userId)).followUpAfterHardDay) {
      const day = new Date().toISOString().slice(0, 10);
      await queueJob(ctx, { kind: 'followup.hard_day', dedupeKey: `followup:${userId}:${day}`, userId, runAt: new Date(Date.now() + 22 * 3600_000) });
    }
    return reply.code(204).send();
  });

  // ---- calm ---------------------------------------------------------------------------------------------
  app.get('/calm/catalogue', auth, async req => {
    const q = parse(z.object({ tab: z.enum(['meditate', 'sleep']).default('meditate'), category: z.string().max(40).optional() }), req.query);
    return { items: await listCalm(ctx, uid(req), q.tab, q.category) };
  });
  app.get('/calm/items/:id', auth, async req => getCalmItem(ctx, uid(req), parse(z.object({ id: z.string().max(64) }), req.params).id));
  // A fresh story costs a model call, so it is rate limited per person; the theme is a fixed list, never free text.
  app.post('/calm/story', { ...adult, config: { rateLimit: { max: 8 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 hour' } } }, async req => makeStory(ctx, uid(req), parse(StoryBody, req.body).theme));
  app.post('/calm/sessions', auth, async (req, reply) => withIdempotency(ctx, req, reply, async () => ({ status: 201, body: await startCalm(ctx, uid(req), parse(CalmSessionBody, req.body)) })));
  app.patch('/calm/sessions/:id', auth, async req => progressCalm(ctx, uid(req), idOf(req), parse(CalmSessionPatch, req.body).completedPct));

  // ---- outside ------------------------------------------------------------------------------------------
  app.get('/outside/events', adult, async req => {
    const q = parse(z.object({ city: z.string().max(60).optional(), from: z.string().datetime().optional() }), req.query);
    return listEvents(ctx, uid(req), q.city, q.from);
  });
  app.get('/outside/events/:id', adult, async req => getEvent(ctx, uid(req), parse(z.object({ id: z.string().max(64) }), req.params).id));
  app.post('/outside/events/:id/interest', adult, async req => markInterest(ctx, uid(req), parse(z.object({ id: z.string().max(64) }), req.params).id));
  app.get('/outside/hobbies', adult, async () => ({ items: HOBBIES }));

  // ---- billing: not connected ---------------------------------------------------------------------------
  const plans = Plan.array().parse([
    { id: 'basic', name: 'Basic', priceInr: 0, features: ['Text chat', 'Limited voice each day', 'Journal and mood', 'Core calm sessions', 'Safety features, always free'] },
    { id: 'plus', name: 'Plus', priceInr: 499, features: ['Unlimited voice and video', 'All calm content and downloads', 'Avatar looks', 'Weekly letter', 'Deeper insights'] },
  ]);
  app.get('/billing/plans', auth, async () => ({ items: plans }));
  app.post('/billing/verify', auth, async () => { throw new AppError(501, 'billing_unavailable', 'Plus isn’t available to start yet.'); });
}

