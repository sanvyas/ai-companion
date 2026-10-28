import type { ServerMsg } from '@saathi/contracts';
import { analyzeJournalLocally, classify, moodIndexFor } from '@saathi/domain';
import { mockCompanion } from '../providers/companion';
import { EVENTS } from '../data/outside';
import { SEED_JOURNAL, SEED_MEMORIES, SEED_PLAN, MOOD_SERIES, WINS, SAFETY_PLAN, TRUSTED_CONTACT } from '../data/seed';
import { YOUTH_HELPLINES, HELPLINES } from '../data/helplines';
import { ApiError, type Api, type ConvEvents, type ConvTransport, type Helpline, type Insights, type JournalEntry, type MemoryItem, type Me, type OutsideEvent, type PlanItem, type SafetyPlan } from './types';

// An in-memory stand-in for the backend, used only for design review (?demo). It follows the same interface and
// the same rules as the server (consent, one-time hook, nothing saved until Done) with seeded demo data and no
// network. Nothing here is a source of truth for the real app.

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const uuid = () => crypto.randomUUID();
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms));

export class DemoApi implements Api {
  readonly kind = 'demo' as const;
  private signed = false;
  private cb: (() => void)[] = [];
  private tokensSeen = 0;

  private _me: Me = {
    id: uuid(), nickname: 'Aarav', language: 'hinglish', timezone: 'Asia/Kolkata', city: 'Bengaluru', phoneMasked: '+91 ••••• 210', subscription: 'basic',
    ageConfirmed18: true, onboarded: false, pendingDeletion: false,
    consent: { version: 1, acceptedAt: null, remember: false, notifications: false, calls: false, healthData: false, location: 'off', improveModels: false, analytics: false },
    privacy: { lockScreenPreviews: false, discreetMode: false, appLock: 'off', quickHide: true, transcriptRetentionDays: 90 },
    companion: { name: 'Saathi', look: 'asha', voice: 'warm' }, flags: {},
    trustedContact: { name: TRUSTED_CONTACT.name, relation: TRUSTED_CONTACT.relation, phoneMasked: '+91 ••••• 233' },
    features: { otp: true, google: false, llm: true, stt: false, tts: false, push: false, calls: false },
  };
  private mem: MemoryItem[] = SEED_MEMORIES.map(m => ({ id: String(m.id), theme: m.theme, text: m.text, sensitive: false, hidden: m.hidden, source: 'chat' as const, createdAt: iso(10) }));
  private jr: JournalEntry[] = SEED_JOURNAL.map((e, i) => ({ id: String(e.id), mode: e.mode, prompt: null, text: e.text, mood: e.mood, shared: e.shared, createdAt: iso(3 + i * 2) }));
  private pl: PlanItem[] = SEED_PLAN.map(p => ({ id: String(p.id), label: p.label, done: p.done, source: 'ai' as const }));
  private wins = WINS.map((w, i) => ({ id: uuid(), kind: 'other', label: w.text, createdAt: iso(i + 1) }));
  private analyses = new Map<string, ReturnType<typeof analyzeJournalLocally>>();
  private hook: string | null = null;
  private prefsV = { quietCards: true, push: false, calls: false, sundayLetter: false, checkinTime: 'evening' as const, quietHours: { start: '22:00', end: '08:00' }, followUpAfterHardDay: false };
  private plan_: SafetyPlan = { warningSigns: [SAFETY_PLAN[0].text], copingSteps: [SAFETY_PLAN[1].text], people: [{ name: 'Priya' }, { name: 'Rohan' }], places: [], professionals: ['Tele-MANAS, 14416, any time'], makingSpaceSafer: [SAFETY_PLAN[4].text] };
  private cards: { id: string; kind: string }[] = [];

  onSignedOut(cb: () => void) { this.cb.push(cb); }
  hasSession() { return this.signed; }
  async restoreSession() { return this.signed; }

  async publicConfig() { return { otp: true, google: false, googleClientId: null, llm: true, stt: false, tts: false, push: false }; }
  async helplines(kind?: string): Promise<Helpline[]> {
    const src = kind === 'youth' ? YOUTH_HELPLINES : HELPLINES;
    return src.map(h => ({ id: h.id, name: h.name, description: h.desc, number: h.num, tel: h.tel, kind: h.id === 'emergency' ? 'emergency' : h.id === 'childline' ? 'youth' : 'crisis', hours: '24x7', languages: ['en', 'hi'], city: null, stale: false }));
  }

  async otpStart(phone: string) { await wait(); return { challengeId: uuid(), expiresInSeconds: 300, resendAfterSeconds: 30, devCode: '123456', phone } as never; }
  async otpVerify(b: { code: string; nickname?: string }) {
    await wait();
    if (b.code !== '123456') throw Object.assign(new Error('That code didn’t work. The demo code is 123456.'), { status: 400, code: 'invalid_code' });
    this.signed = true;
    if (b.nickname) this._me.nickname = b.nickname;
    this.cards = [{ id: uuid(), kind: 'checkin' }];
    return { isNewUser: !this._me.onboarded, pendingDeletion: false };
  }
  async googleSignIn() { this.signed = true; return { isNewUser: false, pendingDeletion: false }; }
  async signOut() { this.signed = false; }

  async me() { return structuredClone(this._me); }
  async patchMe(b: Parameters<Api['patchMe']>[0]) {
    if (b.nickname !== undefined) this._me.nickname = b.nickname;
    if (b.language) this._me.language = b.language;
    if (b.city !== undefined) this._me.city = b.city;
    if (b.onboarded) this._me.onboarded = true;
  }
  async putConsent(b: Parameters<Api['putConsent']>[0]) { this._me.consent = { ...this._me.consent, ...b, acceptedAt: this._me.consent.acceptedAt ?? new Date().toISOString() }; return structuredClone(this._me.consent); }
  async putPrivacy(b: Parameters<Api['putPrivacy']>[0]) { this._me.privacy = { ...this._me.privacy, ...b }; return structuredClone(this._me.privacy); }
  async voices(language = 'en') { return { language, serverVoices: false, items: [{ id: 'warm', label: 'Warm', gender: null, provider: 'device' as const }, { id: 'steady', label: 'Steady', gender: null, provider: 'device' as const }, { id: 'bright', label: 'Bright', gender: null, provider: 'device' as const }] }; }
  async previewVoice(): Promise<{ audio: string; mime: string; sampleRate: number }> { await wait(); throw new ApiError(503, 'voice_unavailable', 'The voices aren’t connected in this preview.'); }
  async putCompanion(b: Parameters<Api['putCompanion']>[0]) { this._me.companion = { ...this._me.companion, ...b }; return structuredClone(this._me.companion); }
  async declareMinor() { this.signed = false; this.cb.forEach(f => f()); }
  async deleteAccount() { this.signed = false; this.cb.forEach(f => f()); }
  async cancelDeletion() { /* nothing scheduled in the demo */ }
  async exportData() { return new Blob([JSON.stringify({ demo: true, memories: this.mem, journal: this.jr }, null, 2)], { type: 'application/json' }); }
  async trusted() { return { name: TRUSTED_CONTACT.name, phone: '', relation: TRUSTED_CONTACT.relation }; }
  async putTrusted(b: Parameters<Api['putTrusted']>[0]) { this._me.trustedContact = { name: b.name, relation: b.relation, phoneMasked: `${b.phone.slice(0, 3)} ••••• ${b.phone.slice(-3)}` }; }
  async deleteTrusted() { this._me.trustedContact = null; }

  async memories() { return structuredClone(this.mem); }
  async patchMemory(id: string, b: { text?: string; hidden?: boolean }) {
    const m = this.mem.find(x => x.id === id)!;
    if (b.text !== undefined) m.text = b.text;
    if (b.hidden !== undefined) m.hidden = b.hidden;
    return structuredClone(m);
  }
  async deleteMemory(id: string) { this.mem = this.mem.filter(m => m.id !== id); }
  async addMemories(items: Parameters<Api['addMemories']>[0], source: 'chat' | 'call' | 'journal') {
    if (!this._me.consent.remember) throw Object.assign(new Error('Memories are turned off.'), { status: 409, code: 'remember_off' });
    const made = items.map(i => ({ id: uuid(), theme: i.theme, text: i.text, sensitive: i.sensitive, hidden: false, source, createdAt: new Date().toISOString() }));
    this.mem = [...made, ...this.mem];
    return made;
  }
  async forgetAll() { this.mem = []; }

  async journal() { return { items: structuredClone(this.jr), nextCursor: null }; }
  async createJournal(b: Parameters<Api['createJournal']>[0]) {
    const entry: JournalEntry = { id: uuid(), mode: b.mode, prompt: b.prompt ?? null, text: b.text, mood: 2, shared: b.shared, createdAt: new Date().toISOString() };
    this.jr = [entry, ...this.jr];
    return { entry, riskLevel: classify(b.text) };
  }
  async analyzeJournal(id: string) {
    await wait(900);
    const e = this.jr.find(x => x.id === id)!;
    const a = analyzeJournalLocally(e.text);
    this.analyses.set(id, a);
    const remember = this._me.consent.remember;
    return { mood: a.mood, noticed: a.noticed, memories: remember ? a.memories.map((m, i) => ({ id: i + 1, ...m })) : [], hook: remember ? a.hook : '', step: a.step, careFlag: a.careFlag, riskLevel: a.riskLevel };
  }
  async commitJournal(id: string, b: { savedMemoryIds: number[]; useHook: boolean; addStep: boolean }) {
    const a = this.analyses.get(id)!;
    const chosen = a.memories.filter((_, i) => b.savedMemoryIds.includes(i + 1));
    await this.addMemories(chosen, 'journal');
    if (b.useHook && this._me.consent.remember) this.hook = a.hook;
    if (b.addStep) this.pl.push({ id: uuid(), label: a.step, done: false, source: 'journal' });
    const e = this.jr.find(x => x.id === id)!;
    e.mood = moodIndexFor(a.mood);
    this.analyses.delete(id);
    return { savedMemories: chosen.length, hook: b.useHook, step: b.addStep };
  }
  async discardJournal(id: string) { this.analyses.delete(id); const e = this.jr.find(x => x.id === id); if (e) e.shared = false; }
  async setJournalShared(id: string, shared: boolean) { const e = this.jr.find(x => x.id === id)!; e.shared = shared; return structuredClone(e); }
  async deleteJournal(id: string) { this.jr = this.jr.filter(e => e.id !== id); }

  private moods = MOOD_SERIES.map((v, i) => ({ day: new Date(Date.now() - (MOOD_SERIES.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), value: Math.max(0, Math.min(4, Math.round(v * 6))) }));
  async logMood(value: number) { const day = new Date().toISOString().slice(0, 10); const last = this.moods.at(-1); if (last?.day === day) last.value = value; else this.moods.push({ day, value }); }
  async plan() { return structuredClone(this.pl); }
  async addPlan(label: string, source: 'user' | 'journal' | 'checkin' = 'user') { const p: PlanItem = { id: uuid(), label, done: false, source }; this.pl = [...this.pl.filter(x => !x.done), p].slice(-3); return p; }
  async setPlanDone(id: string, done: boolean) { const p = this.pl.find(x => x.id === id)!; p.done = done; return structuredClone(p); }
  async insights(): Promise<Insights> {
    return { moodSeries: this.moods, rhythms: ['Days you step out for a walk tend to be lighter.', 'Sleep is a little shorter lately. Want to try winding down earlier?'], wins: this.wins.map(w => ({ ...w })), daysOfData: this.moods.length };
  }
  async latestLetter() {
    return { id: uuid(), weekStart: '2026-10-19', createdAt: iso(7), body: 'Dear Aarav,\n\nThis week you stepped out three times, even on Wednesday when sleep was short. You called Priya, and afterwards you said you’d laughed properly for the first time in a while.\n\nEvenings seem gentler when the phone goes down before midnight. Just something I noticed.\n\nOne invitation for the week ahead, if you’d like it: the Sunday walk at Cubbon Park. Thirty minutes, or less.\n\n— Saathi' };
  }

  async safetyPlan() { return structuredClone(this.plan_); }
  async putSafetyPlan(p: SafetyPlan) { this.plan_ = p; }
  async safetyAck() { /* recorded server-side in the real app */ }

  async startCalm() { return { id: uuid() }; }
  async calmNarration() { return { server: false, voice: null, pace: 0.85, mood: 'unknown', reason: 'the phone’s own voice' }; }
  async narrate(): Promise<never> { await wait(); throw new ApiError(503, 'voice_unavailable', 'The voices aren’t connected in this preview.'); }
  async story(theme: string) {
    return { title: `Evening story: ${theme}`, generated: false, lines: ['Tonight you sit somewhere quiet, as the light turns soft and golden.', 'There is nothing you need to do. Just listen, and let your body get heavy and warm.', 'A cup of tea waits beside you, exactly warm enough.', 'Your breath slows, in and out, in and out.', 'Everything that needed doing has been done enough.', 'Rest here as long as you like. Sleep well.'] };
  }
  async progressCalm(_id: string, pct: number) { if (pct >= 90) this.wins.unshift({ id: uuid(), kind: 'calm', label: 'A calm session', createdAt: new Date().toISOString() }); }

  async events() {
    const items: OutsideEvent[] = EVENTS.map((e, i) => ({ id: e.id, city: 'Bengaluru', title: e.title, venue: e.where, startsAt: new Date(Date.now() + (i + 2) * 86_400_000).toISOString(), beginnerFriendly: true, groupSize: null, category: 'demo', price: e.price, organiser: 'Demo listing', details: { tags: e.tags, why: e.why, like: e.like, stay: e.stay, how: e.how, when: e.when, far: e.far, img: e.img, readback: e.readback }, interested: false }));
    return { city: 'Bengaluru', items };
  }
  async markInterest(id: string) { const e = EVENTS.find(x => x.id === id); if (e) this.pl.push({ id: uuid(), label: e.title, done: false, source: 'user' }); }

  async prefs() { return structuredClone(this.prefsV); }
  async putPrefs(b: Parameters<Api['putPrefs']>[0]) { this.prefsV = { ...this.prefsV, ...b } as typeof this.prefsV; return structuredClone(this.prefsV); }
  async vapidKey() { return { publicKey: null, enabled: false }; }
  async registerDevice() { /* push is not available in the demo */ }
  async inbox() { return this.cards; }
  async dismissCard(id: string) { this.cards = this.cards.filter(c => c.id !== id); }
  async notificationOpened() { /* no-op */ }
  async sendEvents() { /* the demo tracks nothing */ }

  async createConversation(mode: Parameters<Api['createConversation']>[0]) { return { id: uuid(), mode, voice: { serverStt: false, serverTts: false } }; }
  async startWalk() { return { id: uuid(), mode: 'walk' as const, voice: { serverStt: false, serverTts: false } }; }
  async endConversation(): Promise<Awaited<ReturnType<Api['endConversation']>>> {
    await wait(500);
    return {
      summary: 'You talked about work and how tired you have been.',
      proposedMemories: this._me.consent.remember ? [{ theme: 'Work and study', text: 'You have an interview coming up on Thursday.', sensitive: false }] : [],
      checkinResult: { sleep: 'About six hours, on and off', food: 'Lunch, and Maggi later', people: 'Priya called', okayThing: 'Chai on the balcony', mood: 2, intentions: ['Balcony chai, 8 a.m.', 'Short walk after lunch'] },
    };
  }
  async conversations() { return [{ id: uuid(), mode: 'text' as const, startedAt: iso(1), endedAt: iso(1), summary: 'You talked about work and your sister.' }, { id: uuid(), mode: 'voice' as const, startedAt: iso(3), endedAt: iso(3), summary: 'A quiet night, mostly about sleep.' }, { id: uuid(), mode: 'voice' as const, startedAt: iso(6), endedAt: iso(6), summary: 'The interview, and what worries you about it.' }]; }
  async messages() { return []; }

  async openConversation(_id: string, ev: ConvEvents): Promise<ConvTransport> {
    let turns = 0;
    let risk = 0;
    const emit = (m: ServerMsg, d = 0) => setTimeout(() => ev.onMessage(m), d);
    const opening = this.hook;
    this.hook = null;
    emit({ type: 'ready', conversationId: _id, mode: 'text', companion: { name: this._me.companion.name, look: this._me.companion.look, voice: this._me.companion.voice }, voice: { serverStt: false, serverTts: false }, opening }, 30);
    let idx = 0;
    return {
      turn: text => {
        const r = mockCompanion.reply({ text, turn: turns, trustedName: TRUSTED_CONTACT.name });
        emit({ type: 'thinking' }, 0);
        if (r.minor) { emit({ type: 'minor' }, 700); return; }
        if (r.level === 3) { emit({ type: 'ack', riskLevel: 3 }, 100); emit({ type: 'crisis', script: r.lines[0] }, 150); emit({ type: 'done', messageId: null, riskLevel: 3, text: r.lines[0] }, 160); return; }
        risk = Math.max(risk, r.level);
        emit({ type: 'ack', riskLevel: r.level as 0 | 1 | 2 }, 500);
        r.lines.forEach((l, i) => emit({ type: 'sentence', text: l, index: idx++ }, 900 + i * 700));
        if (r.level >= 2) emit({ type: 'care_card' }, 900 + r.lines.length * 700);
        emit({ type: 'done', messageId: null, riskLevel: r.level as 0 | 1 | 2, text: r.lines.join(' ') }, 950 + r.lines.length * 700);
        if (r.level < 2) turns++;
        this.tokensSeen++;
      },
      interrupt: () => undefined,
      silence: () => undefined,
      voiceStart: () => undefined,
      voiceStop: () => undefined,
      sendAudio: () => undefined,
      close: () => undefined,
    };
  }
}
