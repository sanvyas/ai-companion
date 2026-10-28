import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { ClientMsg, CreateConversationBody, EndFeedback, type ServerMsg } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { verifyAccess } from '../auth/tokens.js';
import { AppError } from '../errors.js';
import { parse, uid } from '../http.js';
import { recordClientLatency } from '../services/llmHealth.js';
import { handleTurn, createConversation, endConversation, handleOpening, handleSilence, listConversations, listMessages, needsOpening, openSession, type LiveSession } from '../services/conversations.js';
import { VoiceBridge, speaksFromServer } from '../services/voice.js';
import { withIdempotency } from '../services/idempotency.js';

const TURNS_PER_MINUTE = 20;

/**
 * A WebSocket's Origin must be one of the configured app origins, or the API's own address: when the API serves the app
 * itself (the single-service deploy), the app and the socket share a host and the browser sends exactly that as Origin.
 */
export function originAllowed(origin: string | undefined, host: string | string[] | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  const h = (Array.isArray(host) ? host[0] : host)?.split(',')[0]?.trim().toLowerCase();
  if (!h) return false;
  try { return new URL(origin).host.toLowerCase() === h; } catch { return false; }
}

export function conversationRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = { preHandler: app.auth };

  app.post('/conversations', auth, async (req, reply) =>
    withIdempotency(ctx, req, reply, async () => {
      const b = parse(CreateConversationBody, req.body);
      return { status: 201, body: await createConversation(ctx, uid(req), b.mode, b.continueFrom, b.first) };
    }));

  app.post('/walks', auth, async (req, reply) =>
    withIdempotency(ctx, req, reply, async () => ({ status: 201, body: await createConversation(ctx, uid(req), 'walk') })));

  app.get('/conversations', auth, async req => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }), req.query);
    return { items: await listConversations(ctx, uid(req), q.limit) };
  });

  app.get('/conversations/:id/messages', auth, async req => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return { items: await listMessages(ctx, uid(req), id) };
  });

  app.post('/conversations/:id/end', auth, async req => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const fb = parse(EndFeedback, req.body ?? {});
    return endConversation(ctx, uid(req), id, fb.feeling);
  });

  // ---- WebSocket: text turns now, voice transcripts through the same pipeline ----------------------------
  app.get('/conversations/:id/stream', {
    websocket: true,
    config: { rateLimit: false },
    preValidation: async (req) => {
      // Browsers do not apply CORS to WebSockets, so the Origin is checked here.
      if (!originAllowed(req.headers.origin, req.headers['x-forwarded-host'] ?? req.headers.host, ctx.cfg.webOrigins)) throw new AppError(403, 'bad_origin', 'That origin isn’t allowed.');
    },
  }, (socket: WebSocket, req) => {
    const { id } = req.params as { id: string };
    let session: LiveSession | null = null;
    let voice: VoiceBridge | null = null;
    let userId: string | null = null;
    const stamps: number[] = [];
    let chain: Promise<void> = Promise.resolve();

    const send = (m: ServerMsg) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m)); };
    const fail = (code: string, message: string, close = false) => { send({ type: 'error', code, message }); if (close) socket.close(4001, code); };

    // Credentials travel in the first frame, not the URL, so tokens stay out of access logs.
    const authTimer = setTimeout(() => { if (!session) socket.close(4001, 'auth_timeout'); }, 5000);

    socket.on('message', (raw, isBinary) => {
      // Binary frames are microphone audio (PCM16 mono 16 kHz) once voice_start has been sent.
      if (isBinary) { if (voice) voice.audio(raw as Buffer); return; }
      let msg: ReturnType<typeof ClientMsg.safeParse>;
      try { msg = ClientMsg.safeParse(JSON.parse(raw.toString())); } catch { return fail('bad_message', 'That message wasn’t understood.'); }
      if (!msg.success) return fail('bad_message', 'That message wasn’t understood.');
      const m = msg.data;

      if (m.type === 'ping') return send({ type: 'pong' });

      if (m.type === 'auth') {
        if (session) return;
        chain = chain.then(async () => {
          try {
            const a = await verifyAccess(ctx, m.token);
            userId = a.userId;
            const s = await openSession(ctx, a.userId, id);
            session = s;
            voice = new VoiceBridge(ctx, s, socket, send);
            clearTimeout(authTimer);
            send({ type: 'ready', conversationId: id, mode: s.mode, companion: s.companion, voice: { serverStt: !!ctx.stt, serverTts: speaksFromServer(ctx, s) }, opening: s.opening });
            if (needsOpening(s)) chain = chain.then(() => handleOpening(ctx, s, mm => voice!.emit(mm))).catch(e => ctx.log.warn({ err: (e as Error).message }, 'opening failed'));
          } catch (e) {
            const ae = e instanceof AppError ? e : null;
            fail(ae?.code ?? 'internal', ae?.message ?? 'Something went wrong.', true);
          }
        });
        return;
      }

      if (!session || !userId) return fail('unauthorized', 'Please sign in again.', true);
      const s = session;

      if (m.type === 'interrupt') { voice?.interrupt(); s.abort?.abort(); return; }
      if (m.type === 'voice_start') { chain = chain.then(() => voice!.start(m.language)).catch(e => ctx.log.warn({ err: (e as Error).message }, 'voice_start failed')); return; }
      if (m.type === 'voice_stop') { voice?.stop(); return; }
      if (m.type === 'latency') { recordClientLatency(ctx, s.userId, s.mode, m.endpointMs, m.replyMs); return; }
      if (m.type === 'end') {
        chain = chain.then(async () => {
          try {
            const out = await endConversation(ctx, s.userId, s.conversationId);
            send({ type: 'done', messageId: null, riskLevel: s.risk.level, text: out.summary });
            socket.close(1000, 'ended');
          } catch (e) { fail('end_failed', (e as Error).message); }
        });
        return;
      }

      // Soft limit per connection: a person cannot send 20 turns a minute; a runaway client can.
      const now = Date.now();
      while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
      if (m.type === 'turn') {
        if (stamps.length >= TURNS_PER_MINUTE) return fail('rate_limited', 'Slow down a little.');
        stamps.push(now);
      }

      chain = chain.then(async () => {
        try {
          if (m.type === 'turn') await handleTurn(ctx, s, m.text, mm => voice!.emit(mm), m.clientId);
          else if (m.type === 'silence') await handleSilence(ctx, s, m.seconds, send);
        } catch (e) {
          ctx.log.error({ err: (e as Error).message }, 'turn failed');
          fail('internal', 'Something went wrong on our side. Please try again.');
        }
      });
    });

    socket.on('close', () => { clearTimeout(authTimer); voice?.close(); session?.abort?.abort(); });
    socket.on('error', () => { clearTimeout(authTimer); });
  });
}

