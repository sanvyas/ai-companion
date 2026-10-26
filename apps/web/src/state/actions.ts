import { CALM_ITEMS } from '../data/calm';
import { TRUSTED_CONTACT } from '../data/seed';
import { analyzeJournalLocally, moodIndexFor } from '@saathi/domain';
import { nextRisk, userSafeAcknowledged } from '@saathi/domain';
import { mockCompanion } from '../providers/companion';
import { startDictation, stopDictation } from '../audio/dictation';
import { isSpeaking, pauseNarration, say, stopSpeech, ttsSupported } from '../audio/speech';
import { stopAllSounds, toggleSound } from '../audio/sounds';
import { getState, set, type AppState, type CallMode, type JournalResult, type Screen } from './store';

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let replyTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  clearTimeout(toastTimer);
  set({ toast: msg });
  toastTimer = setTimeout(() => set({ toast: null }), 2800);
}

export function go(screen: Screen, extra: Partial<AppState> = {}) {
  closePlayer();
  stopSpeech();
  stopDictation();
  set({ screen, sheet: null, tick: 0, paused: false, callEnded: false, crisis: false, crisisConfirm: false, breathe: false, paywall: false, ...extra });
}

export const openSheet = (sheet: AppState['sheet']) => set({ sheet });
export const closeSheet = () => set({ sheet: null });
export const openBreathe = () => set({ breathe: true, tick: 0, sheet: null });
export const closeBreathe = () => set({ breathe: false });

// --- onboarding -----------------------------------------------------------------------------
export function finishOnboarding() {
  set({ onboarded: true });
}

// --- calls ----------------------------------------------------------------------------------
export function startCall(mode: CallMode, first = false) {
  if (!getState().micOk && mode !== 'sit') {
    set({ sheet: 'mic', pendingMode: mode, pendingFirst: first });
    return;
  }
  go('call', { callMode: mode, firstRun: first, muted: false });
}

export const startCheckin = () => go('call', { callMode: 'checkin', micOk: true, firstRun: false, inApp: false, notif: null });

export function endCall() {
  stopSpeech();
  set({ callEnded: true });
}

// --- safety ---------------------------------------------------------------------------------
export function showCrisis() {
  stopSpeech();
  stopDictation();
  set({ crisis: true, crisisConfirm: false, sheet: null });
}

/** "I'm safe right now" after the extra confirm (PRD §8.10.3). */
export function confirmSafe() {
  set(s => ({ crisis: false, crisisConfirm: false, risk: userSafeAcknowledged(s.risk), careCard: true }));
}

/** Paywall is never shown during distress (risk >= 1 this session, PRD §8.7.5). Safety features are never gated. */
export function openPaywall() {
  const s = getState();
  if (s.risk.max >= 1) {
    toast('Plus can wait. There’s no rush, and nothing here is locked that you need right now.');
    return;
  }
  set({ paywall: true, sheet: null });
}

// --- chat -----------------------------------------------------------------------------------
export function sendChat() {
  const s = getState();
  const text = s.draft.trim();
  if (!text) return;
  const reply = mockCompanion.reply({ text, turn: s.turn, trustedName: TRUSTED_CONTACT.name });
  const risk = nextRisk(s.risk, reply.level);
  set({ msgs: [...s.msgs, { who: 'me', text }], draft: '', typing: reply.level < 3, risk });
  clearTimeout(replyTimer);

  if (reply.level === 3) {
    // Fixed, reviewed script replaces the AI turn; the crisis screen takes over at once.
    set(p => ({ msgs: [...p.msgs, ...reply.lines.map(t => ({ who: 'ai' as const, text: t }))], careCard: true, turn: p.turn + 1 }));
    showCrisis();
    return;
  }
  replyTimer = setTimeout(() => {
    set(p => ({
      typing: false,
      turn: p.turn + (reply.level >= 2 ? 0 : 1),
      msgs: [...p.msgs, ...reply.lines.map(t => ({ who: 'ai' as const, text: t }))],
      careCard: p.careCard || reply.level >= 2,
    }));
    if (reply.minor) setTimeout(() => go('under'), 2200);
  }, 1700);
}

// --- journal --------------------------------------------------------------------------------
export function startJournal(mode: 'write' | 'speak') {
  go('jcompose', { jMode: mode, jText: '', jPrompt: null, jStage: 'edit', jShare: getState().consent.remember });
}

const addEntry = (s: AppState, shared: boolean, mood: number) => ({
  id: Date.now(),
  date: 'Today',
  mode: (s.jMode === 'speak' ? 'spoken' : 'written') as 'spoken' | 'written',
  mood,
  shared,
  text: (s.jPrompt ? s.jPrompt + '\n' : '') + s.jText.trim(),
});

export function saveJournal() {
  const s = getState();
  if (!s.jText.trim()) { toast('Nothing to save yet. Take your time.'); return; }
  stopDictation();
  if (!s.jShare) {
    // Private path: no analysis, no AI processing at all (PRD §8.5.2).
    set(p => ({ jEntries: [addEntry(s, false, 2), ...p.jEntries] }));
    go('journal');
    toast('Saved, just for you.');
    return;
  }
  analyzeJournal(s.jText);
}

export function analyzeJournal(text: string) {
  set({ jStage: 'thinking' });
  setTimeout(() => {
    const a = analyzeJournalLocally(text);
    const result: JournalResult = {
      ...a,
      hookOn: true,
      stepOn: false,
      memories: a.memories.map((m, i) => ({ ...m, id: Date.now() + i, keep: !m.sensitive })),
    };
    set(p => ({ jStage: 'review', jResult: result, risk: nextRisk(p.risk, a.riskLevel) }));
    if (a.riskLevel === 3) showCrisis();
  }, 1300);
}

export function finishJournal() {
  const s = getState();
  const r = s.jResult;
  if (!r) return;
  const keep = r.memories.filter(m => m.keep);
  set(p => ({
    jEntries: [addEntry(s, true, moodIndexFor(r.mood)), ...p.jEntries],
    // Nothing is written to Memory until Done (PRD §8.5.3).
    memories: [...p.memories, ...keep.map((m, i) => ({ id: Date.now() + i, theme: m.theme, text: m.text, hidden: false }))],
    journalHook: r.hookOn ? r.hook : p.journalHook,
    hookUsed: r.hookOn ? false : p.hookUsed,
    plan: r.stepOn ? [...p.plan.filter(x => !x.done), { id: Date.now(), label: r.step, done: false }].slice(-3) : p.plan,
    jResult: null,
  }));
  go('journal');
  toast(keep.length || r.hookOn ? `Saved. I’ll remember ${keep.length} thing${keep.length === 1 ? '' : 's'}${r.hookOn ? ' and ask about it next time' : ''}.` : 'Saved. I won’t bring it up.');
}

export function keepPrivate() {
  const s = getState();
  if (!s.jResult) return;
  // Analysis MUST be discarded (PRD §8.5.3). TODO(journal-api): also DELETE the server-side analysis.
  set(p => ({ jEntries: [addEntry(s, false, moodIndexFor(s.jResult!.mood)), ...p.jEntries], jResult: null }));
  go('journal');
  toast('Saved, just for you. Nothing remembered.');
}

export const toggleDictation = () => (getState().dictating ? stopDictation() : (stopSpeech(), startDictation(toast)));

// --- calm player ----------------------------------------------------------------------------
let pLine = 0;
let pNext: ReturnType<typeof setTimeout> | undefined;
let pIv: ReturnType<typeof setInterval> | undefined;
export const getPlayerLine = () => pLine;

function playLine() {
  const st = getState();
  if (!st.player || !st.pPlaying) return;
  const it = CALM_ITEMS.find(x => x.id === st.player);
  if (!it?.lines) return;
  if (pLine >= it.lines.length) {
    set(p => ({ pPlaying: false, pEnded: true, pLineIdx: it.lines!.length, wins: [{ text: `${it.title}`, when: 'Today' }, ...p.wins].slice(0, 6) }));
    if (st.pTimer === 'End of story') setTimeout(stopAllSounds, 1500);
    return;
  }
  const text = it.lines[pLine];
  set({ pLineText: text, pLineIdx: pLine });
  const next = () => {
    if (!getState().pPlaying) return;
    pLine++;
    pNext = setTimeout(playLine, it.kind === 'sleep' ? 3200 : 2600);
  };
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
  set({ player: id, pPlaying: true, pElapsed: 0, pEnded: false, pLineText: '', pLineIdx: 0, pBg: bg || null });
  if (bg) toggleSound(bg, true, () => toast('This browser can’t play sounds.'));
  playLine();
  clearInterval(pIv);
  pIv = setInterval(() => {
    const st = getState();
    if (!st.player) return;
    if (st.pPlaying) set({ pElapsed: st.pElapsed + 1 });
    const mins = parseInt(st.pTimer, 10);
    if (mins && st.pElapsed >= mins * 60) {
      // TODO(calm-content): fade audio over 30s (PRD §8.6) once recorded audio exists.
      clearTimeout(pNext);
      pauseNarration();
      stopAllSounds();
      set({ pPlaying: false, pEnded: true, pTimer: 'End of story' });
    }
  }, 1000);
}

export function closePlayer() {
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

// --- timers ---------------------------------------------------------------------------------
/** One-second heartbeat that drives the call script, walk prompts and breathing cycle. */
export function startTicker() {
  const id = setInterval(() => {
    const s = getState();
    const run = ((s.screen === 'call' && !s.paused && !s.callEnded) || (s.screen === 'walk' && !s.walkEnded) || s.breathe) && !isSpeaking();
    if (run) set(p => ({ tick: p.tick + 1 }));
  }, 1000);
  return () => clearInterval(id);
}

export function teardownAll() {
  closePlayer();
  stopAllSounds();
  stopSpeech();
  stopDictation();
  clearTimeout(replyTimer);
  clearTimeout(toastTimer);
}
