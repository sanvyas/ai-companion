import { useEffect, useMemo, useRef } from 'react';
import { dismissCard, go, loadJournal, loadTalk, loadToday, openBreathe, startCall, startCheckin, startJournal, startWalkFlow, loadInsights } from '../state/actions';
import { useStore } from '../state/store';
import { playCalmById } from './calm-actions';
import { daysBetween, dateLabel, greeting, local } from './hooks';
import { useGarden, loadGarden } from './garden';
import { openPlant, pickPlantNow } from './garden-actions';
import { useGuidance } from './guidance';
import { Hero, pickPlace } from './Hero';
import { HelpPill } from './Chrome';
import { Ic, type IconName } from './icons';
import { moodByValue } from './Weather';
import { openSheet, push } from './ui';
import type { OneThing } from '@saathi/domain';

const LAST_VISIT = 'saathi.v2.lastVisit';
const LETTER_SEEN = 'saathi.v2.letterSeen';

/** What the "one small thing" button does for each kind of suggestion. */
export function doOneThing(id: OneThing['id']) {
  switch (id) {
    case 'voice': void startCall('voice'); return;
    case 'breathe': openBreathe(); return;
    case 'walk': void startWalkFlow(); return;
    case 'meditate': playCalmById('kind'); return;
    case 'sleep': go('calm', { calmTab: 'sleep' }); return;
    case 'plan': push({ id: 'plan' }); return;
    case 'boat': push({ id: 'create-boat' }); return;
    case 'rangoli': push({ id: 'create-rangoli' }); return;
    case 'jar': push({ id: 'create-jar' }); return;
  }
}

const TILES: { id: string; label: string; sub: string; icon: IconName; bg: string; go: () => void }[] = [
  { id: 'voice', label: 'Talk', sub: 'Voice with Saathi', icon: 'mic', bg: '#D9DEFA', go: () => void startCall('voice') },
  { id: 'write', label: 'Write', sub: 'Today’s page', icon: 'pen', bg: '#FADCE3', go: () => startJournal('write') },
  { id: 'breathe', label: 'Breathe', sub: '1 minute', icon: 'wave', bg: '#D3ECF5', go: openBreathe },
  { id: 'meditate', label: 'Meditate', sub: 'Guided calm', icon: 'lotus', bg: '#E4DDF3', go: () => go('calm', { calmTab: 'meditate' }) },
  { id: 'sleep', label: 'Sleep', sub: 'Stories to drift off', icon: 'moon', bg: '#CFD3F3', go: () => go('calm', { calmTab: 'sleep' }) },
  { id: 'plant', label: 'Plant', sub: 'Grow something new', icon: 'flower', bg: '#D6EBDD', go: () => openPlant('auto') },
  { id: 'walk', label: 'Walk', sub: 'Fresh air with Saathi', icon: 'pin', bg: '#FBE2CE', go: () => void startWalkFlow() },
  { id: 'plan', label: 'Plan', sub: 'Tiny steps for today', icon: 'list', bg: '#E6EFC6', go: () => push({ id: 'plan' }) },
];

interface Nudge { title: string; sub: string; cta: string; icon: IconName; color: string; run: () => void }

export function Home() {
  const nick = useStore(s => s.nick);
  const mood = useStore(s => s.mood);
  const entries = useStore(s => s.jEntries);
  const letter = useStore(s => s.letter);
  const cards = useStore(s => s.cards);
  const quickHide = useStore(s => s.me?.privacy.quickHide ?? false);
  const garden = useGarden(s => s.garden);
  const { one } = useGuidance();
  const taps = useRef<number[]>([]);
  // Quick hide: three quick taps on the date switch to a breathing screen, for when someone glances over.
  const onDate = () => { const n = Date.now(); taps.current = taps.current.filter(x => n - x < 900).concat(n); if (taps.current.length >= 3 && quickHide) { taps.current = []; openBreathe(); } };

  useEffect(() => {
    void loadToday(); void loadJournal(); void loadTalk(); void loadInsights();
    void loadGarden({ quiet: true });
  }, []);

  const today = garden?.today;
  const checked = !!(today?.checkin || mood !== null);
  const body = !!today?.body;
  const words = !!today?.words;
  const done = (checked ? 1 : 0) + (body ? 1 : 0) + (words ? 1 : 0);
  const next = !checked ? 1 : !body ? 2 : !words ? 3 : 0;
  const m = moodByValue(mood);
  const pick = pickPlace(one?.id, body);

  const nudge = useMemo<Nudge | null>(() => {
    // A check-in the person asked for (quiet cards) comes first: it is what they chose to be reminded of.
    const card = cards.find(c => c.kind === 'checkin');
    if (card) return { title: 'A quiet moment for you?', sub: 'Your check-in is here whenever you are. Two minutes, or skip it.', cta: 'Check in', icon: 'bell', color: '#FFE9B8', run: () => { void dismissCard(card.id); void startCheckin(); } };
    if (!garden) return null;
    const last = local(LAST_VISIT);
    const gap = last ? daysBetween(new Date(last), new Date()) : 0;
    if (garden.activeDays > 0 && gap >= 2 && !checked) return { title: `Welcome back${nick ? `, ${nick}` : ''}`, sub: 'Nothing wilted while you were away. Your garden rested, and Saathi saved your seat.', cta: 'Check in', icon: 'heart', color: '#FFE9B8', run: () => openSheet({ id: 'checkin' }) };
    const ready = garden.plants.find(p => p.ready);
    if (ready) return { title: `Your ${ready.kind} is ready`, sub: 'Pick it, and it starts growing again.', cta: 'Pick it', icon: 'star', color: '#FFE0A8', run: () => void pickPlantNow(ready.id) };
    if (letter && local(LETTER_SEEN) !== letter.id && Date.now() - new Date(letter.createdAt).getTime() < 4 * 86_400_000) return { title: 'A letter from Saathi', sub: 'Your week, in a few kind lines.', cta: 'Read it', icon: 'pen', color: '#F8D9E3', run: () => push({ id: 'letter' }) };
    const game = garden.tokens.gold > 0 ? 'game-pot' : garden.tokens.thread > 0 ? 'game-thread' : garden.tokens.sky > 0 ? 'game-stars' : null;
    if (game && checked) return { title: 'A quiet game is ready', sub: 'You earned it by looking after yourself. No timer, no score.', cta: 'Play', icon: 'star', color: '#E9E3FA', run: () => push({ id: game }) };
    const e = entries.find(x => x.shared && new Date(x.createdAt).toDateString() !== new Date().toDateString());
    if (e && !words) return { title: 'Saathi remembers', sub: `You wrote: “${e.text.length > 60 ? `${e.text.slice(0, 58)}…` : e.text}” How is it today?`, cta: 'Tell Saathi', icon: 'mic', color: '#DDE3FA', run: () => void startCall('voice') };
    if (garden.plants.length < garden.slots && checked) return { title: 'Room to grow', sub: `You have ${garden.slots - garden.plants.length} free plot${garden.slots - garden.plants.length === 1 ? '' : 's'}. Plant something, and it grows on the days you show up.`, cta: 'Choose a plant', icon: 'flower', color: '#DDF0DC', run: () => openPlant('auto') };
    return null;
  }, [garden, checked, words, entries, letter, nick, cards]);

  useEffect(() => { local(LAST_VISIT, new Date().toISOString()); }, []);

  const li = (n: number, cls: 'done' | 'next' | 'later', title: string, sub: React.ReactNode, acts?: React.ReactNode) => (
    <li className={cls}>
      <span className="num">{cls === 'done' ? <Ic n="check" /> : n}</span>
      <div className="grow1"><div className="tt2">{title}</div><div className="ss">{sub}</div>{acts && <div className="acts">{acts}</div>}</div>
    </li>
  );

  return (
    <>
      <div className="hhead">
        <div><div className="eyebrow" onClick={onDate}>{dateLabel()}</div><h1 className="h1" style={{ marginTop: 4 }}>{greeting()}{nick ? <>,<br />{nick}</> : null}</h1></div>
        <HelpPill tour />
      </div>
      <div data-tour="hero"><Hero pick={pick} /></div>

      {nudge && (
        <div className="card row" style={{ marginTop: 16, gap: 12, background: nudge.color, color: '#1F2A44' }}>
          <span className="ico" style={{ background: 'rgba(255,255,255,.7)' }}><Ic n={nudge.icon} /></span>
          <div className="grow1"><b>{nudge.title}</b><div className="small" style={{ opacity: .8 }}>{nudge.sub}</div></div>
          <button className="btn sm" onClick={nudge.run}>{nudge.cta}</button>
          {cards.some(c => c.kind === 'checkin') && <button className="btn sm ghost" onClick={() => { const c = cards.find(x => x.kind === 'checkin'); if (c) void dismissCard(c.id); }}>Not now</button>}
        </div>
      )}

      <div className="sec" data-tour="today">
        <div className="sec-h"><h2 className="h2">Today</h2><span className={'pill' + (done === 3 ? ' leaf' : '')}>{done} of 3</span></div>
        {!checked && <p className="muted small" style={{ margin: '-4px 0 12px' }}>Three small steps. Start with the first one.</p>}
        <ul className="steps">
          {checked
            ? li(1, 'done', 'Check in', <>You felt <b>{m?.label ?? 'something'}</b>. Your tree got its water.</>)
            : li(1, next === 1 ? 'next' : 'later', 'Check in', 'How are you feeling right now?', next === 1 && <button className="btn sm" onClick={() => openSheet({ id: 'checkin' })}><Ic n="heart" />Check in</button>)}
          {body
            ? li(2, 'done', 'One small thing', 'Done. Every small thing counts.')
            : li(2, next === 2 ? 'next' : 'later', 'One small thing',
              one ? <>{one.title}<br /><span className="fine">{one.sub}</span><br /><button className="link" style={{ minHeight: 30, fontSize: 13, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 700 }} onClick={() => push({ id: 'why' })}><span>Why this? <span className="muted" style={{ fontWeight: 600 }}>{one.why}</span></span></button></> : 'Saathi suggests one after you check in.',
              next === 2 && one && <><button className="btn sm" onClick={() => doOneThing(one.id)}><Ic n={one.icon} />{one.cta}</button><button className="btn sm soft" onClick={() => document.getElementById('v2more')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Pick another</button></>)}
          {words
            ? li(3, 'done', 'Put it into words', 'Done. Thank you for sharing.')
            : li(3, next === 3 ? 'next' : 'later', 'Put it into words', 'Write a few lines, or say it out loud.',
              next === 3 ? <><button className="btn sm" onClick={() => startJournal('write')}><Ic n="pen" />Write</button><button className="btn sm soft" onClick={() => void startCall('voice')}><Ic n="mic" />Talk</button></> : <button className="btn sm soft" onClick={() => startJournal('write')}><Ic n="pen" />Write</button>)}
        </ul>
        {today?.golden && <div className="golden"><span className="ico" style={{ background: 'rgba(255,255,255,.55)' }}><Ic n="sun" /></span><div><b style={{ fontFamily: 'var(--disp)', fontSize: 16 }}>Golden hour</b><div className="small">You tended all three parts of today. A kingfisher came to the pond.</div></div></div>}
      </div>

      <div className="sec" id="v2more">
        <div className="sec-h"><h2 className="h2">More ways to feel better</h2></div>
        <div className="tiles">
          {TILES.map(t => (
            <button key={t.id} className="tile" style={{ background: t.bg }} data-track={`tile.${t.id}`} onClick={t.go}><Ic n={t.icon} /><div><b>{t.label}</b><span>{t.sub}</span></div></button>
          ))}
        </div>
      </div>
      <p className="foot">Nothing here ever wilts. Missing a day just means a quiet day.</p>
    </>
  );
}
