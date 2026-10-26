import { useSyncExternalStore } from 'react';
import type { TimeOfDay } from '../theme';
import { SEED_JOURNAL, SEED_MEMORIES, SEED_PLAN, WINS, type JournalEntry, type Memory, type PlanItem } from '../data/seed';
import type { SoundId } from '../data/calm';
import { initialRisk, type RiskState } from '@saathi/domain';
import type { JournalAnalysis } from '@saathi/domain';

export type Screen =
  | 'welcome' | 'intro' | 'age' | 'under' | 'lang' | 'name' | 'companion' | 'consent'
  | 'today' | 'talk' | 'call' | 'chat' | 'outside' | 'walk' | 'journey' | 'you' | 'memory'
  | 'privacy' | 'journal' | 'jcompose' | 'lock' | 'incoming' | 'notifs' | 'studio' | 'calm';

export type Sheet = 'support' | 'helplines' | 'plan' | 'letter' | 'jread' | 'mic' | 'delete' | 'event' | null;
export type CallMode = 'voice' | 'video' | 'sit' | 'checkin';
export type Look = 'orb' | 'asha' | 'dev' | 'noor' | 'kabir';
export type Persona = 'warm' | 'steady' | 'bright';
export type NotifKind = 'checkin' | 'plan' | 'leave' | 'followup' | 'quietweek';
export type AvatarMode = 'idle' | 'listening' | 'thinking' | 'concerned' | 'smiling' | 'speaking' | 'paused';

export interface ChatMsg { who: 'ai' | 'me'; text: string }

export interface JournalResult extends JournalAnalysis {
  hookOn: boolean;
  stepOn: boolean;
  memories: (JournalAnalysis['memories'][number] & { id: number; keep: boolean })[];
}

export interface AppState {
  // navigation + overlays
  screen: Screen;
  sheet: Sheet;
  crisis: boolean;
  crisisConfirm: boolean;
  breathe: boolean;
  paywall: boolean;
  toast: string | null;
  tick: number;

  // onboarding + profile
  onboarded: boolean;
  langs: string[];
  nick: string;
  compName: string;
  acct: 'private' | 'anon';
  look: Look;
  voice: Persona;
  consent: { remember: boolean; health: boolean; notif: boolean; trusted: boolean };

  // voice / call
  captions: boolean;
  muted: boolean;
  paused: boolean;
  callEnded: boolean;
  callMode: CallMode;
  firstRun: boolean;
  micOk: boolean;
  pendingMode: CallMode | null;
  pendingFirst: boolean;
  previewing: Persona | null;
  mouth: number;
  speakingNow: boolean;
  sampleLang: string;
  deviceVoice: string;
  voicesList: { name: string; lang: string; uri: string }[];
  studioMode: AvatarMode;

  // notifications
  notif: NotifKind | null;
  inApp: boolean;
  chan: { card: boolean; push: boolean; calls: boolean; letter: boolean };
  checkinTime: 'Morning' | 'Evening' | 'Off';

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
  sounds: Partial<Record<SoundId, true>>;

  // journal
  jEntries: JournalEntry[];
  jMode: 'write' | 'speak';
  jText: string;
  jPrompt: string | null;
  jShare: boolean;
  jStage: 'edit' | 'thinking' | 'review';
  jResult: JournalResult | null;
  dictating: boolean;
  jReadId: number | null;
  journalHook: string | null;
  hookUsed: boolean;

  // today / outside / insights
  plan: PlanItem[];
  mood: number | null;
  small: number;
  smallReply: string | null;
  walkEnded: boolean;
  eventId: string | null;
  eventStage: 'detail' | 'confirm' | 'done';
  day: number | null;
  wins: { text: string; when: string }[];

  // memory + privacy
  memories: Memory[];
  editingId: number | null;
  editText: string;
  priv: { anon: boolean; lock: boolean; discreet: boolean; hide: boolean; preview: boolean };
  retention: '7 days' | '90 days' | 'Until I delete';

  // chat + safety
  msgs: ChatMsg[];
  draft: string;
  typing: boolean;
  careCard: boolean;
  turn: number;
  risk: RiskState;

  // settings + demo
  reduceMotion: boolean;
  voiceAudio: boolean;
  todOverride: TimeOfDay | null;
  demo: boolean;
}

const PREF_KEY = 'saathi.prefs.v1';

// Only low-sensitivity preferences are persisted. Journal text, memories, chat and mood are
// deliberately NOT written to localStorage (PRD §0.4: when unsure, do not store; §5 requires
// per-user encryption we do not have client-side yet).
// TODO(sync): persist journal/memories through the encrypted API + offline queue (PRD §9).
type Prefs = Pick<AppState, 'onboarded' | 'langs' | 'nick' | 'compName' | 'look' | 'voice' | 'consent' | 'chan' | 'checkinTime' | 'priv' | 'retention' | 'reduceMotion' | 'sampleLang'>;

function loadPrefs(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
  } catch {
    return {};
  }
}

export function savePrefs(s: AppState) {
  const p: Prefs = {
    onboarded: s.onboarded, langs: s.langs, nick: s.nick, compName: s.compName, look: s.look, voice: s.voice,
    consent: s.consent, chan: s.chan, checkinTime: s.checkinTime, priv: s.priv, retention: s.retention,
    reduceMotion: s.reduceMotion, sampleLang: s.sampleLang,
  };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage may be blocked */ }
}

export function clearPrefs() {
  try { localStorage.removeItem(PREF_KEY); } catch { /* ignore */ }
}

export function initialState(withPrefs = true): AppState {
  const prefs = withPrefs ? loadPrefs() : {};
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const base: AppState = {
    screen: 'welcome', sheet: null, crisis: false, crisisConfirm: false, breathe: false, paywall: false, toast: null, tick: 0,
    onboarded: false, langs: ['English', 'Hinglish'], nick: 'Aarav', compName: 'Saathi', acct: 'private', look: 'asha', voice: 'warm',
    consent: { remember: false, health: false, notif: false, trusted: false },
    captions: true, muted: false, paused: false, callEnded: false, callMode: 'voice', firstRun: false, micOk: false, pendingMode: null, pendingFirst: false,
    previewing: null, mouth: 0, speakingNow: false, sampleLang: 'English', deviceVoice: '', voicesList: [], studioMode: 'idle',
    notif: null, inApp: false, chan: { card: true, push: true, calls: true, letter: true }, checkinTime: 'Evening',
    calmTab: 'meditate', calmCat: 'All', player: null, pPlaying: false, pElapsed: 0, pEnded: false, pLineText: '', pLineIdx: 0, pBg: null, pTimer: 'End of story', sounds: {},
    jEntries: SEED_JOURNAL, jMode: 'write', jText: '', jPrompt: null, jShare: false, jStage: 'edit', jResult: null, dictating: false, jReadId: null, journalHook: null, hookUsed: false,
    plan: SEED_PLAN, mood: null, small: 0, smallReply: null, walkEnded: false, eventId: null, eventStage: 'detail', day: null, wins: WINS,
    memories: SEED_MEMORIES, editingId: null, editText: '',
    priv: { anon: false, lock: true, discreet: false, hide: true, preview: false }, retention: '90 days',
    msgs: [{ who: 'ai', text: 'Hey Aarav. I’m here.' }, { who: 'ai', text: 'How did the interview prep go today?' }],
    draft: '', typing: false, careCard: false, turn: 0, risk: initialRisk,
    reduceMotion: false, voiceAudio: true, todOverride: null, demo: params.has('demo') || import.meta.env.VITE_DEMO === '1',
  };
  const merged = { ...base, ...prefs, consent: { ...base.consent, ...prefs.consent }, chan: { ...base.chan, ...prefs.chan }, priv: { ...base.priv, ...prefs.priv } };
  merged.screen = merged.onboarded ? 'today' : 'welcome';
  return merged;
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

export function resetState(next: AppState = initialState(false)) {
  state = next;
  listeners.forEach(l => l());
}

const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const subscribePrefs = subscribe;

/** Select a stable value (primitive or an existing reference). Never build new objects in the selector. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}
