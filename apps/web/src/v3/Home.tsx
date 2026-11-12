import { useEffect, useMemo, useState } from 'react';
import { Companion } from '../components/figures';
import { addPlanItem, go, loadInsights, loadJournal, loadOutside, loadToday, openBreathe, startCall, startJournal, startWalkFlow, togglePlan } from '../state/actions';
import { dayOf, set, useStore } from '../state/store';
import { playCalm } from './calm';
import { s } from './css';
import { I, Svg } from './icons';
import { HelpButton } from './Chrome';
import { Weather } from './weather';
import { BellButton } from './Inbox';
import { SceneBackdrop } from './Scenes';
import { partOf, type Part } from './theme';
import { MOODS, greetFor } from './moods';
import { NUDGES, dayNumber, nudgeText, nudgesFor, type NudgeId } from './nudge';
import { loadMonthData, useMonthData } from './month-data';
import { setV3 } from './ui';

export const openGame = (game: 'rangoli' | 'balloon' | 'fruit' | 'room') => setV3({ over: 'game', game });

const LINE: Record<Part, string> = { morning: 'No rush this morning.', afternoon: 'A quiet afternoon is fine.', evening: 'Slow evening. Take your time.', night: 'Late night. I’m here.' };

/** A soft colour for each, so the options read as different things at a glance. */
const TINT: Record<NudgeId, string> = { talk: 'var(--p-butter)', write: 'var(--p-rose)', speak: 'var(--p-butter)', step: 'var(--p-mint)', story: 'var(--p-sky)', breathe: 'var(--t1)', calm: 'var(--p-mint)', sit: 'var(--t1)', walk: 'var(--p-mint)', play: 'var(--p-rose)' };
const ICON: Record<NudgeId, string> = { talk: I.mic, write: I.pen, speak: I.mic, step: I.check, story: I.moon, breathe: I.breathe, calm: I.lotus, sit: I.sit, walk: I.walk, play: I.game };
/** The short name each suggestion has when it is one of the "or" rows. */
const ROW: Record<NudgeId, string> = { talk: 'Talk to me', write: 'Write it out', speak: 'Speak a journal', step: 'A tiny step', story: 'Rain story', breathe: 'Breathe', calm: 'Calm my mind', sit: 'Sit with me', walk: 'Walk with me', play: 'Play a little' };

export function Home() {
  const mood = useStore(x => x.mood);
  const look = useStore(x => x.look);
  const nick = useStore(x => x.nick);
  const plan = useStore(x => x.plan);
  const events = useStore(x => x.events);
  const city = useStore(x => x.eventsCity);
  const month = useMonthData();
  const [swaps, setSwaps] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => { void loadToday(); void loadOutside(); void loadJournal(); void loadInsights(); void loadMonthData(); }, []);

  const M = mood === null ? null : MOODS[mood];
  const hour = new Date().getHours();
  const greet = greetFor(hour);
  const part = partOf(hour);
  const undone = plan.filter(p => !p.done);
  const doneN = plan.length - undone.length;

  // The suggestions for now. A step is only offered while there is one to do, or none made yet.
  const order = useMemo(() => nudgesFor({ hour, mood, day: dayNumber(), swaps }).filter(id => id !== 'step' || undone.length > 0 || plan.length === 0), [hour, mood, swaps, undone.length, plan.length]);
  const main: NudgeId = order[0];
  const text = useMemo(() => {
    const t = { ...nudgeText(main, mood) };
    if (main === 'step') { t.sub = undone[0] ? undone[0].label : 'Start with a glass of water.'; t.cta = undone[0] ? 'Done it' : 'Add it'; }
    return t;
  }, [main, undone, mood]);

  const run = (id: NudgeId) => {
    switch (id) {
      case 'talk': void startCall('voice'); break;
      case 'write': startJournal('write'); if (mood !== null && mood >= 3) set({ jPrompt: 'What went well today?' }); break;
      case 'speak': startJournal('speak'); break;
      case 'step': if (undone[0]) void togglePlan(undone[0].id); else if (plan.length === 0) void addPlanItem('Drink a glass of water'); else go('journey'); break;
      case 'story': playCalm('monsoon'); break;
      case 'breathe': openBreathe(); break;
      case 'calm': playCalm('sos'); break;
      case 'sit': void startCall('sit'); break;
      case 'walk': void startWalkFlow(); break;
      case 'play': openGame('rangoli'); break;
    }
  };

  const today = month?.days.find(d => d.day === month.today)?.kinds ?? [];
  const steps = [...plan].sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 3);
  const ev = events.find(e => !e.interested) ?? events[0];

  return (
    <div className="screen" data-scroll="1" onScroll={e => setScrollY(e.currentTarget.scrollTop)} style={{ ...s('overflow:auto;background:var(--page);display:flex;flex-direction:column;padding:56px 24px 128px;gap:20px') }}>
      <SceneBackdrop mood={mood} scrollY={scrollY} />
      <header style={s('position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between')}>
        <button onClick={() => go('you')} aria-label="Account and settings" data-track="nav.you" style={s('display:flex;align-items:center;gap:8px;height:44px;padding:0 16px 0 5px;border:none;border-radius:22px;background:var(--card);box-shadow:0 4px 14px rgba(30,36,48,.14);font-size:15px;font-weight:700;color:var(--ink)')}>
          <span style={s('width:34px;height:34px;border-radius:50%;background:var(--soft);overflow:hidden;display:grid;place-items:center;flex:none')}><Companion look={look} size={34} /></span>
          Account
        </button>
        <div style={s('display:flex;align-items:center;gap:8px')}><BellButton /><HelpButton /></div>
      </header>

      <div aria-hidden="true" style={s('height:76px;flex:none')} />

      <div style={s('position:relative;z-index:2;display:flex;flex-direction:column;gap:6px')}>
        <h1 className="serif" style={s('font-size:36px;line-height:1.1;margin:0')}>{greet}{nick ? `, ${nick}` : ''}.</h1>
        <div style={s('font-size:17px;color:var(--muted)')}>{LINE[part]}</div>
        <button onClick={() => setV3({ over: 'mood' })} aria-label={M ? `Feeling ${M.label.toLowerCase()}. Change` : 'Not checked in. Check in'} style={s('align-self:flex-start;margin-top:4px;min-height:44px;padding:0;border:none;background:none;display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600')}>
          <Weather mood={mood ?? 2} size={26} />{M ? `Feeling ${M.label.toLowerCase()}` : 'How are you today?'}<span style={s('color:var(--muted);font-weight:500')}>· {M ? 'change' : 'tell me'}</span>
        </button>
      </div>

      {mood === null ? (
        <section aria-label="Check in" style={s('background:var(--card);border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 28px rgba(30,36,48,.05)')}>
          <h2 className="serif" style={s('font-size:28px;line-height:1.15;margin:0')}>How are you, right now?</h2>
          <div style={s('font-size:17px;color:var(--muted)')}>One tap.</div>
          <button onClick={() => setV3({ over: 'mood' })} data-track="home.hero" style={s('margin-top:14px;align-self:flex-start;height:52px;padding:0 28px;border-radius:26px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600')}>Check in</button>
        </section>
      ) : (
        <section aria-label="For you right now" style={s('background:var(--card);border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 28px rgba(30,36,48,.05)')}>
          <span aria-hidden="true" style={s('width:44px;height:44px;border-radius:50%;background:var(--t1);display:grid;place-items:center;margin-bottom:10px')}><Svg d={ICON[main]} size={20} stroke="var(--accent-ink)" /></span>
          <h2 className="serif" style={s('font-size:28px;line-height:1.15;margin:0')}>{text.title}</h2>
          <div style={s('font-size:17px;line-height:1.4;color:var(--muted)')}>{text.sub}</div>
          <div style={s('display:flex;align-items:center;gap:16px;margin-top:16px')}>
            <button onClick={() => run(main)} data-track="home.hero" style={s('flex:none;white-space:nowrap;height:52px;padding:0 26px;border-radius:26px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600')}>{text.cta}</button>
            <button onClick={() => setSwaps(n => n + 1)} data-track="home.swap" style={s('white-space:nowrap;min-height:44px;padding:0;border:none;background:none;font-size:16px;font-weight:600;color:var(--accent-ink)')}>Something else</button>
          </div>
        </section>
      )}

      <section aria-label="Other things to try" style={s('display:flex;flex-direction:column;gap:10px')}>
        <h2 className="kicker" style={s('margin:0 0 0 4px')}>Or try</h2>
        <div style={s('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px')}>
          {order.slice(1, 4).map(id => (
            <button key={id} onClick={() => run(id)} data-track={`home.more.${id}`} style={s('min-height:124px;padding:14px 12px 12px;border:none;border-radius:24px;background:var(--card);box-shadow:0 8px 22px rgba(30,36,48,.06);display:flex;flex-direction:column;align-items:flex-start;gap:10px;text-align:left')}>
              <span aria-hidden="true" style={s(`width:46px;height:46px;border-radius:50%;background:${TINT[id]};display:grid;place-items:center;flex:none`)}><Svg d={ICON[id]} size={21} stroke="#1E2430" /></span>
              <span style={s('display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:16px;font-weight:600;line-height:1.2')}>{ROW[id]}</span><span style={s('font-size:13px;color:var(--muted)')}>{NUDGES[id].meta}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Tiny steps today" style={s('display:flex;flex-direction:column;gap:6px')}>
        <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:0 4px 2px')}>
          <h2 className="kicker" style={s('margin:0')}>Tiny steps{plan.length ? ` · ${doneN} of ${plan.length}` : ''}</h2>
          <button onClick={() => go('journey')} style={s('border:none;background:none;font-size:15px;font-weight:600;color:var(--accent-ink);padding:0;min-height:44px')}>All steps</button>
        </div>
        <div style={s('display:flex;flex-direction:column;gap:8px')}>
          {steps.length === 0 ? (
            <button onClick={() => { void addPlanItem('Drink a glass of water'); }} style={s('min-height:56px;padding:0 18px;border:1.5px dashed var(--line);border-radius:20px;background:none;text-align:left;font-size:17px;font-weight:600;color:var(--muted)')}>+ Add a tiny step</button>
          ) : steps.map(p => (
            <button key={p.id} onClick={() => void togglePlan(p.id)} role="checkbox" aria-checked={p.done} aria-label={p.label} data-track="home.step" style={s(`min-height:56px;padding:0 18px 0 14px;border:none;border-radius:20px;background:${p.done ? 'transparent' : 'var(--card)'};box-shadow:${p.done ? 'none' : '0 6px 16px rgba(30,36,48,.05)'};display:flex;align-items:center;gap:14px;text-align:left`)}>
              <span style={s(`flex:none;width:26px;height:26px;border-radius:50%;border:2px solid ${p.done ? 'var(--accent)' : 'var(--line)'};background:${p.done ? 'var(--accent)' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={13} stroke="#FFFFFF" sw={3} style={{ opacity: p.done ? 1 : 0 }} /></span>
              <span style={s(`flex:1;font-size:17px;font-weight:500;text-decoration:${p.done ? 'line-through' : 'none'};color:${p.done ? 'var(--muted)' : 'var(--ink)'}`)}>{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      {ev && (
        <button onClick={() => setV3({ sheet: { id: 'event', eventId: ev.id } })} data-track="home.event" style={s('border:none;border-radius:24px;background:var(--card);box-shadow:0 8px 22px rgba(30,36,48,.05);padding:14px 16px;min-height:68px;display:flex;align-items:center;gap:14px;text-align:left')}>
          <span aria-hidden="true" style={s('width:44px;height:44px;border-radius:50%;background:var(--p-rose);display:grid;place-items:center;flex:none')}><Svg d={I.pin} size={19} stroke="#1E2430" /></span>
          <span style={s('flex:1;display:flex;flex-direction:column')}><span style={s('font-size:13px;color:var(--muted);font-weight:600')}>Near you · {dayOf(ev.startsAt)}{city ? ` · ${city}` : ''}</span><span style={s('font-size:17px;font-weight:600')}>{ev.title}</span></span>
          <Svg d={I.chev} size={16} sw={2} stroke="var(--muted)" />
        </button>
      )}

      <button onClick={() => go('journey')} data-track="home.month" style={s('border:none;border-radius:24px;background:var(--p-mint);padding:14px 16px;min-height:68px;display:flex;align-items:center;gap:14px;text-align:left')}>
        <span aria-hidden="true" style={s('width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.7);display:grid;place-items:center;flex:none')}><Svg d={I.month} size={19} stroke="#1E2430" /></span>
        <span style={s('flex:1;display:flex;flex-direction:column')}><span style={s('font-size:17px;font-weight:600')}>This month</span><span style={s('font-size:15px;color:#3F4A57')}>{today.length ? `Today added ${today.length} thing${today.length > 1 ? 's' : ''}.` : 'One small thing adds to it.'}</span></span>
        <Svg d={I.chev} size={16} sw={2} />
      </button>
    </div>
  );
}
