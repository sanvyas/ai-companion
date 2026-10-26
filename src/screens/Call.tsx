import { useEffect, useRef } from 'react';
import { C, serif } from '../theme';
import { set, useStore } from '../state/store';
import { endCall, go, toast } from '../state/actions';
import { say, startMouth, stopMouth, stopSpeech } from '../audio/speech';
import { Companion } from '../components/figures';
import { P, Svg } from '../components/icons';
import { HelpPill, PrimaryButton, TextButton, flex } from '../components/ui';
import { useReduceMotion } from '../components/figures';

interface Line { who: 'ai' | 'me'; text: string }

// Scripted demo conversations. TODO(realtime): replace with WebRTC voice orchestration
// (streaming STT -> LLM -> streaming TTS with visemes), safety on every turn (PRD §4, §8.3.1).
function scriptFor(opts: { firstRun: boolean; mode: string; nick: string; comp: string; hook: string | null }): Line[] {
  const { firstRun, mode, nick, comp, hook } = opts;
  if (firstRun) {
    return [
      { who: 'ai', text: `Hi ${nick}. I’m ${comp}, an AI companion. I’m really glad you’re here.` },
      { who: 'ai', text: 'What kind of day has it been?' },
      { who: 'me', text: 'Honestly, kind of empty.' },
      { who: 'ai', text: 'Empty days are tiring in their own way. Is there anything you’d like a bit of help with?' },
      { who: 'me', text: 'Sleeping better, maybe.' },
      { who: 'ai', text: 'We can go slowly with that. Would an evening check-in suit you, maybe around nine?' },
    ];
  }
  if (mode === 'checkin') {
    return [
      { who: 'ai', text: `Hi ${nick}. Is now still a good time for our check-in?` },
      { who: 'me', text: 'Yeah, okay.' },
      { who: 'ai', text: 'How did you sleep last night?' },
      { who: 'me', text: 'Maybe six hours. Woke up a lot.' },
      { who: 'ai', text: 'Six broken hours is tiring. Did you manage to eat today?' },
      { who: 'me', text: 'Lunch, and some Maggi later.' },
      { who: 'ai', text: 'That counts. Did you talk to anyone today?' },
      { who: 'me', text: 'Priya called for a bit.' },
      { who: 'ai', text: 'I’m glad. And one thing that was okay today?' },
      { who: 'me', text: 'The chai on the balcony, honestly.' },
      { who: 'ai', text: 'That’s a good one. For tomorrow, balcony chai again, or a short walk after lunch?' },
    ];
  }
  return [
    { who: 'ai', text: hook ? `Hi ${nick}. ${hook}` : `Hi ${nick}. How did the interview prep go?` },
    { who: 'me', text: 'Long. I didn’t really leave my room.' },
    { who: 'ai', text: 'That sounds like a heavy kind of long. More tired, or more like not wanting to face things?' },
    { who: 'me', text: 'Bit of both, yaar.' },
    { who: 'ai', text: 'That’s okay. We can just talk for a while. Nothing to fix tonight.' },
  ];
}

const dark = { color: C.moonText };

export function Call() {
  const s = {
    tick: useStore(x => x.tick), paused: useStore(x => x.paused), muted: useStore(x => x.muted), captions: useStore(x => x.captions),
    callMode: useStore(x => x.callMode), firstRun: useStore(x => x.firstRun), callEnded: useStore(x => x.callEnded),
    look: useStore(x => x.look), nick: useStore(x => x.nick), comp: useStore(x => x.compName), hook: useStore(x => x.journalHook),
    speakingNow: useStore(x => x.speakingNow), voiceAudio: useStore(x => x.voiceAudio),
  };
  const reduce = useReduceMotion();
  const sit = s.callMode === 'sit';
  const script = scriptFor({ firstRun: s.firstRun, mode: s.callMode, nick: s.nick, comp: s.comp, hook: s.hook });
  const idx = Math.floor(s.tick / 5);
  const line = script[idx % script.length];
  const sub = s.tick % 5;
  const key = `${s.firstRun}-${s.callMode}-${idx}`;

  const prevIdx = useRef(-1);
  let phase: 'paused' | 'thinking' | 'speaking' | 'listening' | 'idle' = s.paused ? 'paused' : line.who === 'ai' ? (sub < 1 ? 'thinking' : 'speaking') : 'listening';
  if (sit) phase = s.paused ? 'paused' : 'idle';
  // Once the line has finished being spoken, show listening instead of a stuck "speaking" state.
  if (phase === 'speaking' && !s.speakingNow && s.voiceAudio && idx === prevIdx.current) phase = 'listening';
  useEffect(() => { prevIdx.current = idx; });

  const spoken = useRef<string | null>(null);
  useEffect(() => {
    if (sit || s.paused || s.callEnded) return;
    if (line.who === 'ai' && sub >= 1 && spoken.current !== key) {
      spoken.current = key;
      if (s.voiceAudio) say(line.text, {}, undefined, () => toast('This browser can’t play voices.'));
      else { startMouth(); setTimeout(stopMouth, 2600); }
    }
  });
  useEffect(() => () => { stopSpeech(); }, []);

  const label = { paused: 'Paused. Take your time.', thinking: 'Thinking', speaking: 'Speaking', listening: s.muted ? 'Muted' : 'Listening', idle: 'Here with you. No need to talk.' }[phase];
  const breathWord = Math.floor(s.tick / 3) % 2 ? 'Breathe out' : 'Breathe in';
  const figureLook = s.callMode === 'video' && s.look === 'orb' ? 'asha' : s.look;

  const ctrls = [
    { label: s.muted ? 'Unmute' : 'Mute', icon: s.muted ? P.micOff : P.mic, on: s.muted, tap: () => set({ muted: !s.muted }) },
    { label: 'Captions', icon: P.cc, on: s.captions, tap: () => set({ captions: !s.captions }) },
    { label: s.paused ? 'Resume' : 'Pause', icon: s.paused ? P.play : P.pause, on: s.paused, tap: () => { if (!s.paused) stopSpeech(); set({ paused: !s.paused }); } },
    { label: 'Text', icon: P.text, on: false, tap: () => go('chat') }, // switch to text keeps the thread (PRD §8.3.1)
  ];

  return (
    <main className="on-dark" aria-label="Conversation" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'radial-gradient(120% 70% at 50% 32%,#2B3A63 0%,#1B2340 48%,#12182B 100%)', ...dark }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between', padding: 'var(--head-pad) 24px 0' }}>
        <div style={{ fontSize: 13, color: C.moonMuted, padding: '6px 12px', borderRadius: 14, background: 'rgba(255,255,255,.08)' }}>{s.comp} · AI companion</div>
        <HelpPill dark />
      </div>
      <div style={{ flex: 1, ...flex('column', 28), alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <Companion look={figureLook} size={s.callMode === 'video' ? 260 : 210} mode={phase === 'paused' ? 'idle' : phase} />
        <div role="status" aria-live="polite" style={{ fontSize: 15, color: C.moonMuted }}>{label}</div>
        {(sit || s.captions) && (
          <div style={{ minHeight: 72, textAlign: 'center', ...flex('column', 6), maxWidth: 320 }}>
            <span style={{ fontSize: 13, color: '#7F86A8' }}>{sit ? 'Breathing together' : s.paused ? s.comp : line.who === 'ai' ? s.comp : 'You'}</span>
            <span style={{ fontSize: 17, lineHeight: 1.5, color: C.moonSoft, textWrap: 'pretty' }}>{sit ? breathWord : s.paused ? 'I’ll wait. Take all the time you need.' : line.text}</span>
          </div>
        )}
      </div>
      <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 18) }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {ctrls.map(c => (
            <button key={c.label} onClick={c.tap} aria-pressed={c.label === 'Text' ? undefined : c.on} style={{ background: 'none', border: 'none', ...flex('column', 8), alignItems: 'center', color: C.moonText }}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: c.on ? C.moonText : 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center', transition: 'background 400ms' }}>
                <Svg d={c.icon} size={24} stroke={c.on ? '#1B2340' : C.moonText} />
              </span>
              <span style={{ fontSize: 15, color: C.moonSoft }}>{c.label}</span>
            </button>
          ))}
        </div>
        <button onClick={endCall} style={{ height: 56, borderRadius: 28, border: 'none', background: C.moonText, color: '#1B2340', fontSize: 17, fontWeight: 600 }}>End</button>
      </div>
      {s.callEnded && <ClosingSheet reduce={reduce} />}
    </main>
  );
}

function ClosingSheet({ reduce }: { reduce: boolean }) {
  const firstRun = useStore(s => s.firstRun);
  const callMode = useStore(s => s.callMode);
  const sit = callMode === 'sit';
  const checkin = callMode === 'checkin';
  const addPlan = (label: string) => set(p => ({ plan: [...p.plan.filter(x => !x.done), { id: Date.now(), label, done: false }].slice(-3) }));

  const title = firstRun ? 'One tiny first step' : sit ? 'Glad you stayed a while.' : 'Before you go';
  const text = firstRun ? 'A glass of water before bed. I can check in tomorrow evening at nine, if that’s okay.' : sit ? 'Come back any time you want some quiet company.' : 'You said you’d try chai on the balcony tomorrow morning. Small, and it counts.';
  const primary = firstRun ? 'Yes, check in tomorrow' : sit ? 'Done' : 'Add to today';
  const secondary = firstRun ? 'Not now' : sit ? 'Back to Today' : 'Done';
  const onPrimary = () => {
    if (firstRun) { go('today', { firstRun: false }); toast('Okay. Tomorrow at 9 p.m., gently.'); }
    else if (sit) go('today');
    else { addPlan('Chai on the balcony'); go('today'); toast('Added to your gentle plan.'); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={checkin ? 'Check-in summary' : title}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,24,43,.5)', animation: reduce ? undefined : 'sIn 500ms' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: C.paper, color: C.ink, borderRadius: '28px 28px 0 0', padding: '28px 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 14), animation: reduce ? undefined : 'sUp 500ms cubic-bezier(.22,.61,.36,1)' }}>
        {checkin ? (
          <>
            <h2 style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.2, fontWeight: 400, margin: 0 }}>Thanks for checking in.</h2>
            <div style={{ ...flex('column', 8), background: C.white, borderRadius: 24, padding: '16px 18px' }}>
              {[['Sleep', 'About six hours, on and off'], ['Food', 'Lunch, and Maggi later'], ['People', 'Priya called'], ['Okay thing', 'Chai on the balcony']].map(([k, v]) => (
                <div key={k} style={{ ...flex('row', 12), alignItems: 'baseline', fontSize: 15, lineHeight: 1.45 }}><span style={{ flex: 'none', width: 72, color: C.muted }}>{k}</span><span style={{ flex: 1 }}>{v}</span></div>
              ))}
            </div>
            <div style={{ fontSize: 17, marginTop: 4 }}>One small thing for tomorrow, if you like:</div>
            <div style={flex('column', 8)}>
              {['Balcony chai, 8 a.m.', 'Short walk after lunch'].map(label => (
                <button key={label} onClick={() => { addPlan(label); go('today'); toast('Added for tomorrow. I’ll remind you once, gently.'); }} style={{ height: 56, borderRadius: 28, border: `1.5px solid ${C.teal}`, background: C.white, color: C.ink, fontSize: 17, fontWeight: 600 }}>{label}</button>
              ))}
            </div>
            <TextButton onClick={() => go('today')}>Neither, thanks</TextButton>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.2, fontWeight: 400, margin: 0 }}>{title}</h2>
            <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted, textWrap: 'pretty' }}>{text}</div>
            <PrimaryButton onClick={onPrimary} style={{ marginTop: 8 }}>{primary}</PrimaryButton>
            <TextButton onClick={() => go('today')}>{secondary}</TextButton>
          </>
        )}
      </div>
    </div>
  );
}
