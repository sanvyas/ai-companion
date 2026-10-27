import type {
  Companion, Consent, ConsentUpdate, ConversationItem, ConversationMode, EndConversationResponse, Helpline, Insights, JournalAnalysis,
  JournalCreateBody, JournalEntry, MemoryItem, Me, MeUpdate, NotificationPrefs, OtpStartResponse, OutsideEvent, PlanItem, Privacy,
  PrivacyUpdate, SafetyPlan, ServerMsg, Theme, TrustedContact, Letter,
} from '@saathi/contracts';

export type { Companion, Consent, ConsentUpdate, ConversationItem, ConversationMode, EndConversationResponse, Helpline, Insights, JournalAnalysis, JournalCreateBody, JournalEntry, MemoryItem, Me, MeUpdate, NotificationPrefs, OtpStartResponse, OutsideEvent, PlanItem, Privacy, PrivacyUpdate, SafetyPlan, Theme, TrustedContact, Letter };

export interface VoiceItem { id: string; label: string; gender: 'female' | 'male' | null; provider: 'device' | 'sarvam' }
export interface VoiceList { language: string; serverVoices: boolean; items: VoiceItem[] }
export interface PublicConfig { otp: boolean; google: boolean; googleClientId: string | null; llm: boolean; stt: boolean; tts: boolean; push: boolean; signupsOpen?: boolean; voicePaused?: boolean; analytics?: boolean }

export interface AnalyticsEvent { name: 'screen_view' | 'click' | 'step' | 'error'; screen?: string; el?: string; durationMs?: number; step?: string; result?: string; at?: number }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) { super(message); }
}

/** Server -> client conversation events, already decoded. */
export interface ConvEvents {
  onMessage(m: ServerMsg): void;
  onAudio(frame: ArrayBuffer): void;
  onClose(code: number): void;
}

export interface ConvTransport {
  turn(text: string, source?: 'typed' | 'dictated' | 'voice'): void;
  interrupt(): void;
  silence(seconds: number): void;
  voiceStart(language: 'en-IN' | 'hi-IN'): void;
  voiceStop(): void;
  sendAudio(pcm16: ArrayBuffer): void;
  close(): void;
}

export interface Api {
  readonly kind: 'http' | 'demo';
  publicConfig(): Promise<PublicConfig>;
  helplines(kind?: string): Promise<Helpline[]>;

  // session
  hasSession(): boolean;
  restoreSession(): Promise<boolean>;
  otpStart(phone: string, age18: boolean): Promise<OtpStartResponse>;
  otpVerify(b: { phone: string; code: string; challengeId?: string; age18: boolean; nickname?: string }): Promise<{ isNewUser: boolean; pendingDeletion: boolean }>;
  googleSignIn(b: { idToken: string; age18: boolean; nickname?: string }): Promise<{ isNewUser: boolean; pendingDeletion: boolean }>;
  signOut(): Promise<void>;
  onSignedOut(cb: () => void): void;

  // profile
  me(): Promise<Me>;
  patchMe(b: MeUpdate): Promise<void>;
  putConsent(b: ConsentUpdate): Promise<Consent>;
  putPrivacy(b: PrivacyUpdate): Promise<Privacy>;
  putCompanion(b: Partial<Companion>): Promise<Companion>;
  /** The voices that can speak this language. Server voices appear only once the voice service is connected. */
  voices(language?: string): Promise<VoiceList>;
  /** A short spoken sample of a server voice, as a WAV file. Throws voice_unavailable when none is connected. */
  previewVoice(voice: string, language?: string): Promise<{ audio: string; mime: string; sampleRate: number }>;
  declareMinor(): Promise<void>;
  deleteAccount(): Promise<void>;
  cancelDeletion(): Promise<void>;
  exportData(): Promise<Blob>;
  trusted(): Promise<TrustedContact | null>;
  putTrusted(b: TrustedContact): Promise<void>;
  deleteTrusted(): Promise<void>;

  // memory
  memories(): Promise<MemoryItem[]>;
  patchMemory(id: string, b: { text?: string; hidden?: boolean }): Promise<MemoryItem>;
  deleteMemory(id: string): Promise<void>;
  addMemories(items: { theme: Theme; text: string; sensitive: boolean }[], source: 'chat' | 'call' | 'journal', sourceId?: string): Promise<MemoryItem[]>;
  forgetAll(): Promise<void>;

  // journal
  journal(cursor?: string): Promise<{ items: JournalEntry[]; nextCursor: string | null }>;
  createJournal(b: JournalCreateBody): Promise<{ entry: JournalEntry; riskLevel: 0 | 1 | 2 | 3 }>;
  analyzeJournal(id: string): Promise<JournalAnalysis>;
  commitJournal(id: string, b: { savedMemoryIds: number[]; useHook: boolean; addStep: boolean }): Promise<{ savedMemories: number; hook: boolean; step: boolean }>;
  discardJournal(id: string): Promise<void>;
  setJournalShared(id: string, shared: boolean): Promise<JournalEntry>;
  deleteJournal(id: string): Promise<void>;

  // daily
  logMood(value: number, source?: 'tap' | 'checkin' | 'journal'): Promise<void>;
  plan(): Promise<PlanItem[]>;
  addPlan(label: string, source?: 'user' | 'journal' | 'checkin'): Promise<PlanItem>;
  setPlanDone(id: string, done: boolean): Promise<PlanItem>;
  insights(weeks?: number): Promise<Insights>;
  latestLetter(): Promise<Letter | null>;

  // safety
  safetyPlan(): Promise<SafetyPlan | null>;
  putSafetyPlan(p: SafetyPlan): Promise<void>;
  safetyAck(level: 1 | 2 | 3, action: 'helpline' | 'contact' | 'safe' | 'emergency'): Promise<void>;

  // calm
  startCalm(itemId: string, bg?: string, timerMinutes?: number): Promise<{ id: string }>;
  progressCalm(id: string, pct: number): Promise<void>;

  // outside
  events(city?: string): Promise<{ city: string | null; items: OutsideEvent[] }>;
  markInterest(id: string): Promise<void>;

  // notifications
  prefs(): Promise<NotificationPrefs>;
  putPrefs(b: Partial<NotificationPrefs>): Promise<NotificationPrefs>;
  vapidKey(): Promise<{ publicKey: string | null; enabled: boolean }>;
  registerDevice(subscription: PushSubscriptionJSON): Promise<void>;
  inbox(): Promise<{ id: string; kind: string }[]>;
  dismissCard(id: string): Promise<void>;
  notificationOpened(kind: string): Promise<void>;

  // product analytics (only for people who opted in)
  sendEvents(sessionId: string, events: AnalyticsEvent[]): Promise<void>;

  // conversations
  createConversation(mode: ConversationMode, continueFrom?: string, first?: boolean): Promise<{ id: string; mode: ConversationMode; voice: { serverStt: boolean; serverTts: boolean } }>;
  startWalk(): Promise<{ id: string; mode: ConversationMode; voice: { serverStt: boolean; serverTts: boolean } }>;
  endConversation(id: string, feeling?: 'better' | 'same' | 'worse'): Promise<EndConversationResponse>;
  conversations(limit?: number): Promise<ConversationItem[]>;
  messages(id: string): Promise<{ id: string; role: 'user' | 'ai' | 'system'; text: string; createdAt: string }[]>;
  openConversation(id: string, ev: ConvEvents): Promise<ConvTransport>;
}
