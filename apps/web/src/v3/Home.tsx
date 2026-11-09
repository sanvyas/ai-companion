import { useEffect, useMemo } from 'react';
import { SONG_ROWS } from '@saathi/domain';
import { Companion } from '../components/figures';
import { addPlanItem, go, loadInsights, loadJournal, loadOutside, loadToday, openBreathe, openChat, startCall, startJournal, startWalkFlow, togglePlan } from '../state/actions';
import { dayOf, set, useStore } from '../state/store';
import { playCalm } from './calm';
import { s } from './css';
import { I, Svg } from './icons';
import { HelpButton } from './Chrome';
import { Face } from './faces';
import { BellButton } from './Inbox';
import { Living } from './Living';
import { partOf, type Part } from './theme';
import { CHECKIN_HERO, HEROES, MOODS, NOTE_BG, NOTE_ROT, checkLine, greetFor, type Hero, type SuggestId } from './moods';
import { loadMonthData, useMonthData } from './month-data';
import { setV3 } from './ui';

export const openGame = (game: 'rangoli' | 'balloon' | 'fruit' | 'room') => setV3({ over: 'game', game });

interface Suggestion { label: string; meta: string; icon: string; tint: string; run: () => void }

function suggestions(events: { id: string; title: string }[]): Record<SuggestId, Suggestion> {
  const ev = events[0];
  return {
    sit: { label: 'Sit with me', meta: 'No talking', icon: I.sit, tint: 'var(--t1)', run: () => void startCall('sit') },
    write: { label: 'Write it out', meta: 'Private', icon: I.pen, tint: 'var(--p-butter)', run: () => startJournal('write') },
    speak: { label: 'Talk it out', meta: 'Journal', icon: I.mic, tint: 'var(--p-butter)', run: () => startJournal('speak') },
    rain: { label: 'Rain story', meta: '20 min', icon: I.moon, tint: 'var(--t1)', run: () => playCalm('monsoon') },
    balloon: { label: 'Balloon pop', meta: 'Game', icon: I.game, tint: 'var(--p-rose)', run: () => openGame('balloon') },
    racing: { label: 'Calm my mind', meta: '5 min', icon: I.lotus, tint: 'var(--p-mint)', run: () => playCalm('sos') },
    walk: { label: 'Walk with me', meta: '10 min', icon: I.walk, tint: 'var(--p-mint)', run: () => void startWalkFlow() },
    fruit: { label: 'Fruit slice', meta: 'Game', icon: I.game, tint: 'var(--p-rose)', run: () => openGame('fruit') },
    room: { label: 'Cozy room', meta: 'Game', icon: I.home, tint: 'var(--p-butter)', run: () => openGame('room') },
    event: { label: ev ? ev.title.split(' ').slice(0, 2).join(' ') : 'Near you', meta: 'Near you', icon: I.pin, tint: 'var(--p-rose)', run: () => (ev ? setV3({ sheet: { id: 'event', eventId: ev.id } }) : go('talk')) },
    month: { label: 'My month', meta: 'See it', icon: I.month, tint: 'var(--p-mint)', run: () => go('journey') },
    breathe: { label: 'Breathe', meta: '1 min', icon: I.breathe, tint: 'var(--t1)', run: () => openBreathe() },
  };
}

const Label = ({ children, right }: { children: string; right?: React.ReactNode }) => (
  <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-top:8px')}><h2 className="kicker" style={s('margin:0')}>{children}</h2>{right}</div>
);

const LINE: Record<Part, string> = { morning: 'No rush this morning.', afternoon: 'The day can be a quiet one.', evening: 'A slow evening is fine.', night: 'Late nights are okay too. I’m here.' };

export function Home() {
  const nick = useStore(x => x.nick);
  const mood = useStore(x => x.mood);
  const comp = useStore(x => x.compName);
  const look = useStore(x => x.look);
  const plan = useStore(x => x.plan);
  const events = useStore(x => x.events);
  const city = useStore(x => x.eventsCity);
  const month = useMonthData();
  useEffect(() => { void loadToday(); void loadOutside(); void loadJournal(); void loadInsights(); void loadMonthData(); }, []);

  const M = mood === null ? null : MOODS[mood];
  const greet = greetFor(new Date().getHours());
  const undone = plan.filter(p => !p.done);
  const base: Hero = M ? HEROES[mood!] : CHECKIN_HERO;
  const hero = useMemo<Hero>(() => {
    const h = { ...base };
    if (h.id === 'step') { h.sub = undone[0] ? undone[0].label : 'All steps done. Add another, or just enjoy it.'; h.cta = undone[0] ? 'Done it' : 'Add a step'; }
    if (M && mood! <= 2 && (new Date().getHours() >= 17 || new Date().getHours() < 4)) h.more = [h.more[0], h.more[1], 'rain'];
    return h;
  }, [base, undone, M, mood]);
  const sg = suggestions(events.filter(e => !e.interested));
  const run = () => {
    switch (hero.id) {
      case 'talk': void startCall('voice'); break;
      case 'breathe': openBreathe(); break;
      case 'rangoli': openGame('rangoli'); break;
      case 'step': if (undone[0]) void togglePlan(undone[0].id); else go('journey'); break;
      case 'write': startJournal('write'); set({ jPrompt: 'What went well today?' }); break;
      case 'checkin': setV3({ over: 'mood' }); break;
    }
  };
  const notes = [...plan].sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 4);
  const today = month?.days.find(d => d.day === month.today)?.kinds ?? [];
  const showToday = today.length ? today : (month?.days.at(-1)?.kinds ?? []);
  const line = checkLine(mood, nick);

  const doneN = plan.filter(p => p.done).length;
  const pct = plan.length ? Math.round((doneN / plan.length) * 100) : 0;
  const part = partOf(new Date().getHours());

  return (
    <div className="screen" data-scroll="1" style={{ ...s('overflow:auto;background:var(--page);display:flex;flex-direction:column;padding:56px 24px 128px;gap:16px') }}>
      <header style={s('display:flex;align-items:center;justify-content:space-between')}>
        <button onClick={() => go('you')} aria-label="You" data-track="nav.you" style={s('display:flex;align-items:center;gap:10px;border:none;background:none;padding:0;min-height:44px')}>
          <span style={s('width:40px;height:40px;border-radius:50%;background:var(--card);overflow:hidden;display:grid;place-items:center')}><Companion look={look} size={40} /></span>
          <span className="serif" style={s('font-size:24px')}>Saathi</span>
        </button>
        <div style={s('display:flex;align-items:center;gap:8px')}><BellButton /><HelpButton /></div>
      </header>

      <div style={s('display:flex;flex-direction:column;gap:6px;margin-top:4px')}>
        <h1 className="serif" style={s('font-size:36px;line-height:1.1;margin:0')}>{greet}{nick ? `, ${nick}` : ''}.</h1>
        <div style={s('font-size:17px;color:var(--muted)')}>{LINE[part]}</div>
        <button onClick={() => setV3({ over: 'mood' })} aria-label={M ? `Feeling ${M.label.toLowerCase()}. Change` : 'Not checked in. Check in'} style={s('align-self:flex-start;margin-top:8px;height:44px;padding:0 16px 0 8px;border-radius:22px;border:none;background:color-mix(in srgb,var(--card) 80%,transparent);display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600')}>
          <Face mood={mood ?? 2} size={28} />{M ? `Feeling ${M.label.toLowerCase()}` : 'How are you today?'}<span style={s('color:var(--muted);font-weight:500')}>· {M ? 'change' : 'tell me'}</span>
        </button>
      </div>

      <Living />

      <section aria-label="Saathi checking on you" style={s('background:var(--card);border-radius:28px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 10px 28px rgba(30,36,48,.06)')}>
        <div style={s('display:flex;gap:14px;align-items:flex-start')}>
          <div style={s('flex:none;width:48px;height:48px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:grid;place-items:center')}><Companion look={look} size={48} /></div>
          <div style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:15px;color:var(--muted);font-weight:600')}>{comp} · checking on you</span><span style={s('font-size:17px;line-height:1.45')}>{line}</span></div>
        </div>
        <div style={s('display:flex;gap:10px')}>
          <button onClick={() => void startCall('voice')} data-track="home.say" style={s('flex:1.3;height:52px;border-radius:26px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px')}><Svg d={I.mic} size={18} stroke="#FFFFFF" />Say it</button>
          <button onClick={() => void openChat()} data-track="home.type" style={s('flex:1;height:52px;border-radius:26px;border:none;background:var(--soft);font-size:17px;font-weight:600')}>Type</button>
        </div>
      </section>

      <Label>For you right now</Label>
      <button onClick={run} data-track="home.hero" style={s(`text-align:left;border:none;border-radius:28px;padding:24px;background:${hero.bg};color:${hero.fg};display:flex;flex-direction:column;gap:8px;box-shadow:0 16px 34px rgba(30,36,48,.12);position:relative;overflow:hidden`)}>
        <span aria-hidden="true" style={s('position:absolute;right:-30px;top:-30px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.16)')} />
        <span aria-hidden="true" style={s('position:absolute;right:44px;top:56px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.14)')} />
        <span className="serif" style={s('font-size:32px;line-height:1.1;position:relative;max-width:250px')}>{hero.title}</span>
        <span style={s('font-size:17px;line-height:1.4;position:relative')}>{hero.sub}</span>
        <span style={s(`margin-top:10px;align-self:flex-start;height:48px;padding:0 24px;border-radius:24px;background:${hero.fg === '#FFFFFF' ? '#FFFFFF' : '#1E2430'};color:${hero.fg === '#FFFFFF' ? hero.bg : '#FFFFFF'};display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600;position:relative`)}>{hero.cta}</span>
      </button>
      <div role="group" aria-label="Other things to try" style={s('display:flex;gap:8px;overflow-x:auto;margin:0 -24px;padding:0 24px 2px')}>
        {hero.more.map(k => (
          <button key={k} onClick={sg[k].run} data-track={`home.more.${k}`} style={s('flex:none;height:48px;padding:0 18px 0 8px;border-radius:24px;border:none;background:var(--card);display:flex;align-items:center;gap:10px;box-shadow:0 6px 18px rgba(30,36,48,.05);font-size:15px;font-weight:600')}>
            <span style={s(`width:32px;height:32px;border-radius:50%;background:${sg[k].tint};display:grid;place-items:center`)}><Svg d={sg[k].icon} size={16} stroke="#1E2430" /></span>{sg[k].label}
          </button>
        ))}
      </div>

      <Label right={<button onClick={() => go('journey')} style={s('border:none;background:none;font-size:15px;font-weight:600;color:var(--accent-ink);padding:0;min-height:44px')}>All steps</button>}>Tiny steps today</Label>
      <section aria-label="Tiny steps today" style={s('background:var(--card);border-radius:28px;padding:20px 0 16px;display:flex;flex-direction:column;gap:14px;box-shadow:0 10px 28px rgba(30,36,48,.05)')}>
        {plan.length > 0 && (
          <div style={s('padding:0 20px;display:flex;flex-direction:column;gap:8px')}>
            <div style={s('display:flex;justify-content:space-between;font-size:15px')}><span style={s('font-weight:600')}>{doneN === plan.length ? 'All done. That counts.' : doneN ? 'Nicely going' : 'Whenever you’re ready'}</span><span style={s('color:var(--muted)')}>{doneN} of {plan.length}</span></div>
            <div role="progressbar" aria-label="Tiny steps done today" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={s('height:10px;border-radius:5px;background:#EFE9DD;overflow:hidden')}><div style={s(`height:100%;width:${Math.max(pct, 4)}%;border-radius:5px;background:linear-gradient(90deg,var(--accent2),var(--gold));transition:width 600ms cubic-bezier(.22,.61,.36,1)`)} /></div>
          </div>
        )}
        {notes.length === 0 ? (
          <button onClick={() => { void addPlanItem('Drink a glass of water'); }} style={s('margin:0 20px;border:1.5px dashed var(--line);background:none;border-radius:18px;height:56px;text-align:left;padding:0 16px;font-size:17px;font-weight:600;color:var(--muted)')}>+ Add a tiny step</button>
        ) : (
          <div style={s('display:flex;gap:10px;overflow-x:auto;padding:4px 20px 6px')}>
            {notes.map((p, i) => (
              <button key={p.id} onClick={() => void togglePlan(p.id)} role="checkbox" aria-checked={p.done} aria-label={p.label} data-track="home.step" style={{ ...s(`flex:none;width:140px;height:124px;border:none;border-radius:8px 8px 20px 8px;background:${NOTE_BG[i % NOTE_BG.length]};padding:14px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;color:#1E2430;box-shadow:0 6px 14px rgba(30,36,48,.08)`), transform: `rotate(${NOTE_ROT[i % NOTE_ROT.length]}deg)` }}>
                <span style={s(`font-size:15px;font-weight:600;line-height:1.3;text-decoration:${p.done ? 'line-through' : 'none'};opacity:${p.done ? 0.65 : 1}`)}>{p.label}</span>
                <span style={s(`width:28px;height:28px;border-radius:50%;border:2px solid #1E2430;background:${p.done ? '#1E2430' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={14} stroke="#FFFFFF" sw={3} style={{ opacity: p.done ? 1 : 0 }} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      {events.length > 0 && (
        <>
          <Label right={<span style={s('font-size:15px;color:var(--muted)')}>{city ?? ''}</span>}>Out this week</Label>
          <div style={s('display:flex;gap:10px;overflow-x:auto;margin:0 -24px;padding:0 24px 4px')}>
            {events.map((e, i) => (
              <button key={e.id} onClick={() => setV3({ sheet: { id: 'event', eventId: e.id } })} data-track="home.event" style={s('flex:none;width:220px;border:none;border-radius:24px;overflow:hidden;background:var(--card);text-align:left;padding:0;display:flex;flex-direction:column;box-shadow:0 8px 22px rgba(30,36,48,.06)')}>
                <div style={s(`height:84px;background:${EVENT_BG[i % 3]};position:relative;padding:12px`)}>
                  <span style={s('background:rgba(255,255,255,.92);color:#1E2430;border-radius:12px;padding:4px 10px;font-size:13px;font-weight:700')}>{dayOf(e.startsAt)}</span>
                  {e.interested && <span style={s('position:absolute;right:12px;top:12px;background:var(--accent);color:#FFFFFF;border-radius:12px;padding:4px 10px;font-size:13px;font-weight:700')}>Going</span>}
                </div>
                <div style={s('padding:12px 16px 16px;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:17px;font-weight:700')}>{e.title}</span><span style={s('font-size:15px;color:var(--muted)')}>{e.venue}</span></div>
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => go('journey')} data-track="home.month" style={s('margin-top:4px;border:none;border-radius:28px;padding:18px 20px;background:var(--p-mint);display:flex;align-items:center;gap:16px;text-align:left')}>
        <div aria-hidden="true" style={s('flex:none;display:flex;gap:3px;align-items:flex-end;height:44px')}>
          {SONG_ROWS.map((row, i) => { const on = showToday.some(k => row.kinds.includes(k)); return <span key={row.label} style={s(`width:8px;height:${on ? 24 + (i % 3) * 7 : 8}px;border-radius:4px;background:${row.color}`)} />; })}
        </div>
        <div style={s('flex:1;display:flex;flex-direction:column;gap:2px')}>
          <span style={s('font-size:17px;font-weight:700')}>This month</span>
          <span style={s('font-size:15px;opacity:.8')}>{today.length ? `Today added ${today.length} thing${today.length > 1 ? 's' : ''} to it.` : 'Nothing yet today. One small thing adds to it.'}</span>
        </div>
        <Svg d={I.chev} size={16} sw={2} />
      </button>
    </div>
  );
}

const EVENT_BG = ['linear-gradient(135deg,#93C48A,#DDEFE4)', 'linear-gradient(135deg,#E8896B,var(--p-butter))', 'linear-gradient(135deg,var(--accent2),var(--t1))'];
