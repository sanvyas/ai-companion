import { C, ring, serif } from '../theme';
import { set, useStore, type AvatarMode } from '../state/store';
import { go } from '../state/actions';
import { updateCompanion } from '../state/session';
import { stopSpeech } from '../audio/speech';
import { Companion, LOOK_OPTIONS, lookName } from '../components/figures';
import { VoicePicker } from '../components/VoicePicker';
import { voiceLabel } from '../domain/voices';
import { BackHeader, Scroll, flex } from '../components/ui';

const MODES: AvatarMode[] = ['idle', 'listening', 'thinking', 'concerned', 'smiling'];

/** Pick the companion's look and voice. Both save straight away and are used everywhere in the app from then on. */
export function Studio() {
  const look = useStore(s => s.look);
  const voice = useStore(s => s.voice);
  const mode = useStore(s => s.studioMode);
  const speakingNow = useStore(s => s.speakingNow);
  const deviceVoice = useStore(s => s.deviceVoice);
  const voices = useStore(s => s.voicesList);
  const demo = useStore(s => s.demo);
  const language = useStore(s => s.language);
  const comp = useStore(s => s.compName);

  const found = voices.filter(v => /^(en|hi)/i.test(v.lang));

  return (
    <main aria-label="Your companion" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'linear-gradient(180deg,#CFE3F0 0%,#E9E3EF 36%,#FBF7F0 64%)' }}>
      <BackHeader title="Your companion" onBack={() => { stopSpeech(); go('you'); }} />
      <Scroll pad="12px 24px 40px" gap={14}>
        <div style={{ alignSelf: 'center', width: 260, height: 300, borderRadius: '130px 130px 44px 44px', background: 'radial-gradient(circle at 50% 38%,rgba(255,255,255,.85),rgba(255,255,255,.35))', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', boxShadow: '0 20px 50px rgba(90,84,147,.15)' }}>
          <Companion look={look} size={look === 'orb' ? 200 : 260} mode={speakingNow ? 'speaking' : mode} />
        </div>
        <div role="status" style={{ textAlign: 'center', fontSize: 13, color: C.muted }}>{comp} · {lookName(look)} · {voiceLabel(voice)} voice</div>
        <div role="group" aria-label="Expression preview" style={{ ...flex('row', 6), flexWrap: 'wrap', justifyContent: 'center' }}>
          {MODES.map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => set({ studioMode: m })} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', background: mode === m ? C.teal : 'rgba(255,255,255,.75)', color: mode === m ? C.white : C.ink, fontSize: 13, fontWeight: 600 }}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>

        <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Avatar</div>
        <div role="radiogroup" aria-label="Avatar" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
          {LOOK_OPTIONS.map(o => (
            <button key={o.id} type="button" role="radio" aria-checked={look === o.id} onClick={() => void updateCompanion({ look: o.id })} style={{ background: 'none', border: 'none', padding: 0, ...flex('column', 6), alignItems: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', boxShadow: look === o.id ? ring : 'none', overflow: 'hidden', background: C.sand, display: 'grid', placeItems: 'center' }}><Companion look={o.id} size={o.id === 'orb' ? 44 : 60} /></div>
              <span style={{ fontSize: 13 }}>{o.label}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 15, color: C.muted, marginTop: 10 }}>Voice</div>
        <VoicePicker value={voice} onPick={v => { if (v !== voice) void updateCompanion({ voice: v }); }} />
        <div style={{ fontSize: 13, color: C.muted }}>Voices follow your language ({{ en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' }[language]}). Change it in You → Language and the list updates.</div>

        {demo && (
          <>
            <label htmlFor="dv" style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Phone voice, dev only ({found.length} found)</label>
            <select id="dv" value={deviceVoice} onChange={e => set({ deviceVoice: e.target.value })} style={{ height: 52, borderRadius: 20, border: 'none', background: C.sand, padding: '0 16px', fontSize: 15, color: C.ink, width: '100%' }}>
              <option value="">Automatic: best match</option>
              {found.map(v => <option key={v.uri} value={v.uri}>{v.name} · {v.lang}</option>)}
            </select>
          </>
        )}
        <div style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.5, fontStyle: 'italic', color: C.muted, textWrap: 'pretty' }}>The characters are stylised on purpose: warm, never a photo. Their mouths follow the voice as it speaks.</div>
      </Scroll>
    </main>
  );
}
