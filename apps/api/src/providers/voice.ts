// Server-side speech adapters. No vendor is selected yet, so STT_PROVIDER / TTS_PROVIDER are 'none' and the
// web client uses the browser's own speech engines through the same conversation pipeline (safety, memory, LLM).
// To add a vendor: implement these interfaces, return the instance from createStt / createTts in providers/index.ts.

/** Streaming speech-to-text. Feed PCM16 mono 16 kHz frames; receive interim and final transcripts. */
export interface SttSession {
  write(pcm16: Buffer): void;
  end(): void;
  onTranscript(cb: (t: { text: string; final: boolean }) => void): void;
  onError(cb: (e: Error) => void): void;
}
export interface SttProvider {
  readonly name: string;
  open(opts: { language: 'en-IN' | 'hi-IN'; signal?: AbortSignal }): Promise<SttSession>;
}

export interface TtsChunk {
  audio: Buffer; // PCM16 mono 24 kHz
  /** Mouth-shape cues for the avatar, if the vendor returns visemes. Otherwise the client derives them from amplitude. */
  visemes?: { t: number; v: string }[];
}
export interface TtsOptions { text: string; voice: string; language: 'en' | 'hinglish' | 'hi'; /** Speaking speed, 1 is normal. The vendor may clamp it. */ pace?: number; signal?: AbortSignal; userId?: string }
export interface Synthesis { wav: Buffer; pcm: Buffer; sampleRate: number }
export interface TtsProvider {
  readonly name: string;
  /** False until the vendor's key has been added; the app then speaks with the device's own voices. */
  readonly configured: boolean;
  /** Whole utterance, for previews. */
  synthesize(opts: TtsOptions): Promise<Synthesis>;
  /** The same audio as PCM chunks, for a live conversation. */
  stream(opts: TtsOptions): AsyncIterable<TtsChunk>;
}

export interface TtsUsage { provider: string; kind: 'tts'; chars: number; latencyMs: number; ok: boolean; userId?: string }

export class TtsFailure extends Error {}
export class TtsUnavailable extends Error {}

/** Reads the PCM samples and sample rate out of a RIFF/WAVE file. */
export function parseWav(buf: Buffer): { pcm: Buffer; sampleRate: number } {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new TtsFailure('The voice service returned audio in a format I can’t play.');
  let sampleRate = 24_000;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(off + 12);
    if (id === 'data') return { pcm: buf.subarray(off + 8, size === 0 || off + 8 + size > buf.length ? buf.length : off + 8 + size), sampleRate };
    off += 8 + size + (size % 2);
  }
  throw new TtsFailure('The voice service returned audio with no sound in it.');
}
