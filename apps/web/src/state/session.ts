import { ApiError, api, isDemo, type Consent, type ConsentUpdate, type Me, type Privacy, type PrivacyUpdate } from '../api';
import { builtinHelplines, getState, resetState, set, type Language, type Persona, type Look } from './store';

// Boot, sign-in and the person's own settings. The server is the source of truth: screens read mirrors in the store,
// writes go to the API first-class (optimistic where it feels instant, rolled back with a message if it fails).

let toastFn: (m: string) => void = () => undefined;
let navigateFn: (s: import('./store').Screen) => void = () => undefined;
export function bindSessionUi(h: { toast: (m: string) => void; navigate: (s: import('./store').Screen) => void }) { toastFn = h.toast; navigateFn = h.navigate; }

export const errMsg = (e: unknown, fallback = 'That didn’t work. Please try again.') => (e instanceof ApiError || (e instanceof Error && 'code' in e) ? (e as Error).message : fallback);

export function applyMe(me: Me) {
  set({ me, nick: me.nickname, language: me.language, compName: me.companion.name, look: me.companion.look, voice: me.companion.voice, consent: me.consent, retention: me.privacy.transcriptRetentionDays });
}

export const languageFromChoice = (labels: string[]): Language => (labels.includes('Hinglish') ? 'hinglish' : labels.includes('हिन्दी') ? 'hi' : 'en');

// ------------------------------------------------------------------------------------------------ boot
export async function boot() {
  if (getState().phase === 'in') return; // already signed in (remount, hot reload)
  set({ phase: 'booting' });
  api.onSignedOut(() => {
    if (getState().phase === 'in') { resetState(); navigateFn('welcome'); toastFn('Please sign in again.'); }
  });
  void api.publicConfig().then(cfg => set({ cfg })).catch(() => undefined);
  void api.helplines().then(h => { if (h.length) set({ helplines: h }); }).catch(() => set({ helplines: builtinHelplines() }));

  if (!isDemo && (await api.restoreSession().catch(() => false))) { await enterApp(false); return; }
  set({ phase: 'out', screen: 'welcome' });
}

/** After a successful sign-in (or restored session): load the profile and land in the right place. */
export async function enterApp(fresh: boolean) {
  try {
    const me = await api.me();
    applyMe(me);
    set({ phase: 'in' });
    void api.trusted().then(t => set({ trustedDial: t ? { name: t.name, phone: t.phone } : null })).catch(() => undefined);
    if (fresh && getState().language !== me.language) {
      // Their choice on the language screen (made before there was an account) becomes their setting.
      await api.patchMe({ language: getState().language }).catch(() => undefined);
      set(s => ({ me: s.me && { ...s.me, language: s.language } }));
    }
    navigateFn(me.onboarded ? 'today' : 'companion');
  } catch (e) {
    set({ phase: 'out', screen: 'welcome' });
    toastFn(errMsg(e, 'I couldn’t load your account. Check your internet and try again.'));
  }
}

// ------------------------------------------------------------------------------------------------ sign-in
const digits = (s: string) => s.replace(/\D/g, '');

export async function sendCode(): Promise<boolean> {
  const s = getState();
  if (digits(s.phone).length < 10) { set({ authError: 'Enter your 10-digit mobile number.' }); return false; }
  if (!s.returning && !s.nick.trim()) { set({ authError: 'A nickname helps me say hello. Anything works.' }); return false; }
  set({ authBusy: true, authError: null });
  try {
    const r = await api.otpStart(s.phone.trim(), s.age18);
    set({ challengeId: r.challengeId, devCode: r.devCode ?? null, otpCode: '', authBusy: false });
    navigateFn('otp');
    return true;
  } catch (e) {
    set({ authBusy: false, authError: errMsg(e) });
    return false;
  }
}

export async function verifyCode(): Promise<boolean> {
  const s = getState();
  if (!/^\d{6}$/.test(s.otpCode)) { set({ authError: 'Enter the 6-digit code.' }); return false; }
  set({ authBusy: true, authError: null });
  try {
    const r = await api.otpVerify({ phone: s.phone.trim(), code: s.otpCode, challengeId: s.challengeId ?? undefined, age18: s.age18, nickname: s.returning ? undefined : s.nick.trim() });
    set({ authBusy: false, otpCode: '', devCode: null });
    await enterApp(r.isNewUser);
    return true;
  } catch (e) {
    set({ authBusy: false, authError: errMsg(e) });
    return false;
  }
}

export async function signInWithGoogle(idToken: string): Promise<void> {
  const s = getState();
  set({ authBusy: true, authError: null });
  try {
    const r = await api.googleSignIn({ idToken, age18: s.age18, nickname: s.nick.trim() || undefined });
    set({ authBusy: false });
    await enterApp(r.isNewUser);
  } catch (e) {
    set({ authBusy: false, authError: errMsg(e) });
  }
}

export async function signOutNow() {
  await api.signOut().catch(() => undefined);
  resetState();
  navigateFn('welcome');
}

export async function deleteEverything() {
  try {
    await api.deleteAccount();
    resetState();
    navigateFn('welcome');
    toastFn('Your account is closed. Your data is removed within 30 days.');
  } catch (e) { toastFn(errMsg(e)); }
}

/** Under-18 disclosed in conversation: the server has paused the account. Show the exit and end the session here. */
export async function handleMinor() {
  await api.signOut().catch(() => undefined);
  resetState();
  navigateFn('under');
}

// ------------------------------------------------------------------------------------------------ settings
export async function updateConsent(patch: ConsentUpdate): Promise<Consent | null> {
  const before = getState().consent;
  if (before) set({ consent: { ...before, ...patch } });
  try {
    const next = await api.putConsent(patch);
    set(s => ({ consent: next, me: s.me && { ...s.me, consent: next } }));
    return next;
  } catch (e) {
    set({ consent: before });
    toastFn(errMsg(e));
    return null;
  }
}

export async function updatePrivacy(patch: PrivacyUpdate): Promise<Privacy | null> {
  const me = getState().me;
  if (me) set({ me: { ...me, privacy: { ...me.privacy, ...patch } } });
  try {
    const next = await api.putPrivacy(patch);
    set(s => ({ me: s.me && { ...s.me, privacy: next }, retention: next.transcriptRetentionDays }));
    return next;
  } catch (e) {
    if (me) set({ me });
    toastFn(errMsg(e));
    return null;
  }
}

export async function updateCompanion(patch: { name?: string; look?: Look; voice?: Persona }) {
  const s0 = getState();
  set({ compName: patch.name ?? s0.compName, look: patch.look ?? s0.look, voice: patch.voice ?? s0.voice });
  try {
    const next = await api.putCompanion(patch);
    set(s => ({ me: s.me && { ...s.me, companion: next } }));
  } catch (e) {
    set({ compName: s0.compName, look: s0.look, voice: s0.voice });
    toastFn(errMsg(e));
  }
}

export async function finishOnboarding(consent: ConsentUpdate): Promise<boolean> {
  try {
    await api.putConsent(consent);
    await api.patchMe({ onboarded: true });
    applyMe(await api.me());
    return true;
  } catch (e) {
    toastFn(errMsg(e));
    return false;
  }
}
