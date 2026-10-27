import { createHash } from 'node:crypto';
import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';

// Feature flags: on/off with a percentage rollout and per-person overrides. A person always lands in the same
// bucket for a flag (hash of flag + user), so raising 10% to 50% only adds people.

export interface FlagRow { key: string; description: string; enabled: boolean; rolloutPct: number; updatedBy: string | null; updatedAt: string }

export const bucket = (key: string, userId: string) => createHash('sha256').update(`${key}:${userId}`).digest().readUInt32BE(0) / 0x1_0000_0000 * 100;

export class Flags {
  private flags = new Map<string, FlagRow>();
  private overrides = new Map<string, Map<string, boolean>>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly db: Db | null) {}

  async refresh(): Promise<void> {
    if (!this.db) return;
    const [f, o] = await withSystem(this.db, async tx => [
      (await tx.query('SELECT * FROM feature_flags ORDER BY key')).rows,
      (await tx.query('SELECT key, user_id, enabled FROM flag_overrides')).rows,
    ]);
    this.flags = new Map(f.map(r => [r.key as string, { key: r.key, description: r.description, enabled: r.enabled, rolloutPct: r.rollout_pct, updatedBy: r.updated_by, updatedAt: new Date(r.updated_at).toISOString() }]));
    this.overrides = new Map();
    for (const r of o) { if (!this.overrides.has(r.key as string)) this.overrides.set(r.key as string, new Map()); this.overrides.get(r.key as string)!.set(r.user_id as string, r.enabled as boolean); }
  }
  startPolling(ms = 10_000) { this.timer = setInterval(() => void this.refresh().catch(() => undefined), ms); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); }

  /** Flags that do not exist are off, so code can ask for a flag before anyone has created it. */
  isOn(key: string, userId?: string): boolean {
    const f = this.flags.get(key);
    if (!f) return false;
    if (userId) { const o = this.overrides.get(key)?.get(userId); if (o !== undefined) return o; }
    if (!f.enabled) return false;
    if (f.rolloutPct >= 100) return true;
    if (!userId) return false;
    return bucket(key, userId) < f.rolloutPct;
  }

  forUser(userId: string): Record<string, boolean> {
    return Object.fromEntries([...this.flags.keys()].map(k => [k, this.isOn(k, userId)]));
  }

  list(): (FlagRow & { overrides: number })[] {
    return [...this.flags.values()].map(f => ({ ...f, overrides: this.overrides.get(f.key)?.size ?? 0 }));
  }

  async upsert(key: string, p: { description?: string; enabled?: boolean; rolloutPct?: number }, by: string): Promise<{ before: FlagRow | null; after: FlagRow }> {
    if (!this.db) throw new Error('no database');
    if (!/^[a-z][a-z0-9_.]{1,48}$/.test(key)) throw new Error('Use lower case letters, numbers, dots and underscores.');
    const before = this.flags.get(key) ?? null;
    await withSystem(this.db, tx => tx.query(
      `INSERT INTO feature_flags (key, description, enabled, rollout_pct, updated_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET description = COALESCE($6, feature_flags.description), enabled = COALESCE($7, feature_flags.enabled), rollout_pct = COALESCE($8, feature_flags.rollout_pct), updated_by = $5, updated_at = now()`,
      [key, p.description ?? '', p.enabled ?? false, p.rolloutPct ?? 100, by, p.description ?? null, p.enabled ?? null, p.rolloutPct ?? null]));
    await this.refresh();
    return { before, after: this.flags.get(key)! };
  }

  async remove(key: string): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => tx.query('DELETE FROM feature_flags WHERE key = $1', [key]));
    await this.refresh();
  }

  async setOverride(key: string, userId: string, enabled: boolean | null): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => enabled === null ? tx.query('DELETE FROM flag_overrides WHERE key = $1 AND user_id = $2', [key, userId]) : tx.query('INSERT INTO flag_overrides (key, user_id, enabled) VALUES ($1,$2,$3) ON CONFLICT (key, user_id) DO UPDATE SET enabled = EXCLUDED.enabled', [key, userId, enabled]));
    await this.refresh();
  }
}
