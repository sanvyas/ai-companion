import { useEffect, useState } from 'react';
import { Companion } from '../components/figures';
import { useDialog } from '../components/useDialog';
import { addPlanItem, endCall, go, saveProposedMemories, setMuted, setPaused, startCall, updatePrefs } from '../state/actions';
import { set, useStore, type CallPhase } from '../state/store';
import { HelpPill } from './Chrome';
import { Ic, type IconName } from './icons';

/** A voice, video or quiet-company call. The conversation itself runs in the shared app code; this is how it looks. */
export function Call() {
  const s = {
    tick: useStore(x => x.tick), paused: useStore(x => x.paused), muted: useStore(x => x.muted), captions: useStore(x => x.captions),
    callMode: useStore(x => x.callMode), callEnded: useStore(x => x.callEnded), callPhase: useStore(x => x.callPhase), callLine: useStore(x => x.callLine),
    look: useStore(x => x.look), comp: useStore(x => x.compName), conv: useStore(x => x.conv), busy: useStore(x => x.callBusy),
  };
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

  const ctrls: { label: string; icon: IconName; on: boolean; tap: () => void; toggle: boolean }[] = [
    { label: s.muted ? 'Unmute' : 'Mute', icon: s.muted ? 'mute' : 'mic', on: s.muted, tap: () => setMuted(!s.muted), toggle: true },
    { label: 'Captions', icon: 'chat', on: s.captions, tap: () => set({ captions: !s.captions }), toggle: true },
    { label: s.paused ? 'Resume' : 'Pause', icon: s.paused ? 'play' : 'pause', on: s.paused, tap: () => setPaused(!s.paused), toggle: true },
    { label: 'Text', icon: 'pen', on: false, tap: () => go('chat'), toggle: false }, // switching to text keeps the thread
  ];

  return (
    <div className="screen dark" role="main" aria-label="Conversation" style={{ zIndex: 20 }}>
      <div className="sc-head">
        <span className="pill" style={{ background: 'rgba(255,255,255,.12)', color: '#E6EBFF' }}>{s.comp} · AI companion</span>
        <span style={{ flex: 1 }} />
        <HelpPill />
      </div>
      <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, textAlign: 'center' }}>
        <Companion look={figureLook} size={s.callMode === 'video' ? 250 : 200} mode={avatarMode} />
        <div role="status" aria-live="polite" className="muted" style={{ color: '#C9D3F5' }}>{label}</div>
        {(sit || s.captions) && (
          <div style={{ minHeight: 76, maxWidth: 320 }}>
            <div className="fine" style={{ color: '#9FA9D6' }}>{sit && !s.callLine ? 'Breathing together' : s.paused ? s.comp : s.callLine?.who === 'me' ? 'You' : s.comp}</div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 19, lineHeight: 1.4, marginTop: 4, color: '#EEF2FF' }}>{s.paused ? 'I’ll wait. Take all the time you need.' : sit && !s.callLine ? breathWord : s.callLine?.text ?? ''}</div>
          </div>
        )}
      </div>
      <div style={{ padding: '0 18px 26px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          {ctrls.map(c => (
            <button key={c.label} data-track={`call.${c.label.toLowerCase()}`} onClick={c.tap} aria-pressed={c.toggle ? c.on : undefined} style={{ display: 'grid', justifyItems: 'center', gap: 7, color: '#EEF2FF' }}>
              <span className="iconbtn" style={{ width: 60, height: 60, background: c.on ? '#EEF2FF' : 'rgba(255,255,255,.14)', color: c.on ? '#1B2340' : '#fff' }}><Ic n={c.icon} /></span>
              <span className="small" style={{ color: '#C9D3F5' }}>{c.label}</span>
            </button>
          ))}
        </div>
        <button className="btn block" data-track="call.end" style={{ background: '#EEF2FF', color: '#1B2340', boxShadow: 'none' }} onClick={() => (sit ? void endCall() : setAsking(true))} disabled={s.busy && !s.conv}>End</button>
      </div>
      {asking && !s.callEnded && <FeelingSheet onPick={f => { setAsking(false); void endCall(f); }} />}
      {s.callEnded && <ClosingSheet />}
    </div>
  );
}

function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useDialog<HTMLDivElement>();
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <>
      <div className={'scrim' + (on ? ' on' : '')} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} className={'sheet' + (on ? ' on' : '')} role="dialog" aria-modal="true" aria-label={label} style={{ outline: 'none', color: 'var(--ink)' }}>
        <div className="grab" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

/** One optional tap before the call ends: how do you feel now? Never required. */
function FeelingSheet({ onPick }: { onPick: (f?: 'better' | 'same' | 'worse') => void }) {
  return (
    <Sheet label="How are you feeling">
      <h2 className="h1" style={{ fontSize: 24 }}>How are you feeling now?</h2>
      <div style={{ display: 'grid', gap: 8, margin: '14px 0 6px' }}>
        {([['better', 'A bit better'], ['same', 'About the same'], ['worse', 'A bit heavier']] as const).map(([k, label]) => <button key={k} className="btn line block" onClick={() => onPick(k)}>{label}</button>)}
      </div>
      <button className="btn ghost block" onClick={() => onPick(undefined)}>Skip</button>
    </Sheet>
  );
}

function ClosingSheet() {
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
    <Sheet label={title}>
      <h2 className="h1" style={{ fontSize: 24 }}>{title}</h2>
      {busy ? <p role="status" className="muted" style={{ marginTop: 10 }}>Saving our conversation…</p> : (
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          {checkin && out?.checkinResult && (
            <div className="card" style={{ display: 'grid', gap: 8 }}>
              {([['Sleep', out.checkinResult.sleep], ['Food', out.checkinResult.food], ['People', out.checkinResult.people], ['Okay thing', out.checkinResult.okayThing]] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="row small" style={{ alignItems: 'baseline' }}><span className="muted" style={{ width: 72, flex: 'none' }}>{k}</span><span className="grow1">{v}</span></div>
              ))}
            </div>
          )}
          {!checkin && !sit && out?.summary && <p className="muted">{out.summary}</p>}
          {sit && <p className="muted">Come back any time you want some quiet company.</p>}

          {proposed.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              <legend className="muted small" style={{ marginBottom: 6 }}>Want me to remember these? Untick anything.</legend>
              {proposed.map((m, i) => (
                <button key={i} className="check" role="checkbox" aria-checked={kept.includes(i)} onClick={() => toggle(i)}><i><Ic n="check" /></i><span>{m.text}{m.sensitive && <span className="muted"> · sensitive</span>}</span></button>
              ))}
            </fieldset>
          )}

          {checkin && out?.checkinResult && out.checkinResult.intentions.length > 0 && (
            <>
              <p>One small thing for tomorrow, if you like:</p>
              {out.checkinResult.intentions.map(label => <button key={label} className="btn line block" onClick={() => void addStep(label)}>{label}</button>)}
              <button className="btn ghost block" onClick={() => void leave()}>Neither, thanks</button>
            </>
          )}

          {firstRun && !checkin && (
            <>
              <p className="muted">I can check in on you each evening, around nine. You can change or stop that any time.</p>
              <button className="btn block" onClick={async () => { await updatePrefs({ checkinTime: 'evening' }); await leave('Okay. Tomorrow at 9 p.m., gently.'); }}>Yes, check in tomorrow</button>
              <button className="btn ghost block" onClick={() => void leave()}>Not now</button>
            </>
          )}

          {!checkin && !firstRun && (
            <>
              <button className="btn block" onClick={() => void leave()}>{sit ? 'Done' : 'Back to Home'}</button>
              {!sit && <button className="btn ghost block" onClick={() => void startCall('voice')}>Keep talking</button>}
            </>
          )}
          {checkin && !(out?.checkinResult?.intentions.length) && <button className="btn block" onClick={() => void leave()}>Done</button>}
        </div>
      )}
    </Sheet>
  );
}
