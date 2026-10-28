import type { StoryTheme } from '@saathi/contracts';
import { api, isDemo } from '../api';
import { addGeneratedStory, findCalm } from '../data/calm';
import { stopDictation, startDictation } from '../audio/dictation';
import { playClip } from '../audio/clip';
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
  const it = findCalm(s.player);
  if (!s.pSession || !it?.lines) return;
  const pct = done ? 100 : Math.round((Math.min(pLine, it.lines.length) / it.lines.length) * 100);
  void api.progressCalm(s.pSession, pct).catch(() => undefined);
}

// Who reads this session aloud. A server voice, chosen on the server from the person's mood, reads when one is connected;
// otherwise the phone's own voice does, at the pace the server worked out for that mood. Lines are fetched a few ahead
// so the reading does not stall between them.
interface Narrator { server: boolean; pace: number; label: string | null }
let narrator: Promise<Narrator> | null = null;
let lineAudio = new Map<number, Promise<{ audio: string; mime: string } | null>>();
let playToken = 0;

const narrationKind = (it: { kind: string }) => (it.kind === 'sleep' ? 'sleep' as const : 'meditation' as const);

function loadNarrator(it: NonNullable<ReturnType<typeof findCalm>>): Promise<Narrator> {
  const fallback: Narrator = { server: false, pace: it.kind === 'sleep' ? 0.8 : 0.88, label: null };
  const timeout = new Promise<Narrator>(res => setTimeout(() => res(fallback), 3000));
  const ask = api.calmNarration(narrationKind(it)).then(n => ({ server: n.server, pace: n.pace, label: n.voice?.label ?? null })).catch(() => fallback);
  return Promise.race([ask, timeout]);
}

function fetchLine(it: NonNullable<ReturnType<typeof findCalm>>, i: number) {
  if (!it.lines || i >= it.lines.length) return;
  if (lineAudio.has(i)) return;
  const text = it.lines[i];
  lineAudio.set(i, api.narrate(text, narrationKind(it), it.lang).then(r => ({ audio: r.audio, mime: r.mime })).catch(() => {
    // One failed line must not silence the rest of the session: that line falls back to the phone's voice.
    return null;
  }));
}

async function playLine() {
  const st = getState();
  if (!st.player || !st.pPlaying) return;
  const it = findCalm(st.player);
  if (!it?.lines) return;
  if (pLine >= it.lines.length) {
    set({ pPlaying: false, pEnded: true, pLineIdx: it.lines.length });
    reportProgress(true);
    if (st.pTimer === 'End of story') setTimeout(stopAllSounds, 1500);
    return;
  }
  const token = ++playToken;
  const index = pLine;
  const text = it.lines[index];
  set({ pLineText: text, pLineIdx: index });
  const pause = it.kind === 'sleep' ? 3200 : 2600;
  const next = () => { if (token !== playToken || !getState().pPlaying) return; pLine++; pNext = setTimeout(() => void playLine(), pause); };
  if (!st.voiceAudio) { pNext = setTimeout(next, 4200); return; }

  const n = await (narrator ??= loadNarrator(it));
  if (token !== playToken || !getState().pPlaying) return;
  const deviceVoice = () => {
    if (!ttsSupported()) { pNext = setTimeout(next, 4200); return; }
    say(text, { pace: n.pace, lang: it.lang === 'hi' ? 'हिन्दी' : 'English' }, next);
  };
  if (!n.server) { deviceVoice(); return; }

  fetchLine(it, index);
  fetchLine(it, index + 1);
  fetchLine(it, index + 2);
  const clip = await lineAudio.get(index)!;
  if (token !== playToken || !getState().pPlaying) return;
  if (!clip) { deviceVoice(); return; }
  playClip(clip.audio, clip.mime, next, deviceVoice);
}

export function openPlayer(id: string) {
  const it = findCalm(id);
  if (!it) return;
  if (!it.lines) { openBreathe(); return; }
  stopSpeech();
  clearTimeout(pNext);
  pauseNarration();
  pLine = 0;
  narrator = null;
  lineAudio = new Map();
  playToken++;
  const bg = it.bg || getState().pBg;
  const timerMin = parseInt(getState().pTimer, 10) || undefined;
  set({ player: id, pPlaying: true, pElapsed: 0, pEnded: false, pLineText: '', pLineIdx: 0, pBg: bg || null, pSession: null, pNarrator: '' });
  void api.startCalm(id, bg ?? undefined, timerMin).then(r => set({ pSession: r.id })).catch(() => undefined);
  if (bg) toggleSound(bg, true, () => toast('This browser can’t play sounds.'));
  void (narrator = loadNarrator(it)).then(n => { if (getState().player === id) set({ pNarrator: n.server && n.label ? n.label : '' }); });
  void playLine();
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

/** Ask for a story written for tonight and start playing it. Falls back to a reviewed story on the server, and says so if offline. */
export async function playStory(theme: StoryTheme) {
  if (getState().storyBusy) return;
  set({ storyBusy: true });
  try {
    const r = await api.story(theme);
    const it = addGeneratedStory(r.title, r.lines, (getState().me?.language as 'en' | 'hinglish' | 'hi' | undefined) ?? 'en');
    openPlayer(it.id);
  } catch {
    toast('I couldn’t write a story just now. One of the ones below is ready whenever you are.');
  } finally {
    set({ storyBusy: false });
  }
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
  else { set({ pPlaying: true }); void playLine(); }
}

export function stepPlayer(delta: -1 | 1) {
  const it = findCalm(getState().player);
  if (!it?.lines) return;
  clearTimeout(pNext);
  pauseNarration();
  pLine = Math.min(it.lines.length - 1, Math.max(0, pLine + delta));
  set({ pPlaying: true });
  void playLine();
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
