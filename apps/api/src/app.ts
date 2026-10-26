import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import type { Ctx } from './context.js';
import type { Config } from './config.js';
import { createPool, type Db } from './db/pool.js';
import { Crypto } from './crypto/envelope.js';
import { createProviders } from './providers/index.js';
import { AppError } from './errors.js';
import { LlmFailure, LlmRefusal, LlmUnavailable } from './providers/llm.js';
import { registerAuth } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { conversationRoutes } from './routes/conversations.js';
import { dataRoutes } from './routes/data.js';
import { inboxRoutes, notificationRoutes } from './routes/notifications.js';
import { publicRoutes } from './routes/public.js';

export interface BuildOpts { db?: Db; overrides?: Partial<Ctx> }

export async function buildApp(cfg: Config, opts: BuildOpts = {}): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      // Never log credentials or content. Handlers log ids and codes, not text.
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body', 'res.headers["set-cookie"]'], censor: '[redacted]' },
    },
    trustProxy: true,
    bodyLimit: 256 * 1024,
    disableRequestLogging: false,
  });

  const db = opts.db ?? createPool(cfg);
  const providers = createProviders(cfg, db, app.log);
  const ctx: Ctx = { cfg, db, crypto: new Crypto(cfg.DATA_KEK, cfg.PHONE_HASH_KEY), log: app.log, ...providers, ...opts.overrides };

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: cfg.webOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });
  await app.register(rateLimit, { global: true, max: 240 * cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });
  registerAuth(app, ctx);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) reply.header(k, v);
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof LlmUnavailable) return reply.code(503).send({ error: { code: 'llm_unavailable', message: 'Your companion isn’t connected right now. Helplines and breathing exercises still work.' } });
    if (err instanceof LlmFailure || err instanceof LlmRefusal) return reply.code(502).send({ error: { code: 'llm_failed', message: 'I couldn’t find my words just then. Please try again in a moment.' } });
    if (err instanceof ZodError) return reply.code(400).send({ error: { code: 'validation_failed', message: 'Some of that didn’t look right.', details: err.issues } });
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Slow down a little and try again.' } });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: e.message ?? 'Bad request' } });
    req.log.error({ err: { message: e.message, code: e.code } }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'That route doesn’t exist.' } }));

  publicRoutes(app, ctx);
  authRoutes(app, ctx);
  meRoutes(app, ctx);
  conversationRoutes(app, ctx);
  dataRoutes(app, ctx);
  notificationRoutes(app, ctx);
  inboxRoutes(app, ctx);

  app.addHook('onClose', async () => { if (!opts.db) await db.end(); });
  return { app, ctx };
}
