import type { Crypto } from '../crypto/envelope.js';
import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import { INTEGRATION_BY_ID, INTEGRATIONS, type IntegrationField } from './integrations.js';

// Credentials saved from the portal. Stored sealed (AES-256-GCM under a key derived from DATA_KEK, bound to the
// provider and field name), decrypted into memory at startup and on a short refresh. No API ever returns a secret.

export type SecretSource = 'portal' | 'env' | 'none';
export interface FieldStatus { name: string; label: string; secret: boolean; hint?: string; source: SecretSource; last4: string | null; value: string | null; updatedAt: string | null; updatedBy: string | null; lastTestAt: string | null; lastTestOk: boolean | null; lastTestNote: string | null }

const last4 = (v: string) => (v.length <= 4 ? '••••' : v.slice(-4));

export class Secrets {
  private cache = new Map<string, string>();
  private meta = new Map<string, { last4: string; at: string; by: string | null; testAt: string | null; testOk: boolean | null; testNote: string | null }>();
  private timer?: ReturnType<typeof setInterval>;
  private listeners: (() => void)[] = [];

  constructor(private readonly db: Db | null, private readonly crypto: Crypto, private readonly env: NodeJS.ProcessEnv = process.env) {}

  private k = (p: string, n: string) => `${p}:${n}`;

  async refresh(): Promise<void> {
    if (!this.db) return;
    const rows = (await withSystem(this.db, tx => tx.query('SELECT * FROM integration_secrets'))).rows;
    const next = new Map<string, string>();
    const meta = new Map<string, typeof this.meta extends Map<string, infer M> ? M : never>();
    for (const r of rows) {
      try {
        next.set(this.k(r.provider, r.name), this.crypto.openPlatform(`secret:${r.provider}:${r.name}`, r.ciphertext));
        meta.set(this.k(r.provider, r.name), { last4: r.last4, at: new Date(r.updated_at).toISOString(), by: r.updated_by, testAt: r.last_test_at ? new Date(r.last_test_at).toISOString() : null, testOk: r.last_test_ok, testNote: r.last_test_note });
      } catch { /* a value sealed with another key is ignored rather than crashing the app */ }
    }
    const changed = [...next].some(([k, v]) => this.cache.get(k) !== v) || [...this.cache.keys()].some(k => !next.has(k));
    this.cache = next; this.meta = meta;
    if (changed) this.listeners.forEach(l => l());
  }
  startPolling(ms = 10_000) { this.timer = setInterval(() => void this.refresh().catch(() => undefined), ms); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); }
  /** Called when any credential changes, so adapters can rebuild their clients. */
  onChange(fn: () => void) { this.listeners.push(fn); }

  private field(provider: string, name: string): IntegrationField | undefined {
    return INTEGRATION_BY_ID.get(provider)?.fields.find(f => f.name === name);
  }

  /** The saved value, else the environment variable, else undefined. */
  get(provider: string, name: string): string | undefined {
    const saved = this.cache.get(this.k(provider, name));
    if (saved) return saved;
    const envName = this.field(provider, name)?.env;
    return (envName && this.env[envName]) || undefined;
  }

  source(provider: string, name: string): SecretSource {
    if (this.cache.has(this.k(provider, name))) return 'portal';
    const envName = this.field(provider, name)?.env;
    return envName && this.env[envName] ? 'env' : 'none';
  }

  /** Everything the integrations page needs, with secret values removed. */
  status(): { id: string; fields: FieldStatus[] }[] {
    return INTEGRATIONS.map(i => ({
      id: i.id,
      fields: i.fields.map(f => {
        const src = this.source(i.id, f.name);
        const m = this.meta.get(this.k(i.id, f.name));
        const v = this.get(i.id, f.name);
        return {
          name: f.name, label: f.label, secret: f.secret, hint: f.hint, source: src, last4: v ? last4(v) : null, value: !f.secret && v ? v : null,
          updatedAt: m?.at ?? null, updatedBy: m?.by ?? null, lastTestAt: m?.testAt ?? null, lastTestOk: m?.testOk ?? null, lastTestNote: m?.testNote ?? null,
        };
      }),
    }));
  }

  async set(provider: string, name: string, value: string, by: string): Promise<void> {
    const f = this.field(provider, name);
    if (!f || !this.db) throw new Error('unknown credential');
    const v = value.trim();
    if (!v || v.length > 2000) throw new Error('That value isn’t valid.');
    if (f.pattern && !f.pattern.test(v)) throw new Error(`That doesn’t look right.${f.hint ? ` ${f.hint}.` : ''}`);
    await withSystem(this.db, tx => tx.query(
      `INSERT INTO integration_secrets (provider, name, ciphertext, last4, updated_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, last4 = EXCLUDED.last4, updated_by = EXCLUDED.updated_by, updated_at = now(), last_test_at = NULL, last_test_ok = NULL, last_test_note = NULL`,
      [provider, name, this.crypto.sealPlatform(`secret:${provider}:${name}`, v), last4(v), by]));
    await this.refresh();
  }

  async remove(provider: string, name: string): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => tx.query('DELETE FROM integration_secrets WHERE provider = $1 AND name = $2', [provider, name]));
    await this.refresh();
  }

  async recordTest(provider: string, ok: boolean, note: string): Promise<void> {
    if (!this.db) return;
    await withSystem(this.db, tx => tx.query('UPDATE integration_secrets SET last_test_at = now(), last_test_ok = $3, last_test_note = $4 WHERE provider = $1 AND name = $2', [provider, INTEGRATION_BY_ID.get(provider)?.fields.find(f => f.secret)?.name ?? 'api_key', ok, note.slice(0, 200)]));
    await this.refresh();
  }

  /** Values for a provider's test, as a name to value map. */
  values(provider: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of INTEGRATION_BY_ID.get(provider)?.fields ?? []) { const v = this.get(provider, f.name); if (v) out[f.name] = v; }
    return out;
  }
}
