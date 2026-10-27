import { TtsFailure, TtsUnavailable, parseWav, type Synthesis, type TtsChunk, type TtsOptions, type TtsProvider, type TtsUsage } from './voice.js';
import { SARVAM_LANG, SARVAM_MODEL, speakerOf } from '../services/voices.js';

// Sarvam text-to-speech (Bulbul). One request per utterance; the audio comes back as base64 WAV, which is unwrapped to
// PCM so it plays through the same path as any other server voice. The key is read at call time from the credential
// store, so adding or changing it in the admin portal takes effect immediately.
const URL = 'https://api.sarvam.ai/text-to-speech';
const SAMPLE_RATE = 24_000;
const MAX_CHARS = 1500;

export class SarvamTts implements TtsProvider {
  readonly name = 'sarvam';
  constructor(private readonly getKey: () => string | undefined, private readonly onUsage: (u: TtsUsage) => void, private readonly f: typeof fetch = fetch) {}
  get configured() { return !!this.getKey(); }

  async synthesize(o: TtsOptions): Promise<Synthesis> {
    const key = this.getKey();
    if (!key) throw new TtsUnavailable('The voice service isn’t connected yet.');
    const speaker = speakerOf(o.voice);
    if (!speaker) throw new TtsFailure('That isn’t one of the server voices.');
    const text = o.text.trim().slice(0, MAX_CHARS);
    if (!text) throw new TtsFailure('There is nothing to say.');
    const started = Date.now();
    let ok = false;
    try {
      const res = await this.post(key, { text, target_language_code: SARVAM_LANG[o.language], speaker, model: SARVAM_MODEL, pace: 1, speech_sample_rate: SAMPLE_RATE }, o.signal);
      const j = (await res.json()) as { audios?: string[]; audio?: string };
      const b64 = j.audios?.[0] ?? j.audio;
      if (!b64) throw new TtsFailure('The voice service answered without any audio.');
      const wav = Buffer.from(b64, 'base64');
      const { pcm, sampleRate } = parseWav(wav);
      ok = true;
      return { wav, pcm, sampleRate };
    } finally {
      this.onUsage({ provider: 'sarvam', kind: 'tts', chars: ok ? text.length : 0, latencyMs: Date.now() - started, ok, userId: o.userId });
    }
  }

  async *stream(o: TtsOptions): AsyncIterable<TtsChunk> {
    const { pcm } = await this.synthesize(o);
    const CHUNK = SAMPLE_RATE * 2; // one second of 16-bit mono
    for (let i = 0; i < pcm.length; i += CHUNK) {
      if (o.signal?.aborted) return;
      yield { audio: pcm.subarray(i, i + CHUNK) };
    }
  }

  private async post(key: string, body: unknown, signal?: AbortSignal, attempt = 0): Promise<Response> {
    const res = await this.f(URL, {
      method: 'POST',
      headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 1) { await new Promise(r => setTimeout(r, 400)); return this.post(key, body, signal, attempt + 1); }
    if (res.ok) return res;
    let msg = `Sarvam answered ${res.status}.`;
    try { const j = (await res.json()) as { error?: { message?: string }; message?: string; detail?: string }; msg = j.error?.message ?? j.message ?? (typeof j.detail === 'string' ? j.detail : msg); } catch { /* keep the status text */ }
    if (res.status === 401 || res.status === 403) throw new TtsUnavailable('Sarvam rejected the API key.');
    throw new TtsFailure(msg);
  }
}

/** For the portal's “Test connection”: one short real synthesis. */
export async function testSarvam(v: Record<string, string>, f: typeof fetch): Promise<{ ok: boolean; note: string }> {
  const tts = new SarvamTts(() => v.api_key, () => undefined, f);
  const started = Date.now();
  try {
    const r = await tts.synthesize({ text: 'Namaste.', voice: 'sarvam:priya', language: 'hi' });
    return { ok: true, note: `Key accepted. Spoke a test word in ${((Date.now() - started) / 1000).toFixed(1)} s (${(r.pcm.length / 2 / r.sampleRate).toFixed(1)} s of audio).` };
  } catch (e) {
    return { ok: false, note: e instanceof TtsUnavailable || e instanceof TtsFailure ? e.message : `Couldn’t reach Sarvam: ${(e as Error).message}` };
  }
}
