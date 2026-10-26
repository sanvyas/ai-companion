import { C, serif, ring, shadow } from '../theme';
import { useStore, set } from '../state/store';
import { finishOnboarding, go, startCall, toast } from '../state/actions';
import { say, stopSpeech } from '../audio/speech';
import { Companion, LOOK_OPTIONS, Orb } from '../components/figures';
import { Body, Card, CallLink, PrimaryButton, Screen, TextButton, Title, ToggleRow, flex, onbPad } from '../components/ui';
import { YOUTH_HELPLINES } from '../data/helplines';

export function Welcome() {
  return (
    <Screen bg="linear-gradient(180deg,#F7D6C2 0%,#FAE6D6 40%,#FBF7F0 78%)" style={{ padding: onbPad }}>
      <div style={{ ...flex('row'), justifyContent: 'center', padding: '40px 0' }}><Orb size={150} /></div>
      <Title style={{ marginTop: 24 }}>Saathi</Title>
      <div style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.25, color: C.muted, marginTop: 6 }}>A place to talk, any time.</div>
      <div style={{ marginTop: 'auto', ...flex('column', 8) }}>
        <PrimaryButton onClick={() => go('intro')}>Get started</PrimaryButton>
        {/* TODO(auth): real sign-in via /auth/otp/* or /auth/google. For now this just opens Today. */}
        <TextButton onClick={() => { finishOnboarding(); go('today'); }}>I already have an account</TextButton>
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
  return (
    <Screen style={{ padding: onbPad }}>
      <Title>Are you 18 or older?</Title>
      <Body style={{ marginTop: 16 }}>Saathi is for adults for now.</Body>
      <div style={{ marginTop: 'auto', ...flex('column', 8) }}>
        <PrimaryButton onClick={() => go('lang')}>Yes, I am</PrimaryButton>
        <TextButton onClick={() => go('under')}>No, I’m younger</TextButton>
      </div>
    </Screen>
  );
}

// No account is created and nothing is stored on this path (PRD §8.1).
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

const LANGS = ['English', 'हिन्दी', 'Hinglish', 'தமிழ்', 'বাংলা', 'తెలుగు', 'ಕನ್ನಡ', 'मराठी'];

export function Language() {
  const langs = useStore(s => s.langs);
  const note = langs.length === 2 ? `${langs[0]} and ${langs[1]}, mixed as you like.` : langs.length ? `${langs[0]}.` : 'Pick at least one.';
  return (
    <Screen style={{ padding: onbPad }}>
      <Title>Which language feels like home?</Title>
      <Body style={{ marginTop: 12 }}>Pick one or two. You can mix them, the way you talk.</Body>
      <div style={{ ...flex('row', 10), flexWrap: 'wrap', marginTop: 28 }}>
        {LANGS.map(l => {
          const on = langs.includes(l);
          return (
            <button key={l} aria-pressed={on} onClick={() => set(p => ({ langs: on ? p.langs.filter(x => x !== l) : [...p.langs, l].slice(-2) }))}
              style={{ height: 52, padding: '0 20px', borderRadius: 26, fontSize: 17, border: `1.5px solid ${on ? C.teal : 'transparent'}`, background: on ? C.tealSoft : C.sand }}>{l}</button>
          );
        })}
      </div>
      <div role="status" style={{ fontSize: 15, color: C.muted, marginTop: 20 }}>{note}</div>
      <div style={{ marginTop: 'auto' }}>
        <PrimaryButton onClick={() => (langs.length ? go('name') : toast('Pick at least one language.'))} style={{ width: '100%' }}>Continue</PrimaryButton>
      </div>
    </Screen>
  );
}

export function NameScreen() {
  const nick = useStore(s => s.nick);
  const acct = useStore(s => s.acct);
  const accts = [
    { id: 'private' as const, title: 'Private account', desc: 'Phone or email. You can recover it on a new phone.' },
    { id: 'anon' as const, title: 'Anonymous', desc: 'No identity at all. If you lose this phone, we can’t recover your account.' },
  ];
  return (
    <Screen style={{ padding: onbPad }}>
      <Title><label htmlFor="nick">What should I call you?</label></Title>
      <div style={{ fontSize: 17, color: C.muted, marginTop: 12 }}>A nickname is fine.</div>
      <input id="nick" value={nick} maxLength={24} autoComplete="nickname" onChange={e => set({ nick: e.target.value })}
        style={{ marginTop: 20, height: 56, borderRadius: 20, border: 'none', background: C.sand, padding: '0 20px', fontSize: 22, outline: 'none' }} />
      <div id="acct-label" style={{ fontSize: 15, color: C.muted, marginTop: 32, marginBottom: 10 }}>How would you like to sign in?</div>
      <div role="radiogroup" aria-labelledby="acct-label" style={flex('column', 10)}>
        {accts.map(a => (
          <button key={a.id} role="radio" aria-checked={acct === a.id} onClick={() => set({ acct: a.id })}
            style={{ textAlign: 'left', borderRadius: 24, padding: '16px 20px', border: `1.5px solid ${acct === a.id ? C.teal : 'transparent'}`, background: acct === a.id ? C.tealSoft : C.white, ...flex('column', 4) }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{a.title}</span>
            <span style={{ fontSize: 15, lineHeight: 1.45, color: C.muted }}>{a.desc}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'auto' }}>
        {/* TODO(auth): OTP / Google sign-in. Nickname rule from PRD: 1-24 characters. */}
        <PrimaryButton onClick={() => (nick.trim() ? go('companion') : toast('A nickname helps me say hello. Anything works.'))} style={{ width: '100%' }}>Continue</PrimaryButton>
      </div>
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

  const preview = (k: typeof VOICES[number]['id']) => {
    if (previewing === k && speakingNow) { stopSpeech(); return; }
    set({ previewing: k, voice: k });
    say(`Hi ${nick}. I’m ${compName}. I’m here whenever you want to talk.`, { persona: k }, () => set({ previewing: null }), () => toast('This browser can’t play voices.'));
  };

  return (
    <Screen style={{ padding: `calc(var(--sa-top) + 76px) 24px calc(var(--sa-bottom) + 32px)`, overflow: 'auto' }} className="scroll">
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
        <input id="cname" value={compName} maxLength={24} onChange={e => set({ compName: e.target.value })} style={{ height: 56, borderRadius: 20, border: 'none', background: C.sand, padding: '0 20px', fontSize: 17, outline: 'none' }} />
        <div style={{ marginTop: 28, flex: 'none' }}>
          <PrimaryButton onClick={() => { stopSpeech(); go('consent'); }} style={{ width: '100%' }}>Continue</PrimaryButton>
        </div>
      </div>
    </Screen>
  );
}

const CONSENTS = [
  { k: 'remember' as const, label: 'Remember me', desc: 'Store conversations so I can follow up on things.' },
  { k: 'health' as const, label: 'Sleep and steps', desc: 'From Health Connect or Apple Health.' },
  { k: 'notif' as const, label: 'Notifications', desc: 'Gentle, private, never more than twice a day.' },
  { k: 'trusted' as const, label: 'Trusted contact', desc: 'Someone to reach if you’re ever in danger. Skip for now.' },
];

export function Consent() {
  const consent = useStore(s => s.consent);
  const compName = useStore(s => s.compName);
  return (
    <Screen style={{ padding: onbPad }}>
      <Title size={28} style={{ lineHeight: 1.2 }}>What you’re okay with</Title>
      <div style={{ fontSize: 17, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Nothing is switched on for you. Change any of these later in the Privacy Center.</div>
      <div style={{ ...flex('column', 10), marginTop: 24 }}>
        {CONSENTS.map(c => (
          <Card key={c.k} pad="16px 18px" style={{ boxShadow: shadow.lift, borderRadius: 24 }}>
            <ToggleRow on={consent[c.k]} onToggle={() => set(p => ({ consent: { ...p.consent, [c.k]: !p.consent[c.k] } }))} label={c.label} desc={c.desc} />
          </Card>
        ))}
      </div>
      {/* TODO(legal): link to the versioned privacy notice (DPDP Act 2023); re-ask on version change. */}
      <a href="#privacy-notice" onClick={e => { e.preventDefault(); toast('The full notice will live here.'); }} style={{ fontSize: 15, marginTop: 16 }}>Read the full notice in English</a>
      <div style={{ marginTop: 'auto' }}>
        <PrimaryButton onClick={() => { finishOnboarding(); startCall('voice', true); }} style={{ width: '100%' }}>Say hello to {compName}</PrimaryButton>
      </div>
    </Screen>
  );
}

