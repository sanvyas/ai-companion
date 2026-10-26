import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { getCompanion, getConsent, getPrivacy, getTrusted } from './profile.js';
import { getDek } from './users.js';

/** "Download my data" (PRD 8.7.3): everything stored about the user, decrypted, as one JSON document. */
export async function exportAll(ctx: Ctx, userId: string) {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const d = (purpose: string, b: Buffer | null) => (b ? ctx.crypto.decrypt(dek, userId, purpose, b) : null);
    const q = async (sql: string) => (await tx.query(sql)).rows;
    const user = (await tx.query('SELECT nickname, language, timezone, city, subscription, created_at FROM users WHERE id = $1', [userId])).rows[0];
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      consent: await getConsent(tx, userId),
      privacy: await getPrivacy(tx, userId),
      companion: await getCompanion(tx, userId),
      trustedContact: await getTrusted(ctx, tx, userId),
      memories: (await q('SELECT * FROM memories ORDER BY created_at')).map(r => ({ theme: r.theme, text: d('memory', r.text_enc), sensitive: r.sensitive, hidden: r.hidden, source: r.source, createdAt: r.created_at })),
      journal: (await q('SELECT * FROM journal_entries ORDER BY created_at')).map(r => ({ mode: r.mode, prompt: d('journal.prompt', r.prompt_enc), text: d('journal', r.text_enc), mood: r.mood, shared: r.shared, createdAt: r.created_at })),
      conversations: await Promise.all((await q('SELECT * FROM conversations ORDER BY started_at')).map(async c => ({
        mode: c.mode, startedAt: c.started_at, endedAt: c.ended_at, summary: d('summary', c.summary_enc),
        messages: (await tx.query('SELECT role, text_enc, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at', [c.id])).rows.map(m => ({ role: m.role, text: d('message', m.text_enc), createdAt: m.created_at })),
      }))),
      mood: await q('SELECT day, value, source FROM mood_logs ORDER BY day'),
      plan: (await q('SELECT * FROM plan_items ORDER BY day, created_at')).map(r => ({ day: r.day, label: d('plan', r.label_enc), done: r.done, source: r.source })),
      wins: (await q('SELECT * FROM wins ORDER BY created_at')).map(r => ({ kind: r.kind, label: d('win', r.label_enc), createdAt: r.created_at })),
      letters: (await q('SELECT * FROM letters ORDER BY week_start')).map(r => ({ weekStart: r.week_start, body: d('letter', r.body_enc) })),
      safetyPlan: await (async () => { const r = (await q('SELECT data_enc FROM safety_plans'))[0]; return r ? JSON.parse(d('safety_plan', r.data_enc)!) : null; })(),
      calmSessions: await q('SELECT item_id, started_at, completed_pct FROM calm_sessions ORDER BY started_at'),
      notificationPrefs: (await q('SELECT * FROM notification_prefs'))[0] ?? null,
    };
  });
}
