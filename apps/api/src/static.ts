import { existsSync } from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';

/** Paths that must stay reachable in maintenance mode so the UI can show its own message. */
export const STATIC_OPEN_DURING_MAINTENANCE = /^\/(portal|assets|sw\.js|manifest\.webmanifest|icon\.svg|icon-[\w-]+\.png|\.well-known)(\/|\?|$)|^\/(\?.*)?$/;

const HASHED = /\/assets\//;

/**
 * Content-Security-Policy for the two front ends. It is the second line of defence against injected script: even if
 * some text ever got rendered as HTML, the browser would refuse to run it, load it from elsewhere, or send data out.
 * The citizen app needs Google Sign-In (script, frame, styles) and Google Fonts; the portal needs nothing external.
 */
export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://accounts.google.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const PORTAL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const isHtml = (path: string) => /\.html?$/i.test(path);

/**
 * The API can serve the two built front ends itself, which puts the app, the portal and the API on one origin: no CORS,
 * and the portal's SameSite=Strict session cookie just works. The portal lives under /portal/ and never gets framed.
 * Dotfiles (.env, .git, ...) are never served, whatever ends up in those folders.
 */
export async function registerStatic(app: FastifyInstance, cfg: Config) {
  const cache = (path: string) => (HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');

  if (cfg.STATIC_ADMIN_DIR && existsSync(cfg.STATIC_ADMIN_DIR)) {
    await app.register(fastifyStatic, {
      root: cfg.STATIC_ADMIN_DIR,
      prefix: '/portal/',
      wildcard: false,
      cacheControl: false,
      dotfiles: 'ignore',
      decorateReply: false,
      setHeaders: (reply: FastifyReply, path: string) => {
        reply.header('X-Frame-Options', 'DENY');
        reply.header('Referrer-Policy', 'no-referrer');
        reply.header('X-Robots-Tag', 'noindex, nofollow');
        reply.header('X-Content-Type-Options', 'nosniff');
        if (isHtml(path)) reply.header('Content-Security-Policy', PORTAL_CSP);
        reply.header('Cache-Control', HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-store');
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
      dotfiles: 'ignore',
      decorateReply: !cfg.STATIC_ADMIN_DIR,
      setHeaders: (reply: FastifyReply, path: string) => {
        reply.header('Cache-Control', cache(path));
        reply.header('X-Content-Type-Options', 'nosniff');
        if (isHtml(path)) reply.header('Content-Security-Policy', APP_CSP);
      },
    });
  }
}
