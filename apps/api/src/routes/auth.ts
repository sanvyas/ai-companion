import type { FastifyInstance } from 'fastify';
import { GoogleBody, OtpStartBody, OtpVerifyBody, RefreshBody } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { issueSession, revokeFamilyByRefresh, rotateSession } from '../auth/tokens.js';
import { verifyGoogleIdToken } from '../auth/google.js';
import { parse } from '../http.js';
import { startOtp, verifyOtp } from '../services/otp.js';
import { resolveUser } from '../services/users.js';

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const lim = (max: number) => max * ctx.cfg.RATE_LIMIT_SCALE;
  app.post('/auth/otp/start', { config: { rateLimit: { max: lim(10), timeWindow: '1 hour' } } }, async req => {
    const b = parse(OtpStartBody, req.body);
    return startOtp(ctx, b.phone, b.ageConfirmed18, req.ip);
  });

  app.post('/auth/otp/verify', { config: { rateLimit: { max: lim(30), timeWindow: '1 hour' } } }, async req => {
    const b = parse(OtpVerifyBody, req.body);
    const phone = await verifyOtp(ctx, b.phone, b.code, b.challengeId);
    const u = await resolveUser(ctx, { kind: 'phone', value: phone }, { ageConfirmed18: b.ageConfirmed18, nickname: b.nickname });
    const s = await issueSession(ctx, u.userId, { deviceLabel: b.deviceLabel });
    return { ...s, isNewUser: u.isNew, pendingDeletion: u.pendingDeletion };
  });

  app.post('/auth/google', { config: { rateLimit: { max: lim(30), timeWindow: '1 hour' } } }, async req => {
    const b = parse(GoogleBody, req.body);
    const g = await verifyGoogleIdToken({ GOOGLE_CLIENT_ID: ctx.rt.secrets.get('google', 'client_id') }, b.idToken);
    const u = await resolveUser(ctx, { kind: 'google', value: g.sub }, { ageConfirmed18: b.ageConfirmed18, nickname: b.nickname });
    const s = await issueSession(ctx, u.userId, { deviceLabel: b.deviceLabel });
    return { ...s, isNewUser: u.isNew, pendingDeletion: u.pendingDeletion };
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: lim(60), timeWindow: '1 hour' } } }, async req => {
    const b = parse(RefreshBody, req.body);
    const { session, userId } = await rotateSession(ctx, b.refreshToken);
    void userId;
    return { ...session, isNewUser: false, pendingDeletion: false };
  });

  app.post('/auth/logout', async (req, reply) => {
    const b = parse(RefreshBody, req.body);
    await revokeFamilyByRefresh(ctx, b.refreshToken);
    return reply.code(204).send();
  });
}
