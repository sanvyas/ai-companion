import type { Tx } from '../db/pool.js';

/** The user's local calendar day as YYYY-MM-DD (PRD 10: quiet hours and plans follow local time). */
export async function localDay(tx: Tx, userId: string, offsetDays = 0): Promise<string> {
  const r = await tx.query<{ d: string }>(`SELECT ((now() AT TIME ZONE (SELECT timezone FROM users WHERE id = $1))::date + $2::int)::text AS d`, [userId, offsetDays]);
  return r.rows[0].d;
}
