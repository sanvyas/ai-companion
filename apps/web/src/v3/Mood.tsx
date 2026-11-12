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
  const m = MOODS[sel];
  const move = (d: number) => setSel(v => Math.min(MOODS.length - 1, Math.max(0, v + d)));
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

      <div
        role="radiogroup" aria-label="How are you feeling"
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); } }}
        style={s('position:relative;display:flex;justify-content:space-between;align-items:center;margin:8px 4px 0')}
      >
        <span aria-hidden="true" style={s('position:absolute;left:24px;right:24px;top:50%;height:1px;background:var(--line)')} />
        {MOODS.map((x, i) => (
          <button key={x.label} role="radio" aria-checked={sel === i} aria-label={`${x.label}, ${WEATHER_NAMES[i].toLowerCase()}`} tabIndex={sel === i ? 0 : -1} onClick={() => setSel(i)} data-track={`mood.${i}`} style={s(`position:relative;width:52px;height:52px;border-radius:50%;border:${sel === i ? '1.5px solid var(--accent)' : '1.5px solid transparent'};background:var(--bg);display:grid;place-items:center;padding:0;transition:border-color 200ms`)}>
            <span style={{ display: 'grid', opacity: sel === i ? 1 : 0.55, transform: sel === i ? 'scale(1.08)' : 'scale(.86)', transition: 'transform 240ms, opacity 240ms' }}><Weather mood={i} size={34} /></span>
          </button>
        ))}
      </div>
      <div aria-hidden="true" style={s('display:flex;justify-content:space-between;margin:8px 0 0;font-size:13px;color:var(--muted);font-weight:500')}><span>Heavy</span><span>Light</span></div>

      <button onClick={confirm} data-track="mood.confirm" style={s('margin-top:24px;height:58px;border-radius:29px;border:none;background:var(--accent);color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:.01em')}>That’s me</button>
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
