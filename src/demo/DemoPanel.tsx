import { useState } from 'react';
import { C, serif, type TimeOfDay } from '../theme';
import { clearPrefs, initialState, resetState, set, useStore } from '../state/store';
import { analyzeJournal, go, openBreathe, openPaywall, showCrisis, startJournal, teardownAll } from '../state/actions';
import type { NotifKind } from '../state/store';

// Prototype navigator (the side rail from the design). Only mounted with ?demo so the shipped UI stays clean.
// It also reaches states that normally arrive from outside the app: OS notifications, a CallKit call, crisis levels.
const SAMPLE = 'Work was a lot today. My manager moved the deadline again and I didn’t say anything. Priya texted, that helped a bit. I want to sleep before one tonight.';

type Item = [string, () => void];
const sim = (k: NotifKind) => () => go('lock', { notif: k });

export function DemoPanel() {
  const [open, setOpen] = useState(() => typeof innerWidth !== 'undefined' && innerWidth >= 1100);
  const tod = useStore(s => s.todOverride);
  const reduce = useStore(s => s.reduceMotion);
  const voiceAudio = useStore(s => s.voiceAudio);
  const preview = useStore(s => s.priv.preview);

  const groups: { group: string; desc: string; items: Item[] }[] = [
    { group: 'First open', desc: 'Onboarding, in order.', items: [['Welcome', () => go('welcome')], ['Honest intro', () => go('intro')], ['Age check', () => go('age')], ['Language', () => go('lang')], ['Name and sign-in', () => go('name')], ['Your companion', () => go('companion')], ['Consent', () => go('consent')], ['Under-18 exit', () => go('under')]] },
    { group: 'Today', desc: 'Home: companion, mood, plan.', items: [['Today', () => go('today')], ['Quiet card in the app', () => go('today', { inApp: true })]] },
    { group: 'Talk', desc: 'Every way to talk, loud or quiet.', items: [['Talk', () => go('talk')], ['Voice call', () => go('call', { callMode: 'voice', micOk: true })], ['Avatar video call', () => go('call', { callMode: 'video', micOk: true })], ['Text chat', () => go('chat')], ['Just sit with me', () => go('call', { callMode: 'sit' })]] },
    { group: 'Outside', desc: 'Small steps, walks, meetups.', items: [['Outside', () => go('outside')], ['Event detail', () => { go('outside'); set({ sheet: 'event', eventId: 'walk', eventStage: 'detail' }); }], ['Walk with me', () => go('walk', { walkEnded: false })]] },
    { group: 'Journal', desc: 'Entries, dictation, insights.', items: [['Journal entries', () => go('journal')], ['Write an entry', () => startJournal('write')], ['Talk it out (dictation)', () => startJournal('speak')], ['What I noticed (sample)', () => { go('jcompose', { jMode: 'write', jText: SAMPLE, jStage: 'edit', jShare: true }); setTimeout(() => analyzeJournal(SAMPLE), 50); }], ['Insights', () => go('journey')], ['Weekly letter', () => { go('journey'); set({ sheet: 'letter' }); }]] },
    { group: 'You', desc: 'Companion, reminders, privacy.', items: [['You', () => go('you')], ['Memory', () => go('memory')], ['Avatar and voice studio', () => go('studio')], ['Reminder settings', () => go('notifs')], ['Privacy Center', () => go('privacy')], ['Paywall', openPaywall]] },
    { group: 'Notifications', desc: 'What arrives outside the app.', items: [['Check-in notification', sim('checkin')], ['Plan reminder', sim('plan')], ['Event: time to leave', sim('leave')], ['Follow-up after a hard day', sim('followup')], ['After a quiet week', sim('quietweek')], ['Saathi is calling', () => go('incoming')], [`Lock-screen previews: ${preview ? 'on' : 'off'}`, () => set(p => ({ priv: { ...p.priv, preview: !p.priv.preview } }))]] },
    { group: 'Calm', desc: 'Meditations, sleep stories, sounds.', items: [['Calm hub', () => go('calm', { calmTab: 'meditate' })], ['Sleep stories', () => go('calm', { calmTab: 'sleep' })], ['Sounds', () => go('calm', { calmTab: 'sounds' })]] },
    { group: 'Safety', desc: 'Always one tap away.', items: [['Support sheet', () => set({ sheet: 'support' })], ['Level 2 in chat', () => go('chat', { careCard: true })], ['Crisis screen (level 3)', showCrisis], ['Breathe with me', openBreathe]] },
  ];
  const todOpts: (TimeOfDay | null)[] = [null, 'dawn', 'day', 'evening'];

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 100, height: 40, padding: '0 14px', borderRadius: 20, border: 'none', background: C.ink, color: C.white, fontSize: 14, fontWeight: 600 }}>Prototype</button>;
  }
  return (
    <aside aria-label="Prototype navigator" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 280, maxWidth: '86vw', zIndex: 100, overflow: 'auto', background: 'rgba(233,226,214,.97)', padding: '20px 18px 40px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '8px 0 30px rgba(42,46,69,.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: serif, fontSize: 30 }}>Saathi</div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: C.teal, fontSize: 14, fontWeight: 600 }}>Hide</button>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>Jump to any screen. Try the safety layer: in Text chat, type “I feel hopeless” (level 2) or “I have a plan for tonight” (level 3). Triple-tap the Saathi wordmark on Today for quick hide.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Time of day</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {todOpts.map(t => <button key={t ?? 'auto'} aria-pressed={tod === t} onClick={() => set({ todOverride: t })} style={{ height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: tod === t ? C.teal : C.white, color: tod === t ? C.white : C.ink, fontSize: 13, fontWeight: 600 }}>{t ?? 'auto'}</button>)}
        </div>
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={reduce} onChange={e => set({ reduceMotion: e.target.checked })} /> Reduce motion</label>
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={voiceAudio} onChange={e => set({ voiceAudio: e.target.checked })} /> Spoken voice</label>
        <button onClick={() => { teardownAll(); clearPrefs(); resetState(initialState(false)); }} style={{ alignSelf: 'flex-start', height: 32, padding: '0 12px', borderRadius: 16, border: `1px solid ${C.muted}`, background: 'none', fontSize: 13, fontWeight: 600, color: C.ink }}>Reset demo</button>
      </div>
      {groups.map(g => (
        <div key={g.group} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{g.group}</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{g.desc}</div>
          {g.items.map(([label, fn]) => <button key={label} onClick={fn} style={{ textAlign: 'left', background: 'none', border: 'none', padding: '6px 10px', marginLeft: -10, borderRadius: 10, fontSize: 15, color: C.ink }}>{label}</button>)}
        </div>
      ))}
    </aside>
  );
}
