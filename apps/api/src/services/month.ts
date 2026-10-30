import { addDays, kindsOfDay, monthWeeks, type MonthKind } from '@saathi/domain';
import type { ActivityBodyT, MonthT } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { actDays } from './garden.js';
import { localDay } from './time.js';

// The third design's "Month". What someone did each day comes from the same counts as the garden; only what cannot be known
// otherwise (a friend they called, a game, a day they showed up, whether something helped) is kept, in activity_log.

export async function recordActivity(ctx: Ctx, userId: string, b: ActivityBodyT) {
  await withUser(ctx.db, userId, tx => tx.query('INSERT INTO activity_log (user_id, kind, feeling, helped) VALUES ($1,$2,$3,$4)', [userId, b.kind, b.feeling ?? null, b.helped ?? null]));
}

export async function getMonth(ctx: Ctx, userId: string): Promise<MonthT> {
  return withUser(ctx.db, userId, async tx => {
    const today = await localDay(tx, userId);
    const from = monthWeeks(today)[0].start;
    const [ds, logged, help, me] = await Promise.all([
      actDays(tx, userId),
      tx.query<{ day: string; kind: MonthKind }>(`SELECT DISTINCT (created_at AT TIME ZONE (SELECT timezone FROM users WHERE id = $1))::date::text AS day, kind FROM activity_log WHERE created_at >= ($2::date - 1)::timestamptz`, [userId, from]),
      tx.query<{ feeling: MonthT['help'][number]['feeling']; kind: MonthKind; helped: boolean }>(`SELECT feeling, kind, helped FROM activity_log WHERE feeling IS NOT NULL AND helped IS NOT NULL ORDER BY created_at DESC LIMIT 300`),
      tx.query<{ d: string }>(`SELECT (created_at AT TIME ZONE timezone)::date::text AS d FROM users WHERE id = $1`, [userId]),
    ]);
    const extra = new Map<string, MonthKind[]>();
    for (const r of logged.rows) extra.set(r.day, [...(extra.get(r.day) ?? []), r.kind]);
    const by = new Map(ds.map(d => [d.day, d]));
    const days: MonthT['days'] = [];
    for (let day = from, i = 0; day <= today && i < 60; day = addDays(day, 1), i++) {
      const d = by.get(day);
      const kinds = kindsOfDay(d?.acts ?? {}, extra.get(day) ?? [], d?.mood != null);
      if (kinds.length || d?.mood != null) days.push({ day, kinds, mood: d?.mood ?? null });
    }
    return { today, signedUp: me.rows[0].d, days, help: help.rows.reverse() };
  });
}
