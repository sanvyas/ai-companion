import type { Tx } from '../db/pool.js';

/** Config and permission changes write before/after values (never message or journal content). */
export async function audit(tx: Tx, userId: string, action: string, before: unknown, after: unknown): Promise<void> {
  await tx.query('INSERT INTO audit_log (user_id, action, before, after) VALUES ($1,$2,$3,$4)', [userId, action, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after)]);
}
