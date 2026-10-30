import { Companion } from '../components/figures';
import { go } from '../state/actions';
import { useStore } from '../state/store';
import { greetFor, MOODS, NO_MOOD, WHY } from './moods';
import { s } from './css';
import { Svg, I } from './icons';
import { setMood, skipCheckin } from './actions';
import { setV3, useV3 } from './ui';

/** The first thing: one tap on how you are, or skip. Nothing else is asked. */
export function MoodScreen() {
  const nick = useStore(x => x.nick);
  const comp = useStore(x => x.compName);
  const look = useStore(x => x.look);
  const greet = greetFor(new Date().getHours());
  return (
    <div className="screen" role="main" aria-label="How are you" style={{ ...s('background:linear-gradient(180deg,#ECE8F8 0%,#FAF6EF 62%);display:flex;flex-direction:column;padding:92px 24px 36px;animation:kFade 600ms'), overflow: 'auto' }}>
      <div style={s('display:flex;align-items:center;gap:10px')}>
        <div style={s('width:44px;height:44px;border-radius:50%;overflow:hidden;background:#FFFFFF;display:grid;place-items:center')}><Companion look={look} size={44} /></div>
        <span style={s('font-size:15px;color:#636B78;font-weight:600')}>{comp}</span>
      </div>
      <h1 className="serif" style={s('font-size:42px;line-height:1.05;margin:18px 0 0')}>{greet}{nick ? `, ${nick}` : ''}.<br />How are you, right now?</h1>
      <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:28px')} role="group" aria-label="How are you feeling">
        {MOODS.map((m, i) => (
          <button key={m.label} onClick={() => { void setMood(i); setV3({ over: 'why', why: [] }); }} data-track={`mood.${i}`} style={s('height:64px;border-radius:32px;border:none;background:#FFFFFF;display:flex;align-items:center;gap:16px;padding:0 22px 0 10px;box-shadow:0 6px 18px rgba(30,36,48,.06);text-align:left')}>
            <span aria-hidden="true" style={s(`flex:none;width:44px;height:44px;border-radius:${m.shape};background:${m.color}`)} />
            <span style={s('font-size:19px;font-weight:600;flex:1')}>{m.label}</span>
            <span style={s('font-size:15px;color:#636B78')}>{m.hint}</span>
          </button>
        ))}
      </div>
      <button onClick={() => { skipCheckin(); setV3({ over: null }); go('today'); }} data-track="mood.skip" style={s('margin-top:auto;height:48px;border:none;background:none;color:#636B78;font-size:15px;font-weight:600')}>Skip for now</button>
    </div>
  );
}

/** What it is about. Optional, and it only helps Saathi listen better. */
export function WhyScreen({ onDone }: { onDone: () => void }) {
  const mood = useStore(x => x.mood);
  const why = useV3(x => x.why);
  const m = mood === null ? null : MOODS[mood];
  const good = mood !== null && mood >= 3;
  const tint = m?.tint ?? NO_MOOD.tint;
  return (
    <div className="screen" role="main" aria-label="What it is about" style={{ ...s(`background:linear-gradient(180deg,${tint} 0%,#FAF6EF 62%);display:flex;flex-direction:column;padding:60px 24px 36px;animation:kFade 500ms`), overflow: 'auto' }}>
      <button onClick={() => setV3({ over: 'mood' })} aria-label="Back" style={s('align-self:flex-start;width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin-left:-10px')}><Svg d={I.back} size={22} stroke="#1E2430" /></button>
      <span aria-hidden="true" style={{ ...s(`width:64px;height:64px;border-radius:${m?.shape ?? NO_MOOD.shape};background:${m?.color ?? NO_MOOD.color};margin-top:16px;animation:kPop 500ms`) }} />
      <h1 className="serif" style={s('font-size:40px;line-height:1.05;margin:18px 0 0')}>{good ? 'What’s making it good?' : 'What’s it about?'}</h1>
      <div style={s('font-size:15px;color:#636B78;margin-top:6px')}>Pick any. It helps me listen better.</div>
      <div role="group" aria-label="What it is about" style={s('display:flex;flex-wrap:wrap;gap:10px;margin-top:24px')}>
        {WHY.map(c => {
          const on = why.includes(c);
          return <button key={c} aria-pressed={on} onClick={() => setV3({ why: on ? why.filter(x => x !== c) : [...why, c] })} style={s(`height:48px;padding:0 18px;border-radius:24px;border:1.5px solid ${on ? '#2F2A5E' : '#E5DED2'};background:${on ? '#2F2A5E' : '#FFFFFF'};font-size:16px;font-weight:600;color:${on ? '#FFFFFF' : '#1E2430'}`)}>{c}</button>;
        })}
      </div>
      <button onClick={onDone} data-track="why.continue" style={s('margin-top:auto;height:58px;border-radius:29px;border:none;background:#2F2A5E;color:#FFFFFF;font-size:17px;font-weight:600')}>Continue</button>
    </div>
  );
}
