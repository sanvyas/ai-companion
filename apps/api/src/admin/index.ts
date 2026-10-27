import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { analyticsRoutes } from './routes/analytics.js';
import { authRoutes } from './routes/auth.js';
import { configRoutes } from './routes/config.js';
import { contentRoutes } from './routes/content.js';
import { costRoutes } from './routes/cost.js';
import { infraRoutes } from './routes/infra.js';
import { overviewRoutes } from './routes/overview.js';
import { promptRoutes } from './routes/prompts.js';
import { safetyRoutes } from './routes/safety.js';
import { userRoutes } from './routes/users.js';

/** Everything under /admin/api. Own sign-in (password + authenticator code), own cookie, own roles, every write audited. */
export async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  await app.register(async scope => {
    authRoutes(scope, ctx);
    overviewRoutes(scope, ctx);
    userRoutes(scope, ctx);
    configRoutes(scope, ctx);
    promptRoutes(scope, ctx);
    safetyRoutes(scope, ctx);
    contentRoutes(scope, ctx);
    costRoutes(scope, ctx);
    analyticsRoutes(scope, ctx);
    infraRoutes(scope, ctx);
  }, { prefix: '/admin/api' });
}
