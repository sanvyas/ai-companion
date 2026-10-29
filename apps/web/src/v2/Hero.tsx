import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGES } from '@saathi/domain';
import { useStore } from '../state/store';
import { Bird } from './Bird';
import { useGarden } from './garden';
import { useSkyPhase } from './hooks';
import { Ic, type IconName } from './icons';
import { AT, islandSVG, lightsSVG, PERCH, skySVG, SLOTS, weatherHTML } from './island';
import { moodByValue } from './Weather';
import { push, setV2, useV2, type PerchKey } from './ui';
import { go } from '../state/actions';
import { openPlant, pickPlantNow } from './garden-actions';

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

interface Pin { k: PerchKey; label: string; x: number; y: number; icon: IconName; color: string; earned: (c: Record<string, number>) => boolean; go: () => void }
const PINS: Pin[] = [
  { k: 'sleep', label: 'Sleep', x: 122, y: 80, icon: 'moon', color: '#C9CDF0', earned: c => (c.sleep ?? 0) > 0, go: () => go('calm', { calmTab: 'sleep' }) },
  { k: 'calm', label: 'Calm', x: 262, y: 78, icon: 'lotus', color: '#BFE3F0', earned: c => (c.breathe ?? 0) + (c.meditate ?? 0) > 0, go: () => go('calm', { calmTab: 'meditate' }) },
  { k: 'journal', label: 'Journal', x: 80, y: 206, icon: 'book', color: '#F8CDD6', earned: c => (c.journal ?? 0) > 0, go: () => go('journal') },
  { k: 'plan', label: 'Plan', x: 312, y: 204, icon: 'list', color: '#CBE7B5', earned: c => (c.plan ?? 0) > 0, go: () => push({ id: 'plan' }) },
  { k: 'talk', label: 'Talk', x: 196, y: 134, icon: 'mic', color: '#BFC8F3', earned: () => true, go: () => go('talk') },
  { k: 'out', label: 'Outside', x: 196, y: 262, icon: 'pin', color: '#F9DCC0', earned: () => true, go: () => go('outside') },
];

/** Which place today's suggested thing lives in, so its pin can say "Today's pick". */
export function pickPlace(oneId: string | null | undefined, bodyDone: boolean): PerchKey | null {
  if (!oneId || bodyDone) return null;
  return ({ voice: 'talk', breathe: 'calm', walk: 'out', meditate: 'calm', plan: 'plan', sleep: 'sleep', boat: 'calm', rangoli: 'out', jar: 'journal' } as Record<string, PerchKey>)[oneId] ?? null;
}

export function Hero({ pick, interactive = true }: { pick?: PerchKey | null; interactive?: boolean }) {
  const garden = useGarden(s => s.garden);
  const fresh = useGarden(s => s.fresh);
  const phase = useSkyPhase();
  const mood = useStore(s => s.mood);
  const hasPins = interactive;
  const birdAt = useV2(s => s.birdAt);
  const say = useV2(s => s.say);
  const [fly, setFly] = useState(false);
  const prev = useRef(birdAt);
  const [bubbleOut, setBubbleOut] = useState(false);
  const creation = useGarden(s => s.creation);

  const wx = moodByValue(mood)?.wx ?? 'sun';
  const grey = wx === 'rain' || wx === 'mist';
  const night = phase === 'night';
  const skyClass = night ? 'sky-night' : phase === 'golden' ? 'sky-golden' : grey ? 'sky-grey' : 'sky-day';

  const skyHTML = useMemo(() => skySVG(phase, grey, garden?.keepsakes.skies ?? []), [phase, grey, garden?.keepsakes.skies]);
  const islandHTML = useMemo(() => (garden ? islandSVG({ garden, night, fresh, creation }) : ''), [garden, night, fresh, creation]);
  const lightsHTML = useMemo(() => (night && garden ? lightsSVG(garden) : ''), [night, garden]);
  const wxHTML = useMemo(() => weatherHTML(), []);

  useEffect(() => {
    if (prev.current === birdAt) return;
    const [px] = PERCH[prev.current], [nx] = PERCH[birdAt];
    prev.current = birdAt;
    if (Math.abs(px - nx) < 4) return;
    setFly(true);
    const t = setTimeout(() => setFly(false), 1500);
    return () => clearTimeout(t);
  }, [birdAt]);

  useEffect(() => {
    if (!say) return;
    setBubbleOut(false);
    const a = setTimeout(() => setBubbleOut(true), 4200);
    const b = setTimeout(() => setV2(s => (s.say === say ? { say: null } : {})), 4600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [say]);

  const perch = PERCH[birdAt];
  const stage = garden?.stage ?? 0;
  const next = STAGES[stage + 1];
  const progress = garden && next ? Math.round(((garden.sunlight - STAGES[stage].at) / (next.at - STAGES[stage].at)) * 100) : 100;
  const R = 11, C = 2 * Math.PI * R;
  const counts = (garden?.counts ?? {}) as Record<string, number>;
  const freeSlots = garden ? Array.from({ length: garden.slots }, (_, i) => i).filter(i => !garden.plants.some(p => p.slot === i)) : [];

  return (
    <div className={`hero ${skyClass}`} role="group" aria-label="Your garden">
      <div className="skyart" dangerouslySetInnerHTML={{ __html: skyHTML }} />
      <div className="island" dangerouslySetInnerHTML={{ __html: islandHTML }} />
      <div className="lights" dangerouslySetInnerHTML={{ __html: lightsHTML }} />
      <div className={'hwx ' + (night ? '' : wx)} dangerouslySetInnerHTML={{ __html: wxHTML }} />
      <div className={'grade ' + (night ? 'night' : phase === 'golden' ? 'golden' : '')} />
      {hasPins && garden && (
        <div>
          {PINS.map(p => {
            const soon = !p.earned(counts), today = pick === p.k;
            return (
              <button key={p.k} className={'pin' + (soon ? ' soon' : '') + (today ? ' today' : '')} style={{ left: pct(p.x, 390), top: pct(p.y, 360) }} data-track={`pin.${p.k}`}
                aria-label={p.label + (soon ? ', not grown yet' : '') + (today ? ', suggested for you today' : '')} onClick={() => { setV2({ birdAt: p.k }); setTimeout(p.go, 380); }}>
                {today && <span className="tg">Today’s pick</span>}
                <span className="pl"><i style={{ background: p.color }}><Ic n={p.icon} color="#1F2A44" /></i>{p.label}</span>
              </button>
            );
          })}
          <button className="mini" style={{ left: pct(AT.tree[0], 390), top: pct(22, 360) }} aria-label="Your tree. See how your garden grows" onClick={() => push({ id: 'garden' })}><Ic n="leaf" color="#2F7A49" /></button>
          {freeSlots.map(i => (
            <button key={i} className="mini plus" style={{ left: pct(SLOTS[i][0], 390), top: pct(SLOTS[i][1] - 12, 360) }} aria-label="Plant something here" onClick={() => openPlant(i)}><Ic n="plus" color="#2F7A49" /></button>
          ))}
          {garden.plants.filter(p => p.ready).map(p => (
            <button key={p.id} className="mini ready" style={{ left: pct((SLOTS[p.slot] ?? SLOTS[0])[0], 390), top: pct((SLOTS[p.slot] ?? SLOTS[0])[1] - 34, 360) }} aria-label={`Pick your ${p.kind}`} onClick={() => void pickPlantNow(p.id)}><Ic n="star" color="#B26A00" /></button>
          ))}
          {garden.seeds.planted > 0 && <button className="mini" style={{ left: pct(40, 390), top: pct(118, 360) }} aria-label="Greenhouse" onClick={() => push({ id: 'garden' })}><Ic n="flower" color="#2F7A49" /></button>}
        </div>
      )}
      {interactive && (
        <button className="hchip" aria-label={`Day ${garden?.activeDays ?? 0}, ${STAGES[stage].name}. See how your garden grows`} onClick={() => push({ id: 'garden' })}>
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r={R} fill="none" stroke="#E5EDDD" strokeWidth="4" /><circle className="rg" cx="16" cy="16" r={R} fill="none" stroke="#3F8F5A" strokeWidth="4" strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - progress / 100)).toFixed(1)} /></svg>
          <span>Day {garden?.activeDays ?? 0} · {STAGES[stage].name}</span>
        </button>
      )}
      <div className={'bird' + (fly ? ' fly' : '') + (perch[0] < 190 ? ' left' : '') + (say ? ' talk' : '')} aria-hidden="true" style={{ left: pct(perch[0], 390), top: pct(perch[1], 360) }}><Bird size={44} /></div>
      <div className={'bubble' + (bubbleOut ? ' out' : '')} aria-live="polite">{say && <div>{say}</div>}</div>
      {interactive && garden && garden.activeDays === 0 && <div className="hhint">Tap any labelled spot to open it</div>}
    </div>
  );
}

