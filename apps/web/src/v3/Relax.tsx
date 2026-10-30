import { CALM_ITEMS, STORY_THEMES, type CalmItem } from '../data/calm';
import { openBreathe, playStory } from '../state/actions';
import { useStore } from '../state/store';
import { playCalm } from './calm';
import { Head } from './Chrome';
import { openGame } from './Home';
import { s } from './css';
import { I, Svg } from './icons';
import { setV3, useV3, type Feel, type GameId } from './ui';

const FEELS: Feel[] = ['All', 'Calm down', 'Sleep', 'Lift me up', 'Focus'];
/** What each thing is for, so "I want to calm down" shows only what helps with that. */
const TAGS: Record<string, Feel[]> = { breathe: ['Calm down'], sos: ['Calm down'], body: ['Calm down', 'Sleep'], morning: ['Focus'], kind: ['Lift me up'], winddown: ['Sleep', 'Calm down'], monsoon: ['Sleep'], train: ['Sleep'], garden: ['Sleep', 'Calm down'] };
const SHAPES = ['46% 54% 52% 48% / 58% 46% 54% 42%', '38% 62% 40% 60% / 60% 38% 62% 40%', '50% 50% 50% 50% / 60% 60% 40% 40%', '50%', '30%'];
const STORY_BG = ['linear-gradient(180deg,#2B3A63,#5A5493)', 'linear-gradient(180deg,#1E2A44,#3B5577)', 'linear-gradient(180deg,#C98E52,#E8B47A)'];

interface Game { id: GameId; title: string; meta: string; bg: string; tags: Feel[]; deco: [string, string, string, string, string][] }
const GAMES: Game[] = [
  { id: 'rangoli', title: 'Rangoli', meta: 'Draw · no rules', bg: '#2B2350', tags: ['Calm down', 'Focus'], deco: [['60%', '10%', '70px', '50%', '#F2B33D'], ['72%', '22%', '40px', '50%', '#F28DB2'], ['82%', '34%', '14px', '50%', '#7FD1C3']] },
  { id: 'balloon', title: 'Balloon pop', meta: 'Tap · no timer', bg: '#D9715A', tags: ['Lift me up', 'Calm down'], deco: [['58%', '8%', '44px', '50% 50% 50% 50% / 56% 56% 44% 44%', '#FCEFCF'], ['76%', '26%', '34px', '50% 50% 50% 50% / 56% 56% 44% 44%', '#F2B33D'], ['42%', '24%', '26px', '50% 50% 50% 50% / 56% 56% 44% 44%', '#F4C7B8']] },
  { id: 'fruit', title: 'Fruit slice', meta: 'Swipe · no timer', bg: '#3E7F4C', tags: ['Lift me up'], deco: [['56%', '8%', '60px', '50%', '#F05D5E'], ['70%', '20%', '36px', '50%', '#F2B33D'], ['50%', '34%', '20px', '50%', '#FCEFCF']] },
  { id: 'room', title: 'Cozy room', meta: 'Decorate', bg: '#8C6A4A', tags: ['Calm down', 'Focus'], deco: [['62%', '10%', '56px', '12px 12px 4px 4px', '#F2B33D'], ['74%', '34%', '30px', '50%', '#4E9A5C']] },
];

export function Relax() {
  const feel = useV3(x => x.feel);
  const busy = useStore(x => x.storyBusy);
  const ok = (tags: Feel[]) => feel === 'All' || tags.includes(feel);
  const med = CALM_ITEMS.filter(c => c.kind === 'med' && c.lines && ok(TAGS[c.id] ?? []));
  const stories = CALM_ITEMS.filter(c => c.kind === 'sleep' && c.lines && ok(TAGS[c.id] ?? []));
  const games = GAMES.filter(g => ok(g.tags));
  const showBreathe = ok(['Calm down', 'Sleep']);
  const open = (c: CalmItem) => playCalm(c.id);
  return (
    <div className="screen" data-scroll="1" style={{ ...s('overflow:auto;background:#FAF6EF;display:flex;flex-direction:column;padding:58px 20px 120px;gap:14px') }}>
      <Head title="Relax" />
      <div role="group" aria-label="How do you want to feel?" style={s('display:flex;gap:8px;overflow-x:auto;margin:0 -20px;padding:0 20px')}>
        {FEELS.map(f => <button key={f} aria-pressed={feel === f} onClick={() => setV3({ feel: f })} style={s(`flex:none;height:44px;padding:0 16px;border-radius:22px;border:none;background:${feel === f ? '#2F2A5E' : '#FFFFFF'};color:${feel === f ? '#FFFFFF' : '#1E2430'};font-size:15px;font-weight:600`)}>{f}</button>)}
      </div>
      {showBreathe && (
        <button onClick={() => openBreathe()} data-track="relax.breathe" style={s('text-align:left;border:none;border-radius:28px;padding:20px;background:linear-gradient(135deg,#2F2A5E,#6F6BB8);color:#FFFFFF;display:flex;align-items:center;gap:16px;overflow:hidden;position:relative')}>
          <span aria-hidden="true" style={s('flex:none;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center')}><span style={s('width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.5)')} /></span>
          <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span className="serif" style={s('font-size:28px;line-height:1')}>Breathe</span><span style={s('font-size:14px;color:#DAD7F2')}>1 minute · follow the circle</span></span>
        </button>
      )}
      {games.length > 0 && (
        <>
          <h2 className="kicker" style={s('margin:6px 0 0')}>Play</h2>
          <div style={s('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px')}>
            {games.map(g => (
              <button key={g.id} onClick={() => openGame(g.id)} data-track={`relax.${g.id}`} style={s(`text-align:left;border:none;border-radius:24px;padding:14px;background:${g.bg};color:#FFFFFF;height:150px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;overflow:hidden`)}>
                {g.deco.map((d, i) => <span key={i} aria-hidden="true" style={s(`position:absolute;left:${d[0]};top:${d[1]};width:${d[2]};height:${d[2]};border-radius:${d[3]};background:${d[4]}`)} />)}
                <span style={s('font-size:17px;font-weight:700;position:relative')}>{g.title}</span><span style={s('font-size:13px;opacity:.9;position:relative')}>{g.meta}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {med.length > 0 && (
        <>
          <h2 className="kicker" style={s('margin:6px 0 0')}>Meditate</h2>
          <div style={s('background:#FFFFFF;border-radius:24px;padding:4px 14px;display:flex;flex-direction:column')}>
            {med.map((m, i) => (
              <button key={m.id} onClick={() => (m.id === 'breathe' ? openBreathe() : open(m))} aria-label={`${m.title}, ${m.mins} minutes`} style={s(`display:flex;align-items:center;gap:14px;text-align:left;border:none;background:none;padding:12px 0;border-bottom:${i < med.length - 1 ? '1px solid #F1EDE6' : 'none'};min-height:64px`)}>
                <span aria-hidden="true" style={s(`flex:none;width:46px;height:46px;border-radius:${SHAPES[i % 5]};background:${m.tint}`)} />
                <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:16px;font-weight:600')}>{m.title}</span><span style={s('font-size:13px;color:#636B78')}>{(TAGS[m.id] ?? ['Calm down'])[0]} · {m.mins} min</span></span>
                <span aria-hidden="true" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#F1EDE6;display:grid;place-items:center')}><Svg d={I.play} size={12} fill="#1E2430" stroke="#1E2430" sw={0} /></span>
              </button>
            ))}
          </div>
        </>
      )}
      {(stories.length > 0 || feel === 'All' || feel === 'Sleep') && (
        <>
          <h2 className="kicker" style={s('margin:6px 0 0')}>Stories</h2>
          <div style={s('display:flex;gap:10px;overflow-x:auto;margin:0 -20px;padding:0 20px')}>
            {stories.map((st, i) => (
              <button key={st.id} onClick={() => open(st)} aria-label={`${st.title}, ${st.mins} minutes`} style={s(`flex:none;width:170px;height:200px;border:none;border-radius:24px;background:${STORY_BG[i % 3]};color:#FFFFFF;text-align:left;padding:16px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;overflow:hidden`)}>
                <span aria-hidden="true" style={s('position:absolute;right:18px;top:18px;width:34px;height:34px;border-radius:50%;background:#F8E9C8;box-shadow:0 0 30px rgba(248,233,200,.7)')} />
                <span className="serif" style={s('font-size:24px;line-height:1.05;position:relative')}>{st.title}</span><span style={s('font-size:13px;opacity:.9;margin-top:4px')}>{st.mins} min</span>
              </button>
            ))}
          </div>
          {(feel === 'All' || feel === 'Sleep') && (
            <section aria-label="A story made for tonight" style={s('background:#FFFFFF;border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:10px')}>
              <b style={s('font-size:16px')}>A story made for tonight</b>
              <span style={s('font-size:14px;color:#636B78')}>Pick a place and Saathi will write a new, quiet story, just for you.</span>
              <div style={s('display:flex;flex-wrap:wrap;gap:8px')}>
                {STORY_THEMES.map(t => <button key={t.id} disabled={busy} onClick={() => void playStory(t.id)} style={s('height:44px;padding:0 16px;border-radius:22px;border:1.5px solid #D9D2C5;background:#FAF6EF;font-size:14px;font-weight:600')}>{t.label}</button>)}
              </div>
              {busy && <span role="status" style={s('font-size:14px;color:#636B78')}>Writing it now…</span>}
            </section>
          )}
        </>
      )}
      {med.length + stories.length + games.length === 0 && !showBreathe && <p style={s('color:#636B78')}>Nothing here for that yet.</p>}
    </div>
  );
}
