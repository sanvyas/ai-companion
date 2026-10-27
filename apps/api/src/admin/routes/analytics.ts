import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { guard, intParam } from './util.js';

// First-party product analytics. Only people who turned on "Share how I use Saathi" are tracked, events carry a
// screen name, a tagged element id or a step name and nothing else, and the person is a one-way hash.

export function analyticsRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);
  const IST = `AT TIME ZONE 'Asia/Kolkata'`;

  app.get('/analytics', guard(ctx, 'analytics.read'), async req => {
    const days = intParam((req.query as { days?: string }).days, 14, 1, 90);
    const since = `now() - make_interval(days => ${days})`;
    const [totals, screens, clicks, daily, steps, platforms, optIn, signIn] = await Promise.all([
      q(`SELECT count(*)::int AS events, count(DISTINCT session_id)::int AS sessions, count(DISTINCT anon_id)::int AS people FROM analytics_events WHERE created_at > ${since}`),
      q(`SELECT screen, count(*)::int AS views, count(DISTINCT anon_id)::int AS people, COALESCE(round(avg(duration_ms) FILTER (WHERE duration_ms > 0) / 1000.0, 1), 0)::float AS avg_seconds,
                COALESCE(round(sum(duration_ms) / 60000.0, 1), 0)::float AS total_minutes
           FROM analytics_events WHERE name = 'screen_view' AND created_at > ${since} AND screen IS NOT NULL GROUP BY screen ORDER BY total_minutes DESC, views DESC LIMIT 40`),
      q(`SELECT el, screen, count(*)::int AS clicks, count(DISTINCT anon_id)::int AS people FROM analytics_events WHERE name = 'click' AND created_at > ${since} AND el IS NOT NULL GROUP BY el, screen ORDER BY clicks DESC LIMIT 40`),
      q(`WITH d AS (SELECT generate_series((now() ${IST})::date - ${days - 1}, (now() ${IST})::date, interval '1 day')::date AS day)
         SELECT d.day::text AS day, (SELECT count(*)::int FROM analytics_events e WHERE (e.created_at ${IST})::date = d.day) AS events, (SELECT count(DISTINCT anon_id)::int FROM analytics_events e WHERE (e.created_at ${IST})::date = d.day) AS people FROM d ORDER BY d.day`),
      // Steps people reach, counted as distinct people per named step.
      q(`SELECT props->>'step' AS step, count(DISTINCT anon_id)::int AS people FROM analytics_events WHERE name = 'step' AND created_at > ${since} AND props ? 'step' GROUP BY 1 ORDER BY min(created_at)`),
      q(`SELECT COALESCE(platform, 'unknown') AS platform, count(DISTINCT anon_id)::int AS people FROM analytics_events WHERE created_at > ${since} GROUP BY 1 ORDER BY people DESC`),
      q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE c.analytics)::int AS opted_in FROM consents c JOIN users u ON u.id = c.user_id WHERE u.deleted_at IS NULL`),
      // Sign-in funnel from the server's own counts: it needs no tracking, so it exists for everyone.
      q(`SELECT (SELECT count(*)::int FROM otp_challenges WHERE created_at > ${since}) AS codes_requested, (SELECT count(*)::int FROM otp_challenges WHERE created_at > ${since} AND consumed_at IS NOT NULL) AS codes_used,
                (SELECT count(*)::int FROM users WHERE created_at > ${since}) AS accounts, (SELECT count(*)::int FROM users WHERE created_at > ${since} AND onboarded_at IS NOT NULL) AS onboarded,
                (SELECT count(DISTINCT user_id)::int FROM conversations WHERE started_at > ${since}) AS talked`),
    ]);
    return { days, enabled: ctx.rt.settings.bool('analytics.enabled'), totals: totals[0], screens, clicks, daily, steps, platforms, optIn: optIn[0], signInFunnel: signIn[0] };
  });
}
