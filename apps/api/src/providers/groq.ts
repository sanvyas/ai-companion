import { TtsFailure, TtsUnavailable, parseWav, wavOf, type SttProvider, type SttSession, type SttUsage, type Transcriber, type TranscribeOptions } from './voice.js';
import { GROQ_BASE } from './llm.js';

// Speech to text on Groq (Whisper). Two ways in:
//  - GroqStt hears one finished recording (the journal's "Talk it out"), sent as a WAV file.
//  - GroqLiveStt listens during a call. Whisper does not stream, so the call audio is cut into sentences by a small silence
//    detector (UtteranceSegmenter) and each sentence is sent as soon as the person stops talking. The app is told "speech has
//    started" the moment it does, which is what lets someone interrupt the companion mid-sentence.

export const GROQ_STT_MODELS = [
  { value: 'whisper-large-v3-turbo', label: 'Whisper large v3 turbo · fast and cheap, the usual choice' },
  { value: 'whisper-large-v3', label: 'Whisper large v3 · a little more accurate, slower, costs more' },
];
export const DEFAULT_GROQ_STT_MODEL = 'whisper-large-v3-turbo';

/** Whisper tends to invent these when it is handed silence or noise. They are never what someone meant. */
const PHANTOMS = /^(?:thank you\.?|thanks\.?|thanks for watching\.?|thank you for watching\.?|bye\.?|you|\.+|the end\.?|subtitles by .*|please subscribe\.?)$/i;
export const isPhantom = (t: string) => !t.trim() || PHANTOMS.test(t.trim());

const LANG = { en: { language: 'en', prompt: '' }, hi: { language: 'hi', prompt: '' },
  // Asking for Hindi and showing it a Hindi sentence in English letters makes Whisper answer in English letters too.
  hinglish: { language: 'hi', prompt: 'Haan, main theek hoon. Bas thoda thaka hua hoon, aaj kaafi kaam tha.' } } as const;

export class GroqStt implements Transcriber {
  readonly name = 'groq';
  constructor(private readonly getKey: () => string | undefined, private readonly onUsage: (u: SttUsage) => void, private readonly getModel: () => string = () => DEFAULT_GROQ_STT_MODEL, private readonly f: typeof fetch = fetch) {}
  get configured() { return !!this.getKey(); }

  async transcribe(o: TranscribeOptions): Promise<{ text: string }> {
    const key = this.getKey();
    if (!key) throw new TtsUnavailable('The speech service isn’t connected yet.');
    const { sampleRate, pcm } = parseWav(o.wav);
    const seconds = pcm.length / 2 / sampleRate;
    const started = Date.now();
    let ok = false;
    try {
      const text = await this.send(key, o.wav, o.language);
      ok = true;
      return { text: isPhantom(text) ? '' : text };
    } finally {
      this.onUsage({ provider: 'groq', kind: 'stt', seconds: ok ? seconds : 0, latencyMs: Date.now() - started, ok, userId: o.userId });
    }
  }

  private async send(key: string, wav: Buffer, language: 'en' | 'hinglish' | 'hi', attempt = 0): Promise<string> {
    const l = LANG[language];
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', this.getModel());
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('language', l.language);
    if (l.prompt) form.append('prompt', l.prompt);
    const res = await this.f(`${GROQ_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000) });
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      const wait = Number(res.headers.get('retry-after'));
      await new Promise(r => setTimeout(r, Number.isFinite(wait) && wait > 0 ? Math.min(wait, 6) * 1000 : 500));
      return this.send(key, wav, language, attempt + 1);
    }
    if (!res.ok) {
      let msg = `Groq answered ${res.status}.`;
      try { const j = (await res.json()) as { error?: { message?: string } }; if (j.error?.message) msg = j.error.message; } catch { /* keep the status message */ }
      if (res.status === 401 || res.status === 403) throw new TtsUnavailable('Groq rejected the API key.');
      throw new TtsFailure(msg);
    }
    const j = (await res.json()) as { text?: string };
    return (j.text ?? '').trim();
  }
}

// ---------------------------------------------------------------------------------------------- cutting speech into sentences
const RATE = 16_000;

export interface SegmentOptions { rate?: number; startMs?: number; endSilenceMs?: number; minSpeechMs?: number; maxMs?: number; preRollMs?: number; minLevel?: number }
export type SegmentEvent = { type: 'start' } | { type: 'cancel' } | { type: 'end'; pcm: Buffer; speechMs: number };

const rms = (b: Buffer) => { let sum = 0; const n = Math.floor(b.length / 2); for (let i = 0; i < n; i++) { const v = b.readInt16LE(i * 2); sum += v * v; } return n ? Math.sqrt(sum / n) : 0; };

/**
 * Finds sentences in a stream of 16 kHz mono PCM. A chunk is "speech" when it is clearly louder than the room (the room's
 * level is learnt while nobody is talking). Speech starts after a short run of loud chunks and ends after a pause; a
 * little audio from before it started is kept so the first word is not clipped. Runs of noise that are too short to be
 * words are dropped.
 */
export class UtteranceSegmenter {
  private readonly o: Required<SegmentOptions>;
  private floor = 120;
  private state: 'idle' | 'speech' = 'idle';
  private voicedMs = 0;
  private silentMs = 0;
  private speechMs = 0;
  private body: Buffer[] = [];
  private roll: { pcm: Buffer; ms: number }[] = [];
  private rollMs = 0;
  private totalMs = 0;

  constructor(o: SegmentOptions = {}) {
    this.o = { rate: RATE, startMs: 140, endSilenceMs: 800, minSpeechMs: 320, maxMs: 25_000, preRollMs: 320, minLevel: 520, ...o };
  }

  push(chunk: Buffer): SegmentEvent[] {
    const out: SegmentEvent[] = [];
    const ms = (chunk.length / 2 / this.o.rate) * 1000;
    if (ms <= 0) return out;
    const level = rms(chunk);
    const loud = level > Math.max(this.o.minLevel, this.floor * 3);
    if (this.state === 'idle') {
      if (!loud) this.floor = Math.min(900, this.floor * 0.95 + level * 0.05);
      this.roll.push({ pcm: chunk, ms }); this.rollMs += ms;
      while (this.rollMs - this.roll[0].ms >= this.o.preRollMs && this.roll.length > 1) this.rollMs -= this.roll.shift()!.ms;
      this.voicedMs = loud ? this.voicedMs + ms : 0;
      if (this.voicedMs >= this.o.startMs) {
        this.state = 'speech'; this.body = this.roll.map(r => r.pcm); this.roll = []; this.rollMs = 0;
        this.speechMs = this.voicedMs; this.silentMs = 0; this.totalMs = this.body.reduce((n, b) => n + (b.length / 2 / this.o.rate) * 1000, 0);
        out.push({ type: 'start' });
      }
      return out;
    }
    this.body.push(chunk); this.totalMs += ms;
    if (loud) { this.speechMs += ms; this.silentMs = 0; } else this.silentMs += ms;
    if (this.silentMs >= this.o.endSilenceMs || this.totalMs >= this.o.maxMs) out.push(this.finish());
    return out;
  }

  /** The audio so far, as a sentence, when the call ends mid-speech. */
  flush(): SegmentEvent[] { return this.state === 'speech' ? [this.finish()] : []; }

  private finish(): SegmentEvent {
    const pcm = Buffer.concat(this.body);
    const speechMs = this.speechMs;
    this.state = 'idle'; this.body = []; this.voicedMs = 0; this.silentMs = 0; this.speechMs = 0; this.totalMs = 0;
    return speechMs >= this.o.minSpeechMs ? { type: 'end', pcm, speechMs } : { type: 'cancel' };
  }
}

class LiveSession implements SttSession {
  private cbT: (t: { text: string; final: boolean }) => void = () => undefined;
  private cbE: (e: Error) => void = () => undefined;
  private readonly seg = new UtteranceSegmenter();
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly stt: GroqStt, private readonly language: 'en' | 'hinglish' | 'hi', private readonly userId?: string) {}

  onTranscript(cb: (t: { text: string; final: boolean }) => void) { this.cbT = cb; }
  onError(cb: (e: Error) => void) { this.cbE = cb; }

  write(pcm16: Buffer) { if (!this.closed) this.handle(this.seg.push(pcm16)); }

  end() {
    if (this.closed) return;
    this.handle(this.seg.flush());
    this.closed = true;
  }

  private handle(events: ReturnType<UtteranceSegmenter['push']>) {
    for (const e of events) {
      // "…" means speech has started: the app stops the companion talking and shows that it is listening.
      if (e.type === 'start') this.cbT({ text: '…', final: false });
      else if (e.type === 'cancel') this.cbT({ text: '', final: false });
      else this.chain = this.chain.then(() => this.hear(e.pcm)).catch(err => this.cbE(err as Error));
    }
  }

  private async hear(pcm: Buffer) {
    const { text } = await this.stt.transcribe({ wav: wavOf(pcm, RATE), language: this.language, userId: this.userId });
    this.cbT({ text, final: true });
  }
}

/** Listening during a call, through Groq. Offered only while the Groq key is saved and the portal says to use it. */
export class GroqLiveStt implements SttProvider {
  readonly name = 'groq';
  constructor(private readonly stt: GroqStt, private readonly enabled: () => boolean) {}
  get configured() { return this.stt.configured && this.enabled(); }

  async open(o: { language: 'en-IN' | 'hi-IN'; hinglish?: boolean; userId?: string }): Promise<SttSession> {
    if (!this.configured) throw new TtsUnavailable('Server listening isn’t connected.');
    return new LiveSession(this.stt, o.language === 'hi-IN' ? (o.hinglish ? 'hinglish' : 'hi') : 'en', o.userId);
  }
}

/** For the portal's “Test connection”: the key, the chat model, and the speech model. */
export async function testGroq(v: Record<string, string>, f: typeof fetch, ctx?: { groqModel?: string }): Promise<{ ok: boolean; note: string }> {
  const headers = { Authorization: `Bearer ${v.api_key}`, 'Content-Type': 'application/json' };
  try {
    const list = await f(`${GROQ_BASE}/models`, { headers, signal: AbortSignal.timeout(15_000) });
    if (list.status === 401 || list.status === 403) return { ok: false, note: 'Groq rejected this key.' };
    if (!list.ok) return { ok: false, note: `Groq answered ${list.status}.` };
    const ids = ((await list.json()) as { data?: { id: string }[] }).data?.map(m => m.id) ?? [];
    const model = ctx?.groqModel ?? 'openai/gpt-oss-20b';
    const note = `Key accepted (${ids.length} models available).`;
    if (ids.length && !ids.includes(model)) return { ok: false, note: `${note} But the companion model ${model} isn’t on this key. Choose another under Settings, or check the model name.` };
    const started = Date.now();
    const chat = await f(`${GROQ_BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with one short friendly sentence.' }], max_completion_tokens: 600, ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low', include_reasoning: false } : {}) }), signal: AbortSignal.timeout(30_000) });
    if (!chat.ok) {
      let m = `Groq answered ${chat.status}.`;
      try { const j = (await chat.json()) as { error?: { message?: string } }; if (j.error?.message) m = j.error.message; } catch { /* keep */ }
      return { ok: false, note: `${note} But ${model} failed: ${m.slice(0, 160)}. Conversations will not work until this is fixed.` };
    }
    const j = (await chat.json()) as { choices?: { message?: { content?: string } }[] };
    const said = (j.choices?.[0]?.message?.content ?? '').trim();
    if (!said) return { ok: false, note: `${note} But ${model} answered with nothing. Try another model, or lower its reasoning effort.` };
    const sttNote = ids.some(i => /whisper/i.test(i)) ? ' Speech to text (Whisper) is available on this key.' : ' This key doesn’t list a Whisper model, so listening will use another service.';
    return { ok: true, note: `${note} ${model} answered in ${((Date.now() - started) / 1000).toFixed(1)} s.${sttNote}` };
  } catch (e) {
    return { ok: false, note: `Couldn’t reach Groq: ${(e as Error).message}` };
  }
}
