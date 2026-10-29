import { useEffect, useRef } from 'react';
import { go, openChat, openSheet, sendChat, startCall } from '../state/actions';
import { set, useStore } from '../state/store';
import { HelpPill } from './Chrome';
import { Ic } from './icons';

/** Typing with the companion. The messages and the safety checks come from the shared conversation code. */
export function Chat() {
  const msgs = useStore(s => s.msgs);
  const typing = useStore(s => s.typing);
  const careCard = useStore(s => s.careCard);
  const draft = useStore(s => s.draft);
  const compName = useStore(s => s.compName);
  const conv = useStore(s => s.conv);
  const busy = useStore(s => s.callBusy);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs.length, typing, careCard]);

  return (
    <div className="screen" role="main" aria-label="Text conversation" style={{ zIndex: 20 }}>
      <div className="sc-head">
        <button className="backbtn" onClick={() => go('talk')} aria-label="Back"><Ic n="back" />Back</button>
        <div className="ttl" style={{ textAlign: 'center' }}>{compName}<div className="fine" style={{ fontWeight: 600 }}>AI companion</div></div>
        <button className="iconbtn" onClick={() => void startCall('voice')} aria-label="Switch to voice"><Ic n="mic" /></button>
        <HelpPill />
      </div>

      <div ref={ref} className="sc-body" role="log" aria-live="polite" aria-label="Conversation">
        <div className="msgs">
          {msgs.map((m, i) => (
            <div key={i} className={'m ' + (m.who === 'me' ? 'me' : 'her')}>
              <span className="sr-only">{m.who === 'ai' ? `${compName} says: ` : 'You said: '}</span>{m.text}
            </div>
          ))}
          {typing && <div className="typing" role="status"><span className="sr-only">{compName} is typing</span><i /><i /><i /></div>}
        </div>
      </div>

      {careCard && (
        <section aria-label="Support" className="card" style={{ margin: '0 14px 10px', background: 'var(--t-sand)', display: 'grid', gap: 10 }}>
          <b>Talk to a real person</b>
          <span className="small" style={{ color: 'var(--ink2)' }}>Free, any time, in your language. I’ll stay here too.</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm indigo grow1" onClick={() => openSheet('helplines')}>See helplines</button>
            <button className="btn sm ghost" onClick={() => set({ careCard: false })}>Not now</button>
          </div>
        </section>
      )}

      {!conv && !busy && (
        <div role="alert" className="card" style={{ margin: '0 14px 10px', display: 'grid', gap: 10 }}>
          <span className="small">I’m not connected right now. Your words aren’t lost, and help is always one tap away.</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => void openChat()}>Try again</button>
            <button className="btn sm ghost" onClick={() => openSheet('helplines')}>See helplines</button>
          </div>
        </div>
      )}

      <form className="composer" onSubmit={e => { e.preventDefault(); sendChat(); }}>
        <input type="text" aria-label="Message" disabled={!conv} value={draft} onChange={e => set({ draft: e.target.value })} placeholder="Say anything" autoComplete="off" />
        <button type="submit" className="send" aria-label="Send"><Ic n="send" /></button>
      </form>
    </div>
  );
}
