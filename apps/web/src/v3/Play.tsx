import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useDialog } from '../components/useDialog';
import { findCalm } from '../data/calm';
import { closeBreathe, closePlayer, openPlayer, stepPlayer, togglePlay } from '../state/actions';
import { useStore } from '../state/store';
import { logActivity } from './actions';
import { HelpButton } from './Chrome';
import { s } from './css';
import { I, Svg } from './icons';
import { loadMonthData } from './month-data';

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

/** Did that help? One optional tap. It teaches "what works for you", and nothing else. */
function Helped({ kind, onDone, dark }: { kind: 'breathe' | 'sleep'; onDone: () => void; dark?: boolean }) {
  const [said, setSaid] = useState(false);
  const pick = (h: boolean) => { logActivity(kind, h); setSaid(true); void loadMonthData(); setTimeout(onDone, 700); };
  const b = s(`height:48px;padding:0 20px;border-radius:24px;border:none;background:${dark ? 'rgba(255,255,255,.16)' : '#FFFFFF'};color:inherit;font-size:15px;font-weight:700`);
  return said ? <p role="status" style={s('margin:0;font-size:15px')}>Noted. Thank you.</p> : (
    <div style={s('display:flex;flex-direction:column;align-items:center;gap:10px')}>
      <span style={s('font-size:15px;opacity:.9')}>Did that help?</span>
      <div style={s('display:flex;gap:8px')}><button onClick={() => pick(true)} style={b}>It did</button><button onClick={() => pick(false)} style={b}>Not really</button></div>
    </div>
  );
}

export function BreatheScreen() {
  const reduce = useStore(x => x.reduceMotion);
  const ref = useDialog<HTMLDivElement>(closeBreathe);
  const core = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState('Get ready');
  const [cycle, setCycle] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0, last = '', finished = false;
    const loop = (n: number) => {
      const sec = (n - t0) / 1000, c = sec % 12;
      let sc: number, ph: string;
      if (c < 4) { sc = .55 + .45 * ease(c / 4); ph = 'Breathe in'; } else if (c < 6) { sc = 1; ph = 'Hold'; } else { sc = 1 - .45 * ease((c - 6) / 6); ph = 'Breathe out'; }
      if (!reduce && core.current) core.current.style.transform = `scale(${sc})`;
      if (ph !== last) { last = ph; setWord(ph); }
      setCycle(Math.min(2, Math.floor(sec / 12)));
      if (sec >= 36 && !finished) { finished = true; setDone(true); void api.breathed().then(() => loadMonthData()).catch(() => undefined); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Breathe with me" className="screen dark" style={{ ...s('z-index:62;background:linear-gradient(180deg,#2F2A5E 0%,#6F6BB8 100%);color:#FFFFFF;display:flex;flex-direction:column;align-items:center;padding:56px 24px 40px;outline:none') }}>
      <div style={s('align-self:stretch;display:flex;align-items:center;justify-content:space-between')}>
        <span style={s('font-size:14px;color:#D6D3EE;font-weight:600')}>{done ? '1 minute done' : `Breath ${cycle + 1} of 3`}</span>
        <HelpButton dark />
      </div>
      <div style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center')}>
        {!done ? (
          <>
            <div aria-hidden="true" style={s('width:280px;height:280px;display:grid;place-items:center')}>
              <div ref={core} style={s('width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.55),rgba(255,255,255,.12));display:grid;place-items:center;transform:scale(.55)')}><span style={s('width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.7)')} /></div>
            </div>
            <span className="serif" role="status" aria-live="polite" style={s('font-size:40px')}>{word}</span>
          </>
        ) : (
          <>
            <span className="serif" style={s('font-size:44px')}>Nicely done.</span>
            <Helped kind="breathe" dark onDone={closeBreathe} />
          </>
        )}
      </div>
      <button onClick={closeBreathe} style={s('align-self:stretch;height:56px;border-radius:28px;border:none;background:rgba(255,255,255,.16);color:#FFFFFF;font-size:16px;font-weight:700')}>{done ? 'Done' : 'Stop here'}</button>
    </div>
  );
}

export function PlayerScreen() {
  const id = useStore(x => x.player);
  const playing = useStore(x => x.pPlaying);
  const ended = useStore(x => x.pEnded);
  const line = useStore(x => x.pLineText);
  const idx = useStore(x => x.pLineIdx);
  const narrator = useStore(x => x.pNarrator);
  const nick = useStore(x => x.nick);
  const comp = useStore(x => x.compName);
  const ref = useDialog<HTMLDivElement>(closePlayer);
  const it = findCalm(id);
  useEffect(() => { if (ended) void loadMonthData(); }, [ended]);
  if (!it?.lines) return null;
  const story = it.kind === 'sleep';
  const total = it.lines.length;
  const pct = Math.round(Math.min(1, (idx + (playing ? 0.5 : 0)) / total) * 100);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={it.title} className="screen dark" style={{ ...s(`z-index:56;background:${story ? 'linear-gradient(180deg,#1E2A44,#12182B)' : 'linear-gradient(180deg,#3B3577,#1C1B3A)'};color:#FFFFFF;display:flex;flex-direction:column;padding:56px 24px 40px;outline:none`) }}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <button onClick={closePlayer} aria-label="Close" style={s('width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin-left:-10px')}><Svg d={I.down} size={24} stroke="#FFFFFF" /></button>
        <span style={s('font-size:13px;font-weight:700;color:#D6D3EE;letter-spacing:.06em;text-transform:uppercase')}>{story ? 'Story' : 'Meditation'}</span>
        <HelpButton dark />
      </div>
      <div style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;text-align:center')}>
        <div aria-hidden="true" style={s(`width:170px;height:170px;border-radius:50%;background:${story ? 'radial-gradient(circle at 40% 35%,#F8E9C8,#B7B1E6 55%,#5A5493)' : 'radial-gradient(circle at 40% 35%,#FFFFFF,#B7B1E6 50%,#6F6BB8)'};box-shadow:0 0 60px rgba(183,177,230,.5);animation:${playing ? 'kBob 5s ease-in-out infinite' : 'none'}`)} />
        {!ended ? (
          <p className="serif" aria-live="polite" key={idx} style={{ ...s('font-style:italic;font-size:24px;line-height:1.35;min-height:100px;margin:0;text-wrap:pretty;animation:kFade 900ms') }}>{line || 'Settling in…'}</p>
        ) : (
          <>
            <p className="serif" style={s('font-size:34px;line-height:1.15;margin:0')}>{story ? `Sleep well, ${nick || 'friend'}.` : 'Nicely done.'}</p>
            <Helped kind={story ? 'sleep' : 'breathe'} dark onDone={() => undefined} />
          </>
        )}
      </div>
      <span className="serif" style={s('font-size:30px;line-height:1.1')}>{it.title}</span>
      <span style={s('font-size:14px;color:#C9C6EA;margin-top:4px')}>{it.mins} min · {ended ? 'finished' : `part ${Math.min(idx + 1, total)} of ${total}`} · {narrator || `${comp}, on your phone`}</span>
      <div role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={s('margin-top:16px;height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden')}><div style={s(`height:100%;width:${pct}%;background:#FFFFFF;transition:width 600ms`)} /></div>
      <div style={s('display:flex;justify-content:center;align-items:center;gap:18px;margin-top:20px')}>
        {ended ? (
          <><button onClick={closePlayer} style={s('height:56px;padding:0 28px;border-radius:28px;border:none;background:#FFFFFF;color:#1E2430;font-size:16px;font-weight:700')}>Done</button><button onClick={() => openPlayer(it.id, { sounds: false })} style={s('height:56px;padding:0 22px;border-radius:28px;border:none;background:rgba(255,255,255,.16);color:#FFFFFF;font-size:16px;font-weight:700')}>Play again</button></>
        ) : (
          <>
            <button onClick={() => stepPlayer(-1)} aria-label="Previous part" style={s('width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.14);display:grid;place-items:center')}><Svg d={I.back} size={20} stroke="#FFFFFF" /></button>
            <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} style={s('width:76px;height:76px;border-radius:50%;border:none;background:#FFFFFF;display:grid;place-items:center')}><Svg d={playing ? I.pause : I.play} size={28} fill="#1E2430" stroke="#1E2430" sw={0} /></button>
            <button onClick={() => stepPlayer(1)} aria-label="Next part" style={s('width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.14);display:grid;place-items:center')}><Svg d={I.chev} size={20} stroke="#FFFFFF" /></button>
          </>
        )}
      </div>
    </div>
  );
}
