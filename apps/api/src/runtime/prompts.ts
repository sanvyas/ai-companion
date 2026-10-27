import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import { PROMPT_BY_KEY, PROMPT_DEFS, renderTemplate, validatePromptBody, type PromptDef } from './promptDefs.js';

export interface PromptVersion { id: number; key: string; version: number; body: string; note: string; status: 'draft' | 'active' | 'archived'; createdBy: string; createdAt: string; publishedBy: string | null; publishedAt: string | null; evalRunId: number | null }

const rowToVersion = (r: Record<string, unknown>): PromptVersion => ({
  id: Number(r.id), key: r.key as string, version: r.version as number, body: r.body as string, note: r.note as string, status: r.status as PromptVersion['status'],
  createdBy: r.created_by as string, createdAt: new Date(r.created_at as string).toISOString(), publishedBy: (r.published_by as string) ?? null,
  publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null, evalRunId: r.eval_run_id === null ? null : Number(r.eval_run_id),
});

/**
 * Active prompt versions held in memory so the conversation path can read them synchronously. Refreshed on a short
 * timer (other instances) and immediately on any change made through this instance.
 */
export class PromptStore {
  private active = new Map<string, { id: number; version: number; body: string }>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly db: Db | null) {}

  async refresh(): Promise<void> {
    if (!this.db) return;
    const rows = (await withSystem(this.db, tx => tx.query(`SELECT id, key, version, body FROM prompt_versions WHERE status = 'active'`))).rows;
    this.active = new Map(rows.map(r => [r.key as string, { id: Number(r.id), version: r.version as number, body: r.body as string }]));
  }

  startPolling(ms = 10_000) {
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), ms);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  /** The live body for a key: the published version if there is one, otherwise the built-in default. */
  get(key: string): string {
    const hit = this.active.get(key);
    if (hit) return hit.body;
    const d = PROMPT_BY_KEY.get(key);
    if (!d) throw new Error(`unknown prompt ${key}`);
    return d.body;
  }

  render(key: string, vars: Record<string, string> = {}): string {
    return renderTemplate(this.get(key), vars);
  }

  liveVersion(key: string): number | null { return this.active.get(key)?.version ?? null; }

  // ------------------------------------------------------------------------------ admin operations
  async list(): Promise<{ def: PromptDef; liveVersion: number | null; drafts: number; versions: number }[]> {
    const counts = this.db ? (await withSystem(this.db, tx => tx.query(`SELECT key, count(*)::int AS versions, count(*) FILTER (WHERE status = 'draft')::int AS drafts FROM prompt_versions GROUP BY key`))).rows : [];
    const by = new Map(counts.map(c => [c.key as string, c]));
    return PROMPT_DEFS.map(def => ({ def, liveVersion: this.liveVersion(def.key), drafts: (by.get(def.key)?.drafts as number) ?? 0, versions: (by.get(def.key)?.versions as number) ?? 0 }));
  }

  async versions(key: string): Promise<PromptVersion[]> {
    if (!this.db) return [];
    return (await withSystem(this.db, tx => tx.query(`SELECT * FROM prompt_versions WHERE key = $1 ORDER BY version DESC`, [key]))).rows.map(rowToVersion);
  }

  async getVersion(id: number): Promise<PromptVersion | null> {
    if (!this.db) return null;
    const r = (await withSystem(this.db, tx => tx.query('SELECT * FROM prompt_versions WHERE id = $1', [id]))).rows[0];
    return r ? rowToVersion(r) : null;
  }

  async saveDraft(key: string, body: string, note: string, by: string): Promise<PromptVersion> {
    const def = PROMPT_BY_KEY.get(key);
    if (!def || !this.db) throw new Error('unknown prompt');
    const problems = validatePromptBody(def, body);
    if (problems.length) throw Object.assign(new Error(problems.join(' ')), { problems });
    const r = await withSystem(this.db, tx => tx.query(
      `INSERT INTO prompt_versions (key, version, body, note, created_by) VALUES ($1, COALESCE((SELECT max(version) FROM prompt_versions WHERE key = $1), 0) + 1, $2, $3, $4) RETURNING *`,
      [key, body, note.slice(0, 200), by]));
    return rowToVersion(r.rows[0]);
  }

  /** Make a version live (also used to roll back to an older one). The previous live version is archived. */
  async publish(id: number, by: string, evalRunId: number | null): Promise<PromptVersion> {
    if (!this.db) throw new Error('no database');
    const out = await withSystem(this.db, async tx => {
      const v = (await tx.query('SELECT * FROM prompt_versions WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!v) throw new Error('version not found');
      await tx.query(`UPDATE prompt_versions SET status = 'archived' WHERE key = $1 AND status = 'active'`, [v.key]);
      const r = await tx.query(`UPDATE prompt_versions SET status = 'active', published_by = $2, published_at = now(), eval_run_id = $3 WHERE id = $1 RETURNING *`, [id, by, evalRunId]);
      return rowToVersion(r.rows[0]);
    });
    await this.refresh();
    return out;
  }

  /** Go back to the built-in default. */
  async revertToDefault(key: string): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => tx.query(`UPDATE prompt_versions SET status = 'archived' WHERE key = $1 AND status = 'active'`, [key]));
    await this.refresh();
  }
}

/** The store the conversation path reads. Set once at startup; tests that never build the app get the defaults. */
let live: PromptStore = new PromptStore(null);
export const setLivePrompts = (s: PromptStore) => { live = s; };
export const prompt = (key: string, vars?: Record<string, string>) => live.render(key, vars);
