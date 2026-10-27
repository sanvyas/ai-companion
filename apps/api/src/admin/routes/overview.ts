import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { INTEGRATIONS } from '../../runtime/integrations.js';
import { PROMPT_DEFS } from '../../runtime/promptDefs.js';
import { liveSessionCount } from '../../services/conversations.js';
import { guard } from './util.js';

const started = Date.now();
/** Set APP_VERSION, GIT_SHA and BUILD_TIME at build time (the Docker image and CI do). */
export const buildInfo = () => ({
  version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0',
  commit: process.env.GIT_SHA ?? null,
  builtAt: process.env.BUILD_TIME ?? null,
  node: process.version,
});

export type Status = 'ok' | 'warn' | 'down' | 'off';
export interface SystemCard { group: 'Backend' | 'AI' | 'UI' | 'Infrastructure'; name: string; status: Status; detail: string; link: string }

export async function systemCards(ctx: Ctx): Promise<SystemCard[]> {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);
  const cards: SystemCard[] = [];

  const t0 = Date.now();
  let dbOk = true;
  try { await q('SELECT 1'); } catch { dbOk = false; }
  const dbMs = Date.now() - t0;
  const jobs = dbOk ? (await q<{ pending: number; failed: number; stuck: number }>(`SELECT count(*) FILTER (WHERE status='pending' AND run_at < now() - interval '15 minutes')::int AS stuck, count(*) FILTER (WHERE status='pending')::int AS pending, count(*) FILTER (WHERE status='failed' AND created_at > now() - interval '7 days')::int AS failed FROM jobs`))[0] : { pending: 0, failed: 0, stuck: 0 };
  const errs = dbOk ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM error_log WHERE NOT resolved AND last_seen > now() - interval '24 hours'`))[0].n : 0;
  const b = buildInfo();

  cards.push({ group: 'Backend', name: 'API', status: errs > 20 ? 'warn' : 'ok', detail: `v${b.version}${b.commit ? ` · ${b.commit.slice(0, 7)}` : ''} · up ${Math.round((Date.now() - started) / 60_000)} min · ${liveSessionCount()} live conversations`, link: 'infra' });
  cards.push({ group: 'Backend', name: 'Database', status: !dbOk ? 'down' : dbMs > 400 ? 'warn' : 'ok', detail: dbOk ? `${dbMs} ms round trip` : 'Not reachable', link: 'infra' });
  cards.push({ group: 'Backend', name: 'Scheduler and jobs', status: jobs.stuck > 0 || jobs.failed > 0 ? 'warn' : 'ok', detail: `${jobs.pending} waiting · ${jobs.failed} failed this week${jobs.stuck ? ` · ${jobs.stuck} overdue` : ''}`, link: 'infra' });
  cards.push({ group: 'Backend', name: 'Errors', status: errs === 0 ? 'ok' : errs > 20 ? 'down' : 'warn', detail: errs === 0 ? 'No open errors in 24 hours' : `${errs} open error type${errs === 1 ? '' : 's'} in 24 hours`, link: 'infra' });

  const llm = ctx.llm;
  const custom = dbOk ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM prompt_versions WHERE status = 'active'`))[0].n : 0;
  const lastEval = dbOk ? (await q<{ suite: string; failed: number; total: number; created_at: Date }>(`SELECT suite, failed, total, created_at FROM eval_runs ORDER BY id DESC LIMIT 1`))[0] : undefined;
  cards.push({ group: 'AI', name: 'Language model', status: llm.configured ? 'ok' : 'down', detail: llm.configured ? `${ctx.rt.llmProvider() === 'openrouter' ? 'OpenRouter' : 'Anthropic'} · ${ctx.rt.model('companion')} · safety ${ctx.rt.model('safety')}` : 'No API key. Conversations are unavailable.', link: 'integrations' });
  cards.push({ group: 'AI', name: 'Prompts', status: 'ok', detail: `${PROMPT_DEFS.length} prompts · ${custom} customised`, link: 'prompts' });
  cards.push({ group: 'AI', name: 'Safety evaluation', status: !lastEval ? 'warn' : lastEval.failed ? 'warn' : 'ok', detail: lastEval ? `${lastEval.suite}: ${lastEval.total - lastEval.failed}/${lastEval.total} passed, ${new Date(lastEval.created_at).toISOString().slice(0, 10)}` : 'Never run. Run the safety suites before inviting people.', link: 'evals' });
  const open2 = dbOk ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM safety_events e WHERE e.level >= 2 AND e.created_at > now() - interval '7 days' AND NOT EXISTS (SELECT 1 FROM safety_reviews r WHERE r.event_id = e.id)`))[0].n : 0;
  cards.push({ group: 'AI', name: 'Safety review queue', status: open2 ? 'warn' : 'ok', detail: open2 ? `${open2} elevated event${open2 === 1 ? '' : 's'} waiting for review` : 'Nothing waiting', link: 'safety' });

  const ev24 = dbOk ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM analytics_events WHERE created_at > now() - interval '24 hours'`))[0].n : 0;
  const flags = ctx.rt.flags.list();
  const s = ctx.rt.settings;
  cards.push({ group: 'UI', name: 'Web app', status: s.bool('access.maintenance') ? 'warn' : 'ok', detail: s.bool('access.maintenance') ? 'Maintenance mode is ON' : `${flags.filter(f => f.enabled).length}/${flags.length} flags on${s.bool('kill.voice') ? ' · voice paused' : ''}${s.bool('access.signups_open') ? '' : ' · sign-ups closed'}`, link: 'settings' });
  cards.push({ group: 'UI', name: 'Product analytics', status: s.bool('analytics.enabled') ? 'ok' : 'off', detail: s.bool('analytics.enabled') ? `${ev24} events in 24 hours (opted-in people only)` : 'Switched off', link: 'analytics' });

  const configured = INTEGRATIONS.filter(i => ctx.rt.secrets.status().find(x => x.id === i.id)!.fields.some(f => f.source !== 'none')).length;
  cards.push({ group: 'Infrastructure', name: 'Integrations', status: configured ? 'ok' : 'warn', detail: `${configured} of ${INTEGRATIONS.length} connected`, link: 'integrations' });
  cards.push({ group: 'Infrastructure', name: 'Push notifications', status: ctx.push.enabled ? 'ok' : 'off', detail: ctx.push.enabled ? 'Keys set' : 'No VAPID keys. Reminders stay in the app.', link: 'integrations' });
  cards.push({ group: 'Infrastructure', name: 'Sign-in codes', status: ctx.otp.canSend ? (ctx.otp.name === 'console' ? 'warn' : 'ok') : 'off', detail: ctx.otp.canSend ? (ctx.otp.name === 'console' ? 'Development mode: codes print in the log' : ctx.otp.name) : 'No SMS provider. Phone sign-in is off.', link: 'integrations' });
  return cards;
}

export function overviewRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/overview', guard(ctx, 'overview.read'), async () => {
    const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);
    const IST = `AT TIME ZONE 'Asia/Kolkata'`;
    const [users, consent, convs, modes, today, safety, cost, series, systems] = await Promise.all([
      q(`SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7,
                count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30,
                count(*) FILTER (WHERE last_active_at > now() - interval '1 day')::int AS dau,
                count(*) FILTER (WHERE last_active_at > now() - interval '7 days')::int AS wau,
                count(*) FILTER (WHERE last_active_at > now() - interval '30 days')::int AS mau,
                count(*) FILTER (WHERE onboarded_at IS NOT NULL AND deleted_at IS NULL)::int AS onboarded,
                count(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended,
                count(*) FILTER (WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL)::int AS pending_deletion,
                count(*) FILTER (WHERE subscription = 'plus' AND deleted_at IS NULL)::int AS plus
           FROM users`),
      q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE remember)::int AS remember, count(*) FILTER (WHERE notifications)::int AS notifications, count(*) FILTER (WHERE analytics)::int AS analytics FROM consents c JOIN users u ON u.id = c.user_id WHERE u.deleted_at IS NULL`),
      q(`SELECT count(*) FILTER (WHERE started_at > now() - interval '1 day')::int AS today, count(*) FILTER (WHERE started_at > now() - interval '7 days')::int AS week,
                COALESCE(avg(extract(epoch FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL AND started_at > now() - interval '7 days'), 0)::int AS avg_seconds FROM conversations`),
      q(`SELECT mode, count(*)::int AS n FROM conversations WHERE started_at > now() - interval '7 days' GROUP BY mode ORDER BY n DESC`),
      q(`SELECT COALESCE(sum(voice_seconds),0)::int AS voice_seconds, COALESCE(sum(turns),0)::int AS turns FROM usage_daily WHERE day = (now() ${IST})::date`),
      q(`SELECT level, count(*)::int AS n FROM safety_events WHERE created_at > now() - interval '7 days' GROUP BY level ORDER BY level`),
      q(`SELECT COALESCE(sum(cost_inr) FILTER (WHERE created_at >= (date_trunc('day', now() ${IST})) ${IST}),0)::float AS today,
                COALESCE(sum(cost_inr) FILTER (WHERE created_at >= (date_trunc('month', now() ${IST})) ${IST}),0)::float AS month,
                count(*) FILTER (WHERE cost_inr IS NULL AND ok AND created_at > now() - interval '30 days')::int AS uncosted FROM usage_events`),
      q(`WITH d AS (SELECT generate_series((now() ${IST})::date - 13, (now() ${IST})::date, interval '1 day')::date AS day)
         SELECT d.day::text AS day,
                (SELECT count(*)::int FROM users u WHERE (u.created_at ${IST})::date = d.day) AS new_users,
                (SELECT count(*)::int FROM conversations c WHERE (c.started_at ${IST})::date = d.day) AS conversations,
                (SELECT count(DISTINCT c.user_id)::int FROM conversations c WHERE (c.started_at ${IST})::date = d.day) AS talkers,
                (SELECT COALESCE(sum(e.cost_inr),0)::float FROM usage_events e WHERE (e.created_at ${IST})::date = d.day) AS cost
           FROM d ORDER BY d.day`),
      systemCards(ctx),
    ]);
    const budget = ctx.rt.settings.num('cost.monthly_budget_inr');
    const nowIst = new Date(Date.now() + 5.5 * 3600_000);
    const dayOfMonth = nowIst.getUTCDate();
    const daysInMonth = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      users: users[0], consent: consent[0], conversations: { ...convs[0], byMode: modes }, today: today[0], safety, series, systems,
      cost: { ...cost[0], projectedMonth: Math.round(((cost[0].month as number) / Math.max(1, dayOfMonth)) * daysInMonth), budget, budgetPct: budget ? Math.round(((cost[0].month as number) / budget) * 100) : null, alertPct: ctx.rt.settings.num('cost.alert_pct') },
    };
  });

  app.get('/systems', guard(ctx, 'overview.read'), async () => ({ systems: await systemCards(ctx), build: buildInfo() }));
}
