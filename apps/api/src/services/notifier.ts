import { buildContent, decide, ignoredStreak, type Channel, type NotifKind } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';

interface Facts {
  user: { id: string; timezone: string; daysSinceOpen: number; quietWeekSent: boolean; companionName: string };
  prefs: { push: boolean; calls: boolean; sundayLetter: boolean; checkinTime: 'morning' | 'evening' | 'off'; followUpAfterHardDay: boolean; quietStart: string; quietEnd: string };
  consent: { notifications: boolean; calls: boolean };
  privacy: { previews: boolean; discreet: boolean };
  sentToday: { push: number; call: number };
  streak: number;
  localMinutes: number;
}

async function loadFacts(ctx: Ctx, userId: string, now: Date): Promise<Facts | null> {
  return withSystem(ctx.db, async tx => {
    const u = (await tx.query(
      `SELECT u.id, u.timezone, u.deletion_requested_at, u.age_confirmed_18,
              floor(extract(epoch FROM ($2::timestamptz - u.last_active_at)) / 86400)::int AS days_since_open,
              u.quiet_week_sent_at IS NOT NULL AND u.quiet_week_sent_at > u.last_active_at AS quiet_week_sent,
              (extract(hour FROM ($2::timestamptz AT TIME ZONE u.timezone)) * 60 + extract(minute FROM ($2::timestamptz AT TIME ZONE u.timezone)))::int AS local_minutes,
              np.push, np.calls, np.sunday_letter, np.checkin_time, np.follow_up_after_hard_day, np.quiet_start::text AS quiet_start, np.quiet_end::text AS quiet_end,
              c.notifications AS c_notifications, c.calls AS c_calls, p.lock_screen_previews, p.discreet_mode, co.name AS companion_name
         FROM users u JOIN notification_prefs np ON np.user_id = u.id JOIN consents c ON c.user_id = u.id
         JOIN privacy_settings p ON p.user_id = u.id JOIN companions co ON co.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL`, [userId, now])).rows[0];
    if (!u || u.deletion_requested_at || !u.age_confirmed_18) return null;
    const counts = (await tx.query<{ channel: string; n: number }>(
      `SELECT channel, count(*)::int AS n FROM notification_log
        WHERE user_id = $1 AND outcome = 'sent' AND (created_at AT TIME ZONE $3)::date = ($2::timestamptz AT TIME ZONE $3)::date AND channel IN ('push','call') GROUP BY channel`, [userId, now, u.timezone])).rows;
    const outcomes = (await tx.query<{ outcome: 'sent' | 'opened' }>(`SELECT outcome FROM notification_log WHERE user_id = $1 AND outcome IN ('sent','opened') AND channel = 'push' ORDER BY created_at DESC LIMIT 10`, [userId])).rows;
    return {
      user: { id: userId, timezone: u.timezone, daysSinceOpen: u.days_since_open, quietWeekSent: u.quiet_week_sent, companionName: u.companion_name },
      prefs: { push: u.push, calls: u.calls, sundayLetter: u.sunday_letter, checkinTime: u.checkin_time, followUpAfterHardDay: u.follow_up_after_hard_day, quietStart: u.quiet_start.slice(0, 5), quietEnd: u.quiet_end.slice(0, 5) },
      consent: { notifications: u.c_notifications, calls: u.c_calls },
      privacy: { previews: u.lock_screen_previews, discreet: u.discreet_mode },
      sentToday: { push: counts.find(c => c.channel === 'push')?.n ?? 0, call: counts.find(c => c.channel === 'call')?.n ?? 0 },
      streak: ignoredStreak(outcomes.map(o => o.outcome)),
      localMinutes: u.local_minutes,
    };
  });
}

const log = (ctx: Ctx, userId: string, kind: string, channel: 'push' | 'call' | 'card', outcome: string, at: Date) =>
  withSystem(ctx.db, tx => tx.query('INSERT INTO notification_log (user_id, kind, channel, outcome, created_at) VALUES ($1,$2,$3,$4,$5)', [userId, kind, channel, outcome, at]));

export interface NotifyResult { sent: boolean; reason?: string; delivered?: number }

/** Apply the rules, then push to the user's devices. Every decision is logged, sent or not. */
export async function notify(ctx: Ctx, userId: string, kind: NotifKind, now: Date, extra: { eventTitle?: string; eventTime?: string; channel?: Channel } = {}): Promise<NotifyResult> {
  const f = await loadFacts(ctx, userId, now);
  if (!f) return { sent: false, reason: 'account_unavailable' };
  // A call is only attempted when a telephony vendor is connected; otherwise the same nudge goes out as a push.
  const channel: Channel = extra.channel === 'call' && ctx.telephony ? 'call' : 'push';
  const d = decide({
    kind, channel, localMinutes: f.localMinutes, quiet: { start: f.prefs.quietStart, end: f.prefs.quietEnd }, sentToday: f.sentToday, ignoredStreak: f.streak,
    daysSinceOpen: f.user.daysSinceOpen, quietWeekAlreadySent: f.user.quietWeekSent, prefs: f.prefs, consent: f.consent,
  });
  if (!d.send) { await log(ctx, userId, kind, channel, `skipped_${d.reason === 'quiet_hours' ? 'quiet' : d.reason === 'daily_cap' ? 'cap' : 'pref'}`, now); return { sent: false, reason: d.reason }; }

  if (!ctx.push.enabled) { await log(ctx, userId, kind, 'push', 'failed', now); return { sent: false, reason: 'push_not_configured' }; }

  const content = buildContent(kind, { previews: f.privacy.previews, discreet: f.privacy.discreet, companionName: f.user.companionName, eventTitle: extra.eventTitle, eventTime: extra.eventTime });
  const devices = await withSystem(ctx.db, tx => tx.query<{ id: string; token_enc: Buffer }>(`SELECT id, token_enc FROM devices WHERE user_id = $1 AND platform = 'web'`, [userId]));
  if (!devices.rowCount) { await log(ctx, userId, kind, 'push', 'failed', now); return { sent: false, reason: 'no_devices' }; }

  const { getDek } = await import('./users.js');
  const dek = await getDek(ctx, userId);
  let delivered = 0;
  for (const dev of devices.rows) {
    try {
      const sub = JSON.parse(ctx.crypto.decrypt(dek, userId, 'device', dev.token_enc));
      const ok = await ctx.push.send(sub, { title: content.title, body: content.body, route: content.route, tag: content.tag, actions: content.actions, timeSensitive: content.timeSensitive });
      if (ok) delivered++;
      else await withSystem(ctx.db, tx => tx.query('DELETE FROM devices WHERE id = $1', [dev.id])); // subscription expired
    } catch (e) {
      ctx.log.warn({ err: (e as Error).message }, 'push send failed');
    }
  }
  await log(ctx, userId, kind, 'push', delivered ? 'sent' : 'failed', now);
  if (kind === 'quietweek' && delivered) await withSystem(ctx.db, tx => tx.query('UPDATE users SET quiet_week_sent_at = now() WHERE id = $1', [userId]));
  return { sent: delivered > 0, delivered };
}

/** A soft card on Today (no buzz). Respects the user's "quiet cards" setting; no caps because nothing interrupts. */
export async function addInboxCard(ctx: Ctx, userId: string, kind: string, now: Date, ttlHours = 12): Promise<boolean> {
  return withSystem(ctx.db, async tx => {
    const on = (await tx.query('SELECT quiet_cards FROM notification_prefs WHERE user_id = $1', [userId])).rows[0]?.quiet_cards;
    if (!on) return false;
    const r = await tx.query(`INSERT INTO inbox_cards (user_id, kind, created_at, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [userId, kind, now, new Date(now.getTime() + ttlHours * 3600_000)]);
    return (r.rowCount ?? 0) > 0;
  });
}
