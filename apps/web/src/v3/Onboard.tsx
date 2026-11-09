import { useEffect, useState } from 'react';
import { Companion, LOOK_OPTIONS, Orb } from '../components/figures';
import { GoogleButton } from '../components/GoogleButton';
import { VoicePicker } from '../components/VoicePicker';
import { stopSpeech } from '../audio/speech';
import { YOUTH_HELPLINES } from '../data/helplines';
import { finishOnboarding, go, sendCode, toast, updateCompanion, verifyCode } from '../state/actions';
import { set, useStore } from '../state/store';
import type { ConsentUpdate } from '../api';
import { s } from './css';
import { I, Svg } from './icons';

// Sign-up as the first design lays it out (one thing per screen, big type, plenty of room), in the third design's colours.
// What changed: the explanation is one picture-led screen, language, name, number and code share a single screen, and anyone
// who already has an account is never asked their age or their language again.

const INK = 'var(--ink)', MUTED = 'var(--muted)', INDIGO = 'var(--accent)';
const page = 'position:absolute;inset:0;display:flex;flex-direction:column;overflow:auto;padding:64px 24px 32px';
const ground = 'var(--page)';

const Title = ({ children, size = 36, style }: { children: React.ReactNode; size?: number; style?: string }) => <h1 className="serif" style={s(`font-size:${size}px;line-height:1.12;margin:0;${style ?? ''}`)}>{children}</h1>;
const Body = ({ children, style }: { children: React.ReactNode; style?: string }) => <p style={s(`font-size:17px;line-height:1.5;color:${MUTED};margin:0;${style ?? ''}`)}>{children}</p>;
const Primary = ({ children, onClick, disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) =>
  <button type={type} onClick={onClick} disabled={disabled} style={s(`height:56px;border-radius:28px;border:none;background:${INDIGO};color:#FFFFFF;font-size:17px;font-weight:600;width:100%;opacity:${disabled ? 0.65 : 1}`)}>{children}</button>;
const Quiet = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button type="button" onClick={onClick} style={s(`height:48px;border:none;background:none;color:${INDIGO};font-size:17px;font-weight:600;width:100%`)}>{children}</button>;
const Back = ({ onClick }: { onClick: () => void }) => <button type="button" onClick={onClick} aria-label="Back" style={s('align-self:flex-start;width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin:-8px 0 8px -10px')}><Svg d={I.back} size={22} stroke={INK} /></button>;
const field = 'height:56px;border-radius:20px;border:none;background:var(--soft);padding:0 20px;font-size:19px;outline:none;width:100%;color:var(--ink)';

// ------------------------------------------------------------------------------------------------ welcome: what it does, in one look
const DOES: { icon: string; bg: string; title: string; line: string }[] = [
  { icon: I.chat, bg: 'var(--t1)', title: 'Talk', line: 'Say it out loud or type it. No judging, any hour.' },
  { icon: I.lotus, bg: 'var(--p-mint)', title: 'Relax', line: 'Breathing, stories and quiet games to settle down.' },
  { icon: I.pen, bg: 'var(--p-butter)', title: 'Write', line: 'A private journal that listens back.' },
  { icon: I.month, bg: 'var(--p-rose)', title: 'See your month', line: 'Notice how you’ve been looking after yourself.' },
];

export function WelcomeV3() {
  return (
    <main aria-label="Welcome" data-scroll="1" style={{ ...s(page), background: ground, padding: '56px 24px 28px' }}>
      <div style={s('display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px')}>
        <div style={s('position:relative;width:132px;height:132px;display:grid;place-items:center')}>
          <span aria-hidden="true" style={s('position:absolute;inset:-16px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.75),rgba(255,255,255,0) 70%)')} />
          <Orb size={104} />
        </div>
        <Title size={44} style="margin-top:6px">Saathi</Title>
        <div className="serif" style={s('font-size:24px;line-height:1.25;color:var(--muted)')}>A place to talk, any time.</div>
      </div>
      <div style={s('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:26px')}>
        {DOES.map((d, i) => (
          <div key={d.title} style={s(`background:var(--card);border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 26px rgba(30,36,48,.06);animation:kUp 600ms ${i * 90}ms backwards`)}>
            <span aria-hidden="true" style={s(`width:44px;height:44px;border-radius:14px;background:${d.bg};display:grid;place-items:center`)}><Svg d={d.icon} size={22} stroke={INK} /></span>
            <b style={s('font-size:17px')}>{d.title}</b>
            <span style={s(`font-size:15px;line-height:1.4;color:${MUTED}`)}>{d.line}</span>
          </div>
        ))}
      </div>
      <p style={s(`font-size:15px;line-height:1.45;color:${MUTED};margin:18px 4px 0;text-align:center`)}>Saathi is an AI companion, not a therapist or a doctor. If you’re ever in danger, it helps you reach real people.</p>
      <div style={s('margin-top:auto;padding-top:20px;display:flex;flex-direction:column;gap:6px')}>
        <Primary onClick={() => { set({ returning: false }); go('age'); }}>Get started</Primary>
        <Quiet onClick={() => { set({ returning: true, age18: false }); go('name'); }}>I already have an account</Quiet>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------------------------------------ age (new people only)
export function AgeV3() {
  return (
    <main aria-label="Age" style={{ ...s(page), background: ground }}>
      <Back onClick={() => go('welcome')} />
      <Title>Are you 18 or older?</Title>
      <Body style="margin-top:14px">Saathi is for adults for now.</Body>
      <div style={s('margin-top:auto;display:flex;flex-direction:column;gap:6px')}>
        <Primary onClick={() => { set({ age18: true }); go('name'); }}>Yes, I am</Primary>
        <Quiet onClick={() => { set({ age18: false }); go('under'); }}>No, I’m younger</Quiet>
      </div>
    </main>
  );
}

// No account is made and nothing is kept on this path. The numbers are built in so they work offline.
export function UnderV3() {
  return (
    <main aria-label="Support for younger people" style={{ ...s(page), background: ground, gap: 16 }}>
      <Title size={32}>Thank you for being honest. You deserve support too.</Title>
      <Body>Saathi isn’t built for under-18s yet, so we won’t create an account. Talking to an adult you trust, like a family member or teacher, can really help.</Body>
      <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:8px')}>
        {YOUTH_HELPLINES.map(h => (
          <div key={h.id} style={s('background:#FFF1D6;border:1px solid #E8A93A;border-radius:24px;padding:18px;display:flex;align-items:center;gap:12px')}>
            <div style={s('flex:1;display:flex;flex-direction:column;gap:4px')}><b style={s('font-size:17px')}>{h.name} · {h.num}</b><span style={s('font-size:15px;color:#5E4A26')}>{h.desc}</span></div>
            <a href={`tel:${h.tel}`} style={s('height:48px;padding:0 20px;border-radius:24px;background:var(--ink);color:#FFFFFF;font-size:15px;font-weight:600;display:inline-flex;align-items:center;text-decoration:none')}>Call</a>
          </div>
        ))}
      </div>
      <div style={s('margin-top:auto')}><Quiet onClick={() => go('welcome')}>Back</Quiet></div>
    </main>
  );
}

// ------------------------------------------------------------------------------------------------ language, name, number and code on one screen
const LANGS: { label: string; value: 'en' | 'hinglish' | 'hi' }[] = [{ label: 'English', value: 'en' }, { label: 'Hinglish', value: 'hinglish' }, { label: 'हिन्दी', value: 'hi' }];

export function SignInV3({ step }: { step: 'name' | 'otp' }) {
  const x = { nick: useStore(a => a.nick), phone: useStore(a => a.phone), code: useStore(a => a.otpCode), returning: useStore(a => a.returning), language: useStore(a => a.language), busy: useStore(a => a.authBusy), err: useStore(a => a.authError), cfg: useStore(a => a.cfg), dev: useStore(a => a.devCode) };
  const [wait, setWait] = useState(30);
  const sent = step === 'otp';
  useEffect(() => { if (!sent) return; setWait(30); const id = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000); return () => clearInterval(id); }, [sent, x.dev]);
  const off = !!x.cfg && !x.cfg.otp;
  return (
    <main aria-label={x.returning ? 'Welcome back' : 'Set up'} data-scroll="1" style={{ ...s(page), background: ground }}>
      <Back onClick={() => { set({ authError: null }); go(sent ? 'name' : x.returning ? 'welcome' : 'age'); }} />
      <form onSubmit={e => { e.preventDefault(); void (sent ? verifyCode() : sendCode()); }} style={s('display:flex;flex-direction:column;flex:1')}>
        <Title>{x.returning ? 'Welcome back.' : sent ? 'Enter your code' : 'Let’s get you set up'}</Title>
        <Body style="margin-top:12px">{sent ? <>I sent a 6-digit code to <b style={s('color:var(--ink)')}>{x.phone}</b>.</> : x.returning ? 'What’s your mobile number? I’ll send a code.' : 'Four quick things, then we’re in.'}</Body>

        {!sent && !x.returning && (
          <>
            <div id="lang-l" style={s('font-size:15px;font-weight:600;margin-top:28px')}>Which language feels like home?</div>
            <div role="radiogroup" aria-labelledby="lang-l" style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:10px')}>
              {LANGS.map(l => { const on = x.language === l.value; return <button key={l.value} type="button" role="radio" aria-checked={on} onClick={() => set({ language: l.value })} lang={l.value === 'hi' ? 'hi' : 'en'} style={s(`height:48px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;line-height:1;border-radius:24px;font-size:17px;border:1.5px solid ${on ? INDIGO : 'transparent'};background:${on ? 'var(--card)' : 'var(--soft)'};font-weight:${on ? 700 : 500}`)}>{l.label}</button>; })}
            </div>
            <label htmlFor="nick" style={s('font-size:15px;font-weight:600;margin-top:24px')}>What should I call you? <span style={s(`font-weight:400;color:${MUTED}`)}>A nickname is fine.</span></label>
            <input id="nick" value={x.nick} maxLength={24} autoComplete="nickname" onChange={e => set({ nick: e.target.value })} style={{ ...s(field), marginTop: 10 }} />
          </>
        )}

        {!sent && (
          <>
            <label htmlFor="phone" style={s(`font-size:15px;font-weight:600;margin-top:${x.returning ? 28 : 24}px`)}>Your mobile number</label>
            <input id="phone" value={x.phone} inputMode="tel" autoComplete="tel" placeholder="98765 43210" onChange={e => set({ phone: e.target.value })} style={{ ...s(field), marginTop: 10 }} />
            <div style={s(`font-size:14px;line-height:1.45;color:${MUTED};margin-top:8px`)}>Stored encrypted and used only to sign you in.</div>
          </>
        )}

        {sent && (
          <>
            <label htmlFor="otp" className="sr">6-digit code</label>
            <input id="otp" value={x.code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="••••••" onChange={e => set({ otpCode: e.target.value.replace(/\D/g, '').slice(0, 6), authError: null })} style={{ ...s(field), marginTop: 24, letterSpacing: '0.4em', textAlign: 'center', fontSize: 30 }} />
            {x.dev && <div role="status" style={s(`font-size:14px;color:${MUTED};margin-top:10px`)}>Development build: your code is <strong>{x.dev}</strong>.</div>}
            <div style={s('display:flex;justify-content:space-between;margin-top:6px')}>
              <button type="button" onClick={() => go('name')} style={s(`height:48px;border:none;background:none;color:${INDIGO};font-size:15px;font-weight:600;padding:0`)}>Change number</button>
              <button type="button" disabled={wait > 0} onClick={() => void sendCode()} style={s(`height:48px;border:none;background:none;color:${INDIGO};font-size:15px;font-weight:600;padding:0;opacity:${wait ? 0.55 : 1}`)}>{wait ? `Resend in ${wait}s` : 'Resend code'}</button>
            </div>
          </>
        )}

        {x.err && <div role="alert" style={s('font-size:15px;color:#8A2D1A;margin-top:12px;line-height:1.4')}>{x.err}</div>}
        {off && <div role="status" style={s('font-size:15px;color:#5E4A26;background:#FFF1D6;border-radius:16px;padding:12px 14px;margin-top:12px;line-height:1.4')}>Sign-in by phone isn’t switched on yet.</div>}
        {x.cfg === null && <div role="status" style={s('font-size:15px;color:#5E4A26;background:#FFF1D6;border-radius:16px;padding:12px 14px;margin-top:12px')}>I can’t reach Saathi right now. Check your internet.</div>}

        <div style={s('margin-top:auto;padding-top:24px;display:flex;flex-direction:column;gap:14px')}>
          <Primary type="submit" disabled={x.busy || off}>{x.busy ? (sent ? 'Checking…' : 'Sending…') : sent ? 'Continue' : 'Send me a code'}</Primary>
          {!sent && x.cfg?.google && x.cfg.googleClientId && (
            <>
              <div aria-hidden="true" style={s(`display:flex;align-items:center;gap:12px;color:${MUTED};font-size:13px`)}><span style={s('flex:1;height:1px;background:var(--line)')} />or<span style={s('flex:1;height:1px;background:var(--line)')} /></div>
              <GoogleButton clientId={x.cfg.googleClientId} />
            </>
          )}
        </div>
      </form>
    </main>
  );
}

// ------------------------------------------------------------------------------------------------ companion
export function CompanionV3() {
  const look = useStore(a => a.look);
  const voice = useStore(a => a.voice);
  const compName = useStore(a => a.compName);
  const [name, setName] = useState(compName);
  return (
    <main aria-label="Choose your companion" data-scroll="1" style={{ ...s(page), background: ground }}>
      <Title size={34}>Choose your companion</Title>
      <div id="av-l" style={s('font-size:15px;font-weight:600;margin-top:24px')}>Avatar</div>
      <div role="radiogroup" aria-labelledby="av-l" style={s('display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px')}>
        {LOOK_OPTIONS.map(o => (
          <button key={o.id} type="button" role="radio" aria-checked={look === o.id} onClick={() => set({ look: o.id })} style={s('background:none;border:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:6px')}>
            <span style={s(`width:60px;height:60px;border-radius:50%;overflow:hidden;background:var(--card);display:grid;place-items:center;box-shadow:${look === o.id ? `0 0 0 3px var(--bg),0 0 0 5px ${INDIGO}` : 'none'}`)}><Companion look={o.id} size={o.id === 'orb' ? 44 : 60} /></span>
            <span style={s('font-size:15px')}>{o.label}</span>
          </button>
        ))}
      </div>
      <div style={s('font-size:15px;font-weight:600;margin:24px 0 10px')}>Voice</div>
      <VoicePicker value={voice} onPick={v => set({ voice: v })} accent={INDIGO} soft="#FFFFFF" />
      <label htmlFor="cname" style={s('font-size:15px;font-weight:600;margin:24px 0 10px')}>Name <span style={s(`font-weight:400;color:${MUTED}`)}>You can change it any time.</span></label>
      <input id="cname" value={name} maxLength={24} onChange={e => setName(e.target.value)} style={s(field)} />
      <div style={s('margin-top:28px')}><Primary onClick={() => { stopSpeech(); void updateCompanion({ name: name.trim() || 'Saathi', look, voice }); go('consent'); }}>Continue</Primary></div>
    </main>
  );
}

// ------------------------------------------------------------------------------------------------ what they are okay with
type Draft = Required<Pick<ConsentUpdate, 'remember' | 'notifications' | 'healthData' | 'analytics'>> & { location: 'off' | 'city' };
const CONSENTS: { k: 'remember' | 'notifications' | 'healthData' | 'city' | 'analytics'; label: string; desc: string }[] = [
  { k: 'remember', label: 'Remember things from our chats', desc: 'So I can ask how things went. You can see, edit and delete everything.' },
  { k: 'notifications', label: 'Notifications and check-ins', desc: 'Gentle, private, never more than twice a day.' },
  { k: 'city', label: 'Your city', desc: 'To suggest small things nearby. Never your exact location.' },
  { k: 'analytics', label: 'Share how I use Saathi', desc: 'Which screens and buttons get used, never what you write or say.' },
  { k: 'healthData', label: 'Sleep and steps', desc: 'From Health Connect or Apple Health. Needs the phone app, so it does nothing in a browser yet.' },
];

export function ConsentV3() {
  const compName = useStore(a => a.compName);
  const [d, setD] = useState<Draft>({ remember: false, notifications: false, healthData: false, analytics: false, location: 'off' });
  const [busy, setBusy] = useState(false);
  const value = (k: typeof CONSENTS[number]['k']) => (k === 'city' ? d.location === 'city' : d[k]);
  const flip = (k: typeof CONSENTS[number]['k']) => setD(p => (k === 'city' ? { ...p, location: p.location === 'city' ? 'off' : 'city' } : { ...p, [k]: !p[k] }));
  return (
    <main aria-label="What you’re okay with" data-scroll="1" style={{ ...s(page), background: ground }}>
      <Title size={34}>What you’re okay with</Title>
      <Body style="margin-top:12px">Nothing is switched on for you. Change any of these later in Privacy.</Body>
      <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:24px')}>
        {CONSENTS.map(c => {
          const on = value(c.k);
          return (
            <button key={c.k} type="button" role="switch" aria-checked={on} onClick={() => flip(c.k)} style={s('display:flex;align-items:center;gap:16px;text-align:left;border:none;background:var(--card);border-radius:24px;padding:16px 18px;box-shadow:0 8px 22px rgba(30,36,48,.05);width:100%')}>
              <span style={s('flex:1;display:flex;flex-direction:column;gap:3px')}><span style={s('font-size:17px')}>{c.label}</span><span style={s(`font-size:15px;line-height:1.4;color:${MUTED}`)}>{c.desc}</span></span>
              <span aria-hidden="true" style={s(`flex:none;width:52px;height:32px;border-radius:16px;background:${on ? INDIGO : 'var(--line)'};position:relative;transition:background 300ms`)}><span style={s(`position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:var(--card);transform:${on ? 'translateX(20px)' : 'none'};transition:transform 300ms`)} /></span>
            </button>
          );
        })}
      </div>
      <a href="#privacy-notice" onClick={e => { e.preventDefault(); toast('The full privacy notice will live here.'); }} style={s(`font-size:15px;margin-top:16px;color:${INDIGO}`)}>Read the full notice in English</a>
      <div style={s('margin-top:auto;padding-top:24px')}>
        <Primary disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await finishOnboarding({ remember: d.remember, notifications: d.notifications, healthData: d.healthData, analytics: d.analytics, location: d.location });
          setBusy(false);
          if (ok) go('today');
        }}>Say hello to {compName}</Primary>
      </div>
    </main>
  );
}
