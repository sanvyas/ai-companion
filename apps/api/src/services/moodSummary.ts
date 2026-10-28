import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';

// How the person has been feeling lately, from their own mood taps: the one number the plan, stories and calm
// narration all lean on. Nothing here reads what they wrote or said.

export type MoodLabel = 'heavier' | 'in between' | 'lighter' | 'unknown';
export interface MoodSummary { label: MoodLabel; /** Today's tap, 0 (heavy) to 4 (lighter), or null. */ today: number | null }

export const moodLabelOf = (avg: number | null, n: number): MoodLabel => (!n || avg === null ? 'unknown' : avg < 1.5 ? 'heavier' : avg < 2.7 ? 'in between' : 'lighter');

export async function recentMood(ctx: Ctx, userId: string): Promise<MoodSummary> {
  return withUser(ctx.db, userId, async tx => {
    const r = (await tx.query<{ avg: string | null; n: number }>('SELECT avg(value)::numeric(3,1) AS avg, count(*)::int AS n FROM mood_logs WHERE day >= current_date - 3')).rows[0];
    const t = (await tx.query<{ value: number }>('SELECT value FROM mood_logs WHERE day = current_date')).rows[0];
    return { label: moodLabelOf(r.avg === null ? null : Number(r.avg), r.n), today: t?.value ?? null };
  });
}
