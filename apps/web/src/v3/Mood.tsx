import { Companion } from '../components/figures';
import { go } from '../state/actions';
import { useStore } from '../state/store';
import { greetFor, MOODS, WHY } from './moods';
import { s } from './css';
import { Svg, I } from './icons';
import { setMood, skipCheckin } from './actions';
import { Face } from './faces';
import { lastMood, setV3, useV3, whenWords } from './ui';

/** The first thing when they come back after a while: how are you, right now? One tap, in words and a face, or skip. */
export function MoodScreen() {
  const nick = useStore(x => x.nick);
  const comp = useStore(x => x.compName);
  const look = useStore(x => x.look);
  const now = new Date();
  const last = lastMood();
  const recent = last && Date.now() - last.at < 3 * 86_400_000 ? last : null;
  const greet = greetFor(now.getHours());
  return (
    <div className="screen" role="main" aria-label="How are you" style={{ ...s('background:var(--page);display:flex;flex-direction:column;padding:64px 24px 32px;animation:kFade 600ms'), overflow: 'auto' }}>
      <div style={s('display:flex;align-items:center;gap:12px')}>
        <div style={s('width:56px;height:56px;border-radius:50%;overflow:hidden;background:var(--card);display:grid;place-items:center;box-shadow:0 8px 20px rgba(30,36,48,.08)')}><Companion look={look} size={56} /></div>
        <span style={s('font-size:17px;color:var(--muted);font-weight:600')}>{comp}</span>
      </div>
      <h1 className="serif" style={s('font-size:38px;line-height:1.1;margin:22px 0 0')}>{greet}{nick ? `, ${nick}` : ''}.<br />How are you feeling?</h1>
      <p style={s('font-size:17px;line-height:1.45;color:var(--muted);margin:12px 0 0')}>
        {recent ? `${whenWords(recent.at, now) === 'earlier today' ? 'Earlier today' : `Last time, ${whenWords(recent.at, now)},`} you said ${MOODS[recent.mood].label.toLowerCase()}. How is it right now?` : 'Right now, this minute. There’s no wrong answer.'}
      </p>
      <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:24px')} role="group" aria-label="How are you feeling">
        {MOODS.map((m, i) => (
          <button key={m.label} onClick={() => { void setMood(i); setV3({ over: 'why', why: [] }); }} data-track={`mood.${i}`} style={s('height:68px;border-radius:34px;border:none;background:var(--card);display:flex;align-items:center;gap:16px;padding:0 22px 0 12px;box-shadow:0 8px 22px rgba(30,36,48,.06);text-align:left')}>
            <Face mood={i} size={46} />
            <span style={s('font-size:19px;font-weight:600;flex:1')}>{m.label}</span>
            <span style={s('font-size:15px;color:var(--muted)')}>{m.hint}</span>
          </button>
        ))}
      </div>
      <button onClick={() => { skipCheckin(); setV3({ over: null }); go('today'); }} data-track="mood.skip" style={s('margin-top:auto;padding-top:12px;height:56px;border:none;background:none;color:var(--muted);font-size:17px;font-weight:600')}>Not now</button>
    </div>
  );
}

/** What it is about. Optional, and it only helps Saathi listen better. */
export function WhyScreen({ onDone }: { onDone: () => void }) {
  const mood = useStore(x => x.mood);
  const why = useV3(x => x.why);
  const m = mood === null ? null : MOODS[mood];
  const good = mood !== null && mood >= 3;
  return (
    <div className="screen" role="main" aria-label="What it is about" style={{ ...s('background:var(--page);display:flex;flex-direction:column;padding:60px 24px 32px;animation:kFade 500ms'), overflow: 'auto' }}>
      <button onClick={() => setV3({ over: 'mood' })} aria-label="Back" style={s('align-self:flex-start;width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin-left:-10px')}><Svg d={I.back} size={22} stroke="var(--ink)" /></button>
      <div style={s('margin-top:12px;animation:kPop 500ms')}><Face mood={mood ?? 2} size={64} /></div>
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
