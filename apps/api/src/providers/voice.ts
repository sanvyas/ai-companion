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
export interface TtsProvider {
  readonly name: string;
  stream(opts: { text: string; voice: 'warm' | 'steady' | 'bright'; language: 'en' | 'hinglish' | 'hi'; signal?: AbortSignal }): AsyncIterable<TtsChunk>;
}
