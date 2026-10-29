import { useEffect, useMemo, useRef } from 'react';
import { dismissCard, go, loadJournal, loadTalk, loadToday, openBreathe, startCall, startCheckin, startJournal, startWalkFlow, loadInsights } from '../state/actions';
import { useStore } from '../state/store';
import { playCalmById } from './calm-actions';
import { daysBetween, dateLabel, greeting, local } from './hooks';
import { useGarden, loadGarden } from './garden';
import { openPlant, pickPlantNow } from './garden-actions';
import { useGuidance } from './guidance';
import { Hero, pickPlace } from './Hero';
import { milestones, nextMilestone } from './milestones';
import { HelpPill } from './Chrome';
import { Ic, type IconName } from './icons';
import { moodByValue } from './Weather';
import { openSheet, push, setV2, type PerchKey } from './ui';
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

const PLACES: { k: PerchKey; label: string; icon: IconName; tone: string; go: () => void }[] = [
  { k: 'talk', label: 'Talk', icon: 'mic', tone: 'sky', go: () => go('talk') },
  { k: 'journal', label: 'Journal', icon: 'book', tone: 'rose', go: () => go('journal') },
  { k: 'calm', label: 'Calm', icon: 'lotus', tone: 'sage', go: () => go('calm', { calmTab: 'meditate' }) },
  { k: 'sleep', label: 'Sleep', icon: 'moon', tone: 'lilac', go: () => go('calm', { calmTab: 'sleep' }) },
  { k: 'plan', label: 'Plan', icon: 'list', tone: 'sand', go: () => push({ id: 'plan' }) },
  { k: 'out', label: 'Outside', icon: 'pin', tone: 'clay', go: () => go('outside') },
];

const TILES: { id: string; label: string; sub: string; icon: IconName; bg: string; go: () => void }[] = [
  { id: 'voice', label: 'Talk', sub: 'Voice with Saathi', icon: 'mic', bg: 'var(--t-sky)', go: () => void startCall('voice') },
  { id: 'write', label: 'Write', sub: 'Today’s page', icon: 'pen', bg: 'var(--t-rose)', go: () => startJournal('write') },
  { id: 'breathe', label: 'Breathe', sub: '1 minute', icon: 'wave', bg: 'var(--t-sky)', go: openBreathe },
  { id: 'meditate', label: 'Meditate', sub: 'Guided calm', icon: 'lotus', bg: 'var(--t-lilac)', go: () => go('calm', { calmTab: 'meditate' }) },
  { id: 'sleep', label: 'Sleep', sub: 'Stories to drift off', icon: 'moon', bg: 'var(--t-lilac)', go: () => go('calm', { calmTab: 'sleep' }) },
  { id: 'plant', label: 'Plant', sub: 'Grow something new', icon: 'flower', bg: 'var(--t-sage)', go: () => openPlant('auto') },
  { id: 'walk', label: 'Walk', sub: 'Fresh air with Saathi', icon: 'pin', bg: 'var(--t-clay)', go: () => void startWalkFlow() },
  { id: 'plan', label: 'Plan', sub: 'Tiny steps for today', icon: 'list', bg: 'var(--t-sage)', go: () => push({ id: 'plan' }) },
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
    if (card) return { title: 'A quiet moment for you?', sub: 'Your check-in is here whenever you are. Two minutes, or skip it.', cta: 'Check in', icon: 'bell', color: 'var(--t-sand)', run: () => { void dismissCard(card.id); void startCheckin(); } };
    if (!garden) return null;
    const last = local(LAST_VISIT);
    const gap = last ? daysBetween(new Date(last), new Date()) : 0;
    if (garden.activeDays > 0 && gap >= 2 && !checked) return { title: `Welcome back${nick ? `, ${nick}` : ''}`, sub: 'Nothing wilted while you were away. Your garden rested, and Saathi saved your seat.', cta: 'Check in', icon: 'heart', color: 'var(--t-sand)', run: () => openSheet({ id: 'checkin' }) };
    const ready = garden.plants.find(p => p.ready);
    if (ready) return { title: `Your ${ready.kind} is ready`, sub: 'Pick it, and it starts growing again.', cta: 'Pick it', icon: 'star', color: 'var(--t-clay)', run: () => void pickPlantNow(ready.id) };
    if (letter && local(LETTER_SEEN) !== letter.id && Date.now() - new Date(letter.createdAt).getTime() < 4 * 86_400_000) return { title: 'A letter from Saathi', sub: 'Your week, in a few kind lines.', cta: 'Read it', icon: 'pen', color: 'var(--t-rose)', run: () => push({ id: 'letter' }) };
    const game = garden.tokens.gold > 0 ? 'game-pot' : garden.tokens.thread > 0 ? 'game-thread' : garden.tokens.sky > 0 ? 'game-stars' : null;
    if (game && checked) return { title: 'A quiet game is ready', sub: 'You earned it by looking after yourself. No timer, no score.', cta: 'Play', icon: 'star', color: 'var(--t-lilac)', run: () => push({ id: game }) };
    const e = entries.find(x => x.shared && new Date(x.createdAt).toDateString() !== new Date().toDateString());
    if (e && !words) return { title: 'Saathi remembers', sub: `You wrote: “${e.text.length > 60 ? `${e.text.slice(0, 58)}…` : e.text}” How is it today?`, cta: 'Tell Saathi', icon: 'mic', color: 'var(--t-sky)', run: () => void startCall('voice') };
    if (garden.plants.length < garden.slots && checked) return { title: 'Room to grow', sub: `You have ${garden.slots - garden.plants.length} free plot${garden.slots - garden.plants.length === 1 ? '' : 's'}. Plant something, and it grows on the days you show up.`, cta: 'Choose a plant', icon: 'flower', color: 'var(--t-sage)', run: () => openPlant('auto') };
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
      <div className="stage" data-tour="hero">
        <Hero pick={pick}>
          <div className="hhead">
            <div><div className="eyebrow" onClick={onDate}>{dateLabel()}</div><h1 className="h1" style={{ marginTop: 4 }}>{greeting()}{nick ? <>,<br />{nick}</> : null}</h1></div>
            <HelpPill tour />
          </div>
        </Hero>
      </div>
      <div className="daysheet">
      <nav className="places" aria-label="Places in your garden">
        {PLACES.map(p => {
          const today = pick === p.k;
          return (
            <button key={p.k} className={today ? 'on' : undefined} data-track={`pin.${p.k}`} aria-label={p.label + (today ? ', suggested for you today' : '')} onClick={() => { setV2({ birdAt: p.k }); setTimeout(p.go, 260); }}>
              <i style={{ background: `var(--t-${p.tone})` }}><Ic n={p.icon} /></i>
              <span>{p.label}</span>
              {today && <em aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      {nudge && (
        <div className="nudge" style={{ background: nudge.color }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className="ico"><Ic n={nudge.icon} /></span>
            <div className="grow1">
              <b>{nudge.title}</b><div className="small muted">{nudge.sub}</div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn sm" onClick={nudge.run}>{nudge.cta}</button>
                {cards.some(c => c.kind === 'checkin') && <button className="btn sm ghost" onClick={() => { const c = cards.find(x => x.kind === 'checkin'); if (c) void dismissCard(c.id); }}>Not now</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sec" data-tour="today">
        <div className="sec-h"><h2 className="h2">Today</h2><span className={'pill' + (done === 3 ? ' leaf' : '')}>{done} of 3</span></div>
        <ul className="steps card flat">
          {checked
            ? li(1, 'done', 'Check in', <>You felt <b>{m?.label ?? 'something'}</b>. Your tree got its water.</>)
            : li(1, next === 1 ? 'next' : 'later', 'Check in', 'How are you feeling right now?', next === 1 && <button className="btn sm" onClick={() => openSheet({ id: 'checkin' })}>Check in</button>)}
          {body
            ? li(2, 'done', 'One small thing', 'Done. Every small thing counts.')
            : li(2, next === 2 ? 'next' : 'later', 'One small thing',
              one ? <>{one.title}. <span className="muted">{one.sub}</span><br /><button className="link" onClick={() => push({ id: 'why' })}>Why this?</button></> : 'Saathi suggests one after you check in.',
              next === 2 && one && <><button className="btn sm" onClick={() => doOneThing(one.id)}>{one.cta}</button><button className="btn sm ghost" onClick={() => document.getElementById('v2more')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Pick another</button></>)}
          {words
            ? li(3, 'done', 'Put it into words', 'Done. Thank you for sharing.')
            : li(3, next === 3 ? 'next' : 'later', 'Put it into words', 'Write a few lines, or say it out loud.',
              next === 3 ? <><button className="btn sm" onClick={() => startJournal('write')}>Write</button><button className="btn sm ghost" onClick={() => void startCall('voice')}>Talk instead</button></> : null)}
        </ul>
        {today?.golden && <div className="golden"><span className="ico"><Ic n="sun" /></span><div><b>A golden day</b><div className="small">You tended all three parts of today. A kingfisher came to the pond.</div></div></div>}
      </div>

      {garden && (
        <div className="sec">
          <div className="sec-h"><h2 className="h2">Your garden</h2><button className="link" onClick={() => push({ id: 'garden' })}>See all</button></div>
          <div className="card flat">
            <div className="stats">
              {([[garden.activeDays, 'days'], [garden.counts.journal ?? 0, 'flowers'], [garden.plants.length, 'growing'], [garden.rangolis + garden.boats + garden.jarCount, 'made']] as const).map(([n, l]) => (
                <div key={l}><b>{n}</b><span>{l}</span></div>
              ))}
            </div>
            {(() => { const nx = nextMilestone(milestones(garden)); return <p className="small muted" style={{ marginTop: 14 }}>{nx ? <>Next: <b>{nx.label}</b>, {nx.need - nx.have} to go. No rush.</> : 'You have reached every milestone so far.'}</p>; })()}
            {garden.plants.length < garden.slots && <button className="rowlink" onClick={() => openPlant('auto')}><Ic n="flower" /><span>Plant something <em>{garden.slots - garden.plants.length} free plot{garden.slots - garden.plants.length === 1 ? '' : 's'}</em></span><Ic n="chev" /></button>}
          </div>
        </div>
      )}

      <div className="sec" id="v2more">
        <div className="sec-h"><h2 className="h2">More ways to feel better</h2></div>
        <div className="tiles">
          {TILES.map(t => (
            <button key={t.id} className="tile" data-track={`tile.${t.id}`} onClick={t.go}><span className="ico" style={{ background: t.bg }}><Ic n={t.icon} /></span><div><b>{t.label}</b><span>{t.sub}</span></div></button>
          ))}
        </div>
      </div>
      <p className="foot">Nothing here ever wilts. Missing a day just means a quiet day.</p>
      </div>
    </>
  );
}
