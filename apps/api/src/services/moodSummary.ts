import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';

// How the person has been feeling lately: the one summary the plan, stories and calm narration lean on. It combines
// their own mood taps over the last three days with how their recent messages read (a number per message, never the
// words). Taps count for more because they are the person's own statement; messages fill in the days with no tap.

export type MoodLabel = 'heavier' | 'in between' | 'lighter' | 'unknown';
export interface MoodSummary { label: MoodLabel; /** -2 heavy to +2 light, or null when there is nothing to go on. */ score: number | null; /** Today's tap, 0 (heavy) to 4 (lighter), or null. */ today: number | null }

/** On the -2 to +2 scale: below -0.5 is a heavier stretch, above 0.7 a lighter one. */
export const moodLabelOfScore = (score: number | null): MoodLabel => (score === null ? 'unknown' : score < -0.5 ? 'heavier' : score <= 0.7 ? 'in between' : 'lighter');

/** Taps run 0 to 4 and messages -2 to +2; this puts both on -2 to +2. */
export function combineMood(tap: { avg: number | null; n: number }, msg: { avg: number | null; n: number }): number | null {
  const t = tap.n && tap.avg !== null ? tap.avg - 2 : null;
  const m = msg.n >= 3 && msg.avg !== null ? msg.avg : null;
  if (t !== null && m !== null) return Math.round((0.65 * t + 0.35 * m) * 100) / 100;
  return t ?? m;
}

export async function recentMood(ctx: Ctx, userId: string): Promise<MoodSummary> {
  return withUser(ctx.db, userId, async tx => {
    // Days are the person's own, so “today” follows their timezone, not the server's.
    const today = `(now() AT TIME ZONE COALESCE((SELECT timezone FROM users WHERE id = $1), 'Asia/Kolkata'))::date`;
    const taps = (await tx.query<{ avg: string | null; n: number }>(`SELECT avg(value)::numeric(3,2) AS avg, count(*)::int AS n FROM mood_logs WHERE day >= ${today} - 3`, [userId])).rows[0];
    const msgs = (await tx.query<{ avg: string | null; n: number }>(`SELECT avg(valence)::numeric(3,2) AS avg, count(*)::int AS n FROM messages WHERE role = 'user' AND valence IS NOT NULL AND created_at > now() - interval '3 days'`)).rows[0];
    const t = (await tx.query<{ value: number }>(`SELECT value FROM mood_logs WHERE day = ${today}`, [userId])).rows[0];
    const score = combineMood({ avg: taps.avg === null ? null : Number(taps.avg), n: taps.n }, { avg: msgs.avg === null ? null : Number(msgs.avg), n: msgs.n });
    return { label: moodLabelOfScore(score), score, today: t?.value ?? null };
  });
}
