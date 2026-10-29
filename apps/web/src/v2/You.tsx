import { useEffect, useState } from 'react';
import { api } from '../api';
import { Companion, LOOK_OPTIONS, lookName } from '../components/figures';
import { stopSpeech } from '../audio/speech';
import { voiceLabel } from '../domain/voices';
import {
  exportMyData, forgetAllMemories, forgetTheme, go, loadMemory, loadYou, openPaywall, openSheet, removeMemory, saveMemoryEdit, signOutNow, toast, toggleMemoryHidden, updateConsent, updatePrefs, updatePrivacy,
} from '../state/actions';
import { applyMe, errMsg, updateCompanion } from '../state/session';
import { detectPushState, disablePush, enablePush } from '../state/push';
import { set, useStore, type AvatarMode, type Language } from '../state/store';
import { HelpPill, ScreenFrame } from './Chrome';
import { useGarden } from './garden';
import { Ic } from './icons';
import { VoicePicker } from './VoicePicker';
import { push } from './ui';

const LANG_LABEL = { en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' } as const;
const CHECKIN_LABEL = { morning: 'Morning', evening: 'Evening', off: 'Off' } as const;
const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`; };
const backToYou = () => go('you');

interface Row { label: string; desc?: string; value?: string; tap: () => void }

function Group({ title, items }: { title: string; items: Row[] }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 className="eyebrow" style={{ padding: '0 4px 8px' }}>{title}</h2>
      <ul className="list card" style={{ padding: '2px 16px' }}>
        {items.map(it => (
          <li key={it.label}>
            <button className="row grow1" style={{ textAlign: 'left', gap: 12, minHeight: 44 }} onClick={it.tap}>
              <span className="grow1"><span style={{ display: 'block', fontWeight: 700 }}>{it.label}</span>{it.desc && <span className="muted small" style={{ display: 'block' }}>{it.desc}</span>}</span>
              {it.value && <span className="muted small">{it.value}</span>}
              <Ic n="chev" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function YouTab() {
  const compName = useStore(s => s.compName);
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const language = useStore(s => s.language);
  const memories = useStore(s => s.memories);
  const prefs = useStore(s => s.prefs);
  const me = useStore(s => s.me);
  const nick = useStore(s => s.nick);
  const safetyPlan = useStore(s => s.safetyPlan);
  const health = useStore(s => s.consent?.healthData ?? false);
  const garden = useGarden(s => s.garden);
  const memN = memories.filter(m => !m.hidden).length;
  const trusted = me?.trustedContact?.name;
  useEffect(() => { void loadYou(); void loadMemory(); }, []);

  return (
    <>
      <div className="hhead"><div><div className="eyebrow">You</div><h1 className="h1" style={{ marginTop: 4 }}>{nick ? nick : 'Your space'}</h1></div><HelpPill /></div>
      <button className="card row" style={{ width: '100%', textAlign: 'left', gap: 14 }} onClick={() => go('studio')}>
        <span style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg2)', flex: 'none', display: 'grid', placeItems: 'center' }}><Companion look={look} size={58} /></span>
        <span className="grow1"><b style={{ display: 'block' }}>{compName}</b><span className="muted small">{lookName(look)} · {voiceLabel(voice)} voice · {LANG_LABEL[language]}</span><span className="link" style={{ display: 'block', minHeight: 24 }}>See and hear your companion</span></span>
      </button>
      {garden && (
        <button className="card row" style={{ width: '100%', textAlign: 'left', gap: 14, marginTop: 10, background: 'var(--leafsoft)' }} onClick={() => push({ id: 'garden' })}>
          <span className="ico" style={{ background: 'rgba(255,255,255,.7)' }}><Ic n="leaf" color="#2F7A49" /></span>
          <span className="grow1"><b style={{ display: 'block', color: '#14352A' }}>Your garden</b><span className="small" style={{ color: '#2F5A44' }}>{garden.stageName} · {garden.activeDays} day{garden.activeDays === 1 ? '' : 's'} you showed up</span></span>
          <Ic n="chev" />
        </button>
      )}
      <Group title="Your companion" items={[
        { label: `What ${compName} remembers`, desc: 'See, edit or delete what I’ve learned.', value: String(memN), tap: () => go('memory') },
        { label: 'Avatar and voice', desc: 'Pick a character and a voice, and hear them first.', tap: () => go('studio') },
        { label: 'Language', value: LANG_LABEL[language], tap: () => push({ id: 'language' }) },
      ]} />
      <Group title="Reminders and calls" items={[
        { label: 'Check-ins and reminders', desc: 'Gentle nudges, calls and the Sunday letter.', value: prefs && (prefs.push || prefs.calls) ? 'On' : 'Off', tap: () => go('notifs') },
        { label: 'Check-in time', value: prefs ? CHECKIN_LABEL[prefs.checkinTime] : '', tap: () => go('notifs') },
        { label: 'Quiet hours', desc: 'Nothing arrives at night.', value: prefs ? `${clock12(prefs.quietHours.start)} – ${clock12(prefs.quietHours.end)}` : '', tap: () => go('notifs') },
      ]} />
      <Group title="Privacy and safety" items={[
        { label: 'Privacy Center', desc: 'What’s stored, discreet mode, your data.', tap: () => go('privacy') },
        { label: 'My safety plan', desc: 'Your own steps. Works without internet once opened.', value: safetyPlan ? 'Set' : 'Not yet', tap: () => openSheet('plan') },
        { label: 'Trusted contact', desc: 'Someone I can suggest you reach out to.', value: trusted ?? 'None', tap: () => openSheet('trusted') },
        { label: 'Helplines', desc: 'Free, real people, any time.', tap: () => openSheet('helplines') },
      ]} />
      <Group title="Account" items={[
        { label: 'Subscription', value: me?.subscription === 'plus' ? 'Plus' : 'Basic', tap: openPaywall },
        { label: 'Health data', desc: 'Sleep and steps from your phone.', value: health ? 'On' : 'Off', tap: () => void updateConsent({ healthData: !health }) },
        { label: `How ${compName} uses AI`, tap: () => push({ id: 'about' }) },
      ]} />
      <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => void signOutNow()}>Sign out</button>
      <p className="foot">{compName} is an AI companion, not a doctor or therapist.</p>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- language
export function LanguageScreen({ onBack }: { onBack: () => void }) {
  const language = useStore(s => s.language);
  const me = useStore(s => s.me);
  const pick = async (l: Language) => {
    if (l === language) return;
    set({ language: l });
    try { await api.patchMe({ language: l }); if (me) applyMe({ ...me, language: l }); toast('Done. Voices and replies follow your language.'); } catch (e) { set({ language }); toast(errMsg(e)); }
  };
  return (
    <ScreenFrame title="Language" onBack={onBack}>
      <p className="muted" style={{ margin: '6px 0 14px' }}>The language Saathi speaks and writes in. You can switch any time, and mix words however you like.</p>
      <div style={{ display: 'grid', gap: 10 }} role="radiogroup" aria-label="Language">
        {(Object.keys(LANG_LABEL) as Language[]).map(l => (
          <button key={l} role="radio" aria-checked={language === l} className="mode" lang={l === 'hi' ? 'hi' : 'en'} onClick={() => void pick(l)} style={language === l ? { boxShadow: '0 0 0 2.5px var(--leaf),var(--sh1)' } : undefined}>
            <span className="grow1"><b>{LANG_LABEL[l]}</b></span>{language === l && <Ic n="check" color="#2F7A49" />}
          </button>
        ))}
      </div>
      <p className="fine" style={{ marginTop: 12 }}>More languages are on the way.</p>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- about the AI
export function AboutScreen({ onBack }: { onBack: () => void }) {
  const comp = useStore(s => s.compName);
  const line = (t: string) => <li key={t}><span className="dot" style={{ background: 'var(--leaf)', width: 8, height: 8 }} /><span className="grow1">{t}</span></li>;
  return (
    <ScreenFrame title={`How ${comp} uses AI`} onBack={onBack}>
      <p className="muted" style={{ margin: '6px 0 12px' }}>{comp} is an AI companion. It is not a doctor or a therapist, and it is not for emergencies.</p>
      <div className="card">
        <b className="h3">What it does</b>
        <ul className="list" style={{ marginTop: 4 }}>{[
          'Your messages are sent to an AI service to write each reply. Voice recordings are not kept.',
          'It remembers only what you let it, and you can see, edit, hide or delete every memory.',
          'Pages marked “just for you” are never read or remembered.',
          'The garden grows from what you do. It is counted, never scored, and it never shrinks.',
        ].map(line)}</ul>
      </div>
      <div className="card">
        <b className="h3">What it never does</b>
        <ul className="list" style={{ marginTop: 4 }}>{[
          'Diagnose, treat, or tell you what medicine to take.',
          'Pretend to be a person, or keep you here with guilt or streaks.',
          'Contact anyone on your behalf. If you are in danger, it helps you reach real people.',
        ].map(line)}</ul>
      </div>
      <button className="btn line block" style={{ marginTop: 14 }} onClick={() => openSheet('support')}>Need someone now?</button>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- memory
export function MemoryScreen() {
  const memories = useStore(s => s.memories);
  const editingId = useStore(s => s.editingId);
  const editText = useStore(s => s.editText);
  const compName = useStore(s => s.compName);
  const remember = useStore(s => s.consent?.remember ?? false);
  const [confirmAll, setConfirmAll] = useState(0);
  useEffect(() => { void loadMemory(); }, []);
  const themes = [...new Set(memories.map(m => m.theme))];
  return (
    <ScreenFrame title="Memory" onBack={backToYou}>
      <div className="card" style={{ background: 'var(--leafsoft)', color: '#14352A', boxShadow: 'none', marginTop: 6 }}><p className="small">This is what lets {compName} ask how things went. It comes from your conversations, and from journal entries you chose to share.</p></div>
      <button className="sw card" role="switch" aria-checked={remember} onClick={() => void updateConsent({ remember: !remember })} style={{ marginTop: 12 }}>
        <span><b>Remember things from our chats</b><span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>Off means nothing new is saved. Safety checks still run.</span></span><i />
      </button>
      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">What {compName} remembers</h2>
        <p className="muted small" style={{ marginBottom: 6 }}>Edit, hide or delete anything. Hidden items stay here but {compName} won’t use them.</p>
        {themes.map(th => (
          <div key={th} style={{ paddingTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><h3 className="eyebrow">{th}</h3><button className="link" onClick={() => void forgetTheme(th)}>Forget all</button></div>
            {memories.filter(m => m.theme === th).map(m => (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'grid', gap: 6 }}>
                {editingId === m.id ? (
                  <div className="row" style={{ gap: 8 }}>
                    <input type="text" aria-label="Edit memory" maxLength={120} value={editText} onChange={e => set({ editText: e.target.value })} />
                    <button className="btn sm" onClick={() => void saveMemoryEdit()}>Save</button>
                  </div>
                ) : (
                  <>
                    <span style={{ opacity: m.hidden ? .55 : 1 }}>{m.text}</span>
                    {m.hidden && <span className="fine">Hidden from {compName}</span>}
                    <div className="row wrap" style={{ gap: 16 }}>
                      <button className="link" onClick={() => set({ editingId: m.id, editText: m.text })}>Edit</button>
                      <button className="link" onClick={() => void toggleMemoryHidden(m.id)}>{m.hidden ? `Show to ${compName}` : `Hide from ${compName}`}</button>
                      <button className="link" style={{ color: 'var(--ink2)' }} onClick={() => void removeMemory(m.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
        {memories.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Nothing saved right now.</p>}
      </div>
      {memories.length > 0 && (confirmAll === 0
        ? <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setConfirmAll(1)}>Forget everything</button>
        : (
          <div className="card" style={{ marginTop: 12, display: 'grid', gap: 10, boxShadow: '0 0 0 2px #E8B04B' }}>
            <b>{confirmAll === 1 ? 'Forget everything?' : 'Really, all of it?'}</b>
            <span className="muted small">{confirmAll === 1 ? `${compName} will lose all ${memories.length} memories. Your journal stays.` : 'This can’t be undone. It’s removed for good.'}</span>
            <button className="btn block" style={{ background: 'var(--ink)', color: 'var(--bg)' }} onClick={() => { if (confirmAll === 1) setConfirmAll(2); else { void forgetAllMemories(); setConfirmAll(0); } }}>{confirmAll === 1 ? 'Yes, continue' : 'Forget everything'}</button>
            <button className="btn ghost block" onClick={() => setConfirmAll(0)}>Keep my memories</button>
          </div>
        ))}
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- privacy
const RETENTION = [{ value: 0, label: 'Don’t keep' }, { value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 36500, label: 'Until I delete' }] as const;

function Toggle({ on, tap, label, desc }: { on: boolean; tap: () => void; label: string; desc?: string }) {
  return (
    <li><button className="sw" role="switch" aria-checked={on} onClick={tap}><span><b>{label}</b>{desc && <span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{desc}</span>}</span><i /></button></li>
  );
}

export function PrivacyScreen() {
  const compName = useStore(s => s.compName);
  const memCount = useStore(s => s.memories.length);
  const priv = useStore(s => s.me?.privacy);
  const remember = useStore(s => s.consent?.remember ?? false);
  const analyticsOn = useStore(s => s.consent?.analytics ?? false);
  const retention = useStore(s => s.retention);
  useEffect(() => { void loadMemory(); }, []);
  if (!priv) return null;
  return (
    <ScreenFrame title="Privacy Center" onBack={backToYou}>
      <div className="card" style={{ background: 'var(--leafsoft)', color: '#14352A', boxShadow: 'none', marginTop: 6, display: 'grid', gap: 6 }}>
        <span><b>{compName} remembers:</b> {memCount} things.</span>
        <span><b>Stored:</b> encrypted, on our servers in India.</span>
        <span><b>Shared with:</b> no one. Your messages are processed by an AI service to write replies.</span>
      </div>
      <ul className="list card" style={{ padding: '2px 16px', marginTop: 12 }}>
        <Toggle on={priv.discreetMode} tap={() => void updatePrivacy({ discreetMode: !priv.discreetMode })} label="Discreet mode" desc="Neutral tab title. Notifications say nothing personal." />
        <Toggle on={priv.quickHide} tap={() => void updatePrivacy({ quickHide: !priv.quickHide })} label="Quick hide" desc="Triple-tap the date on Home to switch to a breathing screen." />
        <Toggle on={analyticsOn} tap={() => void updateConsent({ analytics: !analyticsOn })} label="Share how I use Saathi" desc="Which screens and buttons get used, never what you write or say." />
        <Toggle on={remember} tap={() => void updateConsent({ remember: !remember })} label="Remember conversations" desc="So I can ask how things went. Safety checks run either way." />
        <Toggle on={priv.lockScreenPreviews} tap={() => void updatePrivacy({ lockScreenPreviews: !priv.lockScreenPreviews })} label="Lock-screen previews" desc="Off means notifications only say “A quiet moment for you?”" />
      </ul>
      <div className="card" style={{ marginTop: 12 }}>
        <b>Keep conversations for</b>
        <div className="chips" role="radiogroup" aria-label="Keep conversations for" style={{ marginTop: 10 }}>
          {RETENTION.map(r => <button key={r.value} role="radio" aria-checked={retention === r.value} className="chip" onClick={() => void updatePrivacy({ transcriptRetentionDays: r.value })}>{r.label}</button>)}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Voice recordings are never kept. Summaries stay until you delete them.</p>
      </div>
      <button className="btn block" style={{ marginTop: 14 }} onClick={() => void exportMyData()}>Export my data</button>
      <button className="btn ghost block" onClick={() => openSheet('delete')}>Delete everything</button>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- reminders
export function NotifScreen() {
  const compName = useStore(s => s.compName);
  const prefs = useStore(s => s.prefs);
  const priv = useStore(s => s.me?.privacy);
  const callsOk = useStore(s => s.me?.features.calls ?? false);
  const pushState = useStore(s => s.pushState);
  useEffect(() => { void loadYou(); detectPushState(); }, []);
  if (!prefs || !priv) return <ScreenFrame title="Reminders and calls" onBack={backToYou} right={<span style={{ width: 44 }} />}><p className="muted" role="status" style={{ marginTop: 20 }}>One moment…</p></ScreenFrame>;
  const checkin = prefs.checkinTime;
  const app = priv.discreetMode ? 'Calm' : priv.lockScreenPreviews ? compName : 'Saathi';
  const body = priv.lockScreenPreviews ? 'Ready for your evening check-in? Two minutes, whenever suits.' : 'A quiet moment for you?';

  const togglePush = async () => {
    if (prefs.push) { await disablePush().catch(() => undefined); await updatePrefs({ push: false }); return; }
    const r = await enablePush().catch(() => 'unavailable' as const);
    if (r === 'on') await updatePrefs({ push: true });
    else toast(r === 'denied' ? 'Notifications are blocked in your browser settings.' : r === 'unsupported' ? 'This browser can’t show notifications.' : 'Notifications aren’t set up on this server yet.');
  };
  const toggleCalls = () => { if (!callsOk && !prefs.calls) { toast('Calls aren’t available yet.'); return; } void updatePrefs({ calls: !prefs.calls }); };

  return (
    <ScreenFrame title="Reminders and calls" onBack={backToYou}>
      <p className="muted small" style={{ margin: '6px 0 8px' }}>What your lock screen shows</p>
      <div style={{ borderRadius: 24, padding: 14, background: 'linear-gradient(180deg,#4A4682,#A79FD6)' }}>
        <div style={{ borderRadius: 18, background: 'rgba(246,244,251,.88)', padding: 12, display: 'flex', gap: 12, color: '#1F2A44' }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 9, background: priv.discreetMode ? '#C9CCD6' : 'var(--indigo)', flex: 'none', display: 'grid', placeItems: 'center' }}><span style={{ width: 14, height: 14, borderRadius: '50%', background: priv.discreetMode ? '#fff' : '#F6C9A4' }} /></span>
          <div className="grow1"><div className="row" style={{ justifyContent: 'space-between' }}><b className="small">{app}</b><span className="fine">now</span></div><div className="small">{body}</div></div>
        </div>
      </div>
      <ul className="list card" style={{ padding: '2px 16px', marginTop: 12 }}>
        <Toggle on={prefs.quietCards} tap={() => void updatePrefs({ quietCards: !prefs.quietCards })} label="Quiet cards in the app" desc="A soft card on Home. Nothing buzzes." />
        <Toggle on={prefs.push && pushState === 'on'} tap={() => void togglePush()} label="Gentle notifications" desc="Two a day at most." />
        <Toggle on={prefs.calls} tap={toggleCalls} label={`Calls from ${compName}`} desc={callsOk ? 'For your check-in, if you’d like. One a day at most.' : 'Not available yet.'} />
        <Toggle on={prefs.sundayLetter} tap={() => void updatePrefs({ sundayLetter: !prefs.sundayLetter })} label="Sunday letter" desc="A short note about your week, Sunday evening." />
        <Toggle on={prefs.followUpAfterHardDay} tap={() => void updatePrefs({ followUpAfterHardDay: !prefs.followUpAfterHardDay })} label="Check on me after a hard day" desc="One gentle message the next morning, even in quiet hours." />
        <Toggle on={priv.lockScreenPreviews} tap={() => void updatePrivacy({ lockScreenPreviews: !priv.lockScreenPreviews })} label="Lock-screen previews" desc="Off means it only ever says “A quiet moment for you?”" />
        <Toggle on={priv.discreetMode} tap={() => void updatePrivacy({ discreetMode: !priv.discreetMode })} label="Discreet mode" desc="Shows as “Calm” with a plain icon." />
      </ul>
      <div className="card" style={{ marginTop: 12 }}>
        <b>Daily check-in</b>
        <div className="chips" role="radiogroup" aria-label="Daily check-in" style={{ marginTop: 10 }}>
          {(['morning', 'evening', 'off'] as const).map(v => <button key={v} role="radio" aria-checked={checkin === v} className="chip" onClick={() => void updatePrefs({ checkinTime: v })}>{CHECKIN_LABEL[v]}</button>)}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>{checkin === 'off' ? 'No daily check-in. You can still talk any time.' : `Around ${checkin === 'morning' ? '9 a.m.' : '9 p.m.'}. A short conversation, never a form. Miss one and I won’t mention it.`}</p>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b>Quiet hours</b><span className="muted">{clock12(prefs.quietHours.start)} – {clock12(prefs.quietHours.end)}</span></div>
        <p className="muted small" style={{ marginTop: 6 }}>Nothing arrives then, unless you’ve asked me to check on you after a hard day.</p>
      </div>
      <div className="card" style={{ marginTop: 12, background: 'var(--leafsoft)', color: '#14352A', boxShadow: 'none' }}>
        <h2 className="h2">What I’ll always do</h2>
        <ul style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {['Two messages a day at most, and one call.', 'If you don’t reply, I slow down. After a quiet week, I pause until you’re back.', 'No guilt, no streaks, no “you haven’t talked to me in days”.', 'Nothing personal on your lock screen unless you turn it on.'].map(t => <li key={t} className="row small" style={{ alignItems: 'baseline', gap: 10 }}><span className="dot" style={{ width: 6, height: 6, background: '#2F7A49' }} /><span>{t}</span></li>)}
        </ul>
      </div>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- avatar and voice
const MODES: AvatarMode[] = ['idle', 'listening', 'thinking', 'concerned', 'smiling'];

export function StudioScreen() {
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const mode = useStore(s => s.studioMode);
  const speakingNow = useStore(s => s.speakingNow);
  const language = useStore(s => s.language);
  const comp = useStore(s => s.compName);
  return (
    <ScreenFrame title="Your companion" onBack={() => { stopSpeech(); backToYou(); }}>
      <div style={{ margin: '6px auto 0', width: 240, height: 280, borderRadius: '120px 120px 40px 40px', background: 'radial-gradient(circle at 50% 38%,rgba(255,255,255,.9),rgba(255,255,255,.4))', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', boxShadow: 'var(--sh2)' }}>
        <Companion look={look} size={look === 'orb' ? 190 : 240} mode={speakingNow ? 'speaking' : mode} />
      </div>
      <div role="status" className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>{comp} · {lookName(look)} · {voiceLabel(voice)} voice</div>
      <div className="chips" role="group" aria-label="Expression preview" style={{ justifyContent: 'center', marginTop: 10 }}>
        {MODES.map(m => <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => set({ studioMode: m })}>{m[0].toUpperCase() + m.slice(1)}</button>)}
      </div>
      <label className="f" style={{ marginTop: 18 }}>Avatar</label>
      <div role="radiogroup" aria-label="Avatar" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
        {LOOK_OPTIONS.map(o => (
          <button key={o.id} type="button" role="radio" aria-checked={look === o.id} onClick={() => void updateCompanion({ look: o.id })} style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
            <span style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg2)', display: 'grid', placeItems: 'center', boxShadow: look === o.id ? '0 0 0 3px var(--leaf)' : 'none' }}><Companion look={o.id} size={o.id === 'orb' ? 42 : 58} /></span>
            <span className="small">{o.label}</span>
          </button>
        ))}
      </div>
      <label className="f" style={{ marginTop: 18 }}>Voice</label>
      <VoicePicker value={voice} onPick={v => { if (v !== voice) void updateCompanion({ voice: v }); }} />
      <p className="fine" style={{ marginTop: 8 }}>Voices follow your language ({LANG_LABEL[language]}). Change it in You, under Language, and the list updates. The characters are stylised on purpose: warm, never a photo.</p>
    </ScreenFrame>
  );
}
