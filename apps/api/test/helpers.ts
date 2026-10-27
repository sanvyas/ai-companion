import { loadConfig } from '../src/config.js';
import { Crypto } from '../src/crypto/envelope.js';
import { createPool, type Db } from '../src/db/pool.js';
import { randomBytes } from 'node:crypto';

export const testEnv = () => ({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL!,
  JWT_SECRET: 'x'.repeat(40),
  DATA_KEK: randomBytes(32).toString('base64'),
  PHONE_HASH_KEY: randomBytes(32).toString('base64'),
  OTP_PEPPER: 'pepper-pepper-pepper',
  LLM_PROVIDER: 'mock',
  OTP_PROVIDER: 'console',
  RUN_WORKER: 'false',
  RATE_LIMIT_SCALE: '1000',
  LOG_LEVEL: 'silent',
});

/** Override environment values for one app. A value of '__unset__' removes the variable. */
export function testConfig(over: Record<string, string> = {}) {
  const env: Record<string, string> = { ...testEnv(), ...over };
  for (const [k, v] of Object.entries(env)) if (v === '__unset__') delete env[k];
  return loadConfig(env as NodeJS.ProcessEnv);
}

export function testDb(): Db {
  return createPool(testConfig());
}

export const testCrypto = (cfg = testConfig()) => new Crypto(cfg.DATA_KEK, cfg.PHONE_HASH_KEY);
