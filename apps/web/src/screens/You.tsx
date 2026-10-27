import { useEffect, useState } from 'react';
import { C, serif, shadow } from '../theme';
import { set, useStore } from '../state/store';
import { detectPushState, disablePush, enablePush } from '../state/push';
import { exportMyData, forgetAllMemories, forgetTheme, go, loadMemory, loadYou, openPaywall, openSheet, removeMemory, saveMemoryEdit, signOutNow, toast, toggleMemoryHidden, updateConsent, updatePrefs, updatePrivacy } from '../state/actions';
import { Companion, lookName } from '../components/figures';
import { voiceLabel } from '../domain/voices';
import { BackHeader, Card, Chevron, Intro, PrimaryButton, Scroll, Segmented, TextButton, ToggleRow, TabHeader, flex } from '../components/ui';
import { buildNotification, NotifIcon } from './Lock';

const LANG_LABEL = { en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' } as const;
const CHECKIN_LABEL = { morning: '9 a.m.', evening: '9 p.m.', off: 'Off' } as const;
const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`; };

export function You() {
  const compName = useStore(s => s.compName);
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const language = useStore(s => s.language);
  const memories = useStore(s => s.memories);
  const prefs = useStore(s => s.prefs);
  const me = useStore(s => s.me);
  const safetyPlan = useStore(s => s.safetyPlan);
  const health = useStore(s => s.consent?.healthData ?? false);
  const memN = memories.filter(m => !m.hidden).length;
  const trusted = me?.trustedContact?.name;
  const checkin = prefs?.checkinTime ?? 'evening';
  useEffect(() => { void loadYou(); void loadMemory(); }, []);
  const na = (label: string) => () => toast(`${label} isn’t available yet.`);

  interface R { label: string; desc?: string; value?: string; tap: () => void }
  const groups: { title: string; items: R[] }[] = [
    { title: 'Your companion', items: [
      { label: `What ${compName} remembers`, desc: 'See, edit or delete what I’ve learned.', value: String(memN), tap: () => go('memory') },
      { label: 'Avatar and voice', desc: 'Pick a character and a voice, and hear them first.', tap: () => go('studio') },
    ] },
    { title: 'Reminders and calls', items: [
      { label: 'Check-ins and reminders', desc: 'Gentle nudges, calls and the Sunday letter.', value: prefs && (prefs.push || prefs.calls) ? 'On' : 'Off', tap: () => go('notifs') },
      { label: 'Check-in time', value: CHECKIN_LABEL[checkin], tap: () => go('notifs') },
      { label: 'Quiet hours', desc: 'Nothing arrives at night.', value: prefs ? `${clock12(prefs.quietHours.start)} – ${clock12(prefs.quietHours.end)}` : '', tap: () => go('notifs') },
    ] },
    { title: 'Privacy and safety', items: [
      { label: 'Privacy Center', desc: 'What’s stored, app lock, discreet mode.', tap: () => go('privacy') },
      { label: 'My safety plan', desc: 'Your own steps. Works without internet once opened.', value: safetyPlan ? 'Set' : 'Not yet', tap: () => openSheet('plan') },
      { label: 'Trusted contact', desc: 'Someone I can suggest you reach out to.', value: trusted ?? 'None', tap: () => openSheet('trusted') },
      { label: 'Helplines', desc: 'Free, real people, any time.', tap: () => openSheet('helplines') },
    ] },
    { title: 'Account', items: [
      { label: 'Subscription', value: me?.subscription === 'plus' ? 'Plus' : 'Basic', tap: openPaywall },
      { label: 'Health data', desc: 'Sleep and steps from your phone.', value: health ? 'On' : 'Off', tap: () => void updateConsent({ healthData: !health }) },
      { label: 'How Saathi uses AI', tap: na('This page') },
      { label: 'About', tap: na('This page') },
    ] },
  ];

  return (
    <main aria-label="You" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <TabHeader title="You" />
      <Scroll pad="24px 24px var(--scroll-bottom)">
        <Intro>Your companion, reminders, privacy and account.</Intro>
        <button onClick={() => go('studio')} style={{ ...flex('row', 16), alignItems: 'center', textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: '18px 20px', boxShadow: shadow.cardSoft }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: C.sand, flex: 'none', display: 'grid', placeItems: 'center' }}><Companion look={look} size={look === 'orb' ? 56 : 56} /></div>
          <div style={{ flex: 1, ...flex('column', 2) }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{compName}</span>
            <span style={{ fontSize: 15, color: C.muted }}>{lookName(look)} · {voiceLabel(voice)} voice · {LANG_LABEL[language]}</span>
            <span style={{ fontSize: 15, color: C.teal, fontWeight: 600, marginTop: 4 }}>See and hear your companion</span>
          </div>
        </button>
        {groups.map(g => (
          <section key={g.title} style={{ ...flex('column', 8), marginTop: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: C.muted, letterSpacing: '.06em', textTransform: 'uppercase', padding: '0 6px', margin: 0 }}>{g.title}</h2>
            <div style={{ background: C.white, borderRadius: 28, padding: '4px 20px', boxShadow: shadow.cardSoft, ...flex('column') }}>
              {g.items.map((it, i) => (
                <button key={it.label} onClick={it.tap} style={{ ...flex('row', 12), alignItems: 'center', textAlign: 'left', border: 'none', background: 'none', minHeight: 56, padding: '12px 0', borderBottom: i < g.items.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                  <div style={{ flex: 1, ...flex('column', 2) }}><span style={{ fontSize: 17 }}>{it.label}</span>{it.desc && <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{it.desc}</span>}</div>
                  {it.value && <span style={{ fontSize: 15, color: C.muted }}>{it.value}</span>}
                  <Chevron />
                </button>
              ))}
            </div>
          </section>
        ))}
        <TextButton onClick={() => void signOutNow()} style={{ color: C.muted, marginTop: 8 }}>Sign out</TextButton>
      </Scroll>
    </main>
  );
}

export function Memory() {
  const memories = useStore(s => s.memories);
  const editingId = useStore(s => s.editingId);
  const editText = useStore(s => s.editText);
  const compName = useStore(s => s.compName);
  const remember = useStore(s => s.consent?.remember ?? false);
  useEffect(() => { void loadMemory(); }, []);
  const [confirmAll, setConfirmAll] = useState(0);
  const themes = [...new Set(memories.map(m => m.theme))];

  return (
    <main aria-label="Memory" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <BackHeader title="Memory" onBack={() => go('you')} />
      <Scroll pad="20px 24px var(--scroll-bottom)">
        <div style={{ borderRadius: 28, padding: 20, background: C.tealSoft, fontSize: 15, lineHeight: 1.5, textWrap: 'pretty' }}>This is what lets {compName} ask how things went. It comes from your conversations, and from journal entries you chose to share.</div>
        <Card pad="16px 20px">
          <ToggleRow on={remember} onToggle={() => void updateConsent({ remember: !remember })} label="Remember things from our chats" desc="Off means nothing new is saved. Safety checks still run." />
        </Card>
        <Card gap={6}>
          <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>What {compName} remembers</h2>
          <span style={{ fontSize: 15, color: C.muted, marginBottom: 6 }}>Edit, hide or delete anything. Hidden items stay here but {compName} won’t use them.</span>
          {themes.map(th => (
            <div key={th} style={{ ...flex('column', 2), paddingTop: 12 }}>
              <div style={{ ...flex('row'), justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: 0 }}>{th}</h3>
                <button onClick={() => void forgetTheme(th)} style={{ height: 36, background: 'none', border: 'none', color: C.teal, fontSize: 13, fontWeight: 600 }}>Forget all</button>
              </div>
              {memories.filter(m => m.theme === th).map(m => (
                <div key={m.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.rule}`, ...flex('column', 6) }}>
                  {editingId === m.id ? (
                    <div style={flex('row', 8)}>
                      <input aria-label="Edit memory" maxLength={120} value={editText} onChange={e => set({ editText: e.target.value })} style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 20, border: 'none', background: C.sand, padding: '0 14px', fontSize: 15, outline: 'none' }} />
                      <button onClick={() => void saveMemoryEdit()} style={{ height: 48, padding: '0 16px', borderRadius: 24, border: 'none', background: C.teal, color: C.white, fontSize: 15, fontWeight: 600 }}>Save</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: 17, lineHeight: 1.45, opacity: m.hidden ? 0.55 : 1 }}>{m.text}</span>
                      {m.hidden && <span style={{ fontSize: 13, color: C.muted }}>Hidden from {compName}</span>}
                      <div style={flex('row', 16)}>
                        <button onClick={() => set({ editingId: m.id, editText: m.text })} style={act(C.teal)}>Edit</button>
                        <button onClick={() => void toggleMemoryHidden(m.id)} style={act(C.teal)}>{m.hidden ? `Show to ${compName}` : `Hide from ${compName}`}</button>
                        <button onClick={() => void removeMemory(m.id)} style={act(C.muted)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {memories.length === 0 && <span style={{ fontSize: 17, color: C.muted }}>Nothing saved right now.</span>}
        </Card>
        {memories.length > 0 && (confirmAll === 0 ? (
          <TextButton onClick={() => setConfirmAll(1)} style={{ color: C.muted }}>Forget everything</TextButton>
        ) : (
          <Card gap={10} style={{ border: `1.5px solid ${C.amberLine}` }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{confirmAll === 1 ? 'Forget everything?' : 'Really, all of it?'}</span>
            <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>{confirmAll === 1 ? `${compName} will lose all ${memories.length} memories. Your journal stays.` : 'This can’t be undone. It’s removed for good.'}</span>
            <PrimaryButton onClick={() => { if (confirmAll === 1) setConfirmAll(2); else { void forgetAllMemories(); setConfirmAll(0); } }} style={{ background: C.ink }}>{confirmAll === 1 ? 'Yes, continue' : 'Forget everything'}</PrimaryButton>
            <TextButton onClick={() => setConfirmAll(0)}>Keep my memories</TextButton>
          </Card>
        ))}
      </Scroll>
    </main>
  );
}
const act = (color: string) => ({ height: 32, padding: 0, background: 'none', border: 'none', color, fontSize: 15, fontWeight: 600 }) as const;

const RETENTION = [{ value: '0', label: 'Don’t keep' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '36500', label: 'Until I delete' }] as const;

export function Privacy() {
  const compName = useStore(s => s.compName);
  const memCount = useStore(s => s.memories.length);
  const priv = useStore(s => s.me?.privacy);
  const remember = useStore(s => s.consent?.remember ?? false);
  const analyticsOn = useStore(s => s.consent?.analytics ?? false);
  const retention = useStore(s => s.retention);
  useEffect(() => { void loadMemory(); }, []);
  if (!priv) return null;
  const rows = [
    { on: priv.discreetMode, tap: () => void updatePrivacy({ discreetMode: !priv.discreetMode }), label: 'Discreet mode', desc: 'Neutral tab title. Notifications say nothing personal.' },
    { on: priv.quickHide, tap: () => void updatePrivacy({ quickHide: !priv.quickHide }), label: 'Quick hide', desc: 'Triple-tap the Saathi name to switch to a breathing screen.' },
    { on: analyticsOn, tap: () => void updateConsent({ analytics: !analyticsOn }), label: 'Share how I use Saathi', desc: 'Which screens and buttons get used, never what you write or say.' },
    { on: remember, tap: () => void updateConsent({ remember: !remember }), label: 'Remember conversations', desc: 'So I can ask how things went. Safety checks run either way.' },
    { on: priv.lockScreenPreviews, tap: () => void updatePrivacy({ lockScreenPreviews: !priv.lockScreenPreviews }), label: 'Lock-screen previews', desc: 'Off means notifications only say “A quiet moment for you?”' },
  ];
  return (
    <main aria-label="Privacy Center" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <BackHeader title="Privacy Center" onBack={() => go('you')} />
      <Scroll pad="20px 24px var(--scroll-bottom)">
        <div style={{ borderRadius: 28, padding: 20, background: C.tealSoft, ...flex('column', 8), fontSize: 17, lineHeight: 1.45 }}>
          <span><strong>{compName} remembers:</strong> {memCount} things.</span>
          <span><strong>Stored:</strong> encrypted, on our servers in India.</span>
          <span><strong>Shared with:</strong> no one. Your messages are processed by an AI service to write replies.</span>
        </div>
        <div style={{ background: C.white, borderRadius: 28, padding: '4px 20px', boxShadow: shadow.cardSoft, ...flex('column') }}>
          {rows.map((r, i) => <ToggleRow key={r.label} on={r.on} onToggle={r.tap} label={r.label} desc={r.desc} style={{ padding: '16px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.rule}` : 'none' }} />)}
        </div>
        <Card gap={12}>
          <span style={{ fontSize: 17 }}>Keep conversations for</span>
          <Segmented<'0' | '7' | '30' | '90' | '36500'> label="Keep conversations for" options={RETENTION} value={String(retention) as '0'} onChange={v => void updatePrivacy({ transcriptRetentionDays: Number(v) as 0 })} />
          <span style={{ fontSize: 15, color: C.muted }}>Voice recordings are never kept. Summaries stay until you delete them.</span>
        </Card>
        <PrimaryButton onClick={() => void exportMyData()}>Export my data</PrimaryButton>
        <TextButton onClick={() => openSheet('delete')} style={{ color: C.muted }}>Delete everything</TextButton>
      </Scroll>
    </main>
  );
}

export function NotifSettings() {
  const compName = useStore(s => s.compName);
  const prefs = useStore(s => s.prefs);
  const priv = useStore(s => s.me?.privacy);
  const callsOk = useStore(s => s.me?.features.calls ?? false);
  const pushState = useStore(s => s.pushState);
  useEffect(() => { void loadYou(); detectPushState(); }, []);
  if (!prefs || !priv) return <main aria-label="Reminders and calls" style={{ position: 'absolute', inset: 0, background: C.paper }}><BackHeader title="Reminders and calls" onBack={() => go('you')} help={false} /></main>;
  const checkin = prefs.checkinTime;
  const preview = buildNotification('checkin', compName, priv.lockScreenPreviews, priv.discreetMode);

  const togglePush = async () => {
    if (prefs.push) { await disablePush().catch(() => undefined); await updatePrefs({ push: false }); return; }
    const r = await enablePush().catch(() => 'unavailable' as const);
    if (r === 'on') await updatePrefs({ push: true });
    else toast(r === 'denied' ? 'Notifications are blocked in your browser settings.' : r === 'unsupported' ? 'This browser can’t show notifications.' : 'Notifications aren’t set up on this server yet.');
  };
  const toggleCalls = () => { if (!callsOk && !prefs.calls) { toast('Calls aren’t available yet.'); return; } void updatePrefs({ calls: !prefs.calls }); };

  const defs = [
    { on: prefs.quietCards, tap: () => void updatePrefs({ quietCards: !prefs.quietCards }), label: 'Quiet cards in the app', desc: 'A soft card on Today. Nothing buzzes.' },
    { on: prefs.push && pushState === 'on', tap: () => void togglePush(), label: 'Gentle notifications', desc: 'Two a day at most.' },
    { on: prefs.calls, tap: toggleCalls, label: `Calls from ${compName}`, desc: callsOk ? 'For your check-in, if you’d like. One a day at most.' : 'Not available yet.' },
    { on: prefs.sundayLetter, tap: () => void updatePrefs({ sundayLetter: !prefs.sundayLetter }), label: 'Sunday letter', desc: 'A short note about your week, Sunday evening.' },
    { on: prefs.followUpAfterHardDay, tap: () => void updatePrefs({ followUpAfterHardDay: !prefs.followUpAfterHardDay }), label: 'Check on me after a hard day', desc: 'One gentle message the next morning, even in quiet hours.' },
    { on: priv.lockScreenPreviews, tap: () => void updatePrivacy({ lockScreenPreviews: !priv.lockScreenPreviews }), label: 'Lock-screen previews', desc: 'Off means it only ever says “A quiet moment for you?”' },
    { on: priv.discreetMode, tap: () => void updatePrivacy({ discreetMode: !priv.discreetMode }), label: 'Discreet mode', desc: 'Shows as “Calm” with a plain icon.' },
  ];
  return (
    <main aria-label="Reminders and calls" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <BackHeader title="Reminders and calls" onBack={() => go('you')} help={false} />
      <Scroll pad="20px 24px var(--scroll-bottom)">
        <div style={{ fontSize: 15, color: C.muted }}>What your lock screen shows</div>
        <div style={{ borderRadius: 28, padding: 14, background: 'linear-gradient(180deg,#4A4682,#A79FD6)' }}>
          <div style={{ borderRadius: 20, background: 'rgba(246,244,251,.8)', padding: 12, ...flex('row', 12), alignItems: 'flex-start' }}>
            <NotifIcon bg={preview.iconBg} dot={preview.iconDot} size={34} />
            <div style={{ flex: 1, ...flex('column', 2) }}><div style={{ ...flex('row'), justifyContent: 'space-between' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{preview.app}</span><span style={{ fontSize: 13, color: C.muted }}>now</span></div><span style={{ fontSize: 15, lineHeight: 1.4 }}>{preview.body}</span></div>
          </div>
        </div>
        <div style={{ background: C.white, borderRadius: 28, padding: '4px 20px', boxShadow: shadow.cardSoft, ...flex('column') }}>
          {defs.map((d, i) => <ToggleRow key={d.label} on={d.on} onToggle={d.tap} label={d.label} desc={d.desc} style={{ padding: '16px 0', borderBottom: i < defs.length - 1 ? `1px solid ${C.rule}` : 'none' }} />)}
        </div>
        <Card gap={12}>
          <span style={{ fontSize: 17 }}>Daily check-in</span>
          <Segmented<'morning' | 'evening' | 'off'> label="Daily check-in" options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }, { value: 'off', label: 'Off' }]} value={checkin} onChange={v => void updatePrefs({ checkinTime: v })} />
          <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>{checkin === 'off' ? 'No daily check-in. You can still talk any time.' : `Around ${checkin === 'morning' ? '9 a.m.' : '9 p.m.'}. A short conversation, never a form. Miss one and I won’t mention it.`}</span>
        </Card>
        <Card gap={6}>
          <div style={{ ...flex('row'), justifyContent: 'space-between', fontSize: 17 }}><span>Quiet hours</span><span style={{ color: C.muted }}>{clock12(prefs.quietHours.start)} – {clock12(prefs.quietHours.end)}</span></div>
          <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>Nothing arrives then, unless you’ve asked me to check on you after a hard day.</span>
        </Card>
        <div style={{ borderRadius: 28, padding: 20, background: C.tealSoft, ...flex('column', 10) }}>
          <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>What I’ll always do</h2>
          {['Two messages a day at most, and one call.', 'If you don’t reply, I slow down. After a quiet week, I pause until you’re back.', 'No guilt, no streaks, no “you haven’t talked to me in days”.', 'Nothing personal on your lock screen unless you turn it on.'].map(t => (
            <div key={t} style={{ ...flex('row', 12), alignItems: 'baseline', fontSize: 15, lineHeight: 1.45 }}><span aria-hidden style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: C.teal, transform: 'translateY(-2px)' }} /><span>{t}</span></div>
          ))}
        </div>
      </Scroll>
    </main>
  );
}

