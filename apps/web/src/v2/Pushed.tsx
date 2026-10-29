import { useEffect, useMemo, useState } from 'react';
import { cameUp, nextNotes, rankByThemes, themeDef, THEMES, weekThemes } from '@saathi/domain';
import { CALM_ITEMS } from '../data/calm';
import { addPlanItem, loadOutside, loadYou, openSheet as openStoreSheet, togglePlan } from '../state/actions';
import { dayOf, useStore } from '../state/store';
import { Soon } from './Soon';
import { ScreenFrame } from './Chrome';
import { useGuidance, useSaid } from './guidance';
import { local } from './hooks';
import { Ic, type IconName } from './icons';
import { deletePlanItem, renamePlanItem } from './plan-actions';
import { CALM_TAGS, eventTags } from './tags';
import { AboutScreen, LanguageScreen } from './You';
import { GardenScreen } from './GardenScreen';
import { BoatScreen, JarScreen, RangoliScreen } from './Create';
import { PotGame, StarsGame, ThreadGame } from './Games';
import { ConvoScreen } from './Journal';
import { pop, type Pushed } from './ui';

const IDEAS = ['Drink a glass of water', 'Step outside for five minutes', 'Message someone you like', 'Stretch for two minutes', 'Eat something warm', 'Tidy one small corner'];

// ---------------------------------------------------------------------------------------------- gentle plan
function PlanRow({ id }: { id: string }) {
  const p = useStore(s => s.plan.find(x => x.id === id));
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!p) return null;
  if (editing) {
    const save = async () => { if (await renamePlanItem(p.id, text)) setEditing(false); };
    return (
      <li style={{ gap: 8 }}>
        <input type="text" aria-label="Edit step" value={text} maxLength={120} autoComplete="off" autoFocus onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }} style={{ padding: '10px 14px', borderRadius: 14 }} />
        <button className="iconbtn" aria-label="Save" style={{ background: 'var(--leaf)', color: '#fff' }} disabled={!text.trim()} onClick={() => void save()}><Ic n="check" /></button>
        <button className="iconbtn" aria-label="Cancel" onClick={() => setEditing(false)}><Ic n="x" /></button>
      </li>
    );
  }
  return (
    <li>
      <button className="chk" role="checkbox" aria-checked={p.done} aria-label={p.label} onClick={() => void togglePlan(p.id)}><Ic n="check" /></button>
      <span className="grow1" style={p.done ? { textDecoration: 'line-through', opacity: .6 } : undefined}>{p.label}</span>
      <button className="iconbtn" style={{ width: 40, height: 40, boxShadow: 'none', background: 'var(--bg2)' }} aria-label={`Edit ${p.label}`} onClick={() => { setText(p.label); setEditing(true); }}><Ic n="pen" /></button>
      <button className="iconbtn" style={{ width: 40, height: 40, boxShadow: 'none', background: 'var(--bg2)' }} aria-label={`Remove ${p.label}`} onClick={() => void deletePlanItem(p.id)}><Ic n="x" /></button>
    </li>
  );
}

export function PlanScreen() {
  const plan = useStore(s => s.plan);
  const [text, setText] = useState('');
  const n = plan.length;
  const done = plan.filter(p => p.done).length;
  const ideas = IDEAS.filter(x => !plan.some(p => p.label === x)).slice(0, 3);
  const add = async (label: string) => { const t = label.trim(); if (!t) return; setText(''); await addPlanItem(t, 'user'); };
  return (
    <ScreenFrame title="Gentle plan" onBack={pop}>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Tiny steps, in any order. Change them, remove them, add your own. This is your list, and there is no wrong way to use it.</p>
      {n > 0 && <div className="bar" style={{ marginBottom: 14 }} role="progressbar" aria-label="Steps done" aria-valuenow={done} aria-valuemin={0} aria-valuemax={n}><i style={{ width: `${Math.round((done / n) * 100)}%` }} /></div>}
      {n > 0
        ? <ul className="list card" style={{ padding: '4px 16px' }}>{plan.map(p => <PlanRow key={p.id} id={p.id} />)}</ul>
        : <div className="card" style={{ textAlign: 'center', padding: 22 }}><b className="h3">Nothing on your list</b><p className="muted small" style={{ marginTop: 4 }}>That is fine too. Add a step when you feel like it.</p></div>}
      {n < 8 ? (
        <>
          <form className="row" style={{ gap: 8, marginTop: 14 }} onSubmit={e => { e.preventDefault(); void add(text); }}>
            <input type="text" aria-label="Add a step" placeholder="Add your own step" maxLength={120} autoComplete="off" value={text} onChange={e => setText(e.target.value)} />
            <button type="submit" className="btn" aria-label="Add step" disabled={!text.trim()}><Ic n="plus" />Add</button>
          </form>
          {ideas.length > 0 && <div className="chips" style={{ marginTop: 10 }}>{ideas.map(x => <button key={x} className="chip" onClick={() => void add(x)}>+ {x}</button>)}</div>}
        </>
      ) : <p className="fine" style={{ marginTop: 10 }}>That is plenty for one day. Remove one to add another.</p>}
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- how saathi plans
export function WhyScreen() {
  const { one, remember } = useGuidance();
  const { said } = useSaid();
  const events = useStore(s => s.events);
  const prefs = useStore(s => s.prefs);
  useEffect(() => { void loadOutside(); void loadYou(); }, []);
  const wk = useMemo(() => weekThemes(said, new Date(), 7), [said]);
  const keys = (Object.keys(wk) as (keyof typeof wk)[]).sort((a, b) => (wk[b] ?? 0) - (wk[a] ?? 0));
  const label = (k: Parameters<typeof cameUp>[0], n: number) => `Because ${cameUp(k, n).toLowerCase()}`;
  const story = rankByThemes(CALM_ITEMS.filter(c => c.kind === 'sleep' && c.lines).map(c => ({ id: c.id, tags: CALM_TAGS[c.id] ?? [], title: c.title })), wk, label)[0];
  const ev = rankByThemes(events.map(e => ({ id: e.id, tags: eventTags(e), title: e.title, when: e.startsAt })), wk, label)[0];
  const notes = nextNotes(wk, prefs?.checkinTime ?? 'evening');
  const row = (icon: IconName, color: string, title: string, body: string, why?: string) => (
    <li style={{ alignItems: 'flex-start' }}><span className="ico" style={{ background: color }}><Ic n={icon} /></span><div className="grow1"><b>{title}</b><div className="small">{body}</div>{why && <div className="fine" style={{ marginTop: 2 }}>{why}</div>}</div></li>
  );
  return (
    <ScreenFrame title="How Saathi plans" onBack={pop}>
      <p className="muted" style={{ margin: '6px 0 12px' }}>Saathi notices the pattern in what you chose to share, and uses it to decide what to offer. It all happens on your phone. Nothing is posted anywhere, and you can switch it off.</p>
      <div className="card">
        <b className="h3">What Saathi noticed this week</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {keys.length ? keys.map(k => { const h = themeDef(k); return <span key={k} className="pill" style={{ background: `${h.color}33` }}><span className="dot" style={{ width: 9, height: 9, background: h.color }} />{h.label} · {wk[k]}</span>; })
            : <span className="muted small">{remember ? 'Nothing yet. Write or talk a little, and this fills in.' : 'Using conversations is off, so suggestions only use how you feel today.'}</span>}
        </div>
      </div>
      <div className="sec-h" style={{ marginTop: 20 }}><h2 className="h2">So Saathi suggests</h2></div>
      <ul className="list card" style={{ padding: '4px 16px' }}>
        {row('check', '#DDF0DC', 'Today’s small thing', one?.title ?? 'Check in first, and Saathi picks one.', one?.why)}
        {story && row('moon', '#C9CDF0', 'A story or meditation', story.item.title, story.why)}
        {ev && row('pin', '#F9DCC0', 'Something near you', `${ev.item.title} · ${dayOf(ev.item.when)}`, ev.why || 'Because it is a gentle way to be around people.')}
      </ul>
      <div className="sec-h" style={{ marginTop: 20 }}><h2 className="h2">Messages coming up</h2></div>
      {notes.length
        ? <ul className="list card" style={{ padding: '4px 16px' }}>{notes.map(nn => row('bell', '#FFE9B8', nn.text, nn.when, nn.why))}</ul>
        : <div className="card"><p className="muted small">Check-ins are off. Saathi won’t send anything unless you turn them on in You.</p></div>}
      <div className="sec-h" style={{ marginTop: 20 }}><h2 className="h2">You are in control</h2></div>
      <div className="card">
        <p className="small muted">Pages marked “just for you” are never used. To stop all of this, turn off “Remember things from our chats” in You, under Memory.</p>
        <button className="btn line sm" style={{ marginTop: 10 }} onClick={() => openStoreSheet('support')}>Need someone now?</button>
      </div>
      <p className="fine" style={{ margin: '12px 0 0' }}>Themes: {THEMES.map(t => t.label.toLowerCase()).join(', ')}.</p>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- sunday letter
const LETTER_SEEN = 'saathi.v2.letterSeen';
export function LetterScreen() {
  const letter = useStore(s => s.letter);
  useEffect(() => { if (letter) local(LETTER_SEEN, letter.id); }, [letter]);
  return (
    <ScreenFrame title="A letter from Saathi" onBack={pop}>
      {letter ? (
        <div className="card" style={{ padding: 22, background: '#FFFDF6' }}>
          <p className="muted small">{dayOf(letter.createdAt)}</p>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 18, lineHeight: 1.6, marginTop: 10, display: 'grid', gap: 12 }}>
            {letter.body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </div>
      ) : <p className="muted" style={{ marginTop: 30, textAlign: 'center' }}>No letter yet. One arrives on Sundays, if you have letters switched on.</p>}
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- the router
export function PushedScreen({ p }: { p: Pushed }) {
  switch (p.id) {
    case 'garden': return <GardenScreen />;
    case 'create-rangoli': return <RangoliScreen />;
    case 'create-boat': return <BoatScreen />;
    case 'create-jar': return <JarScreen />;
    case 'game-pot': return <PotGame />;
    case 'game-thread': return <ThreadGame />;
    case 'game-stars': return <StarsGame />;
    case 'plan': return <PlanScreen />;
    case 'why': return <WhyScreen />;
    case 'letter': return <LetterScreen />;
    case 'convo': return p.arg ? <ConvoScreen id={p.arg} onBack={pop} /> : null;
    case 'about': return <AboutScreen onBack={pop} />;
    case 'language': return <LanguageScreen onBack={pop} />;
    default: return <Soon name={p.id} pushed />;
  }
}
