import { TtsFailure, TtsUnavailable, parseWav, type Synthesis, type TtsChunk, type TtsOptions, type TtsProvider, type TtsUsage } from './voice.js';
import { voiceById } from '../services/voices.js';

// Google Cloud Text-to-Speech (WaveNet). One request per utterance; the audio comes back as base64 inside JSON. It is
// asked for 24 kHz LINEAR16 so it is already PCM and plays through the same path as any other server voice. The key is
// read at call time from the credential store, so adding or changing it in the admin portal takes effect immediately.
const URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const SAMPLE_RATE = 24_000;
// Google accepts 5000 bytes per request; Devanagari is three bytes a letter, so the limit is counted in bytes.
const MAX_BYTES = 4800;

/** The language code Google wants is the first two parts of the voice name, en-IN-Wavenet-A -> en-IN. */
export const googleLangOf = (voiceName: string) => voiceName.split('-').slice(0, 2).join('-');

function clip(text: string): string {
  if (Buffer.byteLength(text) <= MAX_BYTES) return text;
  let out = '';
  for (const ch of text) { if (Buffer.byteLength(out + ch) > MAX_BYTES) break; out += ch; }
  return out;
}

export class GoogleTts implements TtsProvider {
  readonly name = 'google';
  constructor(private readonly getKey: () => string | undefined, private readonly onUsage: (u: TtsUsage) => void, private readonly f: typeof fetch = fetch) {}
  get configured() { return !!this.getKey(); }

  async synthesize(o: TtsOptions): Promise<Synthesis> {
    const key = this.getKey();
    if (!key) throw new TtsUnavailable('The voice service isn’t connected yet.');
    const voice = voiceById(o.voice);
    if (!voice || voice.provider !== 'google' || !voice.speaker) throw new TtsFailure('That isn’t one of the Google voices.');
    const text = clip(o.text.trim());
    if (!text) throw new TtsFailure('There is nothing to say.');
    const started = Date.now();
    let ok = false;
    try {
      const body = {
        input: { text },
        voice: { languageCode: googleLangOf(voice.speaker), name: voice.speaker },
        // Google's own range is 0.25 to 4; a companion's voice stays within what sounds natural.
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE, speakingRate: Math.min(1.3, Math.max(0.6, o.pace ?? 1)) },
      };
      const res = await this.post(key, body, o.signal);
      const j = (await res.json()) as { audioContent?: string };
      if (!j.audioContent) throw new TtsFailure('The voice service answered without any audio.');
      const wav = Buffer.from(j.audioContent, 'base64');
      const { pcm, sampleRate } = parseWav(wav);
      ok = true;
      return { wav, pcm, sampleRate };
    } finally {
      this.onUsage({ provider: 'google', kind: 'tts', chars: ok ? text.length : 0, latencyMs: Date.now() - started, ok, userId: o.userId });
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
      // The key goes in a header, never the URL, so it can't end up in a proxy's or the vendor's access log.
      headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 1) { await new Promise(r => setTimeout(r, 400)); return this.post(key, body, signal, attempt + 1); }
    if (res.ok) return res;
    let msg = `Google answered ${res.status}.`;
    let reason = '';
    try { const j = (await res.json()) as { error?: { message?: string; status?: string } }; msg = j.error?.message ?? msg; reason = j.error?.status ?? ''; } catch { /* keep the status text */ }
    if (res.status === 401 || res.status === 403 || reason === 'PERMISSION_DENIED' || /API key not valid|has not been used|is disabled/i.test(msg)) {
      throw new TtsUnavailable(/has not been used|is disabled/i.test(msg) ? 'Google rejected the call: the Cloud Text-to-Speech API isn’t enabled for this key’s project.' : 'Google rejected the API key.');
    }
    throw new TtsFailure(msg);
  }
}

/** For the portal's “Test connection”: one short real synthesis. */
export async function testGoogleTts(v: Record<string, string>, f: typeof fetch): Promise<{ ok: boolean; note: string }> {
  const tts = new GoogleTts(() => v.api_key, () => undefined, f);
  const started = Date.now();
  try {
    const r = await tts.synthesize({ text: 'Hello. I am here.', voice: 'google:en-in-wavenet-a', language: 'en' });
    return { ok: true, note: `Key accepted. Spoke a test line in ${((Date.now() - started) / 1000).toFixed(1)} s (${(r.pcm.length / 2 / r.sampleRate).toFixed(1)} s of audio).` };
  } catch (e) {
    return { ok: false, note: e instanceof TtsUnavailable || e instanceof TtsFailure ? e.message : `Couldn’t reach Google: ${(e as Error).message}` };
  }
}
