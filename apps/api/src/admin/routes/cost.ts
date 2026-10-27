import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { guard, intParam } from './util.js';

// What the platform costs to run, from the usage the app records. Amounts are rupees at the rates entered under
// Pricing when the call happened. Calls with no rate show as "uncosted", never as free.

export function costRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);
  const IST = `AT TIME ZONE 'Asia/Kolkata'`;

  app.get('/cost', guard(ctx, 'cost.read'), async req => {
    const days = intParam((req.query as { days?: string }).days, 30, 1, 180);
    const since = `now() - make_interval(days => ${days})`;
    const [byProvider, byTask, byDay, topUsers, totals, activeUsers, missing] = await Promise.all([
      q(`SELECT provider, count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS failed, COALESCE(sum(units),0)::bigint::float AS units, COALESCE(sum(cost_inr),0)::float AS cost_inr,
                count(*) FILTER (WHERE cost_inr IS NULL AND ok)::int AS uncosted, COALESCE(avg(latency_ms),0)::int AS avg_latency_ms, COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p95_latency_ms
           FROM usage_events WHERE created_at > ${since} GROUP BY provider ORDER BY cost_inr DESC, calls DESC`),
      q(`SELECT kind, count(*)::int AS calls, COALESCE(sum(units),0)::bigint::float AS units, COALESCE(sum(cost_inr),0)::float AS cost_inr FROM usage_events WHERE created_at > ${since} GROUP BY kind ORDER BY cost_inr DESC, calls DESC`),
      q(`WITH d AS (SELECT generate_series((now() ${IST})::date - ${days - 1}, (now() ${IST})::date, interval '1 day')::date AS day)
         SELECT d.day::text AS day, COALESCE((SELECT sum(cost_inr) FROM usage_events e WHERE (e.created_at ${IST})::date = d.day),0)::float AS cost_inr, (SELECT count(*)::int FROM usage_events e WHERE (e.created_at ${IST})::date = d.day) AS calls FROM d ORDER BY d.day`),
      q(`SELECT e.user_id, u.nickname, count(*)::int AS calls, COALESCE(sum(e.units),0)::bigint::float AS units, COALESCE(sum(e.cost_inr),0)::float AS cost_inr
           FROM usage_events e JOIN users u ON u.id = e.user_id WHERE e.created_at > ${since} GROUP BY e.user_id, u.nickname ORDER BY cost_inr DESC, calls DESC LIMIT 10`),
      q(`SELECT COALESCE(sum(cost_inr),0)::float AS cost_inr, count(*)::int AS calls, count(*) FILTER (WHERE cost_inr IS NULL AND ok)::int AS uncosted FROM usage_events WHERE created_at > ${since}`),
      q(`SELECT count(DISTINCT user_id)::int AS n FROM usage_events WHERE created_at > ${since} AND user_id IS NOT NULL`),
      // Providers that have usage but no rate for what they use, so the owner knows what to fill in.
      q(`SELECT e.provider, bool_or(e.in_tokens IS NOT NULL) AS tokens, bool_or(e.chars IS NOT NULL) AS chars, bool_or(e.seconds IS NOT NULL) AS seconds
           FROM usage_events e WHERE e.created_at > ${since} AND e.ok AND e.cost_inr IS NULL GROUP BY e.provider`),
    ]);
    const t = totals[0] as { cost_inr: number; calls: number; uncosted: number };
    const active = (activeUsers[0] as { n: number }).n;
    return {
      days, totals: { ...t, activeUsers: active, perActiveUser: active ? Math.round((t.cost_inr / active) * 100) / 100 : null },
      byProvider, byTask, byDay, topUsers, missingRates: missing,
    };
  });
}
