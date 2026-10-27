import { useEffect, useState } from 'react';
import { C, serif, ring, shadow } from '../theme';
import { useStore, set } from '../state/store';
import { finishOnboarding, go, sendCode, startCall, toast, updateCompanion, verifyCode } from '../state/actions';
import { say, stopSpeech } from '../audio/speech';
import { Companion, LOOK_OPTIONS, Orb } from '../components/figures';
import { GoogleButton } from '../components/GoogleButton';
import { Body, Card, CallLink, PrimaryButton, Screen, TextButton, Title, ToggleRow, flex, onbPad } from '../components/ui';
import { YOUTH_HELPLINES } from '../data/helplines';
import type { ConsentUpdate } from '../api';

export function Welcome() {
  return (
    <Screen bg="linear-gradient(180deg,#F7D6C2 0%,#FAE6D6 40%,#FBF7F0 78%)" style={{ padding: onbPad }}>
      <div style={{ ...flex('row'), justifyContent: 'center', padding: '40px 0' }}><Orb size={150} /></div>
      <Title style={{ marginTop: 24 }}>Saathi</Title>
      <div style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.25, color: C.muted, marginTop: 6 }}>A place to talk, any time.</div>
      <div style={{ marginTop: 'auto', ...flex('column', 8) }}>
        <PrimaryButton onClick={() => { set({ returning: false }); go('intro'); }}>Get started</PrimaryButton>
        <TextButton onClick={() => { set({ returning: true }); go('age'); }}>I already have an account</TextButton>
      </div>
    </Screen>
  );
}

export function Intro() {
  return (
    <Screen style={{ padding: onbPad }}>
      <div style={{ fontSize: 15, color: C.muted }}>Before we begin</div>
      <Title size={28} style={{ marginTop: 16, lineHeight: 1.3 }}>Saathi is an AI companion, not a therapist or a doctor.</Title>
      <Body style={{ marginTop: 20 }}>It’s here to listen and to help you look after yourself. If you’re ever in danger, Saathi will help you reach real people.</Body>
      <Body style={{ marginTop: 12 }}>You decide what it remembers.</Body>
      <div style={{ marginTop: 'auto' }}><PrimaryButton onClick={() => go('age')} style={{ width: '100%' }}>I understand</PrimaryButton></div>
    </Screen>
  );
}

export function Age() {
  const returning = useStore(s => s.returning);
  return (
    <Screen style={{ padding: onbPad }}>
      <Title>Are you 18 or older?</Title>
      <Body style={{ marginTop: 16 }}>Saathi is for adults for now.</Body>
      <div style={{ marginTop: 'auto', ...flex('column', 8) }}>
        <PrimaryButton onClick={() => { set({ age18: true }); go(returning ? 'name' : 'lang'); }}>Yes, I am</PrimaryButton>
        <TextButton onClick={() => { set({ age18: false }); go('under'); }}>No, I’m younger</TextButton>
      </div>
    </Screen>
  );
}

// No account is created and nothing is stored on this path (PRD 8.1). The numbers are built in so they work offline.
export function Under() {
  return (
    <Screen style={{ padding: onbPad, gap: 16 }}>
      <Title size={28} style={{ lineHeight: 1.3 }}>Thank you for being honest. You deserve support too.</Title>
      <Body>Saathi isn’t built for under-18s yet, so we won’t create an account. Talking to an adult you trust, like a family member or teacher, can really help.</Body>
      <div style={{ ...flex('column', 10), marginTop: 8 }}>
        {YOUTH_HELPLINES.map(h => (
          <div key={h.id} style={{ background: C.amber, border: `1px solid ${C.amberLine}`, borderRadius: 28, padding: 20, ...flex('row', 12), alignItems: 'center' }}>
            <div style={{ flex: 1, ...flex('column', 6) }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{h.name} · {h.num}</div>
              <div style={{ fontSize: 15, color: C.muted }}>{h.desc}</div>
            </div>
            <CallLink tel={h.tel} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>Call</CallLink>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto' }}><TextButton onClick={() => go('welcome')} style={{ width: '100%' }}>Back</TextButton></div>
    </Screen>
  );
}

// The app understands these three today (PRD 8.1). More languages need translated copy and model evaluation first.
const LANGS: { label: string; value: 'en' | 'hinglish' | 'hi' }[] = [{ label: 'English', value: 'en' }, { label: 'Hinglish', value: 'hinglish' }, { label: 'हिन्दी', value: 'hi' }];

export function Language() {
  const language = useStore(s => s.language);
  return (
    <Screen style={{ padding: onbPad }}>
      <Title>Which language feels like home?</Title>
      <Body style={{ marginTop: 12 }}>Hinglish is Hindi and English mixed, the way you talk. You can change this any time.</Body>
      <div role="radiogroup" aria-label="Language" style={{ ...flex('row', 10), flexWrap: 'wrap', marginTop: 28 }}>
        {LANGS.map(l => {
          const on = language === l.value;
          return <button key={l.value} role="radio" aria-checked={on} onClick={() => set({ language: l.value })} lang={l.value === 'hi' ? 'hi' : 'en'}
            style={{ height: 52, padding: '0 20px', borderRadius: 26, fontSize: 17, border: `1.5px solid ${on ? C.teal : 'transparent'}`, background: on ? C.tealSoft : C.sand }}>{l.label}</button>;
        })}
      </div>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 20 }}>More languages are on the way.</div>
      <div style={{ marginTop: 'auto' }}><PrimaryButton onClick={() => go('name')} style={{ width: '100%' }}>Continue</PrimaryButton></div>
    </Screen>
  );
}

const field = { height: 56, borderRadius: 20, border: 'none', background: C.sand, padding: '0 20px', fontSize: 22, outline: 'none' } as const;

export function NameScreen() {
  const s = { nick: useStore(x => x.nick), phone: useStore(x => x.phone), returning: useStore(x => x.returning), busy: useStore(x => x.authBusy), err: useStore(x => x.authError), cfg: useStore(x => x.cfg) };
  return (
    <Screen style={{ padding: onbPad, overflow: 'auto' }}>
      <form onSubmit={e => { e.preventDefault(); void sendCode(); }} style={{ ...flex('column'), flex: 1 }}>
        {!s.returning && (
          <>
            <Title><label htmlFor="nick">What should I call you?</label></Title>
            <div style={{ fontSize: 17, color: C.muted, marginTop: 12 }}>A nickname is fine.</div>
            <input id="nick" value={s.nick} maxLength={24} autoComplete="nickname" onChange={e => set({ nick: e.target.value })} style={{ ...field, marginTop: 20 }} />
          </>
        )}
        <Title size={s.returning ? 34 : 22} style={{ marginTop: s.returning ? 0 : 32 }}><label htmlFor="phone">{s.returning ? 'Welcome back. What’s your mobile number?' : 'Your mobile number'}</label></Title>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>I’ll send a 6-digit code. Your number is stored encrypted and used only to sign you in.</div>
        <input id="phone" value={s.phone} inputMode="tel" autoComplete="tel" placeholder="98765 43210" onChange={e => set({ phone: e.target.value })} style={{ ...field, marginTop: 14 }} />
        {s.err && <div role="alert" style={{ fontSize: 15, color: '#8A2D1A', marginTop: 12, lineHeight: 1.4 }}>{s.err}</div>}
        {s.cfg && !s.cfg.otp && <div role="status" style={{ fontSize: 15, color: C.amberText, background: C.amber, borderRadius: 16, padding: '12px 14px', marginTop: 12, lineHeight: 1.4 }}>Sign-in by phone isn’t switched on yet. Please check back soon.</div>}
        {s.cfg === null && <div role="status" style={{ fontSize: 15, color: C.amberText, background: C.amber, borderRadius: 16, padding: '12px 14px', marginTop: 12 }}>I can’t reach Saathi right now. Check your internet.</div>}
        {s.cfg?.google && s.cfg.googleClientId && (
          <div style={{ ...flex('column', 10), marginTop: 20 }}>
            <div style={{ textAlign: 'center', fontSize: 13, color: C.muted }}>or</div>
            <GoogleButton clientId={s.cfg.googleClientId} />
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <PrimaryButton type="submit" disabled={s.busy || (!!s.cfg && !s.cfg.otp)} style={{ width: '100%', opacity: s.busy ? 0.7 : 1 }}>{s.busy ? 'Sending…' : 'Send me a code'}</PrimaryButton>
        </div>
      </form>
    </Screen>
  );
}

export function OtpScreen() {
  const s = { phone: useStore(x => x.phone), code: useStore(x => x.otpCode), busy: useStore(x => x.authBusy), err: useStore(x => x.authError), dev: useStore(x => x.devCode) };
  const [wait, setWait] = useState(30);
  useEffect(() => { setWait(30); const id = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000); return () => clearInterval(id); }, [s.dev]);
  return (
    <Screen style={{ padding: onbPad, overflow: 'auto' }}>
      <form onSubmit={e => { e.preventDefault(); void verifyCode(); }} style={{ ...flex('column'), flex: 1 }}>
        <Title><label htmlFor="otp">Enter your code</label></Title>
        <div style={{ fontSize: 17, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>Sent to {s.phone}.</div>
        <input id="otp" value={s.code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="••••••" onChange={e => set({ otpCode: e.target.value.replace(/\D/g, '').slice(0, 6), authError: null })}
          style={{ ...field, marginTop: 20, letterSpacing: '0.4em', textAlign: 'center', fontSize: 28 }} />
        {s.dev && <div role="status" style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>Development build: your code is <strong>{s.dev}</strong>.</div>}
        {s.err && <div role="alert" style={{ fontSize: 15, color: '#8A2D1A', marginTop: 12, lineHeight: 1.4 }}>{s.err}</div>}
        <div style={{ ...flex('row'), justifyContent: 'space-between', marginTop: 8 }}>
          <TextButton onClick={() => go('name')} style={{ fontSize: 15 }}>Change number</TextButton>
          <TextButton onClick={() => void sendCode()} style={{ fontSize: 15, opacity: wait ? 0.5 : 1 }}>{wait ? `Resend in ${wait}s` : 'Resend code'}</TextButton>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <PrimaryButton type="submit" style={{ width: '100%', opacity: s.busy ? 0.7 : 1 }}>{s.busy ? 'Checking…' : 'Continue'}</PrimaryButton>
        </div>
      </form>
    </Screen>
  );
}

const VOICES = [{ id: 'warm' as const, label: 'Warm' }, { id: 'steady' as const, label: 'Steady' }, { id: 'bright' as const, label: 'Bright' }];

export function CompanionPicker() {
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const previewing = useStore(s => s.previewing);
  const speakingNow = useStore(s => s.speakingNow);
  const compName = useStore(s => s.compName);
  const nick = useStore(s => s.nick);
  const [name, setName] = useState(compName);

  const preview = (k: typeof VOICES[number]['id']) => {
    if (previewing === k && speakingNow) { stopSpeech(); return; }
    set({ previewing: k, voice: k });
    say(`Hi ${nick}. I’m ${name || 'Saathi'}. I’m here whenever you want to talk.`, { persona: k }, () => set({ previewing: null }), () => toast('This browser can’t play voices.'));
  };

  return (
    <Screen style={{ padding: `calc(var(--sa-top) + 76px) 24px calc(var(--sa-bottom) + 32px)` }}>
      <div data-scroll="1" style={{ ...flex('column'), flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Title size={28} style={{ lineHeight: 1.2 }}>Choose your companion</Title>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 20, marginBottom: 12 }}>Look</div>
        <div role="radiogroup" aria-label="Look" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
          {LOOK_OPTIONS.map(o => (
            <button key={o.id} role="radio" aria-checked={look === o.id} onClick={() => set({ look: o.id })} style={{ background: 'none', border: 'none', padding: 0, ...flex('column', 6), alignItems: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', boxShadow: look === o.id ? ring : 'none', overflow: 'hidden', background: C.sand, display: 'grid', placeItems: 'center' }}>
                <Companion look={o.id} size={o.id === 'orb' ? 44 : 60} />
              </div>
              <span style={{ fontSize: 15 }}>{o.label}</span>
            </button>
          ))}
        </div>
        <div id="voice-label" style={{ fontSize: 15, color: C.muted, marginTop: 24, marginBottom: 10 }}>Voice</div>
        <div role="radiogroup" aria-labelledby="voice-label" style={flex('column', 8)}>
          {VOICES.map(v => {
            const on = voice === v.id;
            return (
              <div key={v.id} style={{ ...flex('row', 4), alignItems: 'center', padding: '4px 10px 4px 0', borderRadius: 24, border: `1.5px solid ${on ? C.teal : 'transparent'}`, background: on ? C.tealSoft : C.white }}>
                <button role="radio" aria-checked={on} onClick={() => set({ voice: v.id })} style={{ flex: 1, height: 52, textAlign: 'left', padding: '0 0 0 20px', border: 'none', background: 'none', fontSize: 17, fontWeight: 600 }}>{v.label}</button>
                <button onClick={() => preview(v.id)} style={{ flex: 'none', height: 44, padding: '0 16px', borderRadius: 22, border: 'none', background: C.sand, fontSize: 15, color: C.tealDark, fontWeight: 600 }}>
                  {previewing === v.id && speakingNow ? 'Stop' : 'Preview'}
                </button>
              </div>
            );
          })}
        </div>
        <label htmlFor="cname" style={{ fontSize: 15, color: C.muted, marginTop: 24, marginBottom: 10 }}>Name (you can change it any time)</label>
        <input id="cname" value={name} maxLength={24} onChange={e => setName(e.target.value)} style={{ height: 56, borderRadius: 20, border: 'none', background: C.sand, padding: '0 20px', fontSize: 17, outline: 'none' }} />
        <div style={{ marginTop: 28, flex: 'none' }}>
          <PrimaryButton onClick={() => { stopSpeech(); void updateCompanion({ name: name.trim() || 'Saathi', look, voice }); go('consent'); }} style={{ width: '100%' }}>Continue</PrimaryButton>
        </div>
      </div>
    </Screen>
  );
}

type Draft = Required<Pick<ConsentUpdate, 'remember' | 'notifications' | 'healthData' | 'analytics'>> & { location: 'off' | 'city' };

const CONSENTS: { k: 'remember' | 'notifications' | 'healthData' | 'city' | 'analytics'; label: string; desc: string }[] = [
  { k: 'remember', label: 'Remember things from our chats', desc: 'So I can ask how things went. You can see, edit and delete everything.' },
  { k: 'notifications', label: 'Notifications and check-ins', desc: 'Gentle, private, never more than twice a day.' },
  { k: 'city', label: 'Your city', desc: 'To suggest small things nearby. Never your exact location.' },
  { k: 'analytics', label: 'Share how I use Saathi', desc: 'Which screens and buttons get used, never what you write or say. It helps us make the app better.' },
  { k: 'healthData', label: 'Sleep and steps', desc: 'From Health Connect or Apple Health. Needs the phone app, so it does nothing in a browser yet.' },
];

export function Consent() {
  const compName = useStore(s => s.compName);
  const [d, setD] = useState<Draft>({ remember: false, notifications: false, healthData: false, analytics: false, location: 'off' });
  const [busy, setBusy] = useState(false);
  const value = (k: typeof CONSENTS[number]['k']) => (k === 'city' ? d.location === 'city' : d[k]);
  const flip = (k: typeof CONSENTS[number]['k']) => setD(p => (k === 'city' ? { ...p, location: p.location === 'city' ? 'off' : 'city' } : { ...p, [k]: !p[k] }));
  return (
    <Screen style={{ padding: onbPad }}>
      <Title size={28} style={{ lineHeight: 1.2 }}>What you’re okay with</Title>
      <div style={{ fontSize: 17, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Nothing is switched on for you. Change any of these later in the Privacy Center.</div>
      <div style={{ ...flex('column', 10), marginTop: 24 }}>
        {CONSENTS.map(c => (
          <Card key={c.k} pad="16px 18px" style={{ boxShadow: shadow.lift, borderRadius: 24 }}>
            <ToggleRow on={value(c.k)} onToggle={() => flip(c.k)} label={c.label} desc={c.desc} />
          </Card>
        ))}
      </div>
      <a href="#privacy-notice" onClick={e => { e.preventDefault(); toast('The full privacy notice will live here.'); }} style={{ fontSize: 15, marginTop: 16 }}>Read the full notice in English</a>
      <div style={{ marginTop: 'auto' }}>
        <PrimaryButton disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await finishOnboarding({ remember: d.remember, notifications: d.notifications, healthData: d.healthData, analytics: d.analytics, location: d.location });
          setBusy(false);
          if (ok) await startCall('voice', true);
        }} style={{ width: '100%', opacity: busy ? 0.7 : 1 }}>Say hello to {compName}</PrimaryButton>
      </div>
    </Screen>
  );
}
