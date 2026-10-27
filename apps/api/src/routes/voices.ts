import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Language } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser } from '../db/pool.js';
import { AppError } from '../errors.js';
import { parse, uid } from '../http.js';
import { TtsFailure, TtsUnavailable } from '../providers/voice.js';
import { SAMPLE, isServerVoice, voiceById, voicesFor } from '../services/voices.js';

const Query = z.object({ language: Language.optional() });
const Preview = z.object({ voice: z.string().min(2).max(40), language: Language.optional() });

/**
 * The voices a person can give their companion, filtered to the language they use, and a short spoken sample of each.
 * Samples carry no personal data (one fixed sentence per language), so they are kept in memory and paid for once.
 */
export function voiceRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = { preHandler: app.auth };
  const cache = new Map<string, { wav: string; sampleRate: number }>();

  const userLanguage = async (userId: string) => (await withUser(ctx.db, userId, tx => tx.query<{ language: 'en' | 'hinglish' | 'hi' }>('SELECT language FROM users WHERE id = $1', [userId]))).rows[0]?.language ?? 'en';

  app.get('/voices', auth, async req => {
    const q = parse(Query, req.query);
    const language = q.language ?? (await userLanguage(uid(req)));
    const server = !!ctx.tts?.configured;
    return {
      language,
      // When no server voice is connected, only the phone's own voices are offered and the app says so.
      serverVoices: server,
      items: voicesFor(language, server).map(v => ({ id: v.id, label: v.label, gender: v.gender, provider: v.provider })),
    };
  });

  app.post('/voices/preview', { preHandler: app.auth, config: { rateLimit: { max: 15 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async req => {
    const b = parse(Preview, req.body);
    const v = voiceById(b.voice);
    if (!v || !isServerVoice(b.voice)) throw new AppError(400, 'not_a_server_voice', 'That voice plays on your phone, not from the server.');
    if (!ctx.tts?.configured) throw new AppError(503, 'voice_unavailable', 'The voices aren’t connected yet. You can still use the phone’s own voices.');
    const language = b.language ?? (await userLanguage(uid(req)));
    if (!v.languages.includes(language)) throw new AppError(400, 'voice_language', 'That voice doesn’t speak this language.');
    const key = `${v.id}|${language}`;
    let hit = cache.get(key);
    if (!hit) {
      try {
        const r = await ctx.tts.synthesize({ text: SAMPLE[language], voice: v.id, language, userId: uid(req) });
        hit = { wav: r.wav.toString('base64'), sampleRate: r.sampleRate };
        if (cache.size >= 80) cache.delete(cache.keys().next().value as string);
        cache.set(key, hit);
      } catch (e) {
        if (e instanceof TtsUnavailable) throw new AppError(503, 'voice_unavailable', e.message);
        if (e instanceof TtsFailure) throw new AppError(502, 'voice_failed', 'I couldn’t make that voice speak just now. Please try another, or try again.');
        throw e;
      }
    }
    return { mime: 'audio/wav', audio: hit.wav, sampleRate: hit.sampleRate, text: SAMPLE[language] };
  });
}
