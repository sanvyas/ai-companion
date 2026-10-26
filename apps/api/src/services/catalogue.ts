import type { CalmItem, OutsideEvent } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { notFound } from '../errors.js';
import { addWin, queueJob } from './daily.js';
import { getDek } from './users.js';

const toCalm = (r: Record<string, unknown>): CalmItem => ({
  id: r.id as string, kind: r.kind as CalmItem['kind'], category: r.category as string, title: r.title as string, minutes: r.minutes as number,
  description: r.description as string, tint: r.tint as string, defaultBg: (r.default_bg as string | null) ?? null, hasTranscript: r.lines !== null, audioUrl: (r.audio_url as string | null) ?? null,
});

export async function listCalm(ctx: Ctx, userId: string, tab: 'meditate' | 'sleep', category?: string) {
  return withUser(ctx.db, userId, async tx => {
    const { rows } = await tx.query('SELECT * FROM calm_items WHERE active AND kind = $1 AND ($2::text IS NULL OR $2 = \'All\' OR category = $2) ORDER BY sort', [tab === 'sleep' ? 'sleep' : 'meditation', category ?? null]);
    return rows.map(toCalm);
  });
}

export async function getCalmItem(ctx: Ctx, userId: string, id: string) {
  return withUser(ctx.db, userId, async tx => {
    const r = (await tx.query('SELECT * FROM calm_items WHERE id = $1 AND active', [id])).rows[0];
    if (!r) throw notFound('That session');
    return { ...toCalm(r), lines: (r.lines as string[] | null) ?? null };
  });
}

export async function startCalm(ctx: Ctx, userId: string, b: { itemId: string; bgSound?: string; timerMinutes?: number }) {
  return withUser(ctx.db, userId, async tx => {
    const ok = await tx.query('SELECT 1 FROM calm_items WHERE id = $1 AND active', [b.itemId]);
    if (!ok.rowCount) throw notFound('That session');
    const r = await tx.query<{ id: string }>('INSERT INTO calm_sessions (user_id, item_id, bg_sound, timer_minutes) VALUES ($1,$2,$3,$4) RETURNING id', [userId, b.itemId, b.bgSound ?? null, b.timerMinutes ?? null]);
    return { id: r.rows[0].id };
  });
}

export async function progressCalm(ctx: Ctx, userId: string, id: string, pct: number) {
  return withUser(ctx.db, userId, async tx => {
    const r = (await tx.query<{ item_id: string }>('UPDATE calm_sessions SET completed_pct = GREATEST(completed_pct, $2) WHERE id = $1 RETURNING item_id', [id, pct])).rows[0];
    if (!r) throw notFound('That session');
    // Finishing a session is a win, once per session (PRD 8.6).
    if (pct >= 90) {
      const title = (await tx.query<{ title: string }>('SELECT title FROM calm_items WHERE id = $1', [r.item_id])).rows[0]?.title ?? 'Calm session';
      await addWin(ctx, userId, 'calm', title, id, tx);
    }
    return { ok: true };
  });
}

// ------------------------------------------------------------------------------------------ outside
const toEvent = (r: Record<string, unknown>, interested: boolean): OutsideEvent => ({
  id: r.id as string, city: r.city as string, title: r.title as string, venue: r.venue as string, startsAt: (r.starts_at as Date).toISOString(),
  beginnerFriendly: r.beginner_friendly as boolean, groupSize: (r.group_size as string | null) ?? null, category: r.category as string, price: r.price as string,
  organiser: (r.organiser as string | null) ?? null, details: (r.details as Record<string, unknown>) ?? {}, interested,
});

export async function listEvents(ctx: Ctx, userId: string, city: string | undefined, from: string | undefined) {
  return withUser(ctx.db, userId, async tx => {
    // City comes from the request or, with location consent, the profile. No city means no list: the app asks.
    const profileCity = (await tx.query<{ city: string | null }>('SELECT city FROM users WHERE id = $1', [userId])).rows[0]?.city ?? null;
    const c = city ?? profileCity;
    if (!c) return { city: null as string | null, items: [] as OutsideEvent[] };
    const { rows } = await tx.query(
      `SELECT e.*, EXISTS (SELECT 1 FROM event_interests i WHERE i.event_id = e.id) AS interested
         FROM events e WHERE e.active AND lower(e.city) = lower($1) AND e.starts_at >= COALESCE($2::timestamptz, now()) ORDER BY e.starts_at LIMIT 30`, [c, from ?? null]);
    return { city: c, items: rows.map(r => toEvent(r, r.interested)) };
  });
}

export async function getEvent(ctx: Ctx, userId: string, id: string) {
  return withUser(ctx.db, userId, async tx => {
    const r = (await tx.query('SELECT e.*, EXISTS (SELECT 1 FROM event_interests i WHERE i.event_id = e.id) AS interested FROM events e WHERE e.id = $1 AND e.active', [id])).rows[0];
    if (!r) throw notFound('That event');
    return toEvent(r, r.interested);
  });
}

/** "I'm interested": remember it, put it on Today's plan, and queue the time-to-leave nudge (PRD 8.4, 8.8). */
export async function markInterest(ctx: Ctx, userId: string, id: string) {
  const ev = await withUser(ctx.db, userId, async tx => {
    const r = (await tx.query('SELECT id, title, starts_at FROM events WHERE id = $1 AND active', [id])).rows[0];
    if (!r) throw notFound('That event');
    const fresh = await tx.query('INSERT INTO event_interests (user_id, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, id]);
    if (fresh.rowCount) {
      const dek = await getDek(ctx, userId, tx);
      const day = (await tx.query<{ d: string }>(`SELECT ($1::timestamptz AT TIME ZONE (SELECT timezone FROM users WHERE id=$2))::date::text AS d`, [r.starts_at, userId])).rows[0].d;
      await tx.query(`INSERT INTO plan_items (user_id, day, label_enc, source) VALUES ($1,$2,$3,'user')`, [userId, day, ctx.crypto.encrypt(dek, userId, 'plan', r.title)]);
    }
    return { title: r.title as string, startsAt: r.starts_at as Date };
  });
  await queueJob(ctx, { kind: 'event.leave', dedupeKey: `event.leave:${userId}:${id}`, userId, runAt: new Date(ev.startsAt.getTime() - 40 * 60_000), payload: { eventId: id } });
  return { ok: true };
}

export const HOBBIES = [
  { id: 'sketch', title: 'Sketching', desc: 'A pencil and the view from your window.', tint: '#E6E2F6' },
  { id: 'cook', title: 'Cook one new dish', desc: 'Something your mother makes. Ask her how.', tint: '#FBE3CF' },
  { id: 'guitar', title: 'Guitar basics', desc: 'Three chords, ten minutes.', tint: '#DCEBE6' },
  { id: 'plant', title: 'A small plant', desc: 'Tulsi or mint, on the balcony.', tint: '#CFE3F0' },
];
