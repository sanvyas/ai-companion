import { useRef, useState } from 'react';
import { go } from '../state/actions';
import { useStore } from '../state/store';
import { greetFor, MOODS, WHY } from './moods';
import { s } from './css';
import { Svg, I } from './icons';
import { setMood, skipCheckin } from './actions';
import { Weather, WEATHER_NAMES } from './weather';
import { lastMood, setV3, useV3 } from './ui';

/** How are you, right now? One calm choice at a time: the weather for each answer is shown large, you move between them, and say "That's me". */
export function MoodScreen() {
  const nick = useStore(x => x.nick);
  const now = new Date();
  const last = lastMood();
  const recent = last && Date.now() - last.at < 3 * 86_400_000 ? last : null;
  const greet = greetFor(now.getHours());
  const [sel, setSel] = useState<number>(recent ? recent.mood : 2);
  const start = useRef<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const m = MOODS[sel];
  const move = (d: number) => setSel(v => Math.min(MOODS.length - 1, Math.max(0, v + d)));
  /** From where a finger is on the slider to the nearest of the five. */
  const pick = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((clientX - r.left) / r.width) * MOODS.length - 0.5);
    setSel(Math.min(MOODS.length - 1, Math.max(0, i)));
  };
  const confirm = () => { void setMood(sel); setV3({ over: 'why', why: [] }); };
  return (
    <div className="screen" role="main" aria-label="How are you" style={{ ...s('background:var(--page);display:flex;flex-direction:column;padding:52px 28px 36px;animation:kFade 700ms'), overflow: 'auto' }}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;min-height:44px')}>
        <span className="kicker" style={s('letter-spacing:.14em')}>{greet}{nick ? `, ${nick}` : ''}</span>
        <button onClick={() => { skipCheckin(); setV3({ over: null }); go('today'); }} data-track="mood.skip" style={s('min-height:44px;padding:0 0 0 12px;border:none;background:none;color:var(--muted);font-size:16px;font-weight:500')}>Not now</button>
      </div>

      <h1 className="serif" style={s('font-size:42px;line-height:1.08;margin:18px 0 0;font-weight:400')}>How are you,<br />right now?</h1>

      <div
        onPointerDown={e => { start.current = e.clientX; }}
        onPointerUp={e => { if (start.current !== null) { const d = e.clientX - start.current; if (Math.abs(d) > 36) move(d < 0 ? 1 : -1); } start.current = null; }}
        style={s('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;touch-action:pan-y')}
      >
        <div key={sel} style={s('position:relative;width:236px;height:236px;display:grid;place-items:center;animation:kPop 520ms cubic-bezier(.22,1,.36,1)')}>
          <svg width="236" height="236" viewBox="0 0 236 236" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="118" cy="118" r="116" fill="none" stroke="var(--line)" strokeWidth="1" />
            <circle cx="118" cy="118" r="92" fill="none" stroke="var(--line)" strokeWidth="1" opacity=".7" />
          </svg>
          <Weather mood={sel} size={176} live />
        </div>
        <div aria-live="polite" style={s('text-align:center;margin-top:10px')}>
          <div className="serif" style={s('font-size:40px;line-height:1.1;font-weight:400')}>{m.label}</div>
          <div style={s('font-size:16px;color:var(--muted);margin-top:6px')}>{WEATHER_NAMES[sel]} · {m.hint}</div>
        </div>
      </div>

      <div style={s('text-align:center;font-size:15px;color:var(--muted);font-weight:500;margin:4px 0 6px')}>Slide, or tap one</div>

      <div
        ref={track}
        aria-hidden="true"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; pick(e.clientX); }}
        onPointerMove={e => { if (drag.current) pick(e.clientX); }}
        onPointerUp={() => { drag.current = false; }}
        onPointerCancel={() => { drag.current = false; }}
        style={s('position:relative;height:60px;touch-action:none;cursor:grab;margin:0')}
      >
        <span style={s('position:absolute;left:10%;right:10%;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:var(--line)')} />
        <span style={{ position: 'absolute', left: '10%', top: '50%', height: 8, marginTop: -4, borderRadius: 4, background: 'var(--accent)', width: `${(sel / (MOODS.length - 1)) * 80}%`, transition: drag.current ? 'none' : 'width 220ms cubic-bezier(.22,1,.36,1)' }} />
        {MOODS.map((x, i) => <span key={x.label} style={{ position: 'absolute', left: `${10 + i * 20}%`, top: '50%', width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: '50%', background: i <= sel ? 'var(--accent)' : 'var(--line)', boxShadow: '0 0 0 3px var(--bg)' }} />)}
        <span style={{ position: 'absolute', left: `${10 + sel * 20}%`, top: '50%', width: 52, height: 52, marginLeft: -26, marginTop: -26, borderRadius: '50%', background: '#FFFFFF', border: '2px solid var(--accent)', boxShadow: '0 8px 20px rgba(30,36,48,.18)', display: 'grid', placeItems: 'center', transition: drag.current ? 'none' : 'left 220ms cubic-bezier(.22,1,.36,1)' }}>
          <Weather mood={sel} size={34} />
        </span>
      </div>

      <div
        role="radiogroup" aria-label="How are you feeling"
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); } }}
        style={s('display:grid;grid-template-columns:repeat(5,1fr);margin:0 -6px')}
      >
        {MOODS.map((x, i) => (
          <button key={x.label} role="radio" aria-checked={sel === i} aria-label={`${x.label}, ${WEATHER_NAMES[i].toLowerCase()}`} tabIndex={sel === i ? 0 : -1} onClick={() => setSel(i)} data-track={`mood.${i}`} style={s('min-height:64px;padding:6px 0;border:none;background:none;display:flex;flex-direction:column;align-items:center;gap:6px')}>
            <span style={{ display: 'grid', opacity: sel === i ? 1 : 0.7, transform: sel === i ? 'scale(1)' : 'scale(.9)', transition: 'transform 220ms, opacity 220ms' }}><Weather mood={i} size={32} /></span>
            <span style={{ fontSize: 14, lineHeight: 1.1, fontWeight: sel === i ? 700 : 500, color: sel === i ? 'var(--ink)' : 'var(--muted)' }}>{x.label}</span>
          </button>
        ))}
      </div>

      <button onClick={confirm} data-track="mood.confirm" style={s('margin-top:18px;height:58px;border-radius:29px;border:none;background:var(--accent);color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:.01em')}>That’s me</button>
    </div>
  );
}

/** What it is about. Optional, and it only helps Flint listen better. */
export function WhyScreen({ onDone }: { onDone: () => void }) {
  const mood = useStore(x => x.mood);
  const why = useV3(x => x.why);
  const m = mood === null ? null : MOODS[mood];
  const good = mood !== null && mood >= 3;
  return (
    <div className="screen" role="main" aria-label="What it is about" style={{ ...s('background:var(--page);display:flex;flex-direction:column;padding:60px 24px 32px;animation:kFade 500ms'), overflow: 'auto' }}>
      <button onClick={() => setV3({ over: 'mood' })} aria-label="Back" style={s('align-self:flex-start;width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin-left:-10px')}><Svg d={I.back} size={22} stroke="var(--ink)" /></button>
      <div style={s('margin-top:12px;animation:kPop 500ms')}><Weather mood={mood ?? 2} size={64} /></div>
      <h1 className="serif" style={s('font-size:38px;line-height:1.1;margin:20px 0 0')}>{good ? 'What’s making it good?' : m ? `What’s making it feel ${m.label.toLowerCase()}?` : 'What’s it about?'}</h1>
      <div style={s('font-size:17px;color:var(--muted);margin-top:8px;line-height:1.45')}>Pick any, or none. It helps me listen better.</div>
      <div role="group" aria-label="What it is about" style={s('display:flex;flex-wrap:wrap;gap:10px;margin-top:24px')}>
        {WHY.map(c => {
          const on = why.includes(c);
          return <button key={c} aria-pressed={on} onClick={() => setV3({ why: on ? why.filter(x => x !== c) : [...why, c] })} style={s(`height:52px;padding:0 20px;border-radius:26px;border:1.5px solid ${on ? 'var(--accent)' : 'var(--line)'};background:${on ? 'var(--accent)' : 'var(--card)'};font-size:17px;font-weight:600;color:${on ? '#FFFFFF' : 'var(--ink)'}`)}>{c}</button>;
        })}
      </div>
      <button onClick={onDone} data-track="why.continue" style={s('margin-top:auto;height:56px;border-radius:28px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600')}>{why.length ? 'Continue' : 'Skip this'}</button>
    </div>
  );
}
