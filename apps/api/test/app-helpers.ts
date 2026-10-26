import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Ctx } from '../src/context.js';
import { MockLlm } from '../src/providers/llm.js';
import { testConfig } from './helpers.js';

export interface TestApp { app: FastifyInstance; ctx: Ctx; llm: MockLlm }

export async function makeApp(env: Record<string, string> = {}): Promise<TestApp> {
  const { app, ctx } = await buildApp(testConfig(env));
  await app.ready();
  return { app, ctx, llm: ctx.llm as MockLlm };
}

let counter = 0;
export const newPhone = () => `9${String(Date.now()).slice(-6)}${String(++counter).padStart(3, '0')}`.slice(0, 10);

export interface Auth { headers: { authorization: string }; userId: string; refreshToken: string; phone: string; accessToken: string }

/** Sign in through the real OTP endpoints using the dev code. */
export async function signIn(t: TestApp, phone = newPhone(), nickname = 'Aarav'): Promise<Auth> {
  const start = await t.app.inject({ method: 'POST', url: '/auth/otp/start', payload: { phone, ageConfirmed18: true } });
  if (start.statusCode !== 200) throw new Error(`otp start failed: ${start.body}`);
  const { devCode, challengeId } = start.json();
  const verify = await t.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code: devCode, challengeId, ageConfirmed18: true, nickname } });
  if (verify.statusCode !== 200) throw new Error(`otp verify failed: ${verify.body}`);
  const s = verify.json();
  const me = await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${s.accessToken}` } });
  return { headers: { authorization: `Bearer ${s.accessToken}` }, userId: me.json().id, refreshToken: s.refreshToken, phone, accessToken: s.accessToken };
}
