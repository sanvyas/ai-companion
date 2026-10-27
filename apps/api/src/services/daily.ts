import { z } from 'zod';
import type { Insights, NotificationPrefs, PlanItem, SafetyPlan } from '@saathi/contracts';
import { buildRhythms } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { withSystem, withUser, type Tx } from '../db/pool.js';
import { notFound } from '../errors.js';
import { planSystem } from './prompts.js';
import { audit } from './audit.js';
import { generateSafe } from './guard.js';
import { retrieveMemories } from './memory.js';
import { localDay } from './time.js';
import { getDek } from './users.js';

// ------------------------------------------------------------------------------------------ mood
export async function logMood(ctx: Ctx, userId: string, value: number, source: 'tap' | 'checkin' | 'journal') {
  await withUser(ctx.db, userId, async tx => {
    const day = await localDay(tx, userId);
    await tx.query(`INSERT INTO mood_logs (user_id, day, value, source) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, day) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now()`, [userId, day, value, source]);
  });
}

// ------------------------------------------------------------------------------------------ plan
const DEFAULT_ITEMS = ['A glass of water', 'Two minutes by the window', 'Message someone you like'];
const PlanSchema = z.object({ items: z.array(z.string().max(60)).min(1).max(3) });
const PLAN_JSON = { type: 'object', properties: { items: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } } }, required: ['items'], additionalProperties: false };

async function planRows(ctx: Ctx, tx: Tx, userId: string, day: string): Promise<PlanItem[]> {
  const dek = await getDek(ctx, userId, tx);
  const { rows } = await tx.query('SELECT id, label_enc, done, source FROM plan_items WHERE day = $1 ORDER BY created_at, id', [day]);
  return rows.map(r => ({ id: r.id, label: ctx.crypto.decrypt(dek, userId, 'plan', r.label_enc), done: r.done, source: r.source }));
}

/**
 * Today's gentle plan. On first open of a day: yesterday's unfinished items carry over (fade forward, never shown
 * as failures), and if there is nothing yet the model suggests three tiny ones (PRD 6.6). The model being down
 * falls back to fixed kind defaults rather than an empty page.
 */
export async function getPlanToday(ctx: Ctx, userId: string): Promise<PlanItem[]> {
  const day = await withUser(ctx.db, userId, tx => localDay(tx, userId));
  const existing = await withUser(ctx.db, userId, tx => planRows(ctx, tx, userId, day));
  if (existing.length) return existing;

  // Gather suggestion inputs outside the write transaction (the model call can take a second).
  let suggestions: string[] | null = null;
  if (ctx.llm.configured) {
    try {
      const mem = await retrieveMemories(ctx, userId, 'plan for today small steps', 3);
      const mood = await withUser(ctx.db, userId, async tx => {
        const r = (await tx.query<{ avg: string | null; n: number }>(`SELECT avg(value)::numeric(3,1) AS avg, count(*)::int AS n FROM mood_logs WHERE day >= current_date - 3`)).rows[0];
        if (!r.n || r.avg === null) return 'unknown';
        return Number(r.avg) < 1.5 ? 'heavier' : Number(r.avg) < 2.7 ? 'in between' : 'lighter';
      });
      const safe = await generateSafe(ctx, {
        label: 'plan',
        run: hint => ctx.llm.json({
          task: 'plan', model: ctx.rt.model('companion'), userId, maxTokens: 200, effort: 'low',
          system: { stable: planSystem() }, messages: [{ role: 'user', content: `Mood: ${mood}\nThings they have told me: ${mem.join(' | ') || 'nothing yet'}${hint ? `\n\n${hint}` : ''}` }],
          schemaName: 'plan', jsonSchema: PLAN_JSON, parse: v => PlanSchema.parse(v),
        }),
        texts: v => v.items,
        fallback: () => ({ items: DEFAULT_ITEMS }),
      });
      suggestions = safe.value.items;
    } catch (e) { ctx.log.warn({ err: (e as Error).message }, 'plan suggestions unavailable, using defaults'); }
  }

  return withUser(ctx.db, userId, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan:${userId}:${day}`]);
    const again = await planRows(ctx, tx, userId, day);
    if (again.length) return again; // a concurrent first open already filled it
    const dek = await getDek(ctx, userId, tx);
    const prevDay = await localDay(tx, userId, -1);
    const carried = (await tx.query<{ label_enc: Buffer; source: string }>('SELECT label_enc, source FROM plan_items WHERE day = $1 AND NOT done ORDER BY created_at LIMIT 3', [prevDay])).rows;
    for (const c of carried) await tx.query('INSERT INTO plan_items (user_id, day, label_enc, source) VALUES ($1,$2,$3,$4)', [userId, day, c.label_enc, c.source]);
    for (const label of carried.length ? [] : (suggestions ?? DEFAULT_ITEMS).slice(0, 3)) {
      await tx.query(`INSERT INTO plan_items (user_id, day, label_enc, source) VALUES ($1,$2,$3,$4)`, [userId, day, ctx.crypto.encrypt(dek, userId, 'plan', label), 'ai']);
    }
    return planRows(ctx, tx, userId, day);
  });
}

export async function addPlanItem(ctx: Ctx, userId: string, label: string, source: 'user' | 'journal' | 'checkin'): Promise<PlanItem> {
  return withUser(ctx.db, userId, async tx => {
    const day = await localDay(tx, userId);
    const dek = await getDek(ctx, userId, tx);
    const r = (await tx.query('INSERT INTO plan_items (user_id, day, label_enc, source) VALUES ($1,$2,$3,$4) RETURNING id, done, source', [userId, day, ctx.crypto.encrypt(dek, userId, 'plan', label), source])).rows[0];
    return { id: r.id, label, done: r.done, source: r.source };
  });
}

export async function setPlanDone(ctx: Ctx, userId: string, id: string, done: boolean): Promise<PlanItem> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const r = (await tx.query('UPDATE plan_items SET done = $2 WHERE id = $1 RETURNING id, label_enc, done, source', [id, done])).rows[0];
    if (!r) throw notFound('That plan item');
    const label = ctx.crypto.decrypt(dek, userId, 'plan', r.label_enc);
    // "That counts." A completed item becomes a win, once.
    if (done) await tx.query(`INSERT INTO wins (user_id, kind, label_enc, source_id) VALUES ($1,'plan',$2,$3) ON CONFLICT DO NOTHING`, [userId, ctx.crypto.encrypt(dek, userId, 'win', label), id]);
    return { id: r.id, label, done: r.done, source: r.source };
  });
}

// ------------------------------------------------------------------------------------------ insights
export async function getInsights(ctx: Ctx, userId: string, weeks: number): Promise<Insights> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const since = await localDay(tx, userId, -7 * weeks);
    const moods = (await tx.query<{ day: string; value: number }>('SELECT day::text AS day, value FROM mood_logs WHERE day >= $1 ORDER BY day', [since])).rows;
    const winRows = (await tx.query<{ id: string; kind: string; label_enc: Buffer; created_at: Date; day: string }>(
      `SELECT w.id, w.kind, w.label_enc, w.created_at, (w.created_at AT TIME ZONE u.timezone)::date::text AS day FROM wins w JOIN users u ON u.id = w.user_id WHERE w.created_at >= now() - ($1::int * interval '7 days') ORDER BY w.created_at DESC`, [weeks])).rows;
    return {
      moodSeries: moods.map(m => ({ day: m.day, value: m.value })),
      rhythms: moods.length >= 3 ? buildRhythms(moods, winRows.map(w => ({ day: w.day, kind: w.kind }))) : [],
      wins: winRows.slice(0, 12).map(w => ({ id: w.id, kind: w.kind, label: ctx.crypto.decrypt(dek, userId, 'win', w.label_enc), createdAt: w.created_at.toISOString() })),
      daysOfData: moods.length,
    };
  });
}

export async function addWin(ctx: Ctx, userId: string, kind: 'walk' | 'event' | 'plan' | 'calm' | 'checkin' | 'other', label: string, sourceId?: string, tx?: Tx) {
  const run = async (t: Tx) => {
    const dek = await getDek(ctx, userId, t);
    await t.query('INSERT INTO wins (user_id, kind, label_enc, source_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [userId, kind, ctx.crypto.encrypt(dek, userId, 'win', label), sourceId ?? null]);
  };
  return tx ? run(tx) : withUser(ctx.db, userId, run);
}

// ------------------------------------------------------------------------------------------ safety plan
export async function getSafetyPlan(ctx: Ctx, userId: string): Promise<SafetyPlan | null> {
  return withUser(ctx.db, userId, async tx => {
    const r = (await tx.query<{ data_enc: Buffer }>('SELECT data_enc FROM safety_plans WHERE user_id = $1', [userId])).rows[0];
    return r ? ctx.crypto.decryptJson<SafetyPlan>(await getDek(ctx, userId, tx), userId, 'safety_plan', r.data_enc) : null;
  });
}

export async function putSafetyPlan(ctx: Ctx, userId: string, plan: SafetyPlan): Promise<void> {
  await withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    await tx.query('INSERT INTO safety_plans (user_id, data_enc) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET data_enc = EXCLUDED.data_enc, updated_at = now()', [userId, ctx.crypto.encryptJson(dek, userId, 'safety_plan', plan)]);
    await audit(tx, userId, 'safety_plan.update', null, { sections: Object.keys(plan) });
  });
}

// ------------------------------------------------------------------------------------------ notification prefs
const toPrefs = (r: Record<string, unknown>): NotificationPrefs => ({
  quietCards: r.quiet_cards as boolean, push: r.push as boolean, calls: r.calls as boolean, sundayLetter: r.sunday_letter as boolean,
  checkinTime: r.checkin_time as NotificationPrefs['checkinTime'],
  quietHours: { start: String(r.quiet_start).slice(0, 5), end: String(r.quiet_end).slice(0, 5) },
  followUpAfterHardDay: r.follow_up_after_hard_day as boolean,
});

export async function getPrefs(ctx: Ctx, userId: string): Promise<NotificationPrefs> {
  return withUser(ctx.db, userId, async tx => toPrefs((await tx.query('SELECT * FROM notification_prefs WHERE user_id = $1', [userId])).rows[0]));
}

export async function updatePrefs(ctx: Ctx, userId: string, b: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  return withUser(ctx.db, userId, async tx => {
    const before = toPrefs((await tx.query('SELECT * FROM notification_prefs WHERE user_id = $1', [userId])).rows[0]);
    const map: [keyof NotificationPrefs, string, unknown][] = [
      ['quietCards', 'quiet_cards', b.quietCards], ['push', 'push', b.push], ['calls', 'calls', b.calls], ['sundayLetter', 'sunday_letter', b.sundayLetter],
      ['checkinTime', 'checkin_time', b.checkinTime], ['followUpAfterHardDay', 'follow_up_after_hard_day', b.followUpAfterHardDay],
    ];
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    for (const [, col, v] of map) if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); }
    if (b.quietHours) { vals.push(b.quietHours.start); sets.push(`quiet_start = $${vals.length}`); vals.push(b.quietHours.end); sets.push(`quiet_end = $${vals.length}`); }
    vals.push(userId);
    await tx.query(`UPDATE notification_prefs SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
    const after = toPrefs((await tx.query('SELECT * FROM notification_prefs WHERE user_id = $1', [userId])).rows[0]);
    await audit(tx, userId, 'notification_prefs.update', before, after);
    return after;
  });
}

export async function queueJob(ctx: Ctx, job: { kind: string; dedupeKey: string; userId: string; runAt: Date; payload?: unknown }) {
  await withSystem(ctx.db, tx =>
    tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING`, [job.kind, job.dedupeKey, job.userId, job.runAt, JSON.stringify(job.payload ?? {})]));
}
