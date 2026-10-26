// Microphone -> PCM16 mono 16 kHz frames (20 ms) for server-side speech-to-text. Audio is streamed, never stored
// (PRD 5.3). The worklet is built from a Blob so no bundler configuration is needed.

const WORKLET = `
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
registerProcessor('pcm16', Pcm16);`;

export interface Mic { stop(): void; setMuted(m: boolean): void }

export async function startMic(onFrame: (pcm: ArrayBuffer) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm16');
  let muted = false;
  node.port.onmessage = e => { if (!muted) onFrame(e.data as ArrayBuffer); };
  src.connect(node); // deliberately not connected to the speakers
  return {
    setMuted: m => { muted = m; stream.getAudioTracks().forEach(t => { t.enabled = !m; }); },
    stop: () => { node.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop()); void ctx.close(); },
  };
}

/** Ask for permission once, then release the mic (used by the "May I use your microphone?" sheet). */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    return true;
  } catch { return false; }
}
