import { useEffect, useRef, useState } from 'react';
import { Companion } from '../components/figures';
import { addPlanItem, endCall, endWalk, go, loadTalk, openChat, openSheet, saveProposedMemories, sendChat, startCall, startWalkFlow, talkOnWalk, updatePrefs } from '../state/actions';
import { setMuted, setPaused } from '../state/conversation';
import { set, useStore, type CallPhase } from '../state/store';
import { logActivity } from './actions';
import { Head, HelpButton, Sheet } from './Chrome';
import { s } from './css';
import { I, Svg } from './icons';

const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
const useSeconds = () => { const [n, setN] = useState(0); useEffect(() => { const t = setInterval(() => setN(x => x + 1), 1000); return () => clearInterval(t); }, []); return n; };

// ------------------------------------------------------------------------------------------------ the Talk tab
export function TalkTab() {
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  useEffect(() => { void loadTalk(); }, []);
  const modes: [string, string, () => void, boolean][] = [['Voice', I.mic, () => void startCall('voice'), true], ['Video', I.video, () => void startCall('video'), false], ['Text', I.chat, () => void openChat(), false]];
  const be: [string, string, string, string, () => void][] = [['Sit with me', 'Quiet company', I.sit, '#5B57A6', () => void startCall('sit')], ['Walk with me', 'In your ear', I.walk, '#3E7F4C', () => void startWalkFlow()]];
  return (
    <div className="screen" data-scroll="1" style={{ ...s('overflow:auto;background:linear-gradient(180deg,#ECE8F8 0%,#FAF6EF 55%);display:flex;flex-direction:column;padding:58px 20px 120px;gap:14px') }}>
      <Head title="Talk" />
      <div style={s('display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 0 4px')}>
        <div style={s('width:170px;height:170px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 40%,#FFFFFF,#E6E2F6);display:flex;justify-content:center;align-items:flex-end')}><Companion look={look} size={170} /></div>
        <p className="serif" style={s('font-size:30px;line-height:1.1;text-align:center;margin:0')}>Say anything.<br />No judging.</p>
      </div>
      <div style={s('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
        {modes.map(([label, icon, run, primary]) => (
          <button key={label} onClick={run} data-track={`talk.${label.toLowerCase()}`} style={s(`border:none;border-radius:24px;padding:16px 8px;background:${primary ? '#2F2A5E' : '#FFFFFF'};color:${primary ? '#FFFFFF' : '#1E2430'};display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:0 8px 22px rgba(30,36,48,.06);min-height:88px`)}>
            <Svg d={icon} size={26} /><span style={s('font-size:15px;font-weight:700')}>{label}</span>
          </button>
        ))}
      </div>
      <h2 className="kicker" style={s('margin:8px 0 0')}>Just be with me</h2>
      <div style={s('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px')}>
        {be.map(([label, sub, icon, bg, run]) => (
          <button key={label} onClick={run} data-track={`talk.${label.split(' ')[0].toLowerCase()}`} style={s(`text-align:left;border:none;border-radius:24px;padding:16px;background:${bg};color:#FFFFFF;height:132px;display:flex;flex-direction:column;justify-content:space-between`)}>
            <Svg d={icon} size={26} stroke="#FFFFFF" />
            <span style={s('display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:17px;font-weight:700')}>{label}</span><span style={s('font-size:13px;opacity:.9')}>{sub}</span></span>
          </button>
        ))}
      </div>
      <div style={s('display:flex;gap:8px;align-items:center;justify-content:center;font-size:13px;color:#636B78;margin-top:6px')}><Svg d={I.lock} size={14} sw={2} stroke="#636B78" />Private. {comp} is an AI, not a therapist.</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ a call: voice, video, check-in, or sitting together
export function CallScreen() {
  const mode = useStore(x => x.callMode);
  const phase0 = useStore(x => x.callPhase);
  const paused = useStore(x => x.paused);
  const muted = useStore(x => x.muted);
  const captions = useStore(x => x.captions);
  const line = useStore(x => x.callLine);
  const ended = useStore(x => x.callEnded);
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  const conv = useStore(x => x.conv);
  const busy = useStore(x => x.callBusy);
  const tick = useStore(x => x.tick);
  const secs = useSeconds();
  const [asking, setAsking] = useState(false);
  const sit = mode === 'sit';
  const phase: CallPhase = paused ? 'paused' : phase0;
  const avatar = phase === 'connecting' || phase === 'error' ? 'idle' : phase;
  const figureLook = mode === 'video' && look === 'orb' ? 'asha' : look;
  const label = ({ connecting: 'Connecting…', paused: 'Paused. Take your time.', thinking: 'Thinking…', speaking: `${comp} is speaking`, listening: muted ? 'Muted' : 'Listening… take your time', idle: sit ? 'Here with you. No need to talk.' : 'Not connected', error: 'Not connected' } as const)[phase];
  const SIT = ['I’m here.', 'No need to say anything.', 'Breathe as slow as you like.', 'Still here with you.', 'Take all the time you need.'];
  const sitLine = line?.who === 'ai' ? line.text : SIT[Math.floor(tick / 12) % SIT.length];
  const lastMe = line?.who === 'me' ? line.text : '';
  const ai = paused ? 'I’ll wait. Take all the time you need.' : line?.who === 'ai' ? line.text : '';

  if (sit) {
    return (
      <div className="screen dark" role="main" aria-label="Sitting together" style={{ ...s('background:linear-gradient(180deg,#2B2858 0%,#463F7E 60%,#7A6BA8 100%);color:#FFFFFF;display:flex;flex-direction:column;align-items:center;padding:70px 24px 40px') }}>
        <span style={s('font-size:14px;color:#D6D3EE;font-weight:600')}>Sitting together · {mmss(secs)}</span>
        <div style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px')}>
          <div style={s('width:230px;height:230px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.25),rgba(255,255,255,.05));display:flex;justify-content:center;align-items:flex-end')}><Companion look={figureLook} size={230} mode="listening" /></div>
          <p className="serif" role="status" aria-live="polite" style={s('font-size:30px;line-height:1.15;text-align:center;min-height:70px;margin:0')}>{sitLine}</p>
        </div>
        <div style={s('display:flex;gap:10px;align-self:stretch')}>
          <button onClick={() => void startCall('voice')} style={s('flex:1;height:56px;border-radius:28px;border:none;background:rgba(255,255,255,.14);color:#FFFFFF;font-size:16px;font-weight:700')}>Talk to me</button>
          <button onClick={() => void endCall()} data-track="sit.end" style={s('flex:1;height:56px;border-radius:28px;border:none;background:#FFFFFF;color:#2B2858;font-size:16px;font-weight:700')}>I’m okay now</button>
        </div>
        {ended && <ClosingSheet />}
      </div>
    );
  }

  const ctl = (aria: string, icon: string, on: boolean, tap: () => void, text: string) => (
    <button onClick={tap} aria-pressed={on} aria-label={aria} style={s('background:none;border:none;display:flex;flex-direction:column;align-items:center;gap:6px;color:#C9C6EA;width:76px')}>
      <span style={s(`width:56px;height:56px;border-radius:50%;background:${on ? '#FFFFFF' : 'rgba(255,255,255,.12)'};color:${on ? '#2F2A5E' : '#FFFFFF'};display:grid;place-items:center`)}><Svg d={icon} size={22} /></span>
      <span style={s('font-size:13px')}>{text}</span>
    </button>
  );
  const video = mode === 'video';
  return (
    <div className="screen dark" role="main" aria-label="Conversation" style={{ ...s('background:radial-gradient(120% 70% at 50% 30%,#3B3577 0%,#221F45 55%,#15132C 100%);color:#FFFFFF;display:flex;flex-direction:column;padding:56px 20px 36px') }}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <span style={s('font-size:14px;color:#D6D3EE;font-weight:600')}>{video ? 'Video call' : mode === 'checkin' ? 'Check-in' : 'Voice call'} · {mmss(secs)}</span>
        <HelpButton dark />
      </div>
      <div style={s('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px')}>
        <div style={s(`position:relative;width:${video ? 300 : 210}px;height:${video ? 360 : 210}px;border-radius:${video ? '32px' : '50%'};display:flex;justify-content:center;align-items:flex-end`)}>
          {!video && phase === 'speaking' && <span aria-hidden="true" style={s('position:absolute;inset:0;border-radius:50%;border:2px solid #B7B1E6;animation:kRing 1.6s ease-out infinite')} />}
          <div style={s(`position:relative;width:100%;height:100%;border-radius:${video ? '32px' : '50%'};overflow:hidden;background:radial-gradient(circle at 50% 40%,#5A54A0,#2F2A5E);display:flex;justify-content:center;align-items:flex-end`)}><Companion look={figureLook} size={video ? 300 : 210} mode={avatar} /></div>
        </div>
        <div role="status" aria-live="polite" style={s('font-size:14px;color:#D6D3EE;font-weight:600;min-height:20px')}>{label}</div>
        {captions && (
          <div style={s('min-height:96px;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;padding:0 8px')}>
            <span style={s('font-size:19px;line-height:1.4;text-wrap:pretty')}>{ai}</span>
            <span style={s('font-size:15px;color:#BDB9E0;line-height:1.4')}>{lastMe ? `“${lastMe}”` : ''}</span>
          </div>
        )}
      </div>
      <div style={s('display:flex;justify-content:space-around;align-items:flex-start;margin-bottom:6px')}>
        {ctl('Type instead', I.chat, false, () => go('chat'), 'Type')}
        {ctl(muted ? 'Unmute' : 'Mute', I.mic, muted, () => setMuted(!muted), muted ? 'Muted' : 'Mic on')}
        {ctl(paused ? 'Resume' : 'Take a moment', paused ? I.play : I.pause, paused, () => setPaused(!paused), paused ? 'Resume' : 'Pause')}
        {ctl(captions ? 'Hide captions' : 'Show captions', I.book, captions, () => set({ captions: !captions }), 'Words')}
      </div>
      <button onClick={() => setAsking(true)} disabled={busy && !conv} data-track="call.end" style={s('height:56px;border-radius:28px;border:none;background:#D9534F;color:#FFFFFF;font-size:16px;font-weight:700;margin-top:10px')}>End</button>
      {asking && !ended && <FeelingSheet onPick={f => { setAsking(false); if (f) logActivity('talk', f === 'better'); void endCall(f); }} />}
      {ended && <ClosingSheet />}
    </div>
  );
}

/** One optional tap before it ends: how do you feel now? Never required. */
function FeelingSheet({ onPick }: { onPick: (f?: 'better' | 'same' | 'worse') => void }) {
  return (
    <Sheet label="How are you feeling" onClose={() => onPick(undefined)}>
      <h2 className="serif" style={s('font-size:30px;line-height:1.1;margin:0')}>How are you feeling now?</h2>
      {([['better', 'A bit better'], ['same', 'About the same'], ['worse', 'A bit heavier']] as const).map(([k, label]) => (
        <button key={k} onClick={() => onPick(k)} style={s('height:56px;border-radius:18px;border:none;background:#FFFFFF;font-size:16px;font-weight:600;text-align:left;padding:0 18px')}>{label}</button>
      ))}
      <button onClick={() => onPick(undefined)} style={s('height:48px;border:none;background:none;color:#636B78;font-size:15px;font-weight:600')}>Skip</button>
    </Sheet>
  );
}

function ClosingSheet() {
  const firstRun = useStore(x => x.firstRun);
  const mode = useStore(x => x.callMode);
  const busy = useStore(x => x.callBusy);
  const out = useStore(x => x.callSummary);
  const sit = mode === 'sit';
  const checkin = mode === 'checkin' && !!out?.checkinResult;
  const proposed = out?.proposedMemories ?? [];
  const [keep, setKeep] = useState<number[] | null>(null);
  const kept = keep ?? proposed.map((m, i) => (m.sensitive ? -1 : i)).filter(i => i >= 0);
  const toggle = (i: number) => setKeep(kept.includes(i) ? kept.filter(x => x !== i) : [...kept, i]);
  const leave = async (msg?: string) => { if (kept.length) await saveProposedMemories(kept.map(i => proposed[i]), 'call'); go('today', { firstRun: false }); if (msg) set({ toast: msg }); };
  const addStep = async (label: string) => { await addPlanItem(label, 'checkin'); await leave('Added to your tiny steps.'); };
  const title = busy ? 'One moment…' : firstRun ? 'Nice to meet you' : checkin ? 'Thanks for checking in.' : sit ? 'Glad you stayed a while.' : 'Before you go';
  const btn = (primary: boolean) => s(`height:56px;border-radius:28px;border:none;background:${primary ? '#2F2A5E' : '#FFFFFF'};color:${primary ? '#FFFFFF' : '#1E2430'};font-size:16px;font-weight:700`);
  return (
    <Sheet label={title} onClose={() => void leave()}>
      <h2 className="serif" style={s('font-size:30px;line-height:1.1;margin:0')}>{title}</h2>
      {busy ? <p role="status" style={s('color:#636B78;margin:0')}>Saving our conversation…</p> : (
        <>
          {checkin && out?.checkinResult && (
            <div style={s('background:#FFFFFF;border-radius:20px;padding:14px 16px;display:grid;gap:8px')}>
              {([['Sleep', out.checkinResult.sleep], ['Food', out.checkinResult.food], ['People', out.checkinResult.people], ['Okay thing', out.checkinResult.okayThing]] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={s('display:flex;gap:10px;font-size:14px;align-items:baseline')}><span style={s('color:#636B78;width:72px;flex:none')}>{k}</span><span>{v}</span></div>
              ))}
            </div>
          )}
          {!checkin && !sit && out?.summary && <p style={s('color:#636B78;margin:0;font-size:15px;line-height:1.5')}>{out.summary}</p>}
          {sit && <p style={s('color:#636B78;margin:0')}>Come back any time you want some quiet company.</p>}
          {proposed.length > 0 && (
            <fieldset style={s('border:0;padding:0;margin:0;display:grid;gap:8px')}>
              <legend style={s('color:#636B78;font-size:13px;margin-bottom:6px')}>Want me to remember these? Untick anything.</legend>
              {proposed.map((m, i) => (
                <button key={i} role="checkbox" aria-checked={kept.includes(i)} onClick={() => toggle(i)} style={s(`display:flex;align-items:center;gap:12px;border:none;border-radius:18px;background:${kept.includes(i) ? '#E0EFE5' : '#FFFFFF'};padding:12px 14px;text-align:left;font-size:15px;line-height:1.35`)}>
                  <span style={s(`flex:none;width:26px;height:26px;border-radius:50%;border:2px solid #1E2430;background:${kept.includes(i) ? '#1E2430' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={13} stroke="#FFFFFF" sw={3} style={{ opacity: kept.includes(i) ? 1 : 0 }} /></span>
                  <span>{m.text}{m.sensitive && <span style={s('color:#636B78')}> · sensitive</span>}</span>
                </button>
              ))}
            </fieldset>
          )}
          {checkin && out?.checkinResult && out.checkinResult.intentions.length > 0 && (
            <>
              <p style={s('margin:0')}>One small thing for tomorrow, if you like:</p>
              {out.checkinResult.intentions.map(label => <button key={label} onClick={() => void addStep(label)} style={btn(false)}>{label}</button>)}
              <button onClick={() => void leave()} style={s('height:48px;border:none;background:none;color:#636B78;font-size:15px;font-weight:600')}>Neither, thanks</button>
            </>
          )}
          {firstRun && !checkin && (
            <>
              <p style={s('color:#636B78;margin:0')}>I can check in on you each evening, around nine. You can change or stop that any time.</p>
              <button onClick={async () => { await updatePrefs({ checkinTime: 'evening' }); await leave('Okay. Tomorrow at 9 p.m., gently.'); }} style={btn(true)}>Yes, check in tomorrow</button>
              <button onClick={() => void leave()} style={s('height:48px;border:none;background:none;color:#636B78;font-size:15px;font-weight:600')}>Not now</button>
            </>
          )}
          {!checkin && !firstRun && (
            <>
              <button onClick={() => void leave()} style={btn(true)}>{sit ? 'Done' : 'Back to Home'}</button>
              {!sit && <button onClick={() => void startCall('voice')} style={s('height:48px;border:none;background:none;color:#2F2A5E;font-size:15px;font-weight:700')}>Keep talking</button>}
            </>
          )}
          {checkin && !(out?.checkinResult?.intentions.length) && <button onClick={() => void leave()} style={btn(true)}>Done</button>}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ typing with the companion
export function ChatScreen() {
  const msgs = useStore(x => x.msgs);
  const typing = useStore(x => x.typing);
  const careCard = useStore(x => x.careCard);
  const draft = useStore(x => x.draft);
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  const conv = useStore(x => x.conv);
  const busy = useStore(x => x.callBusy);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs.length, typing, careCard]);
  const mine = msgs.filter(m => m.who === 'me').length;
  const quick = ['Not great, honestly', 'Can I just vent?', 'Give me advice', 'Distract me'];
  const say = (t: string) => { set({ draft: t }); sendChat(); };
  return (
    <div className="screen" role="main" aria-label="Text conversation" style={{ ...s('background:#FAF6EF;display:flex;flex-direction:column') }}>
      <div style={s('display:flex;align-items:center;gap:10px;padding:52px 16px 12px;background:#FFFFFF;box-shadow:0 1px 0 #EEE8DE')}>
        <button onClick={() => go('talk')} aria-label="Back" style={s('width:40px;height:44px;border:none;background:none;display:grid;place-items:center')}><Svg d={I.back} size={22} stroke="#1E2430" /></button>
        <div style={s('width:40px;height:40px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:grid;place-items:center')}><Companion look={look} size={40} /></div>
        <div style={s('flex:1;display:flex;flex-direction:column')}><span style={s('font-size:16px;font-weight:700')}>{comp}</span><span style={s('font-size:12px;color:#2F6B3C;font-weight:600')}>{typing ? 'typing…' : conv ? 'Always here' : 'Connecting…'}</span></div>
        <button onClick={() => void startCall('voice')} aria-label="Switch to a voice call" style={s('width:44px;height:44px;border-radius:50%;border:none;background:#F1EDE6;display:grid;place-items:center')}><Svg d={I.phone} size={20} stroke="#1E2430" /></button>
        <HelpButton small />
      </div>
      <div ref={ref} role="log" aria-live="polite" aria-label="Conversation" data-scroll="1" style={s('flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:8px')}>
        <span style={s('align-self:center;font-size:12px;color:#636B78;background:#F1EDE6;border-radius:12px;padding:4px 10px')}>Private · you can say anything</span>
        {msgs.map((m, i) => (
          <div key={i} style={s(`align-self:${m.who === 'me' ? 'flex-end' : 'flex-start'};max-width:82%;background:${m.who === 'me' ? '#2F2A5E' : '#FFFFFF'};color:${m.who === 'me' ? '#FFFFFF' : '#1E2430'};border-radius:${m.who === 'me' ? '20px 20px 6px 20px' : '20px 20px 20px 6px'};padding:12px 14px;font-size:16px;line-height:1.45;animation:kUp 300ms`)}>
            <span className="sr">{m.who === 'ai' ? `${comp} says: ` : 'You said: '}</span>{m.text}
          </div>
        ))}
        {typing && <div role="status" style={s('align-self:flex-start;background:#FFFFFF;border-radius:18px 18px 18px 6px;padding:12px 16px;font-size:16px;color:#636B78')}><span className="sr">{comp} is typing</span>…</div>}
        {careCard && (
          <section aria-label="Support" style={s('background:#FFF1E8;border:1px solid #F0B79C;border-radius:20px;padding:14px;display:flex;flex-direction:column;gap:10px;max-width:92%')}>
            <span style={s('font-size:15px;line-height:1.4')}>You matter. Talking to a real person can help right now. It’s free, any time.</span>
            <button onClick={() => openSheet('support')} style={s('height:44px;border-radius:22px;border:none;background:#9A3B1E;color:#FFFFFF;font-size:15px;font-weight:700')}>See who you can call</button>
          </section>
        )}
      </div>
      {!conv && !busy && (
        <div role="alert" style={s('margin:0 16px 8px;background:#FFFFFF;border-radius:18px;padding:12px 14px;font-size:14px;display:grid;gap:8px')}>
          I’m not connected right now. Your words aren’t lost, and help is always one tap away.
          <button onClick={() => void openChat()} style={s('height:40px;border-radius:20px;border:none;background:#2F2A5E;color:#FFFFFF;font-weight:700')}>Try again</button>
        </div>
      )}
      {mine < 2 && conv && (
        <div style={s('display:flex;gap:6px;overflow-x:auto;padding:0 16px 8px')}>
          {quick.map(q => <button key={q} onClick={() => say(q)} style={s('flex:none;height:44px;padding:0 14px;border-radius:22px;border:1.5px solid #D9D2C5;background:#FFFFFF;font-size:14px;font-weight:600')}>{q}</button>)}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); sendChat(); }} style={s('display:flex;gap:8px;align-items:center;padding:8px 12px 34px;background:#FFFFFF;box-shadow:0 -1px 0 #EEE8DE')}>
        <input type="text" aria-label="Message" disabled={!conv} value={draft} onChange={e => set({ draft: e.target.value })} placeholder="Say anything…" autoComplete="off" style={s('flex:1;height:44px;border-radius:22px;border:none;background:#F1EDE6;padding:0 16px;font-size:16px;outline:none')} />
        <button type="submit" aria-label="Send" style={s('flex:none;width:44px;height:44px;border-radius:50%;border:none;background:#2F2A5E;display:grid;place-items:center')}><Svg d={I.send} size={18} stroke="#FFFFFF" sw={2} /></button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ walking together
const WALK = ['Let’s go at your pace. Notice the air on your face.', 'Look up. Find three colours you like.', 'Feel your feet. Heel, then toe.', 'Listen. What’s the farthest sound you can hear?', 'Roll your shoulders back, slowly.', 'You’re doing it. One more minute?'];
export function WalkScreen() {
  const tick = useStore(x => x.tick);
  const ended = useStore(x => x.walkEnded);
  const line = useStore(x => x.callLine);
  const secs = useStore(x => x.walkSeconds);
  const listening = useStore(x => x.callPhase === 'listening');
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  const prompt = line?.who === 'ai' ? line.text : WALK[Math.floor(tick / 15) % WALK.length];
  return (
    <div className="screen" role="main" aria-label="Walk with me" style={{ ...s('background:linear-gradient(180deg,#DDEFE4 0%,#F7EED9 100%);display:flex;flex-direction:column;align-items:center;padding:70px 24px 40px') }}>
      {!ended ? (
        <>
          <span style={s('font-size:14px;color:#2E4A35;font-weight:700')}>Walking with {comp} · {mmss(tick)}</span>
          <div style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;align-self:stretch')}>
            <div style={s('position:relative;width:220px;height:220px;border-radius:50%;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(46,74,53,.15)')}>
              <span aria-hidden="true" style={s('position:absolute;inset:-10px;border-radius:50%;border:3px solid #93C48A;animation:kRing 3s ease-out infinite')} />
              <span style={s('font-size:52px;font-weight:700;line-height:1')}>{Math.max(1, Math.floor(tick / 60))}</span>
              <span style={s('font-size:14px;color:#636B78;font-weight:600')}>{tick < 120 ? 'minute so far' : 'minutes so far'}</span>
            </div>
            <div role="status" aria-live="polite" style={s('align-self:stretch;background:#FFFFFF;border-radius:24px;padding:18px;display:flex;gap:12px;align-items:center;animation:kUp 500ms')}>
              <div style={s('flex:none;width:44px;height:44px;border-radius:50%;overflow:hidden;background:#EEF5EC;display:grid;place-items:center')}><Companion look={look} size={44} /></div>
              <span style={s('font-size:17px;line-height:1.4')}>{prompt}</span>
            </div>
            <span style={s('font-size:13px;color:#4A6A52')}>I don’t track your location.</span>
          </div>
          <div style={s('align-self:stretch;display:grid;gap:8px')}>
            <button onClick={() => void talkOnWalk()} style={s('height:52px;border-radius:26px;border:2px solid #2E4A35;background:none;color:#2E4A35;font-size:16px;font-weight:700')}>{listening ? 'Listening…' : 'Talk'}</button>
            <button onClick={() => { void endWalk().then(() => logActivity('walk')); }} data-track="walk.end" style={s('height:56px;border-radius:28px;border:none;background:#2E4A35;color:#FFFFFF;font-size:16px;font-weight:700')}>End walk</button>
          </div>
        </>
      ) : (
        <>
          <div style={s('flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;align-self:stretch')}>
            <h1 className="serif" style={s('font-size:40px;line-height:1.05;margin:0')}>You went out. That matters.</h1>
            <p style={s('color:#4A6A52;margin:0;font-size:16px;line-height:1.5')}>{mmss(secs)} outside. It’s in your month.</p>
          </div>
          <button onClick={() => go('today')} style={s('align-self:stretch;height:56px;border-radius:28px;border:none;background:#2E4A35;color:#FFFFFF;font-size:16px;font-weight:700')}>Done</button>
        </>
      )}
    </div>
  );
}
