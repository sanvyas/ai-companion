import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db/pool.js';
import { withSystem } from '../db/pool.js';
import { modelOptions } from './models.js';

// Settings the founder can change without a deploy. Each one is typed and validated here; the portal renders its
// editor from this list, and the live app reads the current value from memory (refreshed every few seconds).

export type SettingKind = 'text' | 'long' | 'int' | 'number' | 'bool' | 'json' | 'select';
export interface SettingDef {
  key: string;
  group: 'Models' | 'Limits' | 'Access' | 'Cost' | 'Analytics' | 'Developer';
  label: string;
  description: string;
  kind: SettingKind;
  schema: z.ZodTypeAny;
  default: unknown;
  /** For kind 'select': the choices the portal offers. */
  options?: { value: string; label: string }[];
  /** Only owners may change these (they affect safety, money or access). */
  ownerOnly?: boolean;
}

const EnvList = z.array(z.object({ name: z.string().trim().min(1).max(30), url: z.string().url().max(200) })).max(6);

export function settingDefs(cfg: Pick<Config, 'MODEL_COMPANION' | 'MODEL_SAFETY' | 'MODEL_ANALYSIS' | 'BASIC_VOICE_MINUTES_PER_DAY'>): SettingDef[] {
  const choices = modelOptions(cfg.MODEL_COMPANION, cfg.MODEL_SAFETY, cfg.MODEL_ANALYSIS);
  const model = z.enum(choices.map(c => c.value) as [string, ...string[]], { errorMap: () => ({ message: 'Choose one of the listed models.' }) });
  return [
    { key: 'models.companion', group: 'Models', label: 'Companion model', description: 'Writes the live replies. Speed matters most here.', kind: 'select', options: choices, schema: model, default: cfg.MODEL_COMPANION, ownerOnly: true },
    { key: 'models.safety', group: 'Models', label: 'Safety model', description: 'Classifies every message and reviews risky drafts. Keep it fast and careful.', kind: 'select', options: choices, schema: model, default: cfg.MODEL_SAFETY, ownerOnly: true },
    { key: 'models.analysis', group: 'Models', label: 'Analysis model', description: 'Journal reading, summaries, memory proposals and the weekly letter.', kind: 'select', options: choices, schema: model, default: cfg.MODEL_ANALYSIS, ownerOnly: true },

    { key: 'governance.require_approval', group: 'Access', label: 'Changes need approval', description: 'When on, changes made by anyone below owner wait for someone more senior to approve them before they reach the app.', kind: 'bool', schema: z.boolean(), default: true, ownerOnly: true },

    { key: 'limits.voice_minutes_per_day', group: 'Limits', label: 'Voice minutes per day (Basic)', description: 'Per person. Never applied during a crisis. 0 means no voice.', kind: 'int', schema: z.number().int().min(0).max(240), default: cfg.BASIC_VOICE_MINUTES_PER_DAY },

    { key: 'access.signups_open', group: 'Access', label: 'New sign-ups open', description: 'Off stops new accounts. People who already have one can still sign in.', kind: 'bool', schema: z.boolean(), default: true },
    { key: 'access.maintenance', group: 'Access', label: 'Maintenance mode', description: 'Pauses the app for everyone except helplines and the safety screens.', kind: 'bool', schema: z.boolean(), default: false },
    { key: 'access.maintenance_message', group: 'Access', label: 'Maintenance message', description: 'Shown to people while maintenance mode is on.', kind: 'long', schema: z.string().trim().min(1).max(280), default: 'Saathi is taking a short break and will be back soon. Helplines and breathing exercises still work.' },
    { key: 'kill.voice', group: 'Access', label: 'Pause voice and video calls', description: 'Emergency switch if a voice vendor is failing. Text chat keeps working.', kind: 'bool', schema: z.boolean(), default: false },

    { key: 'cost.monthly_budget_inr', group: 'Cost', label: 'Monthly budget (₹)', description: 'The Cost page warns as you approach it. 0 turns the warning off.', kind: 'int', schema: z.number().int().min(0).max(100_000_000), default: 0 },
    { key: 'cost.usd_inr', group: 'Cost', label: 'US dollar in rupees', description: 'Used to turn dollar prices into rupees.', kind: 'number', schema: z.number().min(50).max(200), default: 87 },
    { key: 'cost.alert_pct', group: 'Cost', label: 'Budget warning at (%)', description: 'Percentage of the monthly budget at which the warning shows.', kind: 'int', schema: z.number().int().min(10).max(100), default: 80 },

    { key: 'analytics.enabled', group: 'Analytics', label: 'Collect product analytics', description: 'Master switch. Even when on, only people who opted in are tracked.', kind: 'bool', schema: z.boolean(), default: true },
    { key: 'analytics.retention_days', group: 'Analytics', label: 'Keep analytics for (days)', description: 'Older events are deleted by the nightly job.', kind: 'int', schema: z.number().int().min(7).max(730), default: 180 },

    { key: 'dev.github_repo', group: 'Developer', label: 'GitHub repository', description: 'owner/name, for the Developer page. The token goes under Integrations.', kind: 'text', schema: z.string().trim().max(100).regex(/^$|^[\w.-]+\/[\w.-]+$/, 'Use owner/name'), default: '' },
    { key: 'dev.environments', group: 'Developer', label: 'Environments', description: 'Name and base URL of each deployed API (dev, staging, production). Their health is checked on the Developer page.', kind: 'json', schema: EnvList, default: [] },
  ];
}

export interface SettingView { def: Omit<SettingDef, 'schema'>; value: unknown; isDefault: boolean; updatedAt: string | null; updatedBy: string | null }

export class Settings {
  private values = new Map<string, unknown>();
  private meta = new Map<string, { at: string; by: string | null }>();
  private timer?: ReturnType<typeof setInterval>;
  readonly defs: SettingDef[];
  private readonly byKey: Map<string, SettingDef>;

  constructor(private readonly db: Db | null, cfg: Parameters<typeof settingDefs>[0]) {
    this.defs = settingDefs(cfg);
    this.byKey = new Map(this.defs.map(d => [d.key, d]));
  }

  async refresh(): Promise<void> {
    if (!this.db) return;
    const rows = (await withSystem(this.db, tx => tx.query('SELECT key, value, updated_by, updated_at FROM app_settings'))).rows;
    this.values = new Map(); this.meta = new Map();
    for (const r of rows) {
      const def = this.byKey.get(r.key as string);
      const parsed = def?.schema.safeParse(r.value);
      if (def && parsed?.success) { this.values.set(def.key, parsed.data); this.meta.set(def.key, { at: new Date(r.updated_at as string).toISOString(), by: (r.updated_by as string) ?? null }); }
    }
  }

  startPolling(ms = 10_000) { this.timer = setInterval(() => void this.refresh().catch(() => undefined), ms); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); }

  get<T = unknown>(key: string): T {
    const d = this.byKey.get(key);
    if (!d) throw new Error(`unknown setting ${key}`);
    return (this.values.has(key) ? this.values.get(key) : d.default) as T;
  }
  bool = (key: string) => this.get<boolean>(key);
  num = (key: string) => this.get<number>(key);
  str = (key: string) => this.get<string>(key);

  list(): SettingView[] {
    return this.defs.map(({ schema: _s, ...def }) => ({ def, value: this.get(def.key), isDefault: !this.values.has(def.key), updatedAt: this.meta.get(def.key)?.at ?? null, updatedBy: this.meta.get(def.key)?.by ?? null }));
  }

  def(key: string) { return this.byKey.get(key); }

  async set(key: string, raw: unknown, by: string): Promise<{ before: unknown; after: unknown }> {
    const d = this.byKey.get(key);
    if (!d || !this.db) throw new Error('unknown setting');
    const value = d.schema.parse(raw);
    const before = this.get(key);
    await withSystem(this.db, tx => tx.query(`INSERT INTO app_settings (key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [key, JSON.stringify(value), by]));
    await this.refresh();
    return { before, after: value };
  }

  async reset(key: string): Promise<unknown> {
    if (!this.db || !this.byKey.has(key)) throw new Error('unknown setting');
    const before = this.get(key);
    await withSystem(this.db, tx => tx.query('DELETE FROM app_settings WHERE key = $1', [key]));
    await this.refresh();
    return before;
  }
}
