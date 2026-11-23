// Turns the microphone into 16 kHz, 16-bit, 20 ms frames for speech-to-text. Loaded by src/audio/mic.ts.
// It is a real file (not built from a Blob) so the page's Content-Security-Policy can refuse every script that is not ours.
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.sum = 0; this.n = 0; this.out = new Int16Array(320); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.sum += ch[k]; this.n++; this.pos++;
      if (this.pos >= this.ratio) {
        const v = Math.max(-1, Math.min(1, this.sum / this.n));
        this.out[this.i++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum = 0; this.n = 0; this.pos -= this.ratio;
        if (this.i === 320) { this.port.postMessage(this.out.buffer.slice(0)); this.i = 0; }
      }
    }
    return true;
  }
}
registerProcessor('pcm16', Pcm16);
