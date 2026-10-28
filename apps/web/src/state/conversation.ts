import type { ServerMsg } from '@saathi/contracts';
import { level3Script, nextRisk, type RiskLevel } from '@saathi/domain';
import { api, ApiError, isDemo, type ConvTransport, type ConversationMode } from '../api';
import { requestMicPermission, startMic, type Mic } from '../audio/mic';
import { PcmPlayer } from '../audio/pcmPlayer';
import { Recognizer, recognitionSupported } from '../audio/recognition';
import { say, startMouth, stopMouth, stopSpeech } from '../audio/speech';
import { getState, set, type CallMode } from './store';

// One live conversation at a time (text chat, voice, video, sit, check-in, walk). Both the Chat and Call screens
// are views over this controller, so "switch to text" keeps the same conversation and transcript (PRD 8.3.1).

let transport: ConvTransport | null = null;
let mic: Mic | null = null;
let recognizer: Recognizer | null = null;
let player: PcmPlayer | null = null;
let browserQueue: string[] = [];
let browserSpeaking = false;
let silenceTimer: ReturnType<typeof setInterval> | undefined;
let lastActivity = Date.now();
let toastFn: (m: string) => void = () => undefined;
let onCrisis: () => void = () => undefined;
let onMinor: () => void = () => undefined;

export function bindConversationUi(h: { toast: (m: string) => void; crisis: () => void; minor: () => void }) {
  toastFn = h.toast; onCrisis = h.crisis; onMinor = h.minor;
}

export const hasConversation = () => !!getState().conv;
const speaksAloud = () => { const s = getState(); return !!s.conv && s.voiceAudio && ['call', 'walk'].includes(s.screen) && s.conv.mode !== 'text'; };
const recLang = () => (getState().me?.language === 'hi' || getState().me?.language === 'hinglish' ? 'hi-IN' : 'en-IN');

// ------------------------------------------------------------------------------------------------ lifecycle
export async function beginConversation(mode: ConversationMode, opts: { continueFrom?: string; keepMessages?: boolean; first?: boolean } = {}): Promise<boolean> {
  await closeConversation({ end: false });
  set(s => ({ callBusy: true, callEnded: false, callSummary: null, callLine: null, callPhase: 'connecting', careCard: false, msgs: opts.keepMessages ? s.msgs : [], typing: false }));
  try {
    const c = mode === 'walk' ? await api.startWalk() : await api.createConversation(mode, opts.continueFrom, opts.first);
    set({ conv: { id: c.id, mode, voice: c.voice, ready: false } });
    transport = await api.openConversation(c.id, { onMessage: onServer, onAudio: f => player?.push(f), onClose });
    ensureSilenceTimer();
    lastActivity = Date.now();
    return true;
  } catch (e) {
    set({ conv: null, callBusy: false, callPhase: 'error' });
    const err = e instanceof ApiError ? e : null;
    toastFn(err?.message ?? 'I couldn’t connect. Check your internet and try again.');
    return false;
  }
}

export async function closeConversation(o: { end: boolean; feeling?: 'better' | 'same' | 'worse' } = { end: false }) {
  const s = getState();
  const id = s.conv?.id;
  stopListening();
  stopOutput();
  clearInterval(silenceTimer);
  silenceTimer = undefined;
  transport?.close();
  transport = null;
  player?.close();
  player = null;
  set({ conv: null, typing: false, callBusy: false });
  if (o.end && id) {
    try { return await api.endConversation(id, o.feeling); } catch { return null; }
  }
  return null;
}

/** The person says goodbye: end the conversation, get the summary, and show the closing sheet. */
export async function finishCall(feeling?: 'better' | 'same' | 'worse') {
  const mode = getState().callMode;
  set({ callEnded: true, callBusy: true, paused: false });
  const out = await closeConversation({ end: true, feeling });
  set({ callSummary: out, callBusy: false });
  void refreshRecent();
  return { out, mode };
}

async function refreshRecent() {
  try { set({ recent: await api.conversations(10) }); } catch { /* the list refreshes next visit */ }
}

function onClose(code: number) {
  if (code === 1000 || !getState().conv) return;
  set({ typing: false, callPhase: 'error' });
  toastFn('The connection dropped. You can start again whenever you like.');
}

// ------------------------------------------------------------------------------------------------ server events
function onServer(m: ServerMsg) {
  lastActivity = Date.now();
  switch (m.type) {
    case 'ready': {
      set(s => ({ conv: s.conv && { ...s.conv, ready: true, voice: m.voice }, callBusy: false, callPhase: s.callMode === 'sit' ? 'idle' : 'listening' }));
      if (m.opening) aiSays(m.opening, false);
      if (['call', 'walk'].includes(getState().screen) && getState().conv?.mode !== 'walk') void startListening();
      return;
    }
    case 'thinking': set({ typing: true, callPhase: 'thinking' }); return;
    case 'ack': set(s => ({ risk: nextRisk(s.risk, m.riskLevel as RiskLevel) })); return;
    case 'sentence': aiSays(m.text, true, m.emotion); return;
    case 'done': set(s => ({ typing: false, callPhase: s.speakingNow ? 'speaking' : s.callMode === 'sit' ? 'idle' : 'listening' })); return;
    case 'care_card': set({ careCard: true }); return;
    case 'crisis': {
      set(s => ({ typing: false, msgs: [...s.msgs, { who: 'ai', text: m.script }], callLine: { who: 'ai', text: m.script }, risk: nextRisk(s.risk, 3) }));
      stopListening();
      onCrisis();
      return;
    }
    case 'minor': set({ typing: false }); onMinor(); return;
    case 'transcript': set({ callLine: { who: 'me', text: m.text } }); if (!m.final) bargeIn(); return;
    case 'audio_start': set({ speakingNow: true, callPhase: 'speaking' }); player ??= new PcmPlayer(v => set({ mouth: v }), () => { set(s => ({ speakingNow: false, mouth: 0, callPhase: s.typing ? 'thinking' : 'listening' })); }); return;
    case 'audio_end': return;
    case 'visemes': return; // the avatar follows loudness today; vendor visemes can drive it later
    case 'error': {
      set({ typing: false, callPhase: 'listening' });
      // The server voice couldn't speak this sentence; its text comes back so the phone can say it instead.
      if (m.code === 'tts_failed') { if (speaksAloud()) { browserQueue.push(m.message); drain(); } return; }
      if (m.code === 'rate_limited' || m.code === 'llm_failed' || m.code === 'llm_unavailable') appendAi(m.message);
      else toastFn(m.message);
      return;
    }
    case 'pong': return;
  }
}

function appendAi(text: string) { set(s => ({ msgs: [...s.msgs, { who: 'ai', text }], callLine: { who: 'ai', text } })); }

/** A sentence from the companion: shown in the thread and captions, and spoken when this is a voice screen. */
function aiSays(text: string, live: boolean, emotion?: string) {
  set(s => ({ msgs: [...s.msgs, { who: 'ai', text }], callLine: { who: 'ai', text }, studioMode: emotion === 'concerned' || emotion === 'smiling' ? emotion : s.studioMode }));
  void live;
  if (!speaksAloud()) return;
  if (getState().conv?.voice.serverTts) return; // audio arrives from the server
  browserQueue.push(text);
  drain();
}

function drain() {
  if (browserSpeaking) return;
  const next = browserQueue.shift();
  if (!next) { set(s => ({ speakingNow: false, callPhase: s.typing ? 'thinking' : s.callMode === 'sit' ? 'idle' : 'listening' })); stopMouth(); return; }
  browserSpeaking = true;
  set({ callPhase: 'speaking' });
  const s = getState();
  say(next, { lang: s.me?.language === 'hi' ? 'हिन्दी' : 'English' }, () => { browserSpeaking = false; drain(); }, () => { browserSpeaking = false; browserQueue = []; startMouthBrief(); });
}

function startMouthBrief() { startMouth(); setTimeout(stopMouth, 1800); }

function stopOutput() {
  browserQueue = [];
  browserSpeaking = false;
  stopSpeech();
  player?.stop();
  set({ speakingNow: false, mouth: 0 });
}

/** The person starts speaking over the companion: stop it within one event-loop turn (PRD 4). */
function bargeIn() {
  if (!getState().speakingNow && !browserSpeaking && !(player?.speaking)) return;
  stopOutput();
  transport?.interrupt();
}

// ------------------------------------------------------------------------------------------------ sending
export function sendTurn(text: string, source: 'typed' | 'dictated' | 'voice' = 'typed') {
  const t = text.trim();
  if (!t || !transport) return false;
  lastActivity = Date.now();
  stopOutput();
  set(s => ({ msgs: [...s.msgs, { who: 'me', text: t }], callLine: { who: 'me', text: t }, typing: true, callPhase: 'thinking', draft: '' }));
  transport.turn(t, source);
  return true;
}

export function interruptNow() { stopOutput(); transport?.interrupt(); }

function ensureSilenceTimer() {
  clearInterval(silenceTimer);
  silenceTimer = setInterval(() => {
    const s = getState();
    if (s.conv?.mode !== 'sit' || !transport || s.paused) return;
    const quiet = Math.floor((Date.now() - lastActivity) / 1000);
    if (quiet >= 150) { transport.silence(quiet); lastActivity = Date.now(); }
  }, 15_000);
}

// ------------------------------------------------------------------------------------------------ listening
export type MicOutcome = 'ok' | 'denied' | 'unsupported';

/** Server STT when connected, otherwise the browser's recognition. Either way the same turn pipeline runs. */
export async function startListening(): Promise<MicOutcome> {
  const s = getState();
  if (!transport || !s.conv || s.muted || s.paused || s.callMode === 'sit') return 'ok';
  if (isDemo) return 'ok'; // the demo companion is typed
  stopListening();
  if (s.conv.voice.serverStt) {
    try {
      mic = await startMic(buf => transport?.sendAudio(buf));
      transport.voiceStart(recLang() as 'en-IN' | 'hi-IN');
      return 'ok';
    } catch { return 'denied'; }
  }
  if (!recognitionSupported()) return 'unsupported';
  recognizer = new Recognizer(recLang(), {
    onInterim: text => { set({ callLine: { who: 'me', text } }); bargeIn(); },
    onFinal: text => { if (getState().screen === 'call' || getState().screen === 'walk') sendTurn(text, 'voice'); },
    onFatal: reason => { set({ callPhase: 'error' }); toastFn(reason === 'denied' ? 'I can’t hear you. Allow the microphone in your browser, or type instead.' : 'This browser can’t listen. You can type instead.'); },
  });
  recognizer.start();
  return 'ok';
}

export function stopListening() {
  recognizer?.stop();
  recognizer = null;
  if (mic) { transport?.voiceStop(); mic.stop(); mic = null; }
}

export function setMuted(m: boolean) {
  set({ muted: m });
  if (m) stopListening(); else void startListening();
}

export function setPaused(p: boolean) {
  set({ paused: p, callPhase: p ? 'paused' : 'listening' });
  if (p) { stopListening(); stopOutput(); transport?.interrupt(); } else void startListening();
}

export async function askForMic(): Promise<boolean> {
  if (isDemo) { set({ micOk: true }); return true; }
  const ok = await requestMicPermission();
  set({ micOk: ok });
  return ok;
}

export const crisisScriptFor = (name: string | null) => level3Script(name);
export type { CallMode };
