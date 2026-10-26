import { getState, set } from '../state/store';
import type { SoundId } from '../data/calm';

// Generated ambient loops via WebAudio (PRD §12 stand-in).
// TODO(calm-content): recorded gapless loops from the audio CDN, OS media session, lock-screen controls.
let ac: AudioContext | null = null;
const live: Partial<Record<SoundId, { stop: () => void }>> = {};

function ensureAC(): AudioContext | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ac) ac = new AC();
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function noiseSrc(ctx: AudioContext, kind: 'white' | 'pink' | 'brown') {
  const len = ctx.sampleRate * 4;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    else d[i] = w;
  }
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  return s;
}

function start(k: SoundId): boolean {
  const ctx = ensureAC();
  if (!ctx) return false;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(1, t + 2);
  out.connect(ctx.destination);
  const nodes: (AudioScheduledSourceNode)[] = [];
  let iv: ReturnType<typeof setInterval> | null = null;
  const filt = (type: BiquadFilterType, fr: number) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = fr; return x; };
  const gain = (v: number) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  if (k === 'rain') { const s = noiseSrc(ctx, 'white'); s.connect(filt('highpass', 900)).connect(filt('lowpass', 7000)).connect(gain(0.12)).connect(out); s.start(); nodes.push(s); }
  if (k === 'ocean') { const s = noiseSrc(ctx, 'pink'), g = gain(0.45), l = ctx.createOscillator(), lg = gain(0.4); l.frequency.value = 0.085; l.connect(lg).connect(g.gain); s.connect(filt('lowpass', 900)).connect(g).connect(out); s.start(); l.start(); nodes.push(s, l); }
  if (k === 'fan') { const s = noiseSrc(ctx, 'brown'), o = ctx.createOscillator(); o.frequency.value = 96; o.connect(gain(0.015)).connect(out); s.connect(filt('lowpass', 420)).connect(gain(0.55)).connect(out); s.start(); o.start(); nodes.push(s, o); }
  if (k === 'brown') { const s = noiseSrc(ctx, 'brown'); s.connect(filt('lowpass', 700)).connect(gain(0.7)).connect(out); s.start(); nodes.push(s); }
  if (k === 'crickets') {
    const o = ctx.createOscillator(), g = gain(0), trem = ctx.createOscillator(), gate = gain(0);
    o.frequency.value = 4500; trem.frequency.value = 32;
    trem.connect(gain(0.018)).connect(g.gain);
    o.connect(g).connect(gate).connect(out);
    o.start(); trem.start(); nodes.push(o, trem);
    const chirp = () => { const n = ctx.currentTime; gate.gain.cancelScheduledValues(n); gate.gain.setValueAtTime(0, n); for (let i = 0; i < 3; i++) { gate.gain.linearRampToValueAtTime(1, n + i * 0.35 + 0.05); gate.gain.linearRampToValueAtTime(0, n + i * 0.35 + 0.25); } };
    chirp(); iv = setInterval(chirp, 1900);
  }
  if (k === 'bells') {
    const ring = () => { const n = ctx.currentTime; [[523, 0.08], [1047, 0.03], [1568, 0.015]].forEach(([fr, v]) => { const o = ctx.createOscillator(), g = gain(0); o.frequency.value = fr * (0.995 + Math.random() * 0.01); g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.0001, n + 5); o.connect(g).connect(out); o.start(n); o.stop(n + 5.2); }); };
    ring(); iv = setInterval(ring, 7000);
  }
  live[k] = {
    stop: () => {
      const n = ctx.currentTime;
      out.gain.cancelScheduledValues(n);
      out.gain.setValueAtTime(out.gain.value, n);
      out.gain.linearRampToValueAtTime(0, n + 1.2);
      if (iv) clearInterval(iv);
      setTimeout(() => { nodes.forEach(x => { try { x.stop(); } catch { /* already stopped */ } }); out.disconnect(); }, 1400);
    },
  };
  return true;
}

export function toggleSound(k: SoundId, force?: boolean, onUnsupported?: () => void) {
  const on = !!getState().sounds[k];
  const want = force === undefined ? !on : force;
  if (want === on) return;
  if (want) { if (!start(k)) { onUnsupported?.(); return; } }
  else if (live[k]) { live[k]!.stop(); delete live[k]; }
  set(p => { const n = { ...p.sounds }; if (want) n[k] = true; else delete n[k]; return { sounds: n }; });
}

export function stopAllSounds() {
  (Object.keys(live) as SoundId[]).forEach(k => { live[k]!.stop(); delete live[k]; });
  set({ sounds: {}, pBg: null });
}
