import { api, isDemo } from '../api';
import { CALM_ITEMS } from '../data/calm';
import { stopDictation, startDictation } from '../audio/dictation';
import { isSpeaking, pauseNarration, say, stopSpeech, ttsSupported } from '../audio/speech';
import { stopAllSounds, toggleSound } from '../audio/sounds';
import { nextRisk, userSafeAcknowledged } from '@saathi/domain';
import { askForMic, beginConversation, bindConversationUi, closeConversation, finishCall, hasConversation, sendTurn, startListening } from './conversation';
import { bindDataUi, loadTalk } from './data';
import { bindSessionUi, handleMinor } from './session';
import { getState, set, type AppState, type CallMode, type Screen } from './store';

export * from './conversation';
export * from './data';
export * from './session';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  clearTimeout(toastTimer);
  set({ toast: msg });
  toastTimer = setTimeout(() => set({ toast: null }), 3200);
}

/** Pure navigation: resets transient UI. Does not touch the live conversation. */
export function navigate(screen: Screen, extra: Partial<AppState> = {}) {
  closePlayer();
  stopSpeech();
  stopDictation();
  set({ screen, sheet: null, tick: 0, paused: false, crisis: false, crisisConfirm: false, breathe: false, paywall: false, ...extra });
}

/**
 * Navigate and tidy the conversation: leaving chat or a call ends the conversation (so its summary shows up in
 * Recent), except when switching between the chat and call views of the same one.
 */
export function go(screen: Screen, extra: Partial<AppState> = {}) {
  const s = getState();
  const keep = (s.screen === 'call' && screen === 'chat') || (s.screen === 'chat' && screen === 'call');
  if (!keep && s.conv && ['chat', 'call', 'walk'].includes(s.screen)) void closeConversation({ end: true }).then(() => loadTalk());
  navigate(screen, extra);
}

export const openSheet = (sheet: AppState['sheet']) => set({ sheet });
export const closeSheet = () => set({ sheet: null });
export const openBreathe = () => set({ breathe: true, tick: 0, sheet: null });
export const closeBreathe = () => set({ breathe: false });

// ------------------------------------------------------------------------------------------------ calls
export async function startCall(mode: CallMode, first = false) {
  const s = getState();
  if (!s.micOk && mode !== 'sit' && !isDemo) { set({ sheet: 'mic', pendingMode: mode, pendingFirst: first }); return; }
  // Switching from the text chat to a voice call keeps the thread: the old conversation becomes context for the new one.
  const previous = s.screen === 'chat' ? s.conv?.id : undefined;
  if (previous) await closeConversation({ end: true });
  navigate('call', { callMode: mode, firstRun: first, muted: false, paused: false, callEnded: false, callSummary: null, callLine: null, callPhase: 'connecting' });
  await beginConversation(mode, { continueFrom: previous, keepMessages: !!previous, first });
}

export const startCheckin = () => { set({ micOk: getState().micOk || isDemo }); return startCall('checkin'); };

export async function allowMic() {
  const s = getState();
  const ok = await askForMic();
  set({ sheet: null });
  if (ok) await startCall(s.pendingMode ?? 'voice', s.pendingFirst);
  else { toast('No problem. You can talk by typing instead.'); void openChat(); }
}

export async function endCall(feeling?: 'better' | 'same' | 'worse') {
  stopSpeech();
  await finishCall(feeling);
}

/** Open the text chat. From a call it keeps the same conversation; otherwise it starts a fresh one (optionally picking up an earlier one). */
export async function openChat(continueFrom?: string) {
  const s = getState();
  if (s.conv && s.screen === 'call') { navigate('chat'); return; }
  go('chat', { msgs: [], careCard: false, draft: '' });
  await beginConversation('text', { continueFrom });
}

export function sendChat() {
  const text = getState().draft;
  if (!text.trim()) return;
  if (!sendTurn(text, 'typed')) toast('I’m not connected yet. One moment.');
}

// ------------------------------------------------------------------------------------------------ walk
export async function startWalkFlow() {
  navigate('walk', { walkEnded: false, walkSeconds: 0, callLine: null, callPhase: 'connecting' });
  // A walk works as a plain timer even if the companion can't connect.
  await beginConversation('walk');
}

export async function endWalk() {
  const seconds = getState().tick;
  set({ walkEnded: true, walkSeconds: seconds });
  await closeConversation({ end: true });
  void loadTalk();
}

export async function talkOnWalk() {
  if (!getState().micOk && !isDemo) { set({ sheet: 'mic', pendingMode: 'voice', pendingFirst: false }); return; }
  await startListening();
}

// ------------------------------------------------------------------------------------------------ safety
export function showCrisis() {
  stopSpeech();
  stopDictation();
  set({ crisis: true, crisisConfirm: false, sheet: null });
}

/** "I'm safe right now" after the extra confirm (PRD 8.10.3). Recorded, and a gentle follow-up is queued if opted in. */
export function confirmSafe() {
  set(s => ({ crisis: false, crisisConfirm: false, risk: userSafeAcknowledged(s.risk), careCard: true }));
  void api.safetyAck(3, 'safe').catch(() => undefined);
}

export function acknowledgeHelp(action: 'helpline' | 'contact' | 'emergency') {
  void api.safetyAck(getState().crisis ? 3 : 2, action).catch(() => undefined);
}

/** Paywall is never shown during distress (risk >= 1 this session, PRD 8.7.5). Safety features are never gated. */
export function openPaywall() {
  if (getState().risk.max >= 1) { toast('Plus can wait. There’s no rush, and nothing you need right now is locked.'); return; }
  set({ paywall: true, sheet: null });
}

// ------------------------------------------------------------------------------------------------ calm player
// The catalogue ships with the app so it works offline (PRD 9). Sessions are reported to the server for wins.
let pLine = 0;
let pNext: ReturnType<typeof setTimeout> | undefined;
let pIv: ReturnType<typeof setInterval> | undefined;

function reportProgress(done: boolean) {
  const s = getState();
  const it = CALM_ITEMS.find(x => x.id === s.player);
  if (!s.pSession || !it?.lines) return;
  const pct = done ? 100 : Math.round((Math.min(pLine, it.lines.length) / it.lines.length) * 100);
  void api.progressCalm(s.pSession, pct).catch(() => undefined);
}

function playLine() {
  const st = getState();
  if (!st.player || !st.pPlaying) return;
  const it = CALM_ITEMS.find(x => x.id === st.player);
  if (!it?.lines) return;
  if (pLine >= it.lines.length) {
    set({ pPlaying: false, pEnded: true, pLineIdx: it.lines.length });
    reportProgress(true);
    if (st.pTimer === 'End of story') setTimeout(stopAllSounds, 1500);
    return;
  }
  const text = it.lines[pLine];
  set({ pLineText: text, pLineIdx: pLine });
  const next = () => { if (!getState().pPlaying) return; pLine++; pNext = setTimeout(playLine, it.kind === 'sleep' ? 3200 : 2600); };
  if (!st.voiceAudio || !ttsSupported()) { pNext = setTimeout(next, 4200); return; }
  say(text, { persona: st.voice, rateMul: it.kind === 'sleep' ? 0.8 : 0.88 }, next);
}

export function openPlayer(id: string) {
  const it = CALM_ITEMS.find(x => x.id === id);
  if (!it) return;
  if (!it.lines) { openBreathe(); return; }
  stopSpeech();
  clearTimeout(pNext);
  pauseNarration();
  pLine = 0;
  const bg = it.bg || getState().pBg;
  const timerMin = parseInt(getState().pTimer, 10) || undefined;
  set({ player: id, pPlaying: true, pElapsed: 0, pEnded: false, pLineText: '', pLineIdx: 0, pBg: bg || null, pSession: null });
  void api.startCalm(id, bg ?? undefined, timerMin).then(r => set({ pSession: r.id })).catch(() => undefined);
  if (bg) toggleSound(bg, true, () => toast('This browser can’t play sounds.'));
  playLine();
  clearInterval(pIv);
  pIv = setInterval(() => {
    const st = getState();
    if (!st.player) return;
    if (st.pPlaying) set({ pElapsed: st.pElapsed + 1 });
    const mins = parseInt(st.pTimer, 10);
    if (mins && st.pElapsed >= mins * 60) {
      // TODO(calm-content): fade audio over 30 s (PRD 8.6) once recorded audio exists.
      clearTimeout(pNext);
      pauseNarration();
      stopAllSounds();
      set({ pPlaying: false, pEnded: true, pTimer: 'End of story' });
      reportProgress(false);
    }
  }, 1000);
}

export function closePlayer() {
  const had = !!getState().player && !getState().pEnded;
  if (had) reportProgress(false);
  clearTimeout(pNext);
  clearInterval(pIv);
  pauseNarration();
  if (getState().player) set({ player: null, pPlaying: false });
}

export function togglePlay() {
  if (getState().pPlaying) { clearTimeout(pNext); pauseNarration(); set({ pPlaying: false }); }
  else { set({ pPlaying: true }); playLine(); }
}

export function stepPlayer(delta: -1 | 1) {
  const it = CALM_ITEMS.find(x => x.id === getState().player);
  if (!it?.lines) return;
  clearTimeout(pNext);
  pauseNarration();
  pLine = Math.min(it.lines.length - 1, Math.max(0, pLine + delta));
  set({ pPlaying: true });
  playLine();
}

export function setPlayerBg(k: Parameters<typeof toggleSound>[0] | null) {
  const cur = getState().pBg;
  if (cur && cur !== k) toggleSound(cur, false);
  if (k) toggleSound(k, true, () => toast('This browser can’t play sounds.'));
  set({ pBg: k });
}

export const toggleDictation = () => (getState().dictating ? stopDictation() : (stopSpeech(), startDictation(toast)));

// ------------------------------------------------------------------------------------------------ app wiring
/** One heartbeat for the walk timer and breathing cycle. */
export function startTicker() {
  const id = setInterval(() => {
    const s = getState();
    const run = (s.screen === 'walk' && !s.walkEnded) || s.breathe;
    if (run && !isSpeaking()) set(p => ({ tick: p.tick + 1 }));
  }, 1000);
  return () => clearInterval(id);
}

export function bindUi() {
  bindConversationUi({ toast, crisis: showCrisis, minor: () => void handleMinor() });
  bindSessionUi({ toast, navigate: s => navigate(s) });
  bindDataUi({ toast, crisis: showCrisis, navigate: s => navigate(s), sheet: openSheet });
}

/** A tapped notification lands on the right screen (PRD 8.8: actions deep-link into the right state). */
export function handleNotificationOpen(route: string, _kind: string, action: string) {
  void _kind;
  if (action === 'later' || action === 'skip') return;
  switch (route) {
    case 'checkin': if (action === 'type') void openChat(); else void startCheckin(); return;
    case 'walk': if (action === 'company') void startWalkFlow(); else go('outside'); return;
    case 'plan': if (action === 'walk') void startWalkFlow(); else go('today'); return;
    case 'talk': void startCall('voice'); return;
    case 'letter': go('journey'); set({ sheet: 'letter' }); return;
    default: go('today');
  }
}

export function teardownAll() {
  closePlayer();
  stopAllSounds();
  stopSpeech();
  stopDictation();
  void closeConversation({ end: false });
  clearTimeout(toastTimer);
}

export { hasConversation, nextRisk };
