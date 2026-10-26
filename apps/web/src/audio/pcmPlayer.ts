// Plays streamed PCM16 mono audio from the server's TTS and reports its loudness every frame so the avatar's
// mouth follows what is actually being said (PRD 8.3.1). Vendors that return visemes can refine this later.

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private raf = 0;
  private buf = new Uint8Array(512);
  private live = false;

  constructor(private readonly onLevel: (v: number) => void, private readonly onIdle: () => void) {}

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get speaking() { return this.live; }

  push(frame: ArrayBuffer, sampleRate = 24_000) {
    if (frame.byteLength < 2) return;
    const ctx = this.ensure();
    const pcm = new Int16Array(frame.slice(0, frame.byteLength - (frame.byteLength % 2)));
    const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser!);
    const at = Math.max(ctx.currentTime + 0.02, this.next);
    src.start(at);
    this.next = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); if (!this.sources.size) this.finish(); };
    if (!this.live) { this.live = true; this.loop(); }
  }

  private loop = () => {
    if (!this.live || !this.analyser) return;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) { const x = (v - 128) / 128; sum += x * x; }
    this.onLevel(Math.min(1, Math.sqrt(sum / this.buf.length) * 5));
    this.raf = requestAnimationFrame(this.loop);
  };

  private finish() {
    this.live = false;
    cancelAnimationFrame(this.raf);
    this.onLevel(0);
    this.onIdle();
  }

  /** Barge-in: silence immediately. */
  stop() {
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear();
    this.next = 0;
    if (this.live) this.finish();
  }

  close() { this.stop(); void this.ctx?.close(); this.ctx = null; }
}
