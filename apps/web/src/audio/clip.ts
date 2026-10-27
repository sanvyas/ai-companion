import { set } from '../state/store';
import { startMouth, stopMouth } from './speech';

// Plays a short spoken sample that came from the server (a base64 WAV file) and moves the avatar's mouth while it
// plays. `stopClip` is called by stopSpeech so one Stop button silences everything.
let audio: HTMLAudioElement | null = null;

export function stopClip() {
  if (!audio) return;
  const a = audio;
  audio = null;
  a.onended = null; a.onerror = null;
  a.pause();
  stopMouth();
  set({ speakingNow: false });
}

export function playClip(b64: string, mime: string, onEnd: () => void, onFail: () => void) {
  stopClip();
  const a = new Audio(`data:${mime};base64,${b64}`);
  audio = a;
  const done = () => { if (audio !== a) return; audio = null; stopMouth(); set({ speakingNow: false }); onEnd(); };
  a.onended = done;
  a.onerror = () => { if (audio !== a) return; audio = null; stopMouth(); set({ speakingNow: false }); onFail(); };
  a.play().then(() => { if (audio === a) { set({ speakingNow: true }); startMouth(); } }).catch(() => { if (audio === a) { audio = null; set({ speakingNow: false }); } onFail(); });
}
