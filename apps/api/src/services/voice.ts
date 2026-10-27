import type WebSocket from 'ws';
import type { ServerMsg } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import type { SttSession } from '../providers/voice.js';
import { isServerVoice } from './voices.js';
import { handleTurn, type LiveSession } from './conversations.js';

// Server-side voice for one WebSocket (PRD 4, 8.3.1): audio frames -> STT -> the same safety + model pipeline as
// text -> TTS audio back. With no STT/TTS vendor configured none of this is used and the web app speaks and listens
// through the browser instead, sending finished transcripts as ordinary turns.

const SAMPLE_RATE_OUT = 24_000;

/** Whether this conversation's replies are spoken by the server (versus the phone's own voice). */
export function speaksFromServer(ctx: Ctx, s: Pick<LiveSession, 'mode' | 'companion'>): boolean {
  return !!ctx.tts?.configured && s.mode !== 'text' && isServerVoice(s.companion.voice);
}

export class VoiceBridge {
  private stt: SttSession | null = null;
  private ttsAbort: AbortController | null = null;
  private speakQueue: Promise<void> = Promise.resolve();
  private turnChain: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: Ctx, private readonly session: LiveSession, private readonly socket: WebSocket, private readonly send: (m: ServerMsg) => void) {}

  get hasStt() { return !!this.ctx.stt; }
  /** Server speech is used only for a voice the person chose from the server's list, and never in plain text chat. */
  get hasTts() { return speaksFromServer(this.ctx, this.session); }

  async start(language: 'en-IN' | 'hi-IN') {
    if (!this.ctx.stt) { this.send({ type: 'error', code: 'stt_unavailable', message: 'Server listening isn’t connected. Use the browser’s microphone.' }); return; }
    this.stop();
    const s = await this.ctx.stt.open({ language });
    this.stt = s;
    s.onTranscript(t => {
      this.send({ type: 'transcript', text: t.text, final: t.final });
      if (t.final && t.text.trim()) {
        // Barge-in is handled by `interrupt`; a new final transcript simply starts the next turn.
        this.turnChain = this.turnChain.then(() => this.turn(t.text.trim())).catch(e => this.ctx.log.error({ err: (e as Error).message }, 'voice turn failed'));
      }
    });
    s.onError(e => { this.ctx.log.warn({ err: e.message }, 'stt error'); this.send({ type: 'error', code: 'stt_failed', message: 'I lost the thread of what you said. Could you say that again?' }); });
  }

  audio(frame: Buffer) {
    if (frame.length > 64 * 1024) return; // a runaway client cannot grow memory
    this.stt?.write(frame);
  }

  stop() {
    this.stt?.end();
    this.stt = null;
  }

  /** Barge-in: stop speaking and stop generating within one event-loop turn (PRD 4: under 200 ms). */
  interrupt() {
    this.ttsAbort?.abort();
    this.ttsAbort = null; // the next sentence gets a fresh controller
    this.session.abort?.abort();
  }

  async turn(text: string) {
    await handleTurn(this.ctx, this.session, text, m => this.emit(m));
  }

  /** Every outgoing message passes through here so sentences can also be spoken. */
  emit(m: ServerMsg) {
    this.send(m);
    if (m.type === 'sentence' && this.hasTts) this.enqueueSpeech(m.text, m.index);
    // The fixed, reviewed crisis script is spoken too: someone in distress may not be looking at the screen.
    if (m.type === 'crisis' && this.hasTts) this.enqueueSpeech(m.script, this.session.sentenceIndex++);
  }

  private enqueueSpeech(text: string, index: number) {
    this.ttsAbort ??= new AbortController();
    const signal = this.ttsAbort.signal;
    this.speakQueue = this.speakQueue.then(async () => {
      if (signal.aborted) return;
      try {
        this.send({ type: 'audio_start', sampleRate: SAMPLE_RATE_OUT, index });
        for await (const chunk of this.ctx.tts!.stream({ text, voice: this.session.companion.voice, language: this.session.language, signal, userId: this.session.userId })) {
          if (signal.aborted) break;
          if (chunk.visemes?.length) this.send({ type: 'visemes', index, cues: chunk.visemes });
          if (this.socket.readyState === this.socket.OPEN) this.socket.send(chunk.audio, { binary: true });
        }
      } catch (e) {
        if (!signal.aborted) {
          this.ctx.log.warn({ err: (e as Error).message }, 'tts failed');
          // The words are already on screen; tell the app so it can read them with the phone's own voice instead.
          this.send({ type: 'error', code: 'tts_failed', message: text });
        }
      } finally {
        this.send({ type: 'audio_end', index });
      }
    });
  }

  close() {
    this.stop();
    this.interrupt();
  }
}
