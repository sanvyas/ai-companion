import type { Config } from '../config.js';
import type { Crypto } from '../crypto/envelope.js';
import type { Db } from '../db/pool.js';
import { seedEvalCases } from './evalSeeds.js';
import { Flags } from './flags.js';
import { Pricing } from './pricing.js';
import { PromptStore, setLivePrompts } from './prompts.js';
import { Secrets } from './secrets.js';
import { Settings } from './settings.js';

/**
 * Everything the portal can change while the app is running. Loaded once at startup, refreshed every few seconds so
 * other instances catch up, and refreshed at once on any change made through this instance.
 */
export class Runtime {
  readonly settings: Settings;
  readonly flags: Flags;
  readonly secrets: Secrets;
  readonly prompts: PromptStore;
  readonly pricing: Pricing;

  constructor(private readonly db: Db | null, crypto: Crypto, cfg: RuntimeConfig, env: NodeJS.ProcessEnv = process.env) {
    this.settings = new Settings(db, cfg);
    this.flags = new Flags(db);
    this.secrets = new Secrets(db, crypto, env);
    this.prompts = new PromptStore(db);
    this.pricing = new Pricing(db, this.settings);
    setLivePrompts(this.prompts);
  }

  async start(): Promise<void> {
    if (this.db) await seedEvalCases(this.db);
    await Promise.all([this.settings.refresh(), this.flags.refresh(), this.secrets.refresh(), this.prompts.refresh(), this.pricing.refresh()]);
    for (const x of [this.settings, this.flags, this.secrets, this.prompts, this.pricing]) x.startPolling();
  }

  stop() { for (const x of [this.settings, this.flags, this.secrets, this.prompts, this.pricing]) x.stop(); }
}

export type RuntimeConfig = Pick<Config, 'MODEL_COMPANION' | 'MODEL_SAFETY' | 'MODEL_ANALYSIS' | 'BASIC_VOICE_MINUTES_PER_DAY'>;
