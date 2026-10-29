import { useEffect, useState } from 'react';
import { api, type ConsentUpdate } from '../api';
import { Companion, LOOK_OPTIONS } from '../components/figures';
import { GoogleG, useGoogleSignIn } from '../components/GoogleButton';
import { YOUTH_HELPLINES } from '../data/helplines';
import { stopSpeech } from '../audio/speech';
import { finishOnboarding, go, sendCode, toast, updateCompanion, verifyCode } from '../state/actions';
import { set, useStore, type Language } from '../state/store';
import { Bird } from './Bird';
import { Ic } from './icons';
import { VoicePicker } from './VoicePicker';
import { setV2 } from './ui';

// Sign-up in the new design. The steps are the same ones the app has always had (welcome, age, language and name, phone or
// Google, companion, consent), arranged so each screen says what it is for and what happens next.

const STEPS = 6;
function Frame({ step, back, foot, children }: { step: number; back?: () => void; foot: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="onb" style={{ position: 'absolute' }}>
      <div className="top">
        {back ? <button className="backbtn" onClick={back}><Ic n="back" />Back</button> : <span style={{ width: 44 }} />}
        <div className="dots" aria-hidden="true">{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <span className="fine" style={{ width: 60, textAlign: 'right' }}>{step + 1} of {STEPS}</span>
      </div>
      <div className="body"><div className="page">{children}</div></div>
      <div className="foot2">{foot}</div>
    </div>
  );
}

export function WelcomeV2() {
  return (
    <div className="onb" style={{ position: 'absolute' }}>
      <div className="top"><span style={{ width: 44 }} /></div>
      <div className="body">
        <div className="page" style={{ justifyContent: 'center' }}>
          <div className="art"><div style={{ position: 'relative', width: 260, height: 230, display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#FFF2C9,#FFE0A8 60%,#FFD08A)', opacity: .85 }} />
            <div style={{ position: 'absolute', bottom: 18, width: 210, height: 44, borderRadius: '50%', background: 'radial-gradient(#9AD27C,#74BB5F)' }} />
            <div style={{ position: 'relative', width: 170, height: 170, marginTop: 10 }}><Bird size={170} /></div>
          </div></div>
          <h1 className="h1" style={{ fontSize: 34, textAlign: 'center', marginTop: 6 }}>Hi, I’m Saathi.</h1>
          <p className="muted" style={{ textAlign: 'center', fontSize: 17, margin: '12px auto 0', maxWidth: 300 }}>A calm place to talk, write and breathe. Whenever you need it, at any hour.</p>
        </div>
      </div>
      <div className="foot2">
        <button className="btn block" onClick={() => { set({ returning: false }); go('intro'); }}>Get started</button>
        <button className="btn ghost block" onClick={() => { set({ returning: true }); go('age'); }}>I already have an account</button>
        <p className="fine" style={{ textAlign: 'center' }}>For adults 18 and over. Takes about a minute.</p>
      </div>
    </div>
  );
}

const HOW: { i: 'mic' | 'pen' | 'lotus' | 'leaf'; bg: string; t: string; d: string }[] = [
  { i: 'mic', bg: '#D9DEFA', t: 'Talk', d: 'Say what’s on your mind. Saathi listens, day or night.' },
  { i: 'pen', bg: '#FADCE3', t: 'Write', d: 'A private journal. Type it or speak it.' },
  { i: 'lotus', bg: '#D3ECF5', t: 'Calm', d: 'Breathing, meditation and sleep stories.' },
  { i: 'leaf', bg: '#DDF0DC', t: 'Your garden', d: 'Everything you do grows a little garden. It never wilts.' },
];

export function IntroV2() {
  return (
    <Frame step={1} back={() => go('welcome')} foot={<button className="btn block" onClick={() => go('age')}>Next</button>}>
      <h1 className="h1" style={{ marginTop: 12 }}>Here’s how Saathi helps</h1>
      <div className="how stg">
        {HOW.map(x => (
          <div key={x.t}><span className="ico" style={{ background: x.bg, width: 50, height: 50, borderRadius: 16 }}><Ic n={x.i} /></span><div><b className="h3" style={{ display: 'block' }}>{x.t}</b><span className="muted small">{x.d}</span></div></div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 16 }}><b>Saathi is an AI companion, not a doctor or therapist.</b> If you’re ever in danger, it will help you reach real people.</p>
    </Frame>
  );
}

const LANGS: { label: string; value: Language }[] = [{ label: 'English', value: 'en' }, { label: 'Hinglish', value: 'hinglish' }, { label: 'हिन्दी', value: 'hi' }];

/** Nickname, language and the age check, in one place. For someone coming back, only the age check. */
export function AboutV2() {
  const s = { nick: useStore(x => x.nick), language: useStore(x => x.language), age18: useStore(x => x.age18), returning: useStore(x => x.returning) };
  const ok = s.age18 && (s.returning || s.nick.trim().length > 0);
  return (
    <Frame step={2} back={() => go(s.returning ? 'welcome' : 'intro')} foot={<>
      <button className="btn block" disabled={!ok} onClick={() => go('name')}>Next</button>
      <button className="btn ghost block" onClick={() => { set({ age18: false }); go('under'); }}>I’m under 18</button>
    </>}>
      <h1 className="h1" style={{ marginTop: 12 }}>{s.returning ? 'Welcome back' : 'What should we call you?'}</h1>
      {!s.returning && <>
        <p className="muted" style={{ margin: '6px 0 18px' }}>A first name or a nickname is fine.</p>
        <label className="f" htmlFor="v2nick">Your name</label>
        <input type="text" id="v2nick" value={s.nick} maxLength={24} autoComplete="nickname" placeholder="For example, Meera" onChange={e => set({ nick: e.target.value })} />
        <label className="f" style={{ marginTop: 20 }}>Language</label>
        <div className="chips" role="radiogroup" aria-label="Language">
          {LANGS.map(l => <button key={l.value} role="radio" aria-checked={s.language === l.value} className="chip" lang={l.value === 'hi' ? 'hi' : 'en'} onClick={() => set({ language: l.value })}>{l.label}</button>)}
        </div>
        <p className="fine" style={{ marginTop: 8 }}>More languages are on the way.</p>
      </>}
      <button className="check" role="checkbox" aria-checked={s.age18} onClick={() => set({ age18: !s.age18 })} style={{ marginTop: 22 }}><i><Ic n="check" /></i><span>I am 18 or older.</span></button>
    </Frame>
  );
}

export function UnderV2() {
  return (
    <Frame step={2} back={() => go('welcome')} foot={<button className="btn soft block" onClick={() => go('welcome')}>Back</button>}>
      <h1 className="h1" style={{ marginTop: 12, fontSize: 25 }}>Thank you for being honest. You deserve support too.</h1>
      <p className="muted" style={{ margin: '10px 0 16px' }}>Saathi isn’t built for under-18s yet, so we won’t create an account, and nothing is stored. Talking to an adult you trust, like a family member or teacher, can really help.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {YOUTH_HELPLINES.map(h => (
          <div key={h.id} className="card row" style={{ gap: 12, background: '#FFF1D6' }}>
            <div className="grow1"><b>{h.name} · {h.num}</b><div className="muted small">{h.desc}</div></div>
            <a className="btn sm indigo" href={`tel:${h.tel}`}><Ic n="phone" />Call</a>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Phone number and Google. Both lead to the same account. */
export function SignInV2() {
  const s = { phone: useStore(x => x.phone), returning: useStore(x => x.returning), busy: useStore(x => x.authBusy), err: useStore(x => x.authError), cfg: useStore(x => x.cfg) };
  return (
    <Frame step={3} back={() => go('age')} foot={<button className="btn block" form="v2phone" type="submit" disabled={s.busy || (!!s.cfg && !s.cfg.otp)}>{s.busy ? 'Sending…' : 'Send me a code'}</button>}>
      <h1 className="h1" style={{ marginTop: 12 }}>{s.returning ? 'What’s your mobile number?' : 'Save your garden with your number'}</h1>
      <p className="muted" style={{ margin: '6px 0 18px' }}>I’ll send a 6-digit code. Your number is stored encrypted and used only to sign you in.</p>
      <form id="v2phone" onSubmit={e => { e.preventDefault(); void sendCode(); }}>
        <label className="f" htmlFor="v2phone-in">Mobile number</label>
        <input type="text" id="v2phone-in" value={s.phone} inputMode="tel" autoComplete="tel" placeholder="98765 43210" onChange={e => set({ phone: e.target.value, authError: null })} />
      </form>
      {s.err && <div role="alert" className="err">{s.err}</div>}
      {s.cfg && !s.cfg.otp && <div role="status" className="note">Sign-in by phone isn’t switched on yet. Please check back soon.</div>}
      {s.cfg === null && <div role="status" className="note">I can’t reach Saathi right now. Check your internet.</div>}
      {s.cfg?.google && s.cfg.googleClientId && <>
        <div className="row" aria-hidden="true" style={{ gap: 12, margin: '22px 0 14px', color: 'var(--ink2)', fontSize: 13 }}><span style={{ flex: 1, height: 1, background: 'var(--line)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>
        <GoogleV2 clientId={s.cfg.googleClientId} />
      </>}
    </Frame>
  );
}

function GoogleV2({ clientId }: { clientId: string }) {
  const g = useGoogleSignIn(clientId);
  return (
    <div>
      <div style={{ position: 'relative', height: 54, borderRadius: 27, overflow: 'hidden' }}>
        <div aria-hidden="true" className="btn line" style={{ position: 'absolute', inset: 0, gap: 12, background: 'var(--card)', opacity: g.state === 'ready' ? 1 : .6 }}><GoogleG /> Continue with Google</div>
        <div ref={g.overlay} style={{ position: 'absolute', inset: 0, opacity: .01, transform: `scaleY(${54 / 40})`, transformOrigin: 'top', display: 'flex', justifyContent: 'center', pointerEvents: g.stuck ? 'none' : 'auto' }} />
        {g.stuck && <button type="button" aria-label="Continue with Google" onClick={g.tappedWhileStuck} style={{ position: 'absolute', inset: 0 }} />}
      </div>
      {g.message && <div role="status" className="note">{g.message}</div>}
    </div>
  );
}

export function OtpV2() {
  const s = { phone: useStore(x => x.phone), code: useStore(x => x.otpCode), busy: useStore(x => x.authBusy), err: useStore(x => x.authError), dev: useStore(x => x.devCode) };
  const [wait, setWait] = useState(30);
  useEffect(() => { setWait(30); const id = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000); return () => clearInterval(id); }, [s.dev]);
  return (
    <Frame step={3} back={() => go('name')} foot={<button className="btn block" form="v2otp" type="submit" disabled={s.busy}>{s.busy ? 'Checking…' : 'Continue'}</button>}>
      <h1 className="h1" style={{ marginTop: 12 }}>Enter your code</h1>
      <p className="muted" style={{ margin: '6px 0 18px' }}>Sent to {s.phone}.</p>
      <form id="v2otp" onSubmit={e => { e.preventDefault(); void verifyCode(); }}>
        <label className="f" htmlFor="v2otp-in">6-digit code</label>
        <input type="text" id="v2otp-in" value={s.code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="••••••" onChange={e => set({ otpCode: e.target.value.replace(/\D/g, '').slice(0, 6), authError: null })} style={{ letterSpacing: '.4em', textAlign: 'center', fontSize: 26 }} />
      </form>
      {s.dev && <p role="status" className="fine" style={{ marginTop: 10 }}>Development build: your code is <b>{s.dev}</b>.</p>}
      {s.err && <div role="alert" className="err">{s.err}</div>}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <button className="link" onClick={() => go('name')}>Change number</button>
        <button className="link" disabled={wait > 0} style={{ opacity: wait ? .5 : 1 }} onClick={() => void sendCode()}>{wait ? `Resend in ${wait}s` : 'Resend code'}</button>
      </div>
    </Frame>
  );
}

/** Who Saathi is: name, look and voice. */
export function CompanionV2() {
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const compName = useStore(s => s.compName);
  const [name, setName] = useState(compName);
  return (
    <Frame step={4} foot={<button className="btn block" onClick={() => { stopSpeech(); void updateCompanion({ name: name.trim() || 'Saathi', look, voice }); go('consent'); }}>Next</button>}>
      <h1 className="h1" style={{ marginTop: 12 }}>Choose your companion</h1>
      <p className="muted" style={{ margin: '6px 0 14px' }}>How it looks and sounds when you talk. You can change this any time.</p>
      <label className="f">Look</label>
      <div role="radiogroup" aria-label="Look" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
        {LOOK_OPTIONS.map(o => (
          <button key={o.id} role="radio" aria-checked={look === o.id} onClick={() => set({ look: o.id })} style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
            <span style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg2)', display: 'grid', placeItems: 'center', boxShadow: look === o.id ? '0 0 0 3px var(--leaf)' : 'none' }}><Companion look={o.id} size={o.id === 'orb' ? 42 : 58} /></span>
            <span className="small">{o.label}</span>
          </button>
        ))}
      </div>
      <label className="f" style={{ marginTop: 18 }}>Voice</label>
      <VoicePicker value={voice} onPick={v => set({ voice: v })} />
      <label className="f" htmlFor="v2cname" style={{ marginTop: 18 }}>Name</label>
      <input type="text" id="v2cname" value={name} maxLength={24} onChange={e => setName(e.target.value)} />
    </Frame>
  );
}

type Draft = Required<Pick<ConsentUpdate, 'remember' | 'notifications' | 'healthData' | 'analytics'>> & { location: 'off' | 'city' };
const CONSENTS: { k: 'remember' | 'notifications' | 'city' | 'analytics'; label: string; desc: string }[] = [
  { k: 'remember', label: 'Remember things from our chats', desc: 'So I can ask how things went. You can see, edit and delete everything.' },
  { k: 'notifications', label: 'Notifications and check-ins', desc: 'Gentle, private, never more than twice a day.' },
  { k: 'city', label: 'Your city', desc: 'To suggest small things nearby. Never your exact location.' },
  { k: 'analytics', label: 'Share how I use Saathi', desc: 'Which screens get used, never what you write or say.' },
];
const CHECKIN: { v: 'morning' | 'evening' | 'off'; label: string }[] = [{ v: 'morning', label: 'Morning' }, { v: 'evening', label: 'Evening' }, { v: 'off', label: 'No check-ins' }];

/** What Saathi is, what it will and won't do, and what the person is okay with. Nothing is switched on for them. */
export function ConsentV2() {
  const [ai, setAi] = useState(false);
  const [priv, setPriv] = useState(false);
  const [d, setD] = useState<Draft>({ remember: false, notifications: false, healthData: false, analytics: false, location: 'off' });
  const [time, setTime] = useState<'morning' | 'evening' | 'off'>('evening');
  const [busy, setBusy] = useState(false);
  const on = (k: typeof CONSENTS[number]['k']) => (k === 'city' ? d.location === 'city' : d[k]);
  const flip = (k: typeof CONSENTS[number]['k']) => setD(p => (k === 'city' ? { ...p, location: p.location === 'city' ? 'off' : 'city' } : { ...p, [k]: !p[k] }));
  const go1 = async () => {
    setBusy(true);
    const ok = await finishOnboarding({ remember: d.remember, notifications: d.notifications, healthData: d.healthData, analytics: d.analytics, location: d.location });
    if (ok) {
      await api.putPrefs({ checkinTime: time }).catch(() => undefined);
      setV2({ seed: true });
    } else toast('I couldn’t save that. Please try again.');
    setBusy(false);
  };
  return (
    <Frame step={5} back={() => go('companion')} foot={<button className="btn block" disabled={!(ai && priv) || busy} onClick={() => void go1()}>{busy ? 'One moment…' : 'I understand'}</button>}>
      <h1 className="h1" style={{ marginTop: 12 }}>Before we begin</h1>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Two things worth knowing, then what you’re okay with.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <button className="check" role="checkbox" aria-checked={ai} onClick={() => setAi(!ai)}><i><Ic n="check" /></i><span><b>Saathi is an AI companion.</b><br /><span className="muted small">Not a doctor or a therapist, and not for emergencies. If you are in danger, the Help button is on every screen.</span></span></button>
        <button className="check" role="checkbox" aria-checked={priv} onClick={() => setPriv(!priv)}><i><Ic n="check" /></i><span><b>Your words stay private.</b><br /><span className="muted small">Encrypted, readable only by you, and you can delete everything any time.</span></span></button>
      </div>
      <h2 className="h3" style={{ margin: '22px 0 8px' }}>What you’re okay with</h2>
      <p className="fine" style={{ marginBottom: 10 }}>Nothing is switched on for you. Change any of these later in You.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {CONSENTS.map(c => (
          <button key={c.k} className="sw card" role="switch" aria-checked={on(c.k)} onClick={() => flip(c.k)} style={{ padding: '12px 14px', borderRadius: 18 }}>
            <span><b>{c.label}</b><span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{c.desc}</span></span><i />
          </button>
        ))}
      </div>
      <label className="f" style={{ marginTop: 18 }}>When should I check on you?</label>
      <div className="chips" role="radiogroup" aria-label="Check-in time">
        {CHECKIN.map(c => <button key={c.v} className="chip" role="radio" aria-checked={time === c.v} onClick={() => setTime(c.v)}>{c.label}</button>)}
      </div>
      <p className="fine" style={{ marginTop: 8 }}>One small hello a day at most, and quiet at night. This only happens if you switch on notifications above.</p>
    </Frame>
  );
}
