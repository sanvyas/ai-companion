import { getState, set, type Persona } from '../state/store';
import { stopClip } from './clip';
import { personaOf } from '../domain/voices';

// Browser TTS stand-in (PRD §12). TODO(tts-adapter): production TTS with visemes + per-voice personas.
let utt: SpeechSynthesisUtterance | null = null;
let speaking = false;
let mouthTimer: ReturnType<typeof setInterval> | null = null;
let guard: ReturnType<typeof setTimeout> | null = null;

export const isSpeaking = () => speaking;
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function loadVoices() {
  if (!ttsSupported()) return;
  const load = () => set({ voicesList: speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang, uri: v.voiceURI })) });
  load();
  speechSynthesis.onvoiceschanged = load;
}

function pickVoice(persona: Persona, lang: string): SpeechSynthesisVoice | null {
  const all = ttsSupported() ? speechSynthesis.getVoices() : [];
  const dv = getState().deviceVoice;
  if (dv) { const f = all.find(v => v.voiceURI === dv); if (f) return f; }
  const norm = (l: string) => (l || '').replace('_', '-').toLowerCase();
  const hindi = lang === 'हिन्दी';
  const prefs = hindi ? ['hi-in'] : ['en-in', 'en-gb', 'en-us', 'en-au'];
  const score = (v: SpeechSynthesisVoice) => (/(natural|neural|premium|enhanced|google)/i.test(v.name) ? 0 : 1);
  let c: SpeechSynthesisVoice[] = [];
  prefs.forEach(p => c.push(...all.filter(v => norm(v.lang) === p).sort((a, b) => score(a) - score(b))));
  if (!c.length) c = all.filter(v => norm(v.lang).startsWith(hindi ? 'hi' : 'en'));
  if (!c.length) return null;
  return c[({ warm: 0, steady: 1, bright: 2 }[persona] || 0) % c.length];
}

export function startMouth() {
  if (mouthTimer) clearInterval(mouthTimer);
  mouthTimer = setInterval(() => set({ mouth: Math.random() < 0.2 ? 0.05 : 0.3 + Math.random() * 0.7 }), 95);
}

export function stopMouth() {
  if (mouthTimer) clearInterval(mouthTimer);
  mouthTimer = null;
  set({ mouth: 0 });
}

export function stopSpeech() {
  stopClip();
  utt = null;
  speaking = false;
  if (guard) clearTimeout(guard);
  if (ttsSupported()) speechSynthesis.cancel();
  if (mouthTimer) stopMouth();
  set({ speakingNow: false, previewing: null });
}

/** Stops audio without touching `previewing` (used between player lines). */
export function pauseNarration() {
  utt = null;
  speaking = false;
  if (ttsSupported()) speechSynthesis.cancel();
  if (mouthTimer) stopMouth();
}

export function say(text: string, opts: { persona?: Persona; lang?: string; rateMul?: number } = {}, onEnd?: () => void, onUnsupported?: () => void) {
  if (!ttsSupported()) { onUnsupported?.(); onEnd?.(); return; }
  speechSynthesis.cancel();
  const persona = opts.persona || personaOf(getState().voice);
  const lang = opts.lang || 'English';
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(persona, lang);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'हिन्दी' ? 'hi-IN' : 'en-IN';
  const P = { warm: [0.95, 0.9], steady: [0.82, 0.93], bright: [1.12, 1.0] }[persona] || [1, 1];
  u.pitch = P[0];
  u.rate = P[1] * (opts.rateMul || 1);
  const done = () => {
    if (utt !== u) return;
    utt = null;
    speaking = false;
    if (guard) clearTimeout(guard);
    stopMouth();
    set({ speakingNow: false });
    onEnd?.();
  };
  u.onstart = () => startMouth();
  u.onend = done;
  u.onerror = done;
  utt = u;
  speaking = true;
  set({ speakingNow: true });
  if (guard) clearTimeout(guard);
  guard = setTimeout(done, 20000);
  speechSynthesis.speak(u);
}
