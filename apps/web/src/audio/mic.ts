// Microphone -> PCM16 mono 16 kHz frames (20 ms) for server-side speech-to-text. Audio is streamed, never stored
// (PRD 5.3). The worklet is the file public/mic-worklet.js, served from our own address so the Content-Security-Policy
// does not have to allow scripts built at run time.


export interface Mic { stop(): void; setMuted(m: boolean): void }

export async function startMic(onFrame: (pcm: ArrayBuffer) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule('/mic-worklet.js');
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
