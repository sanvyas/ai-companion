import { useEffect } from 'react';
import { PLANT_KINDS, STAGES } from '@saathi/domain';
import { loadGarden, useGarden } from './garden';
import { openPlant, pickPlantNow } from './garden-actions';
import { Ic, type IconName } from './icons';
import { ScreenFrame } from './Chrome';
import { pop } from './ui';

const ISLE_COLORS: [string, string][] = [['#C6E98A', '#84C86C'], ['#FFD98A', '#F2A34A'], ['#BFE3F0', '#5FA8CF'], ['#8D93D8', '#3C4488'], ['#9FD0C8', '#4F8F86'], ['#FFC9D6', '#C98FE0']];

/** Everything the garden is made of, what each place means, and the long road ahead. Nothing here is a score and nothing can be lost. */
export function GardenScreen() {
  const g = useGarden(s => s.garden);
  useEffect(() => { void loadGarden({ quiet: true }); }, []);
  if (!g) return <ScreenFrame title="Your garden" onBack={pop}><p className="muted" role="status" style={{ marginTop: 20 }}>One moment…</p></ScreenFrame>;
  const C = g.counts;
  const st = g.stage, nx = STAGES[st + 1];
  const pct = nx ? Math.round(((g.sunlight - STAGES[st].at) / (nx.at - STAGES[st].at)) * 100) : 100;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const calm = (C.breathe ?? 0) + (C.meditate ?? 0);
  const rows: { name: string; icon: IconName; bg: string; text: string; value: string; on: boolean }[] = [
    { name: 'Your tree', icon: 'leaf', bg: '#DDF0DC', text: 'Grows taller on every day you show up, in any way.', value: `Day ${g.activeDays}`, on: g.activeDays > 0 },
    { name: 'Flower beds', icon: 'book', bg: '#F8CDD6', text: 'Every journal page plants a flower. Its colour is the weather you named.', value: plural(C.journal ?? 0, 'flower'), on: (C.journal ?? 0) > 0 },
    { name: 'Pond', icon: 'lotus', bg: '#BFE3F0', text: 'Breathing and meditation add lily pads and lotus flowers.', value: plural(calm, 'calm moment'), on: calm > 0 },
    { name: 'Saathi’s bench', icon: 'mic', bg: '#BFC8F3', text: 'Each talk hangs a lantern in your tree.', value: plural(C.talk ?? 0, 'talk'), on: (C.talk ?? 0) > 0 },
    { name: 'Herb patch', icon: 'list', bg: '#CBE7B5', text: 'Tiny daily steps grow tulsi, mint and tomatoes.', value: plural(C.plan ?? 0, 'step'), on: (C.plan ?? 0) > 0 },
    { name: 'Moon nook', icon: 'moon', bg: '#C9CDF0', text: 'Sleep stories bring fireflies and a moon lantern.', value: plural(C.sleep ?? 0, 'night'), on: (C.sleep ?? 0) > 0 },
    { name: 'Path and gate', icon: 'pin', bg: '#F9DCC0', text: 'Every walk or outing lays a stone. The path always goes on.', value: plural((C.walk ?? 0) + (C.event ?? 0), 'stone'), on: (C.walk ?? 0) + (C.event ?? 0) > 0 },
    { name: 'Greenhouse', icon: 'flower', bg: '#D3EBEF', text: 'On a heavy day, any small act plants a seed. It sprouts once the day is over.', value: plural(g.seeds.planted, 'seed'), on: g.seeds.planted > 0 },
  ];
  return (
    <ScreenFrame title="Your garden" onBack={pop}>
      <div className="card" style={{ background: 'linear-gradient(135deg,#DDF0DC,#F5F9D8)', color: '#14352A', marginTop: 6 }}>
        <div className="sec-h" style={{ marginBottom: 8 }}><div className="h2">{g.stageName}</div><span className="pill" style={{ background: 'rgba(255,255,255,.7)' }}>{g.sunlight} sunlight</span></div>
        <div className="bar" role="progressbar" aria-label="Progress to the next stage" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ background: 'rgba(255,255,255,.6)' }}><i style={{ width: `${pct}%` }} /></div>
        <p className="small" style={{ marginTop: 8 }}>{nx ? `${(g.nextAt ?? nx.at) - g.sunlight} more sunlight to become a ${nx.name.toLowerCase()}.` : 'Your garden is a grove.'} Every day you show up gives about {g.road.perActiveDay} sunlight.</p>
      </div>
      <div className="card row" style={{ background: 'var(--bg2)', boxShadow: 'none', marginTop: 12, gap: 12 }}>
        <Ic n="leaf" color="#2F7A49" /><p className="small">Nothing here ever wilts. A day you skip is just a quiet day, and your plants wait for you.</p>
      </div>

      <div className="sec-h" style={{ marginTop: 22 }}><h2 className="h2">Your road, month by month</h2></div>
      <p className="muted small" style={{ margin: '-6px 0 10px' }}>Six isles to reach over about six months at a steady pace. There is no deadline.</p>
      <ul className="list card" style={{ padding: '4px 16px' }}>
        {g.road.isles.map((x, i) => {
          const done = i < g.road.current, now = i === g.road.current;
          const [a, b] = ISLE_COLORS[i] ?? ISLE_COLORS[0];
          return (
            <li key={x.name}>
              <span className="ico" style={{ background: `linear-gradient(160deg,${a},${b})`, width: 46, height: 46, borderRadius: '50%', color: '#fff' }}><Ic n={done ? 'check' : now ? 'leaf' : 'lock'} color="#fff" /></span>
              <div className="grow1"><b>{x.name}</b><div className="muted small">{x.theme}</div></div>
              <span className={'pill' + (now ? ' leaf' : '')}>{done ? 'Visited' : now ? 'You are here' : `in ~${x.days} days`}</span>
            </li>
          );
        })}
      </ul>
      <p className="fine" style={{ marginTop: 6 }}>For now, the Home isle is the one you can tend. The others open as you reach them.</p>

      <div className="sec-h" style={{ marginTop: 22 }}><h2 className="h2">What you are growing</h2><button className="link" onClick={() => openPlant('auto')}>Plant</button></div>
      {g.plants.length ? (
        <ul className="list card" style={{ padding: '4px 16px' }}>
          {g.plants.map(p => {
            const d = PLANT_KINDS.find(k => k.id === p.kind)!;
            return (
              <li key={p.id}>
                <span className="ico" style={{ background: d.kind === 'tree' ? '#DDF0DC' : '#FFF1D2' }}><Ic n={d.kind === 'tree' ? 'leaf' : 'flower'} color={d.kind === 'tree' ? '#2F7A49' : '#B26A00'} /></span>
                <div className="grow1"><b>{d.name}</b><div className="bar" style={{ marginTop: 6, height: 7 }}><i style={{ width: `${Math.round(p.growth * 100)}%` }} /></div></div>
                {p.ready ? <button className="btn sm" onClick={() => void pickPlantNow(p.id)}>Pick</button> : <span className="pill">{p.daysLeft} day{p.daysLeft === 1 ? '' : 's'}</span>}
              </li>
            );
          })}
        </ul>
      ) : <div className="card"><p className="small muted">Nothing planted yet. Tap a “+” on the island to choose your first plant.</p></div>}

      <div className="sec-h" style={{ marginTop: 22 }}><h2 className="h2">How each place grows</h2></div>
      <ul className="list card" style={{ padding: '4px 16px' }}>
        {rows.map(r => (
          <li key={r.name} style={{ alignItems: 'flex-start' }}>
            <span className="ico" style={{ background: r.bg }}><Ic n={r.icon} /></span>
            <div className="grow1"><b>{r.name}</b><div className="muted small">{r.text}</div></div>
            <span className={'pill' + (r.on ? ' leaf' : '')}>{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="fine" style={{ margin: '10px 0 0' }}>{g.jarCount} good thing{g.jarCount === 1 ? '' : 's'} in your jar · {g.boats} paper boat{g.boats === 1 ? '' : 's'} let go · {g.rangolis} rangoli{g.rangolis === 1 ? '' : 's'} drawn.</p>
    </ScreenFrame>
  );
}
