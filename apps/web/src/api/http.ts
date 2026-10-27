import type { ServerMsg } from '@saathi/contracts';
import { ApiError, type AnalyticsEvent, type Api, type ConvEvents, type ConvTransport, type PublicConfig } from './types';

const RT_KEY = 'saathi.rt';
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8787';

const readRt = () => { try { return localStorage.getItem(RT_KEY); } catch { return null; } };
const writeRt = (v: string | null) => { try { if (v) localStorage.setItem(RT_KEY, v); else localStorage.removeItem(RT_KEY); } catch { /* storage blocked: the session lasts until the tab closes */ } };

function jwtExp(token: string): number {
  try { return (JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp ?? 0) * 1000; } catch { return 0; }
}

/**
 * The real backend. Access tokens live in memory; the rotating refresh token is kept in localStorage so the app
 * survives a reload (an HttpOnly cookie would be stronger but needs same-site hosting; revisit when deployed).
 */
export class HttpApi implements Api {
  readonly kind = 'http' as const;
  private access: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private signedOut: (() => void)[] = [];

  onSignedOut(cb: () => void) { this.signedOut.push(cb); }
  hasSession() { return !!(this.access || readRt()); }

  // ---------------------------------------------------------------------------------------------- plumbing
  private async raw(method: string, path: string, body?: unknown, opts: { auth?: boolean; idem?: boolean; blob?: boolean; keepalive?: boolean } = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idem) headers['Idempotency-Key'] = crypto.randomUUID();
    if (opts.auth !== false) {
      await this.ensureAccess();
      if (this.access) headers.Authorization = `Bearer ${this.access}`;
    }
    return fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive: opts.keepalive });
  }

  private async req<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; idem?: boolean; keepalive?: boolean } = {}): Promise<T> {
    let res = await this.raw(method, path, body, opts);
    if (res.status === 401 && opts.auth !== false && (await this.refresh())) res = await this.raw(method, path, body, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      if (res.status === 401 && opts.auth !== false) this.dropSession();
      const e = json?.error;
      throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Something went wrong. Please try again.', e?.details);
    }
    return json as T;
  }

  private async ensureAccess() {
    if (this.access && jwtExp(this.access) - Date.now() > 30_000) return;
    if (readRt()) await this.refresh();
  }

  /** Single-flight so ten parallel requests share one rotation (the old token is single-use). */
  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const rt = readRt();
      if (!rt) return false;
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
        if (!res.ok) { if (res.status === 401) this.dropSession(); return false; }
        const s = await res.json();
        this.access = s.accessToken;
        writeRt(s.refreshToken);
        return true;
      } catch { return false; } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  private dropSession() {
    this.access = null;
    writeRt(null);
    this.signedOut.forEach(cb => cb());
  }

  private take(s: { accessToken: string; refreshToken: string }) {
    this.access = s.accessToken;
    writeRt(s.refreshToken);
  }

  // ---------------------------------------------------------------------------------------------- public
  publicConfig = () => this.req<PublicConfig>('GET', '/public-config', undefined, { auth: false });
  helplines = async (kind?: string) => (await this.req<{ items: Awaited<ReturnType<Api['helplines']>> }>('GET', `/helplines${kind ? `?kind=${kind}` : ''}`, undefined, { auth: false })).items;

  // ---------------------------------------------------------------------------------------------- session
  async restoreSession() { if (!readRt()) return false; return this.refresh(); }
  otpStart = (phone: string, age18: boolean) => this.req<Awaited<ReturnType<Api['otpStart']>>>('POST', '/auth/otp/start', { phone, ageConfirmed18: age18 }, { auth: false });
  async otpVerify(b: Parameters<Api['otpVerify']>[0]) {
    const s = await this.req<{ accessToken: string; refreshToken: string; isNewUser: boolean; pendingDeletion: boolean }>('POST', '/auth/otp/verify', { phone: b.phone, code: b.code, challengeId: b.challengeId, ageConfirmed18: b.age18, nickname: b.nickname, deviceLabel: navigator.userAgent.slice(0, 80) }, { auth: false });
    this.take(s);
    return { isNewUser: s.isNewUser, pendingDeletion: s.pendingDeletion };
  }
  async googleSignIn(b: Parameters<Api['googleSignIn']>[0]) {
    const s = await this.req<{ accessToken: string; refreshToken: string; isNewUser: boolean; pendingDeletion: boolean }>('POST', '/auth/google', { idToken: b.idToken, ageConfirmed18: b.age18, nickname: b.nickname, deviceLabel: navigator.userAgent.slice(0, 80) }, { auth: false });
    this.take(s);
    return { isNewUser: s.isNewUser, pendingDeletion: s.pendingDeletion };
  }
  async signOut() {
    const rt = readRt();
    if (rt) await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(() => undefined);
    this.access = null;
    writeRt(null);
  }

  // ---------------------------------------------------------------------------------------------- profile
  me = () => this.req<Awaited<ReturnType<Api['me']>>>('GET', '/me');
  patchMe = async (b: Parameters<Api['patchMe']>[0]) => { await this.req('PATCH', '/me', b); };
  putConsent = (b: Parameters<Api['putConsent']>[0]) => this.req<Awaited<ReturnType<Api['putConsent']>>>('PUT', '/me/consent', b);
  putPrivacy = (b: Parameters<Api['putPrivacy']>[0]) => this.req<Awaited<ReturnType<Api['putPrivacy']>>>('PUT', '/me/privacy', b);
  putCompanion = (b: Parameters<Api['putCompanion']>[0]) => this.req<Awaited<ReturnType<Api['putCompanion']>>>('PUT', '/me/companion', b);
  voices = (language?: string) => this.req<Awaited<ReturnType<Api['voices']>>>('GET', `/voices${language ? `?language=${language}` : ''}`);
  previewVoice = (voice: string, language?: string) => this.req<Awaited<ReturnType<Api['previewVoice']>>>('POST', '/voices/preview', { voice, language });
  declareMinor = async () => { try { await this.req('PUT', '/me/age', { confirmed18: false }); } catch (e) { if (!(e instanceof ApiError && e.code === 'under18')) throw e; } this.dropSession(); };
  deleteAccount = async () => { await this.req('DELETE', '/me'); this.dropSession(); };
  cancelDeletion = async () => { await this.req('POST', '/me/deletion/cancel'); };
  async exportData() {
    await this.ensureAccess();
    const res = await this.raw('GET', '/me/export');
    if (!res.ok) throw new ApiError(res.status, 'export_failed', 'The export didn’t work. Please try again.');
    return res.blob();
  }
  trusted = () => this.req<Awaited<ReturnType<Api['trusted']>>>('GET', '/trusted-contact/dial');
  putTrusted = async (b: Parameters<Api['putTrusted']>[0]) => { await this.req('PUT', '/trusted-contact', b); };
  deleteTrusted = async () => { await this.req('DELETE', '/trusted-contact'); };

  // ---------------------------------------------------------------------------------------------- memory
  memories = async () => (await this.req<{ items: Awaited<ReturnType<Api['memories']>> }>('GET', '/memories')).items;
  patchMemory = (id: string, b: { text?: string; hidden?: boolean }) => this.req<Awaited<ReturnType<Api['patchMemory']>>>('PATCH', `/memories/${id}`, b);
  deleteMemory = async (id: string) => { await this.req('DELETE', `/memories/${id}`); };
  addMemories = async (items: Parameters<Api['addMemories']>[0], source: 'chat' | 'call' | 'journal', sourceId?: string) =>
    (await this.req<{ items: Awaited<ReturnType<Api['addMemories']>> }>('POST', '/memories/bulk', { items, source, sourceId }, { idem: true })).items;
  forgetAll = async () => { await this.req('DELETE', '/memories'); };

  // ---------------------------------------------------------------------------------------------- journal
  journal = (cursor?: string) => this.req<Awaited<ReturnType<Api['journal']>>>('GET', `/journal?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  createJournal = (b: Parameters<Api['createJournal']>[0]) => this.req<Awaited<ReturnType<Api['createJournal']>>>('POST', '/journal', b, { idem: true });
  analyzeJournal = (id: string) => this.req<Awaited<ReturnType<Api['analyzeJournal']>>>('POST', `/journal/${id}/analyze`);
  commitJournal = (id: string, b: Parameters<Api['commitJournal']>[1]) => this.req<Awaited<ReturnType<Api['commitJournal']>>>('POST', `/journal/${id}/commit`, b);
  discardJournal = async (id: string) => { await this.req('POST', `/journal/${id}/discard`); };
  setJournalShared = (id: string, shared: boolean) => this.req<Awaited<ReturnType<Api['setJournalShared']>>>('PATCH', `/journal/${id}`, { shared });
  deleteJournal = async (id: string) => { await this.req('DELETE', `/journal/${id}`); };

  // ---------------------------------------------------------------------------------------------- daily
  logMood = async (value: number, source: 'tap' | 'checkin' | 'journal' = 'tap') => { await this.req('POST', '/mood', { value, source }); };
  plan = async () => (await this.req<{ items: Awaited<ReturnType<Api['plan']>> }>('GET', '/plan/today')).items;
  addPlan = (label: string, source: 'user' | 'journal' | 'checkin' = 'user') => this.req<Awaited<ReturnType<Api['addPlan']>>>('POST', '/plan', { label, source }, { idem: true });
  setPlanDone = (id: string, done: boolean) => this.req<Awaited<ReturnType<Api['setPlanDone']>>>('PATCH', `/plan/${id}`, { done });
  insights = (weeks = 4) => this.req<Awaited<ReturnType<Api['insights']>>>('GET', `/insights?weeks=${weeks}`);
  latestLetter = async () => (await this.req<Awaited<ReturnType<Api['latestLetter']>> | undefined>('GET', '/letters/latest')) ?? null;

  // ---------------------------------------------------------------------------------------------- safety
  safetyPlan = async () => (await this.req<Awaited<ReturnType<Api['safetyPlan']>> | undefined>('GET', '/safety-plan')) ?? null;
  putSafetyPlan = async (p: Parameters<Api['putSafetyPlan']>[0]) => { await this.req('PUT', '/safety-plan', p); };
  safetyAck = async (level: 1 | 2 | 3, action: 'helpline' | 'contact' | 'safe' | 'emergency') => { await this.req('POST', '/safety/acknowledge', { level, action }); };

  // ---------------------------------------------------------------------------------------------- calm, outside
  startCalm = (itemId: string, bg?: string, timerMinutes?: number) => this.req<{ id: string }>('POST', '/calm/sessions', { itemId, bgSound: bg, timerMinutes }, { idem: true });
  progressCalm = async (id: string, pct: number) => { await this.req('PATCH', `/calm/sessions/${id}`, { completedPct: pct }); };
  events = (city?: string) => this.req<Awaited<ReturnType<Api['events']>>>('GET', `/outside/events${city ? `?city=${encodeURIComponent(city)}` : ''}`);
  markInterest = async (id: string) => { await this.req('POST', `/outside/events/${encodeURIComponent(id)}/interest`); };

  // ---------------------------------------------------------------------------------------------- notifications
  prefs = () => this.req<Awaited<ReturnType<Api['prefs']>>>('GET', '/notifications/prefs');
  putPrefs = (b: Parameters<Api['putPrefs']>[0]) => this.req<Awaited<ReturnType<Api['putPrefs']>>>('PUT', '/notifications/prefs', b);
  vapidKey = () => this.req<{ publicKey: string | null; enabled: boolean }>('GET', '/notifications/vapid-key');
  registerDevice = async (subscription: PushSubscriptionJSON) => { await this.req('POST', '/devices', { platform: 'web', subscription }); };
  inbox = async () => (await this.req<{ cards: { id: string; kind: string }[] }>('GET', '/inbox')).cards;
  dismissCard = async (id: string) => { await this.req('POST', `/inbox/${id}/dismiss`); };
  notificationOpened = async (kind: string) => { await this.req('POST', '/notifications/opened', { kind }); };
  sendEvents = async (sessionId: string, events: AnalyticsEvent[]) => { await this.req('POST', '/events', { sessionId, platform: 'web', appVersion: import.meta.env.VITE_APP_VERSION ?? '0.1.0', events }, { keepalive: true }); };

  // ---------------------------------------------------------------------------------------------- conversations
  createConversation = (mode: Parameters<Api['createConversation']>[0], continueFrom?: string, first?: boolean) => this.req<Awaited<ReturnType<Api['createConversation']>>>('POST', '/conversations', { mode, continueFrom, first }, { idem: true });
  startWalk = () => this.req<Awaited<ReturnType<Api['startWalk']>>>('POST', '/walks', undefined, { idem: true });
  endConversation = (id: string, feeling?: 'better' | 'same' | 'worse') => this.req<Awaited<ReturnType<Api['endConversation']>>>('POST', `/conversations/${id}/end`, feeling ? { feeling } : {});
  conversations = async (limit = 10) => (await this.req<{ items: Awaited<ReturnType<Api['conversations']>> }>('GET', `/conversations?limit=${limit}`)).items;
  messages = async (id: string) => (await this.req<{ items: Awaited<ReturnType<Api['messages']>> }>('GET', `/conversations/${id}/messages`)).items;

  async openConversation(id: string, ev: ConvEvents): Promise<ConvTransport> {
    await this.ensureAccess();
    const url = `${(BASE || window.location.origin).replace(/^http/, 'ws')}/conversations/${id}/stream`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new ApiError(0, 'network', 'I couldn’t connect. Check your internet and try again.')); });
    // Credentials go in the first frame, not the URL, so they stay out of server logs.
    ws.send(JSON.stringify({ type: 'auth', token: this.access }));
    ws.onmessage = e => {
      if (typeof e.data === 'string') { try { ev.onMessage(JSON.parse(e.data) as ServerMsg); } catch { /* ignore malformed frame */ } }
      else ev.onAudio(e.data as ArrayBuffer);
    };
    ws.onclose = e => ev.onClose(e.code);
    const send = (m: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
    const ping = setInterval(() => send({ type: 'ping' }), 25_000);
    return {
      turn: (text, source = 'typed') => send({ type: 'turn', text, source, clientId: crypto.randomUUID().slice(0, 8) }),
      interrupt: () => send({ type: 'interrupt' }),
      silence: seconds => send({ type: 'silence', seconds }),
      voiceStart: language => send({ type: 'voice_start', language }),
      voiceStop: () => send({ type: 'voice_stop' }),
      sendAudio: pcm => { if (ws.readyState === WebSocket.OPEN) ws.send(pcm); },
      close: () => { clearInterval(ping); ws.close(1000); },
    };
  }
}
