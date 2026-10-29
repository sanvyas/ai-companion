import { useEffect, useMemo } from 'react';
import { cameUp, rankByThemes, weekThemes } from '@saathi/domain';
import { CALM_ITEMS, STORY_THEMES, type CalmItem } from '../data/calm';
import { openBreathe, playStory, loadJournal, loadTalk } from '../state/actions';
import { set, useStore } from '../state/store';
import { playCalmById } from './calm-actions';
import { HelpPill } from './Chrome';
import { useGarden } from './garden';
import { useSaid } from './guidance';
import { Ic, type IconName } from './icons';
import { CALM_TAGS } from './tags';
import { push, type PushedId } from './ui';

const COVER = [
  '<circle cx="150" cy="30" r="48" fill="#fff" opacity=".4"/><circle cx="20" cy="140" r="60" fill="#fff" opacity=".28"/>',
  '<path d="M0 120C40 90 80 110 120 90S180 80 200 100V200H0Z" fill="#fff" opacity=".35"/><circle cx="140" cy="40" r="26" fill="#fff" opacity=".5"/>',
  '<ellipse cx="60" cy="40" rx="50" ry="16" fill="#fff" opacity=".45"/><ellipse cx="140" cy="70" rx="44" ry="13" fill="#fff" opacity=".35"/>',
];

function Cover({ it, k, forYou, why }: { it: CalmItem; k: number; forYou: boolean; why?: string }) {
  return (
    <button className="cover" data-track={`calm.${it.id}`} onClick={() => playCalmById(it.id)} aria-label={`${it.title}, ${it.mins} minutes${forYou ? ', picked for you' : ''}`}>
      <svg className="bg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<rect width="200" height="200" fill="${it.tint}"/>${COVER[k % 3]}` }} />
      {forYou && <span className="tag">For you</span>}
      <span className="pl"><Ic n="play" color="#1F2A44" /></span>
      <b className="h3">{it.title}</b>
      <span className="small" style={{ opacity: .75 }}>{it.mins} min · {it.desc}</span>
      {why && <span className="fine" style={{ color: 'var(--ink2)', marginTop: 4 }}>{why}</span>}
    </button>
  );
}

const GAMES: { id: PushedId; name: string; icon: IconName; color: string; token: 'gold' | 'thread' | 'sky'; unlock: 'pot' | 'thread' | 'sky'; rule: string }[] = [
  { id: 'game-pot', name: 'Mend the pot', icon: 'star', color: '#FBE2CE', token: 'gold', unlock: 'pot', rule: 'Unlocks on a hard day when you still show up, in any small way.' },
  { id: 'game-thread', name: 'Untangle the thread', icon: 'wave', color: 'var(--t-sky)', token: 'thread', unlock: 'thread', rule: 'Unlocks after a breathing session or a meditation.' },
  { id: 'game-stars', name: 'Constellations', icon: 'moon', color: '#DAD7F0', token: 'sky', unlock: 'sky', rule: 'Unlocks after a sleep story.' },
];

export function Calm() {
  const calmTab = useStore(s => s.calmTab);
  const busy = useStore(s => s.storyBusy);
  const garden = useGarden(s => s.garden);
  const { said } = useSaid();
  useEffect(() => { void loadJournal(); void loadTalk(); }, []);

  // Coming from "Sleep" or "Meditate" elsewhere in the app lands on that section.
  useEffect(() => {
    const id = calmTab === 'sleep' ? 'v2sleep' : calmTab === 'meditate' ? 'v2med' : null;
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => clearTimeout(t);
  }, [calmTab]);

  const wk = useMemo(() => weekThemes(said, new Date(), 7), [said]);
  const label = (k: Parameters<typeof cameUp>[0], n: number) => `For ${cameUp(k, n).toLowerCase()}`;
  const med = CALM_ITEMS.filter(c => c.kind === 'med' && c.lines);
  const sleep = CALM_ITEMS.filter(c => c.kind === 'sleep' && c.lines);
  const rank = (items: CalmItem[]) => rankByThemes(items.map(c => ({ id: c.id, tags: CALM_TAGS[c.id] ?? [], c })), wk, label);
  const rm = rank(med), rs = rank(sleep);
  const top = [rs[0], rm[0]].find(x => x?.why);
  const games = GAMES;
  const createCount = garden ? garden.jarCount + garden.boats + garden.rangolis : 0;

  return (
    <>
      <div className="hhead"><div><div className="eyebrow">Calm</div><h1 className="h1" style={{ marginTop: 4 }}>A moment<br />to breathe</h1></div><HelpPill /></div>
      <div className="stg">
        <div className="card" style={{ background: 'linear-gradient(150deg,#1F2A5C,#3C5FA0)', color: '#fff', padding: 20 }}>
          <div className="row" style={{ gap: 14 }}>
            <div aria-hidden="true" style={{ width: 62, height: 62, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#EAF8FF,#8CC6E3 60%,#5A9CC4)', boxShadow: '0 0 30px rgba(120,190,230,.7)', flex: 'none' }} />
            <div className="grow1"><div className="h2">Breathe</div><div style={{ opacity: .8, fontSize: 14 }}>Three slow breaths. Good when your mind is racing.</div></div>
          </div>
          <button className="btn block" style={{ marginTop: 16 }} onClick={openBreathe}><Ic n="play" />Start breathing</button>
        </div>
        {top && (
          <div className="card row" style={{ marginTop: 12, gap: 12, background: 'var(--t-lilac)' }}>
            <span className="ico" style={{ background: 'rgba(255,255,255,.7)' }}><Ic n={top.item.c.kind === 'sleep' ? 'moon' : 'lotus'} /></span>
            <div className="grow1"><div className="eyebrow" style={{ color: 'var(--brand-text)' }}>Picked for you</div><b>{top.item.c.title}</b><div className="small" style={{ opacity: .8 }}>{top.why}</div></div>
            <button className="btn sm" onClick={() => playCalmById(top.item.c.id)}><Ic n="play" />Play</button>
          </div>
        )}
      </div>

      <div className="sec" id="v2med">
        <div className="sec-h"><h2 className="h2">Meditate</h2></div>
        <div className="hscroll">{rm.map((r, i) => <Cover key={r.item.id} it={r.item.c} k={i} forYou={!!r.why && i < 2} why={i === 0 ? r.why : undefined} />)}</div>
      </div>

      <div className="sec" id="v2sleep">
        <div className="sec-h"><h2 className="h2">Sleep stories</h2></div>
        <div className="hscroll">{rs.map((r, i) => <Cover key={r.item.id} it={r.item.c} k={i + 1} forYou={!!r.why && i < 2} why={i === 0 ? r.why : undefined} />)}</div>
        <section aria-label="A story made for tonight" className="card" style={{ marginTop: 12 }}>
          <b>A story made for tonight</b>
          <p className="muted small" style={{ margin: '4px 0 10px' }}>Pick a place and Saathi will write a new, quiet story, just for you.</p>
          <div className="chips" role="group" aria-label="Story place">{STORY_THEMES.map(t => <button key={t.id} className="chip" disabled={busy} onClick={() => void playStory(t.id)}>{t.label}</button>)}</div>
          <div role="status" aria-live="polite" className="fine" style={{ minHeight: 18, marginTop: 6 }}>{busy ? 'Writing your story…' : ''}</div>
        </section>
      </div>

      <div className="sec" id="v2create">
        <div className="sec-h"><h2 className="h2">Create</h2><span className="fine">No skill needed</span></div>
        <div className="tiles">
          <button className="tile" style={{ background: 'var(--t-rose)' }} onClick={() => push({ id: 'create-rangoli' })}><Ic n="flower" /><div><b>Draw a rangoli</b><span>Colour and pattern</span></div></button>
          <button className="tile" style={{ background: 'var(--t-sky)' }} onClick={() => push({ id: 'create-boat' })}><Ic n="leaf" /><div><b>Paper boat</b><span>Let a worry float away</span></div></button>
          <button className="tile" style={{ background: 'var(--t-sand)', gridColumn: 'span 2' }} onClick={() => push({ id: 'create-jar' })}><Ic n="star" /><div><b>Good-things jar</b><span>{garden?.jarCount ? `${garden.jarCount} saved for hard days` : 'Save one good thing from today'}</span></div></button>
        </div>
        {createCount > 0 && <p className="fine" style={{ marginTop: 8 }}>You have made {createCount} thing{createCount === 1 ? '' : 's'} so far. They live in your garden.</p>}
      </div>

      <div className="sec" id="v2games">
        <div className="sec-h"><h2 className="h2">Quiet games</h2></div>
        <p className="muted small" style={{ margin: '-6px 0 12px' }}>Earned by looking after yourself. No timers, no scores, nothing to lose.</p>
        <div className="stg">
          {games.map(g => {
            const un = !!garden?.unlocked[g.unlock], n = garden?.tokens[g.token] ?? 0;
            const prog = g.id === 'game-pot' ? `Mended ${garden?.keepsakes.potSeams ?? 0} of 6 seams` : g.id === 'game-thread' ? `${garden?.keepsakes.flags ?? 0} flag${garden?.keepsakes.flags === 1 ? '' : 's'} hung` : `${garden?.keepsakes.skies.length ?? 0} of 6 skies`;
            return (
              <button key={g.id} className="mode" style={un ? undefined : { opacity: .66 }} onClick={() => { if (un) push({ id: g.id }); else set({ toast: g.rule }); }} aria-label={`${g.name}. ${un ? prog : g.rule}`}>
                <span className="ico" style={{ background: g.color }}><Ic n={un ? g.icon : 'lock'} /></span>
                <span className="grow1"><b style={{ display: 'block' }}>{g.name}</b><span className="muted small">{un ? prog : g.rule}</span></span>
                {un && n > 0 ? <span className="tag">{n} ready</span> : <Ic n="chev" />}
              </button>
            );
          })}
        </div>
      </div>
      <p className="foot">Nothing here is timed. Come back whenever you like.</p>
    </>
  );
}
