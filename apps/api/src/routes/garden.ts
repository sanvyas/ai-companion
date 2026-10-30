import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ActivityBody, CreationBody, JarBody, KeepsakeBody, PlantBody } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { parse, uid } from '../http.js';
import { assertAdult } from '../services/users.js';
import { getMonth, recordActivity } from '../services/month.js';
import { addCreation, addJarItem, addKeepsake, deleteCreation, deleteJarItem, getGarden, listCreations, listJar, pickPlant, plantSomething, recordBreath } from '../services/garden.js';

const Id = z.object({ id: z.string().uuid() });
const idOf = (req: { params: unknown }) => parse(Id, req.params).id;

export function gardenRoutes(app: FastifyInstance, ctx: Ctx) {
  const adult = { preHandler: [app.auth, async (req: { userId?: string }) => assertAdult(ctx, uid(req as never))] };
  const slow = (max: number) => ({ ...adult, config: { rateLimit: { max: max * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } });

  app.get('/garden', adult, async req => getGarden(ctx, uid(req)));
  app.post('/garden/plants', slow(30), async (req, reply) => { const b = parse(PlantBody, req.body); return reply.code(201).send(await plantSomething(ctx, uid(req), b.kind, b.slot)); });
  app.post('/garden/plants/:id/pick', slow(30), async req => pickPlant(ctx, uid(req), idOf(req)));
  // A paper boat sends only "a boat was let go". What was written for it never leaves the phone.
  app.post('/garden/keepsakes', slow(60), async (req, reply) => reply.code(201).send(await addKeepsake(ctx, uid(req), parse(KeepsakeBody, req.body).kind)));
  app.post('/garden/creations', slow(20), async (req, reply) => reply.code(201).send(await addCreation(ctx, uid(req), parse(CreationBody, req.body).image)));
  app.get('/garden/creations', adult, async req => ({ items: await listCreations(ctx, uid(req)) }));
  app.delete('/garden/creations/:id', adult, async (req, reply) => { await deleteCreation(ctx, uid(req), idOf(req)); return reply.code(204).send(); });
  app.post('/breaths', slow(60), async (req, reply) => { await recordBreath(ctx, uid(req)); return reply.code(204).send(); });

  // The third design's Month: the last four weeks, and the few things only they can tell us.
  app.get('/month', adult, async req => getMonth(ctx, uid(req)));
  app.post('/activity', slow(120), async (req, reply) => { await recordActivity(ctx, uid(req), parse(ActivityBody, req.body)); return reply.code(204).send(); });

  app.get('/jar', adult, async req => ({ items: await listJar(ctx, uid(req)) }));
  app.post('/jar', slow(40), async (req, reply) => reply.code(201).send(await addJarItem(ctx, uid(req), parse(JarBody, req.body).text)));
  app.delete('/jar/:id', adult, async (req, reply) => { await deleteJarItem(ctx, uid(req), idOf(req)); return reply.code(204).send(); });
}
