import { useEffect, useState } from 'react';
import { ApiError, api, type VoiceItem, type VoiceList } from '../api';
import { playClip } from '../audio/clip';
import { say, stopSpeech } from '../audio/speech';
import { isLegacy, personaOf } from '../domain/voices';
import { set, useStore } from '../state/store';

// Same choices as before (natural server voices when connected, the phone's own voices always, each playable before choosing),
// drawn in the new design.
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
    const playing = previewing === v.id && speakingNow;
    return (
      <div key={v.id} className="vrow" data-on={on}>
        <button type="button" role="radio" aria-checked={on} onClick={() => onPick(v.id)} className="vname">
          <b>{v.label}</b>
          {v.gender && <span className="fine">{v.gender === 'female' ? 'Woman’s voice' : 'Man’s voice'}</span>}
        </button>
        <button type="button" className="btn sm soft" onClick={() => void preview(v)} aria-label={`${playing ? 'Stop' : 'Preview'} ${v.label}`}>{playing ? 'Stop' : previewing === v.id ? '…' : 'Preview'}</button>
      </div>
    );
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Voice" style={{ display: 'grid', gap: 8 }}>
        {natural.length > 0 && <div className="fine">Natural voices for {{ en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' }[language]}</div>}
        {natural.map(row)}
        {natural.length > 0 && <div className="fine" style={{ marginTop: 6 }}>On this phone</div>}
        {phone.map(row)}
      </div>
      {list && !list.serverVoices && <p className="fine" style={{ marginTop: 8 }}>Natural voices aren’t switched on yet, so these use your phone’s own speech. They sound flatter.</p>}
      {failed && <p role="status" className="fine" style={{ marginTop: 8 }}>I couldn’t load the voice list, so only the phone’s voices are shown.</p>}
      {note && <p role="status" className="small" style={{ color: '#B3392A', marginTop: 8 }}>{note}</p>}
    </div>
  );
}
