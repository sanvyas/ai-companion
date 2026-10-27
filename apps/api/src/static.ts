import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';

/** Paths that must stay reachable in maintenance mode so the UI can show its own message. */
export const STATIC_OPEN_DURING_MAINTENANCE = /^\/(portal|assets|sw\.js|manifest\.webmanifest|icon\.svg)(\/|\?|$)|^\/(\?.*)?$/;

const HASHED = /\/assets\//;

/**
 * The API can serve the two built front ends itself, which puts the app, the portal and the API on one origin: no CORS,
 * and the portal's SameSite=Strict session cookie just works. The portal lives under /portal/ and never gets framed.
 */
export async function registerStatic(app: FastifyInstance, cfg: Config) {
  const cache = (path: string) => (HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');

  if (cfg.STATIC_ADMIN_DIR && existsSync(cfg.STATIC_ADMIN_DIR)) {
    await app.register(fastifyStatic, {
      root: cfg.STATIC_ADMIN_DIR,
      prefix: '/portal/',
      wildcard: false,
      cacheControl: false,
      decorateReply: false,
      setHeaders: (res, path) => {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-store');
      },
    });
    app.get('/portal', async (_req, reply) => reply.redirect('/portal/', 301));
  }

  if (cfg.STATIC_WEB_DIR && existsSync(cfg.STATIC_WEB_DIR)) {
    await app.register(fastifyStatic, {
      root: cfg.STATIC_WEB_DIR,
      prefix: '/',
      wildcard: false,
      cacheControl: false,
      decorateReply: !cfg.STATIC_ADMIN_DIR,
      setHeaders: (res, path) => {
        res.setHeader('Cache-Control', cache(path));
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    });
  }
}
