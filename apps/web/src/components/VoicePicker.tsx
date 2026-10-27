import { useEffect, useState } from 'react';
import { ApiError, api, type VoiceItem, type VoiceList } from '../api';
import { C } from '../theme';
import { playClip } from '../audio/clip';
import { say, stopSpeech } from '../audio/speech';
import { isLegacy, personaOf } from '../domain/voices';
import { set, useStore } from '../state/store';
import { flex } from './ui';

// The voices that can speak the person's language: natural server voices when they are connected, and the phone's own
// three voices always. Each can be played before choosing. Choosing is up to the caller (onboarding keeps it in the
// form, the companion screen saves it straight away).
const SAMPLE_LANG = { en: 'English', hinglish: 'English', hi: 'हिन्दी' } as const;
const LINE = { en: 'Hi. I’m here whenever you want to talk.', hinglish: 'Hi, main yahan hoon, jab bhi aap baat karna chahein.', hi: 'नमस्ते। मैं यहाँ हूँ, जब भी आप बात करना चाहें।' } as const;

export function VoicePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const language = useStore(s => s.language);
  const previewing = useStore(s => s.previewing);
  const speakingNow = useStore(s => s.speakingNow);
  const [list, setList] = useState<VoiceList | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    setList(null); setFailed(false);
    api.voices(language).then(l => {
      if (dead) return;
      setList(l);
      // If the saved voice can't speak this language (or its service is off), fall back to the first one that can.
      if (!l.items.some(v => v.id === value)) onPick(l.items[0]?.id ?? 'warm');
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; stopSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const items: VoiceItem[] = list?.items ?? [
    { id: 'warm', label: 'Warm', gender: null, provider: 'device' }, { id: 'steady', label: 'Steady', gender: null, provider: 'device' }, { id: 'bright', label: 'Bright', gender: null, provider: 'device' },
  ];
  const natural = items.filter(v => v.provider === 'sarvam');
  const phone = items.filter(v => v.provider === 'device');

  const preview = async (v: VoiceItem) => {
    if (previewing === v.id && speakingNow) { stopSpeech(); set({ previewing: null }); return; }
    stopSpeech();
    setNote(null);
    set({ previewing: v.id });
    const onEnd = () => set({ previewing: null });
    const phoneVoice = () => say(LINE[language], { persona: personaOf(v.id, id => items.find(i => i.id === id)?.gender), lang: SAMPLE_LANG[language] }, onEnd, () => { onEnd(); setNote('This browser can’t play voices.'); });
    if (isLegacy(v.id)) { phoneVoice(); return; }
    try {
      const r = await api.previewVoice(v.id, language);
      playClip(r.audio, r.mime, onEnd, () => { onEnd(); setNote('I couldn’t play that sample.'); });
    } catch (e) {
      onEnd();
      setNote(e instanceof ApiError ? e.message : 'I couldn’t play that sample.');
    }
  };

  const row = (v: VoiceItem) => {
    const on = value === v.id;
    return (
      <div key={v.id} style={{ ...flex('row', 4), alignItems: 'center', padding: '4px 10px 4px 0', borderRadius: 24, border: `1.5px solid ${on ? C.teal : 'transparent'}`, background: on ? C.tealSoft : C.white }}>
        <button type="button" role="radio" aria-checked={on} onClick={() => onPick(v.id)} style={{ flex: 1, minHeight: 52, textAlign: 'left', padding: '0 0 0 20px', border: 'none', background: 'none', fontSize: 17, fontWeight: 600, ...flex('column', 0), justifyContent: 'center' }}>
          {v.label}
          {v.gender && <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>{v.gender === 'female' ? 'Woman’s voice' : 'Man’s voice'}</span>}
        </button>
        <button type="button" onClick={() => void preview(v)} aria-label={`${previewing === v.id && speakingNow ? 'Stop' : 'Preview'} ${v.label}`} style={{ flex: 'none', height: 44, padding: '0 16px', borderRadius: 22, border: 'none', background: C.sand, fontSize: 15, color: C.tealDark, fontWeight: 600 }}>
          {previewing === v.id && speakingNow ? 'Stop' : previewing === v.id ? '…' : 'Preview'}
        </button>
      </div>
    );
  };

  return (
    <div style={flex('column', 8)}>
      <div role="radiogroup" aria-label="Voice" style={flex('column', 8)}>
        {natural.length > 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Natural voices for {{ en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' }[language]}</div>}
        {natural.map(row)}
        {natural.length > 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>On this phone</div>}
        {phone.map(row)}
      </div>
      {list && !list.serverVoices && <div style={{ fontSize: 13, lineHeight: 1.45, color: C.muted }}>Natural voices aren’t switched on yet, so these use your phone’s own speech. They sound flatter.</div>}
      {failed && <div role="status" style={{ fontSize: 13, color: C.muted }}>I couldn’t load the voice list, so only the phone’s voices are shown.</div>}
      {note && <div role="status" style={{ fontSize: 14, color: '#8A2D1A' }}>{note}</div>}
    </div>
  );
}

