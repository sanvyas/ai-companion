import type { FastifyInstance } from 'fastify';
import { AgeBody, CompanionUpdate, ConsentUpdate, MeUpdate, PrivacyUpdate, TrustedContact } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { forbidden } from '../errors.js';
import { parse, uid } from '../http.js';
import { cancelDeletion, deleteTrusted, getMe, putTrusted, requestDeletion, updateCompanion, updateConsent, updateMe, updatePrivacy } from '../services/profile.js';
import { exportAll } from '../services/export.js';
import { pauseAsMinor } from '../services/users.js';

export function meRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = { preHandler: app.auth };

  app.get('/me', auth, async req => getMe(ctx, uid(req)));

  app.patch('/me', auth, async req => {
    await updateMe(ctx, uid(req), parse(MeUpdate, req.body));
    return getMe(ctx, uid(req));
  });

  app.delete('/me', auth, async (req, reply) => {
    await requestDeletion(ctx, uid(req));
    return reply.code(202).send({ status: 'scheduled', purgeWithinDays: 30 });
  });

  app.post('/me/deletion/cancel', auth, async (req, reply) => {
    await cancelDeletion(ctx, uid(req));
    return reply.code(204).send();
  });

  app.get('/me/export', auth, async (req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="saathi-data.json"');
    return exportAll(ctx, uid(req));
  });

  // 403 under18 -> the app shows the Under-18 exit (PRD section 7). Nothing is created for a "no".
  app.put('/me/age', auth, async (req, reply) => {
    const b = parse(AgeBody, req.body);
    if (!b.confirmed18) {
      await pauseAsMinor(ctx, uid(req));
      throw forbidden('under18', 'Saathi is for adults.');
    }
    return reply.code(204).send();
  });

  app.get('/me/consent', auth, async req => (await getMe(ctx, uid(req))).consent);
  app.put('/me/consent', auth, async req => updateConsent(ctx, uid(req), parse(ConsentUpdate, req.body)));
  app.get('/me/privacy', auth, async req => (await getMe(ctx, uid(req))).privacy);
  app.put('/me/privacy', auth, async req => updatePrivacy(ctx, uid(req), parse(PrivacyUpdate, req.body)));
  app.get('/me/companion', auth, async req => (await getMe(ctx, uid(req))).companion);
  app.put('/me/companion', auth, async req => updateCompanion(ctx, uid(req), parse(CompanionUpdate, req.body)));

  app.get('/trusted-contact', auth, async req => (await getMe(ctx, uid(req))).trustedContact);
  app.put('/trusted-contact', auth, async (req, reply) => {
    await putTrusted(ctx, uid(req), parse(TrustedContact, req.body));
    return reply.code(204).send();
  });
  app.delete('/trusted-contact', auth, async (req, reply) => {
    await deleteTrusted(ctx, uid(req));
    return reply.code(204).send();
  });

  // Server TTS previews need a TTS vendor. Until one is connected the web app uses the browser's voices.
  app.get('/voices/samples', auth, async () => ({ available: !!ctx.tts, samples: [] as string[] }));
}
