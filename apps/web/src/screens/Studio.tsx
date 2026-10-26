import { C, ring, serif } from '../theme';
import { set, useStore, type AvatarMode } from '../state/store';
import { go } from '../state/actions';
import { say, stopSpeech } from '../audio/speech';
import { toast } from '../state/actions';
import { Companion, LOOK_OPTIONS, lookName } from '../components/figures';
import { BackHeader, PrimaryButton, Scroll, Segmented, flex } from '../components/ui';

const MODES: AvatarMode[] = ['idle', 'listening', 'thinking', 'concerned', 'smiling'];
const LANGS = ['English', 'Hinglish', 'हिन्दी'] as const;

export function Studio() {
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const mode = useStore(s => s.studioMode);
  const speakingNow = useStore(s => s.speakingNow);
  const lang = useStore(s => s.sampleLang) as (typeof LANGS)[number];
  const deviceVoice = useStore(s => s.deviceVoice);
  const voices = useStore(s => s.voicesList);
  const nick = useStore(s => s.nick);
  const comp = useStore(s => s.compName);
  const demo = useStore(s => s.demo);

  const found = voices.filter(v => /^(en|hi)/i.test(v.lang));
  const sample = { English: `Hi ${nick}. I’m ${comp}, your AI companion. No rush tonight. How has the day been, really?`, Hinglish: `Hi ${nick}. Aaj ka din kaisa raha? Thoda thake hue lag rahe ho. Koi baat nahi, aaram se baat karte hain.`, 'हिन्दी': `नमस्ते ${nick}। मैं ${comp} हूँ, आपका AI साथी। आज का दिन कैसा रहा? कोई जल्दी नहीं है।` }[lang];
  const play = () => {
    if (speakingNow) { stopSpeech(); return; }
    say(sample, { persona: voice, lang }, () => { set({ studioMode: 'smiling' }); setTimeout(() => { if (mode === 'smiling') set({ studioMode: 'idle' }); }, 1800); }, () => toast('This browser can’t play voices.'));
  };

  return (
    <main aria-label="Your companion" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'linear-gradient(180deg,#CFE3F0 0%,#E9E3EF 36%,#FBF7F0 64%)' }}>
      <BackHeader title="Your companion" onBack={() => { stopSpeech(); go('you'); }} />
      <Scroll pad="12px 24px 40px" gap={14}>
        <div style={{ alignSelf: 'center', width: 260, height: 300, borderRadius: '130px 130px 44px 44px', background: 'radial-gradient(circle at 50% 38%,rgba(255,255,255,.85),rgba(255,255,255,.35))', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', boxShadow: '0 20px 50px rgba(90,84,147,.15)' }}>
          <Companion look={look} size={look === 'orb' ? 200 : 260} mode={speakingNow ? 'speaking' : mode} />
        </div>
        <div role="status" style={{ textAlign: 'center', fontSize: 13, color: C.muted }}>{lookName(look)} · AI companion · {speakingNow ? 'speaking' : mode}</div>
        <div role="group" aria-label="Expression preview" style={{ ...flex('row', 6), flexWrap: 'wrap', justifyContent: 'center' }}>
          {MODES.map(m => <button key={m} aria-pressed={mode === m} onClick={() => set({ studioMode: m })} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', background: mode === m ? C.teal : 'rgba(255,255,255,.75)', color: mode === m ? C.white : C.ink, fontSize: 13, fontWeight: 600 }}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Look</div>
        <div role="radiogroup" aria-label="Look" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
          {LOOK_OPTIONS.map(o => (
            <button key={o.id} role="radio" aria-checked={look === o.id} onClick={() => set({ look: o.id })} style={{ background: 'none', border: 'none', padding: 0, ...flex('column', 6), alignItems: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', boxShadow: look === o.id ? ring : 'none', overflow: 'hidden', background: C.sand, display: 'grid', placeItems: 'center' }}><Companion look={o.id} size={o.id === 'orb' ? 44 : 60} /></div>
              <span style={{ fontSize: 13 }}>{o.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Voice</div>
        <Segmented<'warm' | 'steady' | 'bright'> label="Voice" options={[{ value: 'warm', label: 'Warm' }, { value: 'steady', label: 'Steady' }, { value: 'bright', label: 'Bright' }]} value={voice} onChange={v => set({ voice: v, deviceVoice: '' })} />
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Sample language</div>
        <Segmented<(typeof LANGS)[number]> label="Sample language" options={LANGS} value={lang} onChange={v => set({ sampleLang: v, deviceVoice: '' })} />
        {demo && (
          <>
            <label htmlFor="dv" style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Device voice, dev only ({found.length} found)</label>
            <select id="dv" value={deviceVoice} onChange={e => set({ deviceVoice: e.target.value })} style={{ height: 52, borderRadius: 20, border: 'none', background: C.sand, padding: '0 16px', fontSize: 15, color: C.ink, width: '100%' }}>
              <option value="">Automatic: {voice} persona, best match</option>
              {found.map(v => <option key={v.uri} value={v.uri}>{v.name} · {v.lang}</option>)}
            </select>
          </>
        )}
        <div lang={lang === 'हिन्दी' ? 'hi' : 'en'} style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.5, fontStyle: 'italic', textWrap: 'pretty' }}>“{sample}”</div>
        <PrimaryButton onClick={play}>{speakingNow ? 'Stop' : 'Play sample'}</PrimaryButton>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.muted, textWrap: 'pretty' }}>The character is stylised on purpose: warm, never a photo. Lip-sync here follows the speech engine. Voices come from this device’s built-in speech engine and stand in for the production voice provider. They sound flatter than the real thing.</div>
      </Scroll>
    </main>
  );
}
