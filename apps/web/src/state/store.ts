import { useSyncExternalStore } from 'react';
import type { TimeOfDay } from '../theme';
import { initialRisk, type RiskState } from '@saathi/domain';
import type { SoundId } from '../data/calm';
import { HELPLINES } from '../data/helplines';
import { isDemo, type Consent, type ConversationItem, type ConversationMode, type EndConversationResponse, type Helpline, type Insights, type JournalAnalysis, type JournalEntry, type Letter, type MemoryItem, type Me, type NotificationPrefs, type OutsideEvent, type PlanItem, type PublicConfig, type SafetyPlan } from '../api';

export type Screen =
  | 'welcome' | 'intro' | 'age' | 'under' | 'lang' | 'name' | 'otp' | 'companion' | 'consent'
  | 'today' | 'talk' | 'call' | 'chat' | 'outside' | 'walk' | 'journey' | 'you' | 'memory'
  | 'privacy' | 'journal' | 'jcompose' | 'lock' | 'incoming' | 'notifs' | 'studio' | 'calm';

export type Sheet = 'support' | 'helplines' | 'plan' | 'letter' | 'jread' | 'mic' | 'delete' | 'event' | 'trusted' | 'planedit' | null;
export type CallMode = 'voice' | 'video' | 'sit' | 'checkin';
export type Look = 'orb' | 'asha' | 'dev' | 'noor' | 'kabir';
export type Persona = 'warm' | 'steady' | 'bright';
export type Language = 'en' | 'hinglish' | 'hi';
export type NotifKind = 'checkin' | 'plan' | 'leave' | 'followup' | 'quietweek';
export type AvatarMode = 'idle' | 'listening' | 'thinking' | 'concerned' | 'smiling' | 'speaking' | 'paused';
export type CallPhase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'idle' | 'paused' | 'error';

export interface ChatMsg { who: 'ai' | 'me'; text: string }

export interface JournalResult extends JournalAnalysis {
  hookOn: boolean;
  stepOn: boolean;
  entryId: string;
  /** Which proposed memories the user has ticked. Sensitive ones start off. */
  keep: number[];
}

export interface AppState {
  // session
  phase: 'booting' | 'out' | 'in';
  cfg: PublicConfig | null;
  me: Me | null;
  helplines: Helpline[];
  trustedDial: { name: string; phone: string } | null;

  // navigation + overlays
  screen: Screen;
  sheet: Sheet;
  crisis: boolean;
  crisisConfirm: boolean;
  breathe: boolean;
  paywall: boolean;
  toast: string | null;
  tick: number;

  // sign-in (before there is a `me`)
  language: Language;
  nick: string;
  age18: boolean;
  returning: boolean;
  phone: string;
  otpCode: string;
  challengeId: string | null;
  devCode: string | null;
  authBusy: boolean;
  authError: string | null;
  previewing: string | null;

  // mirrors of `me` that screens read directly
  compName: string;
  look: Look;
  voice: string;
  consent: Consent | null;

  // conversation + call
  conv: { id: string; mode: ConversationMode; voice: { serverStt: boolean; serverTts: boolean }; ready: boolean } | null;
  callMode: CallMode;
  firstRun: boolean;
  captions: boolean;
  muted: boolean;
  paused: boolean;
  callEnded: boolean;
  callPhase: CallPhase;
  callLine: { who: 'ai' | 'me'; text: string } | null;
  callSummary: EndConversationResponse | null;
  callBusy: boolean;
  micOk: boolean;
  pendingMode: CallMode | null;
  pendingFirst: boolean;
  mouth: number;
  speakingNow: boolean;
  sampleLang: string;
  deviceVoice: string;
  voicesList: { name: string; lang: string; uri: string }[];
  studioMode: AvatarMode;
  walkEnded: boolean;
  walkSeconds: number;

  // chat
  msgs: ChatMsg[];
  draft: string;
  typing: boolean;
  careCard: boolean;
  risk: RiskState;

  // notifications
  notif: NotifKind | null;
  cards: { id: string; kind: string }[];
  prefs: NotificationPrefs | null;
  pushState: 'unknown' | 'unsupported' | 'denied' | 'off' | 'on';

  // calm
  calmTab: 'meditate' | 'sleep' | 'sounds';
  calmCat: string;
  player: string | null;
  pPlaying: boolean;
  pElapsed: number;
  pEnded: boolean;
  pLineText: string;
  pLineIdx: number;
  pBg: SoundId | null;
  pTimer: string;
  pSession: string | null;
  /** Who is reading the current session aloud, for the player's caption. */
  pNarrator: string;
  /** A story is being written. */
  storyBusy: boolean;
  sounds: Partial<Record<SoundId, true>>;

  // journal
  jEntries: JournalEntry[];
  jNext: string | null;
  jMode: 'write' | 'speak';
  jText: string;
  jPrompt: string | null;
  jShare: boolean;
  jStage: 'edit' | 'saving' | 'thinking' | 'review';
  jResult: JournalResult | null;
  jError: string | null;
  dictating: boolean;
  /** Which language the microphone listens for in the journal. 'auto' follows the profile. */
  dictLang: 'auto' | 'en' | 'hi';
  jReadId: string | null;

  // today, outside, insights, memory, safety
  plan: PlanItem[];
  mood: number | null;
  small: number;
  smallReply: string | null;
  events: OutsideEvent[];
  eventsCity: string | null;
  eventId: string | null;
  eventStage: 'detail' | 'confirm' | 'done';
  day: number | null;
  insights: Insights | null;
  letter: Letter | null;
  memories: MemoryItem[];
  editingId: string | null;
  editText: string;
  recent: ConversationItem[];
  safetyPlan: SafetyPlan | null;
  retention: 0 | 7 | 30 | 90 | 36500;

  // settings + demo
  reduceMotion: boolean;
  voiceAudio: boolean;
  todOverride: TimeOfDay | null;
  demo: boolean;
}

const PREF_KEY = 'saathi.ui.v1';

// Only display preferences are kept on the device. Anything personal lives on the server, encrypted (PRD 5).
function loadUi(): Partial<Pick<AppState, 'reduceMotion' | 'captions' | 'language'>> {
  try { const r = localStorage.getItem(PREF_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
export function saveUi(s: AppState) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ reduceMotion: s.reduceMotion, captions: s.captions, language: s.language })); } catch { /* blocked */ }
}

export function initialState(): AppState {
  const ui = loadUi();
  return {
    phase: 'booting', cfg: null, me: null, helplines: builtinHelplines(), trustedDial: null,
    screen: 'welcome', sheet: null, crisis: false, crisisConfirm: false, breathe: false, paywall: false, toast: null, tick: 0,
    language: ui.language ?? 'en', nick: '', age18: false, returning: false, phone: '', otpCode: '', challengeId: null, devCode: null, authBusy: false, authError: null, previewing: null,
    compName: 'Saathi', look: 'asha', voice: 'warm', consent: null,
    conv: null, callMode: 'voice', firstRun: false, captions: ui.captions ?? true, muted: false, paused: false, callEnded: false, callPhase: 'connecting', callLine: null, callSummary: null, callBusy: false,
    micOk: false, pendingMode: null, pendingFirst: false, mouth: 0, speakingNow: false, sampleLang: 'English', deviceVoice: '', voicesList: [], studioMode: 'idle', walkEnded: false, walkSeconds: 0,
    msgs: [], draft: '', typing: false, careCard: false, risk: initialRisk,
    notif: null, cards: [], prefs: null, pushState: 'unknown',
    calmTab: 'meditate', calmCat: 'All', player: null, pPlaying: false, pElapsed: 0, pEnded: false, pLineText: '', pLineIdx: 0, pBg: null, pTimer: 'End of story', pSession: null, pNarrator: '', storyBusy: false, sounds: {},
    jEntries: [], jNext: null, jMode: 'write', jText: '', jPrompt: null, jShare: false, jStage: 'edit', jResult: null, jError: null, dictating: false, dictLang: 'auto', jReadId: null,
    plan: [], mood: null, small: 0, smallReply: null, events: [], eventsCity: null, eventId: null, eventStage: 'detail', day: null, insights: null, letter: null,
    memories: [], editingId: null, editText: '', recent: [], safetyPlan: null, retention: 90,
    reduceMotion: ui.reduceMotion ?? false, voiceAudio: true, todOverride: null, demo: isDemo,
  };
}

/** Always available, even offline or before sign-in: the numbers PRD 6.4 says must be in the app. */
export function builtinHelplines(): Helpline[] {
  return HELPLINES.map(h => ({ id: h.id, name: h.name, description: h.desc, number: h.num, tel: h.tel, kind: h.id === 'emergency' ? 'emergency' : 'crisis', hours: '24x7', languages: ['en', 'hi'], city: null, stale: false }));
}

type Listener = () => void;
let state: AppState = initialState();
const listeners = new Set<Listener>();

export const getState = () => state;

export function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach(l => l());
}

export function resetState() {
  const keep = { cfg: state.cfg, helplines: state.helplines, voicesList: state.voicesList, demo: state.demo };
  state = { ...initialState(), ...keep, phase: 'out' };
  listeners.forEach(l => l());
}

export const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Select a stable value (primitive or an existing reference). Never build new objects in the selector. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
