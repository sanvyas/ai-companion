import { prompt } from '../runtime/prompts.js';
import { z } from 'zod';
import { checkAiOutput } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { withSystem, type Tx } from '../db/pool.js';
import { addInboxCard, notify } from '../services/notifier.js';
import { getDek } from '../services/users.js';

// Scheduler and worker (PRD 6.6, 8.8). Everything is idempotent: jobs have deterministic dedupe keys, so running
// the planner twice (or on two instances) changes nothing. Jobs are claimed with FOR UPDATE SKIP LOCKED.

interface Job { id: number; kind: string; user_id: string | null; payload: Record<string, unknown>; attempts: number; dedupe_key: string }

const MAX_ATTEMPTS = 3;

// ------------------------------------------------------------------------------------------ planner
/** Enqueue the jobs that should exist for `now`. Safe to call every minute from any number of workers. */
export async function plan(ctx: Ctx, now: Date): Promise<number> {
  return withSystem(ctx.db, async tx => {
    let n = 0;
    const add = async (sql: string, params: unknown[] = []) => { n += (await tx.query(sql, params)).rowCount ?? 0; };

    // Daily check-in at 09:00 (morning) or 21:00 (evening) local, once per user per local day.
    await add(
      `INSERT INTO jobs (kind, dedupe_key, user_id, run_at)
       SELECT 'checkin.daily', 'checkin.daily:' || u.id || ':' || (($1::timestamptz AT TIME ZONE u.timezone)::date)::text, u.id, $1
         FROM users u JOIN notification_prefs np ON np.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.deletion_requested_at IS NULL AND u.age_confirmed_18 AND np.checkin_time <> 'off'
          AND extract(hour FROM ($1::timestamptz AT TIME ZONE u.timezone)) = CASE np.checkin_time WHEN 'morning' THEN 9 ELSE 21 END
       ON CONFLICT (dedupe_key) DO NOTHING`, [now]);

    // Sunday letter at 18:00 local, once per user per week.
    await add(
      `INSERT INTO jobs (kind, dedupe_key, user_id, run_at)
       SELECT 'letter.weekly', 'letter.weekly:' || u.id || ':' || (($1::timestamptz AT TIME ZONE u.timezone)::date)::text, u.id, $1
         FROM users u JOIN notification_prefs np ON np.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.deletion_requested_at IS NULL AND u.age_confirmed_18 AND np.sunday_letter
          AND extract(dow FROM ($1::timestamptz AT TIME ZONE u.timezone)) = 0 AND extract(hour FROM ($1::timestamptz AT TIME ZONE u.timezone)) = 18
       ON CONFLICT (dedupe_key) DO NOTHING`, [now]);

    // Seven quiet days: one "No pressure" message per absence (the user returning resets it).
    await add(
      `INSERT INTO jobs (kind, dedupe_key, user_id, run_at)
       SELECT 'quietweek', 'quietweek:' || u.id || ':' || u.last_active_at::date::text, u.id, $1
         FROM users u JOIN notification_prefs np ON np.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.deletion_requested_at IS NULL AND u.age_confirmed_18 AND np.push
          AND u.last_active_at < $1::timestamptz - interval '7 days'
       ON CONFLICT (dedupe_key) DO NOTHING`, [now]);

    // Housekeeping, hourly.
    await add(`INSERT INTO jobs (kind, dedupe_key, run_at) VALUES ('maintenance', $2, $1) ON CONFLICT (dedupe_key) DO NOTHING`, [now, `maintenance:${now.toISOString().slice(0, 13)}`]);
    return n;
  });
}

// ------------------------------------------------------------------------------------------ handlers
const LetterSchema = z.object({ body: z.string().max(1200) });
const LETTER_JSON = { type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false };

async function weeklyLetter(ctx: Ctx, userId: string, now: Date): Promise<void> {
  if (!ctx.llm.configured) return;
  const data = await withSystem(ctx.db, async tx => {
    const u = (await tx.query('SELECT nickname, language, timezone FROM users WHERE id = $1', [userId])).rows[0];
    const dek = await getDek(ctx, userId, tx);
    const wins = (await tx.query(`SELECT kind, label_enc FROM wins WHERE user_id = $1 AND created_at > $2::timestamptz - interval '7 days' ORDER BY created_at`, [userId, now])).rows
      .map(w => `${w.kind}: ${ctx.crypto.decrypt(dek, userId, 'win', w.label_enc)}`);
    const moods = (await tx.query(`SELECT value FROM mood_logs WHERE user_id = $1 AND day > ($2::timestamptz AT TIME ZONE $3)::date - 7`, [userId, now, u.timezone])).rows.map(r => r.value as number);
    return { u, wins, moods, dek };
  });
  if (!data.wins.length && !data.moods.length) return; // nothing to say is better than a hollow letter
  const out = await ctx.llm.json({
    task: 'letter', model: ctx.rt.settings.str('models.analysis'), userId, maxTokens: 500, effort: 'low',
    system: { stable: prompt('letter', { language: data.u.language === 'hi' ? 'Hindi (Devanagari)' : data.u.language === 'hinglish' ? 'Hinglish in Latin script' : 'English', nickname: data.u.nickname || 'you' }) },
    messages: [{ role: 'user', content: `Wins this week: ${data.wins.join('; ') || 'none logged'}.\nMood taps (0 heavy to 4 lighter): ${data.moods.join(', ') || 'none'}.` }],
    schemaName: 'letter', jsonSchema: LETTER_JSON, parse: v => LetterSchema.parse(v),
  });
  if (!checkAiOutput(out.body).ok) return;
  await withSystem(ctx.db, async tx => {
    await tx.query(`INSERT INTO letters (user_id, week_start, body_enc) VALUES ($1, ($2::timestamptz AT TIME ZONE $3)::date, $4) ON CONFLICT (user_id, week_start) DO NOTHING`,
      [userId, now, data.u.timezone, ctx.crypto.encrypt(data.dek, userId, 'letter', out.body)]);
  });
  await notify(ctx, userId, 'letter', now);
}

async function maintenance(ctx: Ctx): Promise<void> {
  await withSystem(ctx.db, async tx => {
    // Transcript retention per user setting (PRD 5.3). 36500 days = until deleted.
    await tx.query(`DELETE FROM messages m USING privacy_settings p WHERE p.user_id = m.user_id AND p.transcript_retention_days < 36500 AND m.created_at < now() - make_interval(days => p.transcript_retention_days)`);
    await tx.query(`DELETE FROM safety_events WHERE created_at < now() - interval '1 year'`);
    await tx.query(`DELETE FROM otp_challenges WHERE created_at < now() - interval '1 day'`);
    await tx.query(`DELETE FROM idempotency_keys WHERE created_at < now() - interval '2 days'`);
    await tx.query(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`);
    await tx.query(`DELETE FROM inbox_cards WHERE expires_at < now() - interval '2 days'`);
    await tx.query(`DELETE FROM notification_log WHERE created_at < now() - interval '90 days'`);
    await tx.query(`DELETE FROM jobs WHERE status IN ('done','skipped','failed') AND created_at < now() - interval '14 days'`);
  });
}

/** Hard delete of an account whose 30-day window has passed (PRD 5.2). Cascades remove every row. */
async function purgeAccount(ctx: Ctx, userId: string): Promise<void> {
  await withSystem(ctx.db, async tx => {
    const still = (await tx.query('SELECT deletion_requested_at FROM users WHERE id = $1', [userId])).rows[0];
    if (!still?.deletion_requested_at) return; // cancelled in the meantime
    await tx.query('DELETE FROM users WHERE id = $1', [userId]);
  });
  ctx.crypto.forget(userId);
}

export async function runJob(ctx: Ctx, job: Job, now: Date): Promise<void> {
  const uid = job.user_id;
  switch (job.kind) {
    case 'checkin.daily':
      if (!uid) return;
      await addInboxCard(ctx, uid, 'checkin', now);
      await notify(ctx, uid, 'checkin', now, { channel: 'call' }); // falls back to a push if no telephony vendor is connected
      return;
    case 'event.leave': {
      if (!uid) return;
      const ev = await withSystem(ctx.db, async tx => (await tx.query('SELECT title, starts_at FROM events WHERE id = $1', [job.payload.eventId])).rows[0]);
      if (!ev) return;
      const tz = (await withSystem(ctx.db, tx => tx.query('SELECT timezone FROM users WHERE id = $1', [uid]))).rows[0]?.timezone ?? 'Asia/Kolkata';
      const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: tz }).format(ev.starts_at);
      await notify(ctx, uid, 'leave', now, { eventTitle: ev.title, eventTime: time });
      return;
    }
    case 'followup.hard_day':
      if (uid) await notify(ctx, uid, 'followup', now);
      return;
    case 'quietweek':
      if (uid) await notify(ctx, uid, 'quietweek', now);
      return;
    case 'letter.weekly':
      if (uid) await weeklyLetter(ctx, uid, now);
      return;
    case 'maintenance':
      return maintenance(ctx);
    case 'account.purge':
      if (uid) await purgeAccount(ctx, uid);
      return;
    default:
      throw new Error(`unknown job kind ${job.kind}`);
  }
}

/** Claim and run due jobs. Failures retry with backoff, then stop at MAX_ATTEMPTS. */
export async function runDue(ctx: Ctx, now: Date, limit = 25): Promise<number> {
  const claimed = await withSystem(ctx.db, async (tx: Tx) =>
    (await tx.query<Job>(
      `UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
        WHERE id IN (SELECT id FROM jobs WHERE status = 'pending' AND run_at <= $1 ORDER BY run_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id, kind, user_id, payload, attempts, dedupe_key`, [now, limit])).rows);
  for (const job of claimed) {
    try {
      await runJob(ctx, job, now);
      await withSystem(ctx.db, tx => tx.query(`UPDATE jobs SET status = 'done', last_error = NULL WHERE id = $1`, [job.id]));
    } catch (e) {
      const final = job.attempts >= MAX_ATTEMPTS;
      ctx.log.error({ job: job.kind, id: job.id, err: (e as Error).message }, 'job failed');
      await withSystem(ctx.db, tx => tx.query(`UPDATE jobs SET status = $2, last_error = $3, run_at = now() + ($4 || ' minutes')::interval WHERE id = $1`, [job.id, final ? 'failed' : 'pending', (e as Error).message.slice(0, 300), String(2 ** job.attempts)]));
    }
  }
  // A job stuck in 'running' (crash) is released after 10 minutes.
  await withSystem(ctx.db, tx => tx.query(`UPDATE jobs SET status = 'pending' WHERE status = 'running' AND locked_at < now() - interval '10 minutes'`));
  return claimed.length;
}

export function startWorker(ctx: Ctx): () => void {
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const now = new Date();
      await plan(ctx, now);
      await runDue(ctx, now);
    } catch (e) {
      ctx.log.error({ err: (e as Error).message }, 'worker tick failed');
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
