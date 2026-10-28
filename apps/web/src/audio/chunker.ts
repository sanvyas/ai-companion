// Cuts a continuous 16 kHz recording into pieces a speech service can take (it accepts about 30 s at a time), at the
// pauses between phrases so a word is never split. Audio is only ever held in memory, in pieces, until it is sent.

export const RATE = 16_000;

export interface ChunkerOptions {
  /** Never cut before this much audio has been heard. */
  minSeconds: number;
  /** Cut at the next pause once this much has been heard. */
  softSeconds: number;
  /** Cut regardless at this length (the vendor's limit is 30 s). */
  maxSeconds: number;
  /** A pause this long counts as the end of a phrase. */
  pauseSeconds: number;
  /** Average loudness (0 to 1) below which a moment counts as quiet. */
  quiet: number;
  /** A piece whose loudest moment never reaches this is silence, and is dropped rather than sent. */
  speech: number;
}

export const DEFAULTS: ChunkerOptions = { minSeconds: 2, softSeconds: 8, maxSeconds: 25, pauseSeconds: 0.7, quiet: 0.012, speech: 0.03 };

const rms = (pcm: Int16Array) => { let s = 0; for (let i = 0; i < pcm.length; i++) { const v = pcm[i] / 32768; s += v * v; } return Math.sqrt(s / Math.max(1, pcm.length)); };

export class Chunker {
  private frames: Int16Array[] = [];
  private samples = 0;
  private quietRun = 0;
  private peak = 0;
  private readonly o: ChunkerOptions;

  constructor(private readonly emit: (pcm: Int16Array, seconds: number) => void, opts: Partial<ChunkerOptions> = {}) { this.o = { ...DEFAULTS, ...opts }; }

  /** Feed 20 ms (or any size) frames as they arrive. */
  push(frame: Int16Array) {
    this.frames.push(frame);
    this.samples += frame.length;
    const level = rms(frame);
    this.peak = Math.max(this.peak, level);
    this.quietRun = level < this.o.quiet ? this.quietRun + frame.length : 0;
    const seconds = this.samples / RATE;
    if (seconds >= this.o.maxSeconds) this.cut();
    else if (seconds >= this.o.minSeconds && this.quietRun / RATE >= this.o.pauseSeconds && seconds >= Math.min(this.o.softSeconds, this.o.minSeconds + 0.1)) this.cut();
    else if (seconds >= this.o.softSeconds && this.quietRun / RATE >= this.o.pauseSeconds / 2) this.cut();
  }

  /** The recording has ended: send whatever is left. */
  flush() { this.cut(); }

  private cut() {
    if (!this.samples) return;
    const out = new Int16Array(this.samples);
    let at = 0;
    for (const f of this.frames) { out.set(f, at); at += f.length; }
    const heard = this.peak >= this.o.speech;
    this.frames = []; this.samples = 0; this.quietRun = 0; this.peak = 0;
    if (heard && out.length / RATE >= 0.3) this.emit(out, out.length / RATE);
  }
}

/** A mono 16-bit WAV file around raw samples. */
export function wavOf(pcm: Int16Array, rate = RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}
