import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withSystem } from '../src/db/pool.js';
import type { PushPayload, PushProvider } from '../src/providers/push.js';
import { plan, runDue } from '../src/jobs/worker.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';

class FakePush implements PushProvider {
  enabled = true;
  publicKey = 'test-key';
  sent: { to: unknown; payload: PushPayload }[] = [];
  gone = false;
  async send(to: unknown, payload: PushPayload) { if (this.gone) return false; this.sent.push({ to, payload }); return true; }
}

let t: TestApp;
let push: FakePush;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.app.close(); });
beforeEach(() => { push = new FakePush(); t.ctx.push = push; });

const j = (a: Auth, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => t.app.inject({ method, url, headers: a.headers, payload: payload as never });

// 21:00 in Asia/Kolkata is 15:30 UTC.
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 28, h, m));
const EVENING_IST = at(15, 30);

async function notified(over: { previews?: boolean; discreet?: boolean } = {}) {
  const a = await signIn(t);
  await j(a, 'PUT', '/me/consent', { notifications: true });
  await j(a, 'PUT', '/notifications/prefs', { push: true, checkinTime: 'evening' });
  if (over.previews !== undefined || over.discreet !== undefined) await j(a, 'PUT', '/me/privacy', { lockScreenPreviews: over.previews ?? false, discreetMode: over.discreet ?? false });
  await j(a, 'POST', '/devices', { platform: 'web', subscription: { endpoint: `https://push.example/${a.userId}`, keys: { p256dh: 'p', auth: 'a' } } });
  return a;
}

const jobsFor = (userId: string, kind?: string) => withSystem(t.ctx.db, tx => tx.query(`SELECT * FROM jobs WHERE user_id = $1 ${kind ? 'AND kind = $2' : ''}`, kind ? [userId, kind] : [userId])).then(r => r.rows);

describe('planner', () => {
  it('queues a check-in only at the user’s local check-in hour, and only once', async () => {
    const a = await notified();
    await plan(t.ctx, at(10, 0)); // 15:30 IST: not the hour
    expect(await jobsFor(a.userId, 'checkin.daily')).toHaveLength(0);
    await plan(t.ctx, EVENING_IST);
    await plan(t.ctx, new Date(EVENING_IST.getTime() + 60_000)); // running it again changes nothing
    expect(await jobsFor(a.userId, 'checkin.daily')).toHaveLength(1);
  });

  it('respects a morning check-in and "off"', async () => {
    const a = await notified();
    await j(a, 'PUT', '/notifications/prefs', { checkinTime: 'morning' });
    await plan(t.ctx, EVENING_IST);
    expect(await jobsFor(a.userId, 'checkin.daily')).toHaveLength(0);
    await plan(t.ctx, at(3, 45)); // 09:15 IST
    expect(await jobsFor(a.userId, 'checkin.daily')).toHaveLength(1);
    const b = await notified();
    await j(b, 'PUT', '/notifications/prefs', { checkinTime: 'off' });
    await plan(t.ctx, EVENING_IST);
    expect(await jobsFor(b.userId, 'checkin.daily')).toHaveLength(0);
  });
});

describe('sending', () => {
  it('sends a generic lock-screen line when previews are off', async () => {
    const a = await notified();
    await plan(t.ctx, EVENING_IST);
    await runDue(t.ctx, EVENING_IST, 1000);
    const mine = push.sent.filter(s => (s.to as { endpoint: string }).endpoint.endsWith(a.userId));
    expect(mine).toHaveLength(1);
    expect(mine[0].payload).toMatchObject({ title: 'Saathi', body: 'A quiet moment for you?', actions: [] });
  });

  it('uses the approved copy with previews on, and renames the app in discreet mode', async () => {
    const a = await notified({ previews: true });
    const b = await notified({ discreet: true });
    await plan(t.ctx, EVENING_IST);
    await runDue(t.ctx, EVENING_IST, 1000);
    const to = (u: Auth) => push.sent.find(s => (s.to as { endpoint: string }).endpoint.endsWith(u.userId))!.payload;
    expect(to(a).body).toBe('Ready for your evening check-in? Two minutes, whenever suits.');
    expect(to(a).title).toBe('Saathi');
    expect(to(b).title).toBe('Calm');
  });

  it('adds an in-app quiet card without buzzing anyone who has push off', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/notifications/prefs', { checkinTime: 'evening' });
    await plan(t.ctx, EVENING_IST);
    await runDue(t.ctx, EVENING_IST, 1000);
    expect(push.sent.filter(s => (s.to as { endpoint?: string }).endpoint?.endsWith(a.userId))).toHaveLength(0);
    // The card is made at the test's fixed evening and expires some hours later by the real clock, so this test would start
    // failing as the calendar moves on. What it checks is that the card is there and can be dismissed, not how long it lives.
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE inbox_cards SET expires_at = now() + interval '1 hour' WHERE user_id = $1`, [a.userId]));
    const inbox = (await j(a, 'GET', '/inbox')).json();
    expect(inbox.cards).toHaveLength(1);
    expect(inbox.cards[0].kind).toBe('checkin');
    expect((await j(a, 'POST', `/inbox/${inbox.cards[0].id}/dismiss`)).statusCode).toBe(204);
    expect((await j(a, 'GET', '/inbox')).json().cards).toHaveLength(0);
  });

  it('sends nothing without notification consent', async () => {
    const a = await notified();
    await j(a, 'PUT', '/me/consent', { notifications: false });
    await plan(t.ctx, EVENING_IST);
    await runDue(t.ctx, EVENING_IST, 1000);
    expect(push.sent.filter(s => (s.to as { endpoint: string }).endpoint.endsWith(a.userId))).toHaveLength(0);
    const log = await withSystem(t.ctx.db, tx => tx.query(`SELECT outcome FROM notification_log WHERE user_id = $1`, [a.userId]));
    expect(log.rows[0].outcome).toBe('skipped_pref');
  });

  it('holds a time-to-leave nudge during quiet hours, and caps at two a day', async () => {
    const a = await notified();
    const night = at(18, 30); // 00:00 IST
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at, payload) VALUES ('followup.hard_day', 'x1:'||$1::text, $1::uuid, $2, '{}')`, [a.userId, night]));
    await j(a, 'PUT', '/notifications/prefs', { followUpAfterHardDay: false });
    await runDue(t.ctx, night, 1000);
    expect(push.sent.filter(s => (s.to as { endpoint: string }).endpoint.endsWith(a.userId))).toHaveLength(0);

    const { notify } = await import('../src/services/notifier.js');
    const day = at(6, 0);
    expect((await notify(t.ctx, a.userId, 'plan', day)).sent).toBe(true);
    expect((await notify(t.ctx, a.userId, 'plan', day)).sent).toBe(true);
    expect(await notify(t.ctx, a.userId, 'plan', day)).toMatchObject({ sent: false, reason: 'daily_cap' });
  });

  it('removes a subscription the push service says is gone', async () => {
    const a = await notified();
    push.gone = true;
    const { notify } = await import('../src/services/notifier.js');
    await notify(t.ctx, a.userId, 'plan', at(6, 0));
    expect((await withSystem(t.ctx.db, tx => tx.query('SELECT 1 FROM devices WHERE user_id = $1', [a.userId]))).rowCount).toBe(0);
  });

  it('after seven quiet days sends one gentle message and then stays silent until the user returns', async () => {
    const a = await notified();
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE users SET last_active_at = now() - interval '8 days' WHERE id = $1`, [a.userId]));
    const now = new Date();
    now.setUTCHours(6, 0, 0, 0); // 11:30 IST
    await plan(t.ctx, now);
    await runDue(t.ctx, now, 1000);
    const mine = () => push.sent.filter(s => (s.to as { endpoint: string }).endpoint.endsWith(a.userId));
    expect(mine()).toHaveLength(1);
    expect(mine()[0].payload.tag).toBe('quietweek');
    const { notify } = await import('../src/services/notifier.js');
    expect(await notify(t.ctx, a.userId, 'quietweek', now)).toMatchObject({ sent: false });
    expect(await notify(t.ctx, a.userId, 'checkin', now)).toMatchObject({ sent: false, reason: 'paused_after_quiet_week' });
    await j(a, 'GET', '/inbox'); // opening the app brings them back
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [a.userId]));
    expect((await notify(t.ctx, a.userId, 'checkin', at(15, 30))).sent).toBe(true);
  });

  it('three ignored notifications halve the daily cap, and opening one resets that', async () => {
    const a = await notified();
    const { notify } = await import('../src/services/notifier.js');
    const day = at(6, 0);
    for (let i = 0; i < 3; i++) {
      await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO notification_log (user_id, kind, channel, outcome, created_at) VALUES ($1,'plan','push','sent', now() - interval '3 days' + ($2 || ' minutes')::interval)`, [a.userId, String(i)]));
    }
    expect((await notify(t.ctx, a.userId, 'plan', day)).sent).toBe(true);
    expect(await notify(t.ctx, a.userId, 'plan', day)).toMatchObject({ sent: false, reason: 'daily_cap' });
    // Opening a notification ends the ignored streak (the route records this with the real clock).
    expect((await j(a, 'POST', '/notifications/opened', { kind: 'plan' })).statusCode).toBe(204);
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE notification_log SET created_at = $2 WHERE user_id = $1 AND outcome = 'opened'`, [a.userId, new Date(day.getTime() + 60_000)]));
    const later = new Date(day.getTime() + 3600_000);
    await withSystem(t.ctx.db, tx => tx.query(`DELETE FROM notification_log WHERE user_id = $1 AND outcome = 'sent' AND created_at >= $2`, [a.userId, day]));
    expect((await notify(t.ctx, a.userId, 'plan', later)).sent).toBe(true);
    expect((await notify(t.ctx, a.userId, 'plan', later)).sent).toBe(true);
  });
});

describe('jobs', () => {
  it('weekly letter is written from real wins and sent, once', async () => {
    const a = await notified();
    await j(a, 'POST', '/mood', { value: 3 });
    const { addWin } = await import('../src/services/daily.js');
    await addWin(t.ctx, a.userId, 'walk', 'Went for a walk');
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('letter.weekly', $1, $2, now())`, [`letter.weekly:test:${a.userId}`, a.userId]));
    await j(a, 'PUT', '/notifications/prefs', { sundayLetter: true });
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    const letter = (await j(a, 'GET', '/letters/latest')).json();
    expect(letter.body).toMatch(/This week/);
  });

  it('skips the letter when there is nothing to say', async () => {
    const a = await notified();
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('letter.weekly', $1, $2, now())`, [`letter.weekly:empty:${a.userId}`, a.userId]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    expect((await j(a, 'GET', '/letters/latest')).statusCode).toBe(204);
  });

  it('failed jobs retry with backoff and then stop', async () => {
    const a = await notified();
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('no.such.kind', $1, $2, now())`, [`bad:${a.userId}`, a.userId]));
    for (let i = 0; i < 4; i++) {
      await withSystem(t.ctx.db, tx => tx.query(`UPDATE jobs SET run_at = now() WHERE dedupe_key = $1`, [`bad:${a.userId}`]));
      await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    }
    const row = (await withSystem(t.ctx.db, tx => tx.query(`SELECT status, attempts, last_error FROM jobs WHERE dedupe_key = $1`, [`bad:${a.userId}`]))).rows[0];
    expect(row).toMatchObject({ status: 'failed', attempts: 3 });
    expect(row.last_error).toMatch(/unknown job kind/);
  });

  it('purges an account after the 30-day window and removes every row', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { remember: true });
    await j(a, 'POST', '/journal', { mode: 'written', text: 'gone soon', shared: false });
    await j(a, 'POST', '/memories/bulk', { items: [{ theme: 'People', text: 'x', sensitive: false }] });
    const conv = (await j(a, 'POST', '/conversations', { mode: 'text' })).json();
    await j(a, 'DELETE', '/me');
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE jobs SET run_at = now() WHERE dedupe_key = $1`, [`account.purge:${a.userId}`]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    for (const tbl of ['users', 'journal_entries', 'memories', 'conversations', 'consents', 'refresh_tokens', 'audit_log', 'safety_events']) {
      const col = tbl === 'users' ? 'id' : 'user_id';
      expect((await withSystem(t.ctx.db, tx => tx.query(`SELECT 1 FROM ${tbl} WHERE ${col} = $1`, [a.userId]))).rowCount, tbl).toBe(0);
    }
    void conv;
  });

  it('a cancelled deletion is not purged', async () => {
    const a = await signIn(t);
    await j(a, 'DELETE', '/me');
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE jobs SET run_at = now() WHERE dedupe_key = $1`, [`account.purge:${a.userId}`]));
    await withSystem(t.ctx.db, tx => tx.query(`UPDATE users SET deletion_requested_at = NULL WHERE id = $1`, [a.userId]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    expect((await withSystem(t.ctx.db, tx => tx.query('SELECT 1 FROM users WHERE id = $1', [a.userId]))).rowCount).toBe(1);
  });

  it('maintenance applies transcript retention and clears expired rows', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/privacy', { transcriptRetentionDays: 7 });
    const conv = (await j(a, 'POST', '/conversations', { mode: 'text' })).json();
    const dek = await (await import('../src/services/users.js')).getDek(t.ctx, a.userId);
    for (const age of [2, 10]) {
      await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO messages (user_id, conversation_id, role, text_enc, created_at) VALUES ($1,$2,'user',$3, now() - ($4 || ' days')::interval)`, [a.userId, conv.id, t.ctx.crypto.encrypt(dek, a.userId, 'message', 'old'), String(age)]));
    }
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, run_at) VALUES ('maintenance', $1, now())`, [`maintenance:test:${a.userId}`]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    expect((await withSystem(t.ctx.db, tx => tx.query('SELECT count(*)::int n FROM messages WHERE user_id = $1', [a.userId]))).rows[0].n).toBe(1);
  });
});
