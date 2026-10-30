import { useEffect, useMemo } from 'react';
import { SONG_ROWS } from '@saathi/domain';
import { Companion } from '../components/figures';
import { addPlanItem, go, loadInsights, loadJournal, loadOutside, loadToday, openBreathe, openChat, startCall, startJournal, startWalkFlow, togglePlan } from '../state/actions';
import { dayOf, set, useStore } from '../state/store';
import { playCalm } from './calm';
import { s } from './css';
import { I, Svg } from './icons';
import { HelpButton } from './Chrome';
import { CHECKIN_HERO, HEROES, MOODS, NOTE_BG, NOTE_ROT, checkLine, greetFor, type Hero, type SuggestId } from './moods';
import { loadMonthData, useMonthData } from './month-data';
import { setV3 } from './ui';

export const openGame = (game: 'rangoli' | 'balloon' | 'fruit' | 'room') => setV3({ over: 'game', game });

interface Suggestion { label: string; meta: string; icon: string; tint: string; run: () => void }

function suggestions(events: { id: string; title: string }[]): Record<SuggestId, Suggestion> {
  const ev = events[0];
  return {
    sit: { label: 'Sit with me', meta: 'No talking', icon: I.sit, tint: '#E6E4F5', run: () => void startCall('sit') },
    write: { label: 'Write it out', meta: 'Private', icon: I.pen, tint: '#FCEFCF', run: () => startJournal('write') },
    speak: { label: 'Talk it out', meta: 'Journal', icon: I.mic, tint: '#FCEFCF', run: () => startJournal('speak') },
    rain: { label: 'Rain story', meta: '20 min', icon: I.moon, tint: '#E6E4F5', run: () => playCalm('monsoon') },
    balloon: { label: 'Balloon pop', meta: 'Game', icon: I.game, tint: '#FBE4DA', run: () => openGame('balloon') },
    racing: { label: 'Calm my mind', meta: '5 min', icon: I.lotus, tint: '#E0EFE5', run: () => playCalm('sos') },
    walk: { label: 'Walk with me', meta: '10 min', icon: I.walk, tint: '#E0EFE5', run: () => void startWalkFlow() },
    fruit: { label: 'Fruit slice', meta: 'Game', icon: I.game, tint: '#FBE4DA', run: () => openGame('fruit') },
    room: { label: 'Cozy room', meta: 'Game', icon: I.home, tint: '#FCEFCF', run: () => openGame('room') },
    event: { label: ev ? ev.title.split(' ').slice(0, 2).join(' ') : 'Near you', meta: 'Near you', icon: I.pin, tint: '#FBE4DA', run: () => (ev ? setV3({ sheet: { id: 'event', eventId: ev.id } }) : go('talk')) },
    month: { label: 'My month', meta: 'See it', icon: I.month, tint: '#E0EFE5', run: () => go('journey') },
    breathe: { label: 'Breathe', meta: '1 min', icon: I.breathe, tint: '#E6E4F5', run: () => openBreathe() },
  };
}

const Label = ({ children, right }: { children: string; right?: React.ReactNode }) => (
  <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-top:8px')}><h2 className="kicker" style={s('margin:0')}>{children}</h2>{right}</div>
);

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

  return (
    <div className="screen" data-scroll="1" style={{ ...s(`overflow:auto;background:linear-gradient(180deg,${M?.tint ?? '#ECE8F8'} 0px,#FAF6EF 380px);display:flex;flex-direction:column;padding:58px 20px 120px;gap:14px`) }}>
      <header style={s('display:flex;align-items:center;gap:12px')}>
        <button onClick={() => go('you')} aria-label="You" data-track="nav.you" style={s('width:44px;height:44px;border-radius:50%;border:none;background:#FFFFFF;overflow:hidden;display:grid;place-items:center;padding:0')}><Companion look={look} size={44} /></button>
        <div style={s('flex:1;display:flex;flex-direction:column')}><span style={s('font-size:13px;color:#636B78;font-weight:600')}>{greet}</span><span style={s('font-size:19px;font-weight:700')}>{nick || 'Friend'}</span></div>
        <HelpButton />
      </header>

      <button onClick={() => setV3({ over: 'mood' })} aria-label={M ? `Feeling ${M.label.toLowerCase()}. Change` : 'Not checked in. Check in'} style={s('align-self:flex-start;height:44px;padding:0 14px 0 8px;border-radius:22px;border:none;background:rgba(255,255,255,.75);display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600')}>
        <span aria-hidden="true" style={s(`width:20px;height:20px;border-radius:${M?.shape ?? '50%'};background:${M?.color ?? '#D9D2C5'}`)} />{M ? `Feeling ${M.label.toLowerCase()}` : 'Not checked in'}<span style={s('color:#636B78;font-weight:500')}>· change</span>
      </button>

      <section aria-label="Saathi checking on you" style={s('background:#FFFFFF;border-radius:28px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 10px 28px rgba(30,36,48,.06);animation:kUp 600ms')}>
        <div style={s('display:flex;gap:12px;align-items:flex-start')}>
          <div style={s('flex:none;width:44px;height:44px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:grid;place-items:center')}><Companion look={look} size={44} /></div>
          <div style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:13px;color:#636B78;font-weight:600')}>{comp} · checking on you</span><span style={s('font-size:17px;line-height:1.4')}>{line}</span></div>
        </div>
        <div style={s('display:flex;gap:8px')}>
          <button onClick={() => void startCall('voice')} data-track="home.say" style={s('flex:1;height:44px;border-radius:22px;border:none;background:#2F2A5E;color:#FFFFFF;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px')}><Svg d={I.mic} size={16} stroke="#FFFFFF" sw={2} />Say it</button>
          <button onClick={() => void openChat()} data-track="home.type" style={s('flex:1;height:44px;border-radius:22px;border:none;background:#F1EDE6;font-size:15px;font-weight:600')}>Type</button>
        </div>
      </section>

      <Label>For you right now</Label>
      <button onClick={run} data-track="home.hero" style={s(`text-align:left;border:none;border-radius:30px;padding:22px;background:${hero.bg};color:${hero.fg};display:flex;flex-direction:column;gap:6px;box-shadow:0 16px 34px rgba(30,36,48,.14);position:relative;overflow:hidden;animation:kUp 700ms`)}>
        <span aria-hidden="true" style={s('position:absolute;right:-30px;top:-30px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.16)')} />
        <span aria-hidden="true" style={s('position:absolute;right:40px;top:50px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.14)')} />
        <span className="serif" style={s('font-size:32px;line-height:1.05;position:relative;max-width:260px')}>{hero.title}</span>
        <span style={s('font-size:15px;position:relative')}>{hero.sub}</span>
        <span style={s(`margin-top:10px;align-self:flex-start;height:44px;padding:0 20px;border-radius:22px;background:${hero.fg === '#FFFFFF' ? '#FFFFFF' : '#1E2430'};color:${hero.fg === '#FFFFFF' ? hero.bg : '#FFFFFF'};display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;position:relative`)}>{hero.cta}</span>
      </button>
      <div style={s('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
        {hero.more.map(k => (
          <button key={k} onClick={sg[k].run} data-track={`home.more.${k}`} style={s('text-align:left;border:none;border-radius:22px;padding:14px 12px;background:#FFFFFF;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 22px rgba(30,36,48,.05);min-height:112px')}>
            <span style={s(`width:36px;height:36px;border-radius:50%;background:${sg[k].tint};display:grid;place-items:center`)}><Svg d={sg[k].icon} size={18} stroke="#1E2430" /></span>
            <span style={s('font-size:15px;font-weight:600;line-height:1.2')}>{sg[k].label}</span>
            <span style={s('font-size:12px;color:#636B78')}>{sg[k].meta}</span>
          </button>
        ))}
      </div>

      <Label right={<button onClick={() => go('journey')} style={s('border:none;background:none;font-size:14px;font-weight:600;color:#2F2A5E;padding:0;min-height:44px')}>All steps</button>}>Tiny steps today</Label>
      {notes.length === 0 ? (
        <button onClick={() => { void addPlanItem('Drink a glass of water'); }} style={s('border:1.5px dashed #D6CDBE;background:none;border-radius:18px;height:56px;text-align:left;padding:0 16px;font-size:15px;font-weight:600;color:#636B78')}>+ Add a tiny step. Try “Drink a glass of water”</button>
      ) : (
        <div style={s('display:flex;gap:10px;overflow-x:auto;margin:0 -20px;padding:4px 20px 8px')}>
          {notes.map((p, i) => (
            <button key={p.id} onClick={() => void togglePlan(p.id)} role="checkbox" aria-checked={p.done} aria-label={p.label} data-track="home.step" style={{ ...s(`flex:none;width:132px;height:124px;border:none;border-radius:6px 6px 18px 6px;background:${NOTE_BG[i % 4]};padding:14px;text-align:left;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 6px 14px rgba(30,36,48,.08)`), transform: `rotate(${NOTE_ROT[i % 4]})` }}>
              <span style={s(`font-size:15px;font-weight:600;line-height:1.3;text-decoration:${p.done ? 'line-through' : 'none'};opacity:${p.done ? 0.65 : 1}`)}>{p.label}</span>
              <span style={s(`width:28px;height:28px;border-radius:50%;border:2px solid #1E2430;background:${p.done ? '#1E2430' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={14} stroke="#FFFFFF" sw={3} style={{ opacity: p.done ? 1 : 0 }} /></span>
            </button>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <>
          <Label right={<span style={s('font-size:13px;color:#636B78')}>{city ?? ''}</span>}>Out this week</Label>
          <div style={s('display:flex;gap:10px;overflow-x:auto;margin:0 -20px;padding:0 20px 4px')}>
            {events.map((e, i) => (
              <button key={e.id} onClick={() => setV3({ sheet: { id: 'event', eventId: e.id } })} data-track="home.event" style={s('flex:none;width:210px;border:none;border-radius:24px;overflow:hidden;background:#FFFFFF;text-align:left;padding:0;display:flex;flex-direction:column;box-shadow:0 8px 22px rgba(30,36,48,.06)')}>
                <div style={s(`height:84px;background:${EVENT_BG[i % 3]};position:relative;padding:12px`)}>
                  <span style={s('background:rgba(255,255,255,.92);border-radius:12px;padding:4px 10px;font-size:12px;font-weight:700')}>{dayOf(e.startsAt)}</span>
                  {e.interested && <span style={s('position:absolute;right:12px;top:12px;background:#2F2A5E;color:#FFFFFF;border-radius:12px;padding:4px 10px;font-size:12px;font-weight:700')}>Going</span>}
                </div>
                <div style={s('padding:12px 14px 14px;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:16px;font-weight:700')}>{e.title}</span><span style={s('font-size:13px;color:#636B78')}>{e.venue}</span></div>
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => go('journey')} data-track="home.month" style={s('margin-top:8px;border:none;border-radius:24px;padding:14px 16px;background:#E0EFE5;display:flex;align-items:center;gap:14px;text-align:left')}>
        <div aria-hidden="true" style={s('flex:none;display:flex;gap:3px;align-items:flex-end;height:40px')}>
          {SONG_ROWS.map((row, i) => { const on = showToday.some(k => row.kinds.includes(k)); return <span key={row.label} style={s(`width:8px;height:${on ? 22 + (i % 3) * 7 : 8}px;border-radius:4px;background:${row.color}`)} />; })}
        </div>
        <div style={s('flex:1;display:flex;flex-direction:column;gap:2px')}>
          <span style={s('font-size:15px;font-weight:700')}>This month</span>
          <span style={s('font-size:13px;opacity:.8')}>{today.length ? `Today added ${today.length} thing${today.length > 1 ? 's' : ''} to it.` : 'Nothing yet today. One small thing adds to it.'}</span>
        </div>
        <Svg d={I.chev} size={16} sw={2} />
      </button>
    </div>
  );
}

const EVENT_BG = ['linear-gradient(135deg,#93C48A,#DDEFE4)', 'linear-gradient(135deg,#E8896B,#FCEFCF)', 'linear-gradient(135deg,#6F6BB8,#E6E4F5)'];
