import { api, isDemo, type NotificationPrefs, type SafetyPlan, type TrustedContact } from '../api';
import { dictationSettled, stopDictation } from '../audio/dictation';
import { applyMe, errMsg } from './session';
import { getState, set } from './store';

let toastFn: (m: string) => void = () => undefined;
let crisisFn: () => void = () => undefined;
let navigateFn: (s: import('./store').Screen) => void = () => undefined;
let sheetFn: (s: import('./store').Sheet) => void = () => undefined;
export function bindDataUi(h: { toast: (m: string) => void; crisis: () => void; navigate: (s: import('./store').Screen) => void; sheet: (s: import('./store').Sheet) => void }) { toastFn = h.toast; crisisFn = h.crisis; navigateFn = h.navigate; sheetFn = h.sheet; }

const today = () => new Date().toLocaleDateString('en-CA');
const swallow = () => undefined;

// ------------------------------------------------------------------------------------------------ loaders
export async function loadToday() {
  const [plan, cards, ins] = await Promise.allSettled([api.plan(), api.inbox(), api.insights(1)]);
  set(s => ({
    plan: plan.status === 'fulfilled' ? plan.value : s.plan,
    cards: cards.status === 'fulfilled' ? cards.value : s.cards,
    mood: ins.status === 'fulfilled' ? (ins.value.moodSeries.find(m => m.day === today())?.value ?? s.mood) : s.mood,
  }));
}
export async function loadTalk() { set({ recent: await api.conversations(10).catch(() => getState().recent) }); }
export async function loadJournal() {
  const r = await api.journal().catch(() => null);
  if (r) set({ jEntries: r.items, jNext: r.nextCursor });
}
export async function loadMoreJournal() {
  const c = getState().jNext;
  if (!c) return;
  const r = await api.journal(c).catch(() => null);
  if (r) set(s => ({ jEntries: [...s.jEntries, ...r.items], jNext: r.nextCursor }));
}
export async function loadMemory() { const m = await api.memories().catch(() => null); if (m) set({ memories: m }); }
export async function loadInsights() {
  const [ins, letter] = await Promise.allSettled([api.insights(4), api.latestLetter()]);
  set(s => ({ insights: ins.status === 'fulfilled' ? ins.value : s.insights, letter: letter.status === 'fulfilled' ? letter.value : s.letter }));
}
export async function loadOutside() {
  const r = await api.events().catch(() => null);
  if (r) set({ events: r.items, eventsCity: r.city });
}
export async function loadYou() {
  const [prefs, plan, trusted] = await Promise.allSettled([api.prefs(), api.safetyPlan(), api.trusted()]);
  set(s => ({
    prefs: prefs.status === 'fulfilled' ? prefs.value : s.prefs,
    safetyPlan: plan.status === 'fulfilled' ? plan.value : s.safetyPlan,
    trustedDial: trusted.status === 'fulfilled' ? (trusted.value ? { name: trusted.value.name, phone: trusted.value.phone } : null) : s.trustedDial,
  }));
}

// ------------------------------------------------------------------------------------------------ today
export async function tapMood(i: number) {
  const was = getState().mood;
  set({ mood: was === i ? null : i });
  if (was !== i) await api.logMood(i, 'tap').catch(e => { set({ mood: was }); toastFn(errMsg(e)); });
}

export async function togglePlan(id: string) {
  const item = getState().plan.find(p => p.id === id);
  if (!item) return;
  const done = !item.done;
  set(s => ({ plan: s.plan.map(p => (p.id === id ? { ...p, done } : p)) }));
  await api.setPlanDone(id, done).catch(e => { set(s => ({ plan: s.plan.map(p => (p.id === id ? { ...p, done: !done } : p)) })); toastFn(errMsg(e)); });
}

export async function addPlanItem(label: string, source: 'user' | 'journal' | 'checkin' = 'user') {
  try {
    const p = await api.addPlan(label, source);
    set(s => ({ plan: [...s.plan, p] }));
  } catch (e) { toastFn(errMsg(e)); }
}

export async function dismissCard(id: string) {
  set(s => ({ cards: s.cards.filter(c => c.id !== id) }));
  await api.dismissCard(id).catch(swallow);
}

// ------------------------------------------------------------------------------------------------ journal
export function startJournal(mode: 'write' | 'speak') {
  stopDictation();
  set({ jMode: mode, jText: '', jPrompt: null, jStage: 'edit', jError: null, jResult: null, jShare: !!getState().consent?.remember, screen: 'jcompose', sheet: null });
}

/** Save. Private entries are stored and left alone; shared ones are then read for review (nothing saved to Memory yet). */
export async function saveJournal() {
  // Stop listening, then wait for the last pieces of speech to be written down before reading the text.
  stopDictation();
  await dictationSettled();
  const s = getState();
  if (!s.jText.trim()) { toastFn('Nothing to save yet. Take your time.'); return; }
  set({ jStage: 'saving', jError: null });
  let created;
  try {
    created = await api.createJournal({ mode: s.jMode === 'speak' ? 'spoken' : 'written', prompt: s.jPrompt ?? undefined, text: s.jText.trim(), shared: s.jShare });
  } catch (e) { set({ jStage: 'edit', jError: errMsg(e, 'I couldn’t save that. Your words are still here.') }); return; }
  set(st => ({ jEntries: [created.entry, ...st.jEntries] }));

  if (created.riskLevel === 3) crisisFn();
  if (!s.jShare) {
    navigateFn('journal');
    toastFn('Saved, just for you.');
    if (created.riskLevel >= 2) sheetFn('support');
    return;
  }

  set({ jStage: 'thinking' });
  try {
    const a = await api.analyzeJournal(created.entry.id);
    if (a.riskLevel === 3) crisisFn();
    set({ jStage: 'review', jResult: { ...a, hookOn: true, stepOn: false, entryId: created.entry.id, keep: a.memories.filter(m => !m.sensitive).map(m => m.id) } });
  } catch (e) {
    // The entry is saved. Reading it failed, so it goes back to private rather than claiming Saathi learned from it.
    await api.setJournalShared(created.entry.id, false).catch(swallow);
    set(st => ({ jEntries: st.jEntries.map(x => (x.id === created.entry.id ? { ...x, shared: false } : x)) }));
    navigateFn('journal');
    toastFn(`Saved, just for you. ${errMsg(e, 'I couldn’t read it right now.')}`);
  }
}

export async function finishJournal() {
  const r = getState().jResult;
  if (!r) return;
  try {
    const out = await api.commitJournal(r.entryId, { savedMemoryIds: r.keep, useHook: r.hookOn, addStep: r.stepOn });
    set({ jResult: null });
    navigateFn('journal');
    toastFn(out.savedMemories || out.hook ? `Saved. I’ll remember ${out.savedMemories} thing${out.savedMemories === 1 ? '' : 's'}${out.hook ? ' and ask about it next time' : ''}.` : 'Saved. I won’t bring it up.');
    void loadJournal();
    if (out.savedMemories) void loadMemory();
  } catch (e) { toastFn(errMsg(e)); }
}

export async function keepPrivate() {
  const r = getState().jResult;
  if (!r) return;
  try {
    await api.discardJournal(r.entryId);
    set(s => ({ jResult: null, jEntries: s.jEntries.map(x => (x.id === r.entryId ? { ...x, shared: false } : x)) }));
    navigateFn('journal');
    toastFn('Saved, just for you. Nothing remembered.');
  } catch (e) { toastFn(errMsg(e)); }
}

export async function setEntryShared(id: string, shared: boolean) {
  try {
    const e = await api.setJournalShared(id, shared);
    set(s => ({ jEntries: s.jEntries.map(x => (x.id === id ? e : x)) }));
  } catch (e) { toastFn(errMsg(e)); }
}

export async function deleteEntry(id: string) {
  try {
    await api.deleteJournal(id);
    set(s => ({ jEntries: s.jEntries.filter(x => x.id !== id), sheet: null }));
    toastFn('Entry deleted, for good.');
  } catch (e) { toastFn(errMsg(e)); }
}

// ------------------------------------------------------------------------------------------------ memory
export async function saveMemoryEdit() {
  const { editingId, editText } = getState();
  if (!editingId) return;
  try {
    const m = await api.patchMemory(editingId, { text: editText.trim() });
    set(s => ({ memories: s.memories.map(x => (x.id === m.id ? m : x)), editingId: null }));
  } catch (e) { toastFn(errMsg(e)); }
}
export async function toggleMemoryHidden(id: string) {
  const m = getState().memories.find(x => x.id === id);
  if (!m) return;
  set(s => ({ memories: s.memories.map(x => (x.id === id ? { ...x, hidden: !x.hidden } : x)) }));
  await api.patchMemory(id, { hidden: !m.hidden }).catch(e => { set(s => ({ memories: s.memories.map(x => (x.id === id ? m : x)) })); toastFn(errMsg(e)); });
}
export async function removeMemory(id: string) {
  try { await api.deleteMemory(id); set(s => ({ memories: s.memories.filter(x => x.id !== id) })); toastFn('Deleted. It’s gone for good.'); } catch (e) { toastFn(errMsg(e)); }
}
export async function forgetTheme(theme: string) {
  const ids = getState().memories.filter(m => m.theme === theme).map(m => m.id);
  try {
    for (const id of ids) await api.deleteMemory(id);
    set(s => ({ memories: s.memories.filter(m => m.theme !== theme) }));
    toastFn(`Forgotten: everything about ${theme.toLowerCase()}.`);
  } catch (e) { toastFn(errMsg(e)); }
}
export async function forgetAllMemories() {
  try { await api.forgetAll(); set({ memories: [] }); toastFn('Everything forgotten. A fresh start.'); } catch (e) { toastFn(errMsg(e)); }
}
export async function saveProposedMemories(items: { theme: import('../api').Theme; text: string; sensitive: boolean }[], source: 'chat' | 'call') {
  if (!items.length) return;
  try { await api.addMemories(items, source); toastFn(`I’ll remember ${items.length === 1 ? 'that' : 'those'}.`); void loadMemory(); } catch (e) { toastFn(errMsg(e)); }
}

// ------------------------------------------------------------------------------------------------ safety plan and trusted contact
export async function saveSafetyPlan(p: SafetyPlan) {
  try { await api.putSafetyPlan(p); set({ safetyPlan: p }); toastFn('Saved. It works without internet once you’ve opened it.'); } catch (e) { toastFn(errMsg(e)); }
}
export async function saveTrusted(b: TrustedContact) {
  try {
    await api.putTrusted(b);
    applyMe(await api.me());
    set({ trustedDial: { name: b.name, phone: b.phone } });
    toastFn(`${b.name} is your trusted contact.`);
  } catch (e) { toastFn(errMsg(e)); }
}
export async function removeTrusted() {
  try { await api.deleteTrusted(); applyMe(await api.me()); set({ trustedDial: null }); toastFn('Removed.'); } catch (e) { toastFn(errMsg(e)); }
}

// ------------------------------------------------------------------------------------------------ outside
export async function setCity(city: string) {
  try { await api.patchMe({ city }); applyMe(await api.me()); await loadOutside(); } catch (e) { toastFn(errMsg(e)); }
}
export async function confirmEvent(id: string) {
  try {
    await api.markInterest(id);
    set({ eventStage: 'done', events: getState().events.map(e => (e.id === id ? { ...e, interested: true } : e)) });
    void loadToday();
  } catch (e) { toastFn(errMsg(e)); }
}

// ------------------------------------------------------------------------------------------------ notifications
export async function updatePrefs(patch: Partial<NotificationPrefs>) {
  const before = getState().prefs;
  if (before) set({ prefs: { ...before, ...patch } });
  try { set({ prefs: await api.putPrefs(patch) }); } catch (e) { set({ prefs: before }); toastFn(errMsg(e)); }
}

export async function exportMyData() {
  try {
    const blob = await api.exportData();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'saathi-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toastFn('Your data is downloading.');
  } catch (e) { toastFn(errMsg(e)); }
}

export { isDemo };
