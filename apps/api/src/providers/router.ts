import type { Synthesis, TranscribeOptions, Transcriber, TtsChunk, TtsOptions, TtsProvider } from './voice.js';
import { TtsFailure, TtsUnavailable } from './voice.js';
import { vendorOf } from '../services/voices.js';

/** Sends each voice to the vendor that owns it: `sarvam:` voices to Sarvam, `google:` voices to Google. */
export class TtsRouter implements TtsProvider {
  readonly name = 'router';
  constructor(private readonly vendors: { sarvam: TtsProvider; google: TtsProvider }) {}
  get configured() { return this.vendors.sarvam.configured || this.vendors.google.configured; }
  has(vendor: string) { return vendor === 'sarvam' || vendor === 'google' ? this.vendors[vendor].configured : false; }

  private pick(voice: string): TtsProvider {
    const v = vendorOf(voice);
    if (!v) throw new TtsFailure('That isn’t one of the server voices.');
    const p = this.vendors[v];
    if (!p.configured) throw new TtsUnavailable('The voice service isn’t connected yet.');
    return p;
  }
  async synthesize(o: TtsOptions): Promise<Synthesis> { return this.pick(o.voice).synthesize(o); }
  async *stream(o: TtsOptions): AsyncIterable<TtsChunk> { yield* this.pick(o.voice).stream(o); }
}

/** Journal dictation: the first engine in the preferred order that has its key, so a missing key never leaves it silent. */
export class TranscriberRouter implements Transcriber {
  readonly name = 'router';
  constructor(private readonly order: () => Transcriber[]) {}
  private active(): Transcriber | undefined { return this.order().find(t => t.configured); }
  get configured() { return !!this.active(); }
  async transcribe(o: TranscribeOptions) {
    const t = this.active();
    if (!t) throw new TtsUnavailable('The speech service isn’t connected yet.');
    return t.transcribe(o);
  }
}
