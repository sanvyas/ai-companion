import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import type { Settings } from './settings.js';

// What each unit of usage costs. Rates are entered in the portal from each vendor's own price page, in INR or USD.
// Cost is worked out when usage is recorded and stored in rupees, so a later rate change does not rewrite history.

export type RateUnit = 'input_mtok' | 'output_mtok' | 'cache_read_mtok' | 'cache_write_mtok' | 'per_1k_chars' | 'per_hour' | 'per_message';
export const RATE_UNITS: RateUnit[] = ['input_mtok', 'output_mtok', 'cache_read_mtok', 'cache_write_mtok', 'per_1k_chars', 'per_hour', 'per_message'];

export interface Rate { id: number; provider: string; unit: RateUnit; rate: number; currency: 'INR' | 'USD'; sourceNote: string; verified: boolean; updatedBy: string | null; updatedAt: string }

export interface UsageAmounts { provider: string; inTokens?: number; outTokens?: number; cacheRead?: number; cacheWrite?: number; chars?: number; seconds?: number; messages?: number }

export class Pricing {
  private rates = new Map<string, Rate>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly db: Db | null, private readonly settings: Settings) {}

  async refresh(): Promise<void> {
    if (!this.db) return;
    const rows = (await withSystem(this.db, tx => tx.query('SELECT * FROM pricing_rates ORDER BY provider, unit'))).rows;
    this.rates = new Map(rows.map(r => [`${r.provider}|${r.unit}`, { id: Number(r.id), provider: r.provider, unit: r.unit, rate: Number(r.rate), currency: r.currency, sourceNote: r.source_note, verified: r.verified, updatedBy: r.updated_by, updatedAt: new Date(r.updated_at).toISOString() }]));
  }
  startPolling(ms = 30_000) { this.timer = setInterval(() => void this.refresh().catch(() => undefined), ms); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); }

  list(): Rate[] { return [...this.rates.values()]; }

  private inr(r: Rate | undefined): number | null {
    if (!r) return null;
    return r.currency === 'INR' ? r.rate : r.rate * this.settings.num('cost.usd_inr');
  }

  /** Rupees for this usage, or null when a needed rate has not been entered (so it shows as "uncosted", not free). */
  costInr(u: UsageAmounts): number | null {
    const rate = (unit: RateUnit) => this.inr(this.rates.get(`${u.provider}|${unit}`));
    let total = 0;
    let priced = false;
    const add = (amount: number | undefined, unit: RateUnit, per: number) => {
      if (!amount) return true;
      const r = rate(unit);
      if (r === null) return false;
      total += (amount / per) * r; priced = true;
      return true;
    };
    const ok = [
      add(u.inTokens, 'input_mtok', 1e6), add(u.outTokens, 'output_mtok', 1e6), add(u.cacheRead, 'cache_read_mtok', 1e6), add(u.cacheWrite, 'cache_write_mtok', 1e6),
      add(u.chars, 'per_1k_chars', 1000), add(u.seconds, 'per_hour', 3600), add(u.messages, 'per_message', 1),
    ].every(Boolean);
    return ok && priced ? Math.round(total * 10_000) / 10_000 : null;
  }

  async upsert(p: { provider: string; unit: RateUnit; rate: number; currency: 'INR' | 'USD'; sourceNote: string; verified: boolean }, by: string): Promise<void> {
    if (!this.db) throw new Error('no database');
    await withSystem(this.db, tx => tx.query(
      `INSERT INTO pricing_rates (provider, unit, rate, currency, source_note, verified, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (provider, unit) DO UPDATE SET rate = EXCLUDED.rate, currency = EXCLUDED.currency, source_note = EXCLUDED.source_note, verified = EXCLUDED.verified, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [p.provider, p.unit, p.rate, p.currency, p.sourceNote.slice(0, 200), p.verified, by]));
    await this.refresh();
  }

  async remove(id: number): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => tx.query('DELETE FROM pricing_rates WHERE id = $1', [id]));
    await this.refresh();
  }

  /** Fill in cost for past usage that was recorded before its rate existed. Returns rows updated. */
  async recost(): Promise<number> {
    if (!this.db) return 0;
    const rows = (await withSystem(this.db, tx => tx.query(`SELECT id, provider, in_tokens, out_tokens, cache_read, cache_write, chars, seconds, units, kind FROM usage_events WHERE cost_inr IS NULL AND ok ORDER BY id DESC LIMIT 50000`))).rows;
    let n = 0;
    for (const r of rows) {
      const c = this.costInr({ provider: r.provider, inTokens: r.in_tokens ?? undefined, outTokens: r.out_tokens ?? undefined, cacheRead: r.cache_read ?? undefined, cacheWrite: r.cache_write ?? undefined, chars: r.chars ?? undefined, seconds: r.seconds ? Number(r.seconds) : undefined, messages: r.kind === 'message' ? r.units : undefined });
      if (c !== null) { await withSystem(this.db, tx => tx.query('UPDATE usage_events SET cost_inr = $2 WHERE id = $1', [r.id, c])); n++; }
    }
    return n;
  }
}
