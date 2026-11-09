import { CALM_ITEMS, STORY_THEMES, type CalmItem } from '../data/calm';
import { openBreathe, playStory } from '../state/actions';
import { useStore } from '../state/store';
import { playCalm } from './calm';
import { Head } from './Chrome';
import { Face } from './faces';
import { openGame } from './Home';
import { s } from './css';
import { I, Svg } from './icons';
import { MOODS } from './moods';
import { setV3, useV3, type Feel, type GameId } from './ui';

// Laid out the way a meditation app is: one thing picked for how you are right now, then rows that say what each thing is for.
// Quick resets, meditations, sleep stories, tales made for tonight, and last of all, a little play.

const FEELS: { v: Feel; label: string }[] = [{ v: 'All', label: 'For you' }, { v: 'Calm down', label: 'Calm down' }, { v: 'Sleep', label: 'Sleep' }, { v: 'Lift me up', label: 'Lift me up' }, { v: 'Focus', label: 'Focus' }];
/** What each thing is for, so "I want to calm down" shows only what helps with that. */
const TAGS: Record<string, Feel[]> = { breathe: ['Calm down'], sos: ['Calm down'], body: ['Calm down', 'Sleep'], morning: ['Focus'], kind: ['Lift me up'], winddown: ['Sleep', 'Calm down'], monsoon: ['Sleep'], train: ['Sleep'], garden: ['Sleep', 'Calm down'] };
const STORY_BG = ['linear-gradient(180deg,#2B3A63,#5A5493)', 'linear-gradient(180deg,#1E2A44,#3B5577)', 'linear-gradient(180deg,#8A5A2B,#B97C3F)', 'linear-gradient(180deg,#3B2E63,#6A4E93)'];

/** The one thing to start with, from how they said they are and the hour. */
export function pickFor(mood: number | null, hour: number): { id: string; why: string } {
  const late = hour >= 20 || hour < 5;
  if (mood === 1) return { id: 'sos', why: 'For a racing mind' };
  if (late) return { id: 'winddown', why: 'To wind down for sleep' };
  if (mood === 0) return { id: 'kind', why: 'For a heavy day' };
  if (mood === 2) return hour < 12 ? { id: 'morning', why: 'A gentle start' } : { id: 'body', why: 'To ease the tiredness' };
  if (mood === 3) return hour < 12 ? { id: 'morning', why: 'Keep the day steady' } : { id: 'body', why: 'Keep it steady' };
  if (mood === 4) return { id: 'kind', why: 'Carry the good feeling' };
  return hour < 12 ? { id: 'morning', why: 'A calm start' } : { id: 'body', why: 'A few quiet minutes' };
}

interface Game { id: GameId; title: string; meta: string; bg: string; tags: Feel[] }
const GAMES: Game[] = [
  { id: 'rangoli', title: 'Rangoli', meta: 'Draw', bg: '#2B2350', tags: ['Calm down', 'Focus'] },
  { id: 'balloon', title: 'Balloon pop', meta: 'Tap', bg: '#AE4F38', tags: ['Lift me up', 'Calm down'] },
  { id: 'fruit', title: 'Fruit slice', meta: 'Swipe', bg: '#2F6B3B', tags: ['Lift me up'] },
  { id: 'room', title: 'Cozy room', meta: 'Decorate', bg: '#775A3D', tags: ['Calm down', 'Focus'] },
];

const Label = ({ children, sub }: { children: string; sub?: string }) => (
  <div style={s('display:flex;flex-direction:column;gap:2px;margin-top:10px')}><h2 className="serif" style={s('font-size:26px;line-height:1.15;margin:0')}>{children}</h2>{sub && <span style={s('font-size:15px;color:var(--muted)')}>{sub}</span>}</div>
);
const Row = ({ children }: { children: React.ReactNode }) => <div style={s('display:flex;gap:12px;overflow-x:auto;margin:0 -24px;padding:2px 24px 6px')}>{children}</div>;

export function Relax() {
  const feel = useV3(x => x.feel);
  const busy = useStore(x => x.storyBusy);
  const mood = useStore(x => x.mood);
  const ok = (tags: Feel[]) => feel === 'All' || tags.includes(feel);
  const open = (c: CalmItem) => (c.id === 'breathe' ? openBreathe() : playCalm(c.id));
  const tagsOf = (c: CalmItem) => TAGS[c.id] ?? [];
  const meds = CALM_ITEMS.filter(c => c.kind === 'med' && c.lines && ok(tagsOf(c)));
  const quick = meds.filter(c => c.mins <= 5);
  const longer = meds.filter(c => c.mins > 5);
  const stories = CALM_ITEMS.filter(c => c.kind === 'sleep' && c.lines && ok(tagsOf(c)));
  const games = GAMES.filter(g => ok(g.tags));
  const showBreathe = ok(['Calm down', 'Sleep']);
  const pick = feel === 'All' ? pickFor(mood, new Date().getHours()) : null;
  const pickItem = pick ? CALM_ITEMS.find(c => c.id === pick.id) : null;
  const M = mood === null ? null : MOODS[mood];
  const empty = !showBreathe && !quick.length && !longer.length && !stories.length && !games.length;

  return (
    <div className="screen" data-scroll="1" style={{ ...s('overflow:auto;background:linear-gradient(180deg,var(--tint) 0px,var(--bg) 380px);display:flex;flex-direction:column;padding:56px 24px 128px;gap:16px') }}>
      <Head title="Relax" />
      <div role="group" aria-label="How do you want to feel?" style={s('display:flex;gap:8px;overflow-x:auto;margin:0 -24px;padding:0 24px')}>
        {FEELS.map(f => <button key={f.v} aria-pressed={feel === f.v} onClick={() => setV3({ feel: f.v })} style={s(`flex:none;height:44px;padding:0 18px;border-radius:22px;border:none;background:${feel === f.v ? 'var(--accent)' : '#FFFFFF'};color:${feel === f.v ? '#FFFFFF' : '#1E2430'};font-size:15px;font-weight:600`)}>{f.label}</button>)}
      </div>

      {pickItem && pick && (
        <section aria-label="Picked for you" style={s(`border-radius:28px;padding:22px;background:linear-gradient(145deg,${pickItem.tint},#FFFFFF 135%);display:flex;flex-direction:column;gap:10px;box-shadow:0 14px 32px rgba(30,36,48,.1);position:relative;overflow:hidden`)}>
          <span aria-hidden="true" style={s('position:absolute;right:-34px;top:-34px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.4)')} />
          <span style={s('display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;position:relative')}>{M && <Face mood={mood!} size={24} />}{M ? `Picked for feeling ${M.label.toLowerCase()}` : 'Picked for you'}</span>
          <span className="serif" style={s('font-size:32px;line-height:1.1;position:relative;max-width:260px')}>{pickItem.title}</span>
          <span style={s('font-size:17px;line-height:1.4;position:relative')}>{pick.why} · {pickItem.mins} min</span>
          <button onClick={() => open(pickItem)} data-track="relax.pick" style={s('margin-top:6px;align-self:flex-start;height:52px;padding:0 26px 0 20px;border-radius:26px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600;display:flex;align-items:center;gap:10px;position:relative')}><Svg d={I.play} size={14} fill="#FFFFFF" stroke="#FFFFFF" sw={0} />Begin</button>
        </section>
      )}

      {(showBreathe || quick.length > 0) && (
        <>
          <Label sub="A few minutes, right where you are">Quick resets</Label>
          <Row>
            {showBreathe && (
              <button onClick={() => openBreathe()} data-track="relax.breathe" aria-label="Breathe, 1 minute" style={s('flex:none;width:156px;height:140px;text-align:left;border:none;border-radius:24px;padding:16px;background:#D5E6F2;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 22px rgba(30,36,48,.06)')}>
                <span aria-hidden="true" style={s('width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.7);display:grid;place-items:center')}><Svg d={I.breathe} size={20} /></span>
                <span><b style={s('display:block;font-size:17px')}>Breathe</b><span style={s('font-size:15px;color:#3E4654')}>1 min · follow the circle</span></span>
              </button>
            )}
            {quick.map(c => (
              <button key={c.id} onClick={() => open(c)} aria-label={`${c.title}, ${c.mins} minutes`} style={s(`flex:none;width:156px;height:140px;text-align:left;border:none;border-radius:24px;padding:16px;background:${c.tint};display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 22px rgba(30,36,48,.06)`)}>
                <span aria-hidden="true" style={s('width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.7);display:grid;place-items:center')}><Svg d={I.play} size={14} fill="#1E2430" stroke="#1E2430" sw={0} /></span>
                <span><b style={s('display:block;font-size:17px;line-height:1.2')}>{c.title}</b><span style={s('font-size:15px;color:#3E4654')}>{c.mins} min</span></span>
              </button>
            ))}
          </Row>
        </>
      )}

      {longer.length > 0 && (
        <>
          <Label sub="Guided, a little longer">Meditations</Label>
          <div style={s('background:#FFFFFF;border-radius:28px;padding:6px 18px;display:flex;flex-direction:column;box-shadow:0 8px 22px rgba(30,36,48,.05)')}>
            {longer.map((m, i) => (
              <button key={m.id} onClick={() => open(m)} aria-label={`${m.title}, ${m.mins} minutes`} style={s(`display:flex;align-items:center;gap:16px;text-align:left;border:none;background:none;padding:14px 0;border-bottom:${i < longer.length - 1 ? '1px solid var(--soft)' : 'none'};min-height:72px`)}>
                <span aria-hidden="true" style={s(`flex:none;width:52px;height:52px;border-radius:18px;background:${m.tint};display:grid;place-items:center`)}><Svg d={I.lotus} size={24} /></span>
                <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:17px;font-weight:600')}>{m.title}</span><span style={s('font-size:15px;color:var(--muted)')}>{m.desc} · {m.mins} min</span></span>
                <Svg d={I.chev} size={16} sw={2} stroke="#636B78" />
              </button>
            ))}
          </div>
        </>
      )}

      {stories.length > 0 && (
        <>
          <Label sub="Slow and quiet, for bedtime">Sleep stories</Label>
          <Row>
            {stories.map((st, i) => (
              <button key={st.id} onClick={() => open(st)} aria-label={`${st.title}, ${st.mins} minutes`} style={s(`flex:none;width:172px;height:204px;border:none;border-radius:26px;background:${STORY_BG[i % 4]};color:#FFFFFF;text-align:left;padding:16px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;overflow:hidden`)}>
                <span aria-hidden="true" style={s('position:absolute;right:18px;top:18px;width:34px;height:34px;border-radius:50%;background:#F8E9C8;box-shadow:0 0 30px rgba(248,233,200,.7)')} />
                <span className="serif" style={s('font-size:26px;line-height:1.05;position:relative')}>{st.title}</span><span style={s('font-size:15px;margin-top:4px;position:relative')}>{st.mins} min</span>
              </button>
            ))}
          </Row>
        </>
      )}

      {(feel === 'All' || feel === 'Sleep') && (
        <section aria-label="A tale made for tonight" style={s('background:#FFFFFF;border-radius:28px;padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 22px rgba(30,36,48,.05)')}>
          <div style={s('display:flex;flex-direction:column;gap:2px')}><h2 className="serif" style={s('font-size:26px;line-height:1.15;margin:0')}>A tale made for tonight</h2><span style={s('font-size:15px;line-height:1.4;color:var(--muted)')}>Pick a place and Saathi writes a new, quiet story, just for you.</span></div>
          <div style={s('display:flex;flex-wrap:wrap;gap:8px')}>
            {STORY_THEMES.map(t => <button key={t.id} disabled={busy} onClick={() => void playStory(t.id)} style={s('height:48px;padding:0 20px;border-radius:24px;border:1.5px solid #D9D2C5;background:var(--bg);font-size:15px;font-weight:600')}>{t.label}</button>)}
          </div>
          {busy && <span role="status" style={s('font-size:15px;color:var(--muted)')}>Writing it now…</span>}
        </section>
      )}

      {games.length > 0 && (
        <>
          <Label sub="No scores, no timers. One is picked for the month.">A little play</Label>
          <div style={s('display:flex;flex-direction:column;gap:10px')}>
            {(() => {
              const month = new Date().getMonth();
              const feat = games.find(g => g.id === GAMES[month % GAMES.length].id) ?? games[0];
              const rest = games.filter(g => g.id !== feat.id);
              return (
                <>
                  <button onClick={() => openGame(feat.id)} data-track={`relax.${feat.id}`} style={s(`text-align:left;border:none;border-radius:24px;padding:18px 20px;background:${feat.bg};color:#FFFFFF;min-height:92px;display:flex;align-items:center;gap:14px`)}>
                    <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase')}>This month’s pick</span><span className="serif" style={s('font-size:28px;line-height:1.1')}>{feat.title}</span><span style={s('font-size:15px')}>{feat.meta}</span></span>
                    <Svg d={I.chev} size={18} sw={2} />
                  </button>
                  {rest.length > 0 && (
                    <div role="group" aria-label="More games" style={s('display:flex;gap:8px;flex-wrap:wrap')}>
                      {rest.map(g => <button key={g.id} onClick={() => openGame(g.id)} data-track={`relax.${g.id}`} style={s('height:48px;padding:0 18px;border-radius:24px;border:none;background:#FFFFFF;font-size:15px;font-weight:600;box-shadow:0 6px 16px rgba(30,36,48,.05)')}>{g.title}</button>)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
      {empty && <p style={s('color:var(--muted);font-size:17px')}>Nothing here for that yet.</p>}
    </div>
  );
}
