import { useState } from 'react';
import { C, serif } from '../theme';
import { set, useStore, type CallPhase } from '../state/store';
import { addPlanItem, endCall, go, saveProposedMemories, setMuted, setPaused, startCall, updatePrefs } from '../state/actions';
import { Companion, useReduceMotion } from '../components/figures';
import { P, Svg } from '../components/icons';
import { HelpPill, PrimaryButton, TextButton, flex } from '../components/ui';

const dark = { color: C.moonText };

export function Call() {
  const s = {
    tick: useStore(x => x.tick), paused: useStore(x => x.paused), muted: useStore(x => x.muted), captions: useStore(x => x.captions),
    callMode: useStore(x => x.callMode), callEnded: useStore(x => x.callEnded), callPhase: useStore(x => x.callPhase), callLine: useStore(x => x.callLine),
    look: useStore(x => x.look), comp: useStore(x => x.compName), mouth: useStore(x => x.mouth), conv: useStore(x => x.conv), busy: useStore(x => x.callBusy),
  };
  const reduce = useReduceMotion();
  const sit = s.callMode === 'sit';
  const [asking, setAsking] = useState(false);

  const phase: CallPhase = s.paused ? 'paused' : s.callPhase;
  const label = {
    connecting: 'Connecting…', paused: 'Paused. Take your time.', thinking: 'Thinking', speaking: 'Speaking', listening: s.muted ? 'Muted' : 'Listening',
    idle: sit ? 'Here with you. No need to talk.' : 'Not connected', error: 'Not connected',
  }[phase];
  const breathWord = Math.floor(s.tick / 3) % 2 ? 'Breathe out' : 'Breathe in';
  const figureLook = s.callMode === 'video' && s.look === 'orb' ? 'asha' : s.look;
  const avatarMode = phase === 'connecting' || phase === 'error' ? 'idle' : phase;

  const ctrls = [
    { label: s.muted ? 'Unmute' : 'Mute', icon: s.muted ? P.micOff : P.mic, on: s.muted, tap: () => setMuted(!s.muted) },
    { label: 'Captions', icon: P.cc, on: s.captions, tap: () => set({ captions: !s.captions }) },
    { label: s.paused ? 'Resume' : 'Pause', icon: s.paused ? P.play : P.pause, on: s.paused, tap: () => setPaused(!s.paused) },
    { label: 'Text', icon: P.text, on: false, tap: () => go('chat') }, // switch to text keeps the thread (PRD §8.3.1)
  ];

  return (
    <main className="on-dark" aria-label="Conversation" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'radial-gradient(120% 70% at 50% 32%,#2B3A63 0%,#1B2340 48%,#12182B 100%)', ...dark }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between', padding: 'var(--head-pad) 24px 0' }}>
        <div style={{ fontSize: 13, color: C.moonMuted, padding: '6px 12px', borderRadius: 14, background: 'rgba(255,255,255,.08)' }}>{s.comp} · AI companion</div>
        <HelpPill dark />
      </div>
      <div style={{ flex: 1, ...flex('column', 28), alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <Companion look={figureLook} size={s.callMode === 'video' ? 260 : 210} mode={avatarMode} />
        <div role="status" aria-live="polite" style={{ fontSize: 15, color: C.moonMuted }}>{label}</div>
        {(sit || s.captions) && (
          <div style={{ minHeight: 72, textAlign: 'center', ...flex('column', 6), maxWidth: 320 }}>
            <span style={{ fontSize: 13, color: '#7F86A8' }}>{sit && !s.callLine ? 'Breathing together' : s.paused ? s.comp : s.callLine?.who === 'me' ? 'You' : s.comp}</span>
            <span style={{ fontSize: 17, lineHeight: 1.5, color: C.moonSoft, textWrap: 'pretty' }}>{s.paused ? 'I’ll wait. Take all the time you need.' : sit && !s.callLine ? breathWord : s.callLine?.text ?? ''}</span>
          </div>
        )}
      </div>
      <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 18) }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {ctrls.map(c => (
            <button key={c.label} data-track={`call.${c.label.toLowerCase()}`} onClick={c.tap} aria-pressed={c.label === 'Text' ? undefined : c.on} style={{ background: 'none', border: 'none', ...flex('column', 8), alignItems: 'center', color: C.moonText }}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: c.on ? C.moonText : 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center', transition: 'background 400ms' }}>
                <Svg d={c.icon} size={24} stroke={c.on ? '#1B2340' : C.moonText} />
              </span>
              <span style={{ fontSize: 15, color: C.moonSoft }}>{c.label}</span>
            </button>
          ))}
        </div>
        <button data-track="call.end" onClick={() => (sit ? void endCall() : setAsking(true))} disabled={s.busy && !s.conv} style={{ height: 56, borderRadius: 28, border: 'none', background: C.moonText, color: '#1B2340', fontSize: 17, fontWeight: 600 }}>End</button>
      </div>
      {asking && !s.callEnded && <FeelingSheet reduce={reduce} onPick={f => { setAsking(false); void endCall(f); }} />}
      {s.callEnded && <ClosingSheet reduce={reduce} />}
    </main>
  );
}

const overlay = (reduce: boolean) => <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,24,43,.5)', animation: reduce ? undefined : 'sIn 500ms' }} />;
const panel = (reduce: boolean) => ({ position: 'absolute' as const, left: 0, right: 0, bottom: 0, background: C.paper, color: C.ink, borderRadius: '28px 28px 0 0', padding: '28px 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 14), animation: reduce ? undefined : 'sUp 500ms cubic-bezier(.22,.61,.36,1)' });
const h2 = { fontFamily: serif, fontSize: 28, lineHeight: 1.2, fontWeight: 400, margin: 0 } as const;
const outline = { height: 56, borderRadius: 28, border: `1.5px solid ${C.teal}`, background: C.white, color: C.ink, fontSize: 17, fontWeight: 600 } as const;

/** One optional tap before the call ends: how do you feel now? Never required (PRD 8.3). */
function FeelingSheet({ reduce, onPick }: { reduce: boolean; onPick: (f?: 'better' | 'same' | 'worse') => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="How are you feeling">
      {overlay(reduce)}
      <div style={panel(reduce)}>
        <h2 style={h2}>How are you feeling now?</h2>
        <div style={flex('column', 8)}>
          {([['better', 'A bit better'], ['same', 'About the same'], ['worse', 'A bit heavier']] as const).map(([k, label]) => (
            <button key={k} onClick={() => onPick(k)} style={outline}>{label}</button>
          ))}
        </div>
        <TextButton onClick={() => onPick(undefined)}>Skip</TextButton>
      </div>
    </div>
  );
}

function ClosingSheet({ reduce }: { reduce: boolean }) {
  const firstRun = useStore(s => s.firstRun);
  const callMode = useStore(s => s.callMode);
  const busy = useStore(s => s.callBusy);
  const out = useStore(s => s.callSummary);
  const sit = callMode === 'sit';
  const checkin = callMode === 'checkin' && !!out?.checkinResult;
  const proposed = out?.proposedMemories ?? [];
  const [keep, setKeep] = useState<number[] | null>(null);
  const kept = keep ?? proposed.map((m, i) => (m.sensitive ? -1 : i)).filter(i => i >= 0);
  const toggle = (i: number) => setKeep(kept.includes(i) ? kept.filter(x => x !== i) : [...kept, i]);

  const leave = async (todayMsg?: string) => {
    if (kept.length) await saveProposedMemories(kept.map(i => proposed[i]), 'call');
    go('today', { firstRun: false });
    if (todayMsg) set({ toast: todayMsg });
  };
  const addStep = async (label: string) => { await addPlanItem(label, 'checkin'); await leave('Added to your gentle plan.'); };

  const title = busy ? 'One moment…' : firstRun ? 'Nice to meet you' : checkin ? 'Thanks for checking in.' : sit ? 'Glad you stayed a while.' : 'Before you go';

  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      {overlay(reduce)}
      <div style={panel(reduce)}>
        <h2 style={h2}>{title}</h2>
        {busy ? <div role="status" style={{ color: C.muted, fontSize: 17 }}>Saving our conversation…</div> : (
          <>
            {checkin && out?.checkinResult && (
              <div style={{ ...flex('column', 8), background: C.white, borderRadius: 24, padding: '16px 18px' }}>
                {([['Sleep', out.checkinResult.sleep], ['Food', out.checkinResult.food], ['People', out.checkinResult.people], ['Okay thing', out.checkinResult.okayThing]] as const).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ ...flex('row', 12), alignItems: 'baseline', fontSize: 15, lineHeight: 1.45 }}><span style={{ flex: 'none', width: 72, color: C.muted }}>{k}</span><span style={{ flex: 1 }}>{v}</span></div>
                ))}
              </div>
            )}
            {!checkin && !sit && out?.summary && <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted, textWrap: 'pretty' }}>{out.summary}</div>}
            {sit && <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>Come back any time you want some quiet company.</div>}

            {proposed.length > 0 && (
              <fieldset style={{ border: 'none', padding: 0, margin: 0, ...flex('column', 8) }}>
                <legend style={{ fontSize: 15, color: C.muted, marginBottom: 6 }}>Want me to remember these? Untick anything.</legend>
                {proposed.map((m, i) => (
                  <label key={i} style={{ ...flex('row', 12), alignItems: 'center', background: C.white, borderRadius: 20, padding: '12px 16px', fontSize: 15 }}>
                    <input type="checkbox" checked={kept.includes(i)} onChange={() => toggle(i)} style={{ width: 22, height: 22, accentColor: C.teal }} />
                    <span style={{ flex: 1 }}>{m.text}{m.sensitive && <span style={{ color: C.muted }}> · sensitive</span>}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {checkin && out?.checkinResult && out.checkinResult.intentions.length > 0 && (
              <>
                <div style={{ fontSize: 17, marginTop: 4 }}>One small thing for tomorrow, if you like:</div>
                <div style={flex('column', 8)}>
                  {out.checkinResult.intentions.map(label => <button key={label} onClick={() => void addStep(label)} style={outline}>{label}</button>)}
                </div>
                <TextButton onClick={() => void leave()}>Neither, thanks</TextButton>
              </>
            )}

            {firstRun && !checkin && (
              <>
                <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>I can check in on you each evening, around nine. You can change or stop that any time.</div>
                <PrimaryButton onClick={async () => { await updatePrefs({ checkinTime: 'evening' }); await leave('Okay. Tomorrow at 9 p.m., gently.'); }}>Yes, check in tomorrow</PrimaryButton>
                <TextButton onClick={() => void leave()}>Not now</TextButton>
              </>
            )}

            {!checkin && !firstRun && (
              <>
                <PrimaryButton onClick={() => void leave()} style={{ marginTop: 8 }}>{sit ? 'Done' : 'Back to Today'}</PrimaryButton>
                {!sit && <TextButton onClick={() => void startCall('voice')}>Keep talking</TextButton>}
              </>
            )}
            {checkin && !(out?.checkinResult?.intentions.length) && <PrimaryButton onClick={() => void leave()}>Done</PrimaryButton>}
          </>
        )}
      </div>
    </div>
  );
}
