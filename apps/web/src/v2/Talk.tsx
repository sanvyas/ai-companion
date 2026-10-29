import { useEffect } from 'react';
import { dayOf, useStore } from '../state/store';
import { go, loadTalk, loadYou, openBreathe, openChat, openSheet, startCall, startJournal } from '../state/actions';
import { HelpPill } from './Chrome';
import { Ic, type IconName } from './icons';

const CHECKIN_LABEL = { morning: 'every morning', evening: 'every evening', off: 'not set' } as const;

function Mode({ icon, bg, title, sub, onClick, big, track }: { icon: IconName; bg?: string; title: string; sub: string; onClick: () => void; big?: boolean; track: string }) {
  return (
    <button className={'mode' + (big ? ' big' : '')} data-track={track} onClick={onClick}>
      <span className="ico" style={bg ? { background: bg } : undefined}><Ic n={icon} /></span>
      <span className="grow1"><b className="h3" style={{ display: 'block' }}>{title}</b><span className={big ? '' : 'muted small'} style={big ? { opacity: .85, fontSize: 14 } : undefined}>{sub}</span></span>
      <Ic n="chev" />
    </button>
  );
}

export function Talk() {
  const compName = useStore(s => s.compName);
  const recent = useStore(s => s.recent);
  const prefs = useStore(s => s.prefs);
  useEffect(() => { void loadTalk(); void loadYou(); }, []);
  const last = recent.find(r => r.summary);
  return (
    <>
      <div className="hhead"><div><div className="eyebrow">Talk</div><h1 className="h1" style={{ marginTop: 4 }}>Someone to<br />talk to</h1></div><HelpPill /></div>
      <p className="muted" style={{ margin: '-4px 0 16px' }}>{compName} listens without judging. Choose how you’d like to talk.</p>
      <div className="stg">
        <Mode big icon="mic" title="Talk out loud" sub="Voice call. Just speak, and I listen." onClick={() => void startCall('voice')} track="talk.voice" />
        <Mode icon="chat" bg="var(--t-lilac)" title={`Type to ${compName}`} sub="Chat at your own pace." onClick={() => void openChat()} track="talk.text" />
        <Mode icon="cam" bg="var(--t-rose)" title={`See ${compName}`} sub="Video call, a face to talk to." onClick={() => void startCall('video')} track="talk.video" />
      </div>

      <div className="sec">
        <div className="sec-h"><h2 className="h2">Quieter ways</h2></div>
        <Mode icon="user" bg="#E4DDF3" title="Just sit with me" sub="Quiet company. No need to say anything." onClick={() => void startCall('sit')} track="talk.sit" />
        <Mode icon="pen" bg="#FBE2CE" title="Talk it out" sub="Speak freely. Saved as a private journal entry." onClick={() => startJournal('speak')} track="talk.talk_it_out" />
        <Mode icon="wave" bg="var(--t-sky)" title="Breathe" sub="Three slow breaths, guided." onClick={openBreathe} track="talk.breathe" />
      </div>

      <div className="sec">
        <div className="sec-h"><h2 className="h2">{compName} checks on you</h2></div>
        <div className="card row" style={{ gap: 12 }}>
          <span className="ico" style={{ background: 'var(--t-sand)' }}><Ic n="bell" /></span>
          <div className="grow1"><b>Daily check-in</b><div className="muted small">{prefs ? CHECKIN_LABEL[prefs.checkinTime] : '…'}. You can change this any time.</div></div>
          <button className="link" onClick={() => go('notifs')}>Change</button>
        </div>
      </div>

      <div className="sec">
        <div className="card row" style={{ background: 'var(--t-rose)', gap: 12 }}>
          <span className="ico" style={{ background: 'var(--t-rose)' }}><Ic n="life" color="#8A2D1C" /></span>
          <div className="grow1"><b>Need someone right now?</b><div className="small muted">Helplines and your safety plan are one tap away.</div></div>
          <button className="btn sm" style={{ background: '#C7432B', color: '#fff', boxShadow: 'none' }} onClick={() => openSheet('support')}>Get help</button>
        </div>
      </div>

      {last && (
        <div className="sec">
          <div className="sec-h"><h2 className="h2">Last time</h2></div>
          <button className="card" style={{ width: '100%', textAlign: 'left' }} onClick={() => void openChat(last.id)}>
            <p className="small muted">{dayOf(last.startedAt)}</p>
            <p style={{ marginTop: 4 }}>{last.summary}</p>
            <p className="link" style={{ marginTop: 6 }}>Pick it back up</p>
          </button>
        </div>
      )}
      <p className="foot">{compName} is an AI companion, not a doctor or therapist.</p>
    </>
  );
}
