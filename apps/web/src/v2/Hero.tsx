import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STAGES } from '@saathi/domain';
import { useStore } from '../state/store';
import { Bird } from './Bird';
import { useGarden } from './garden';
import { useSkyPhase } from './hooks';
import { Ic } from './icons';
import { islandSVG, lightsSVG, PERCH, sc, skySVG, SLOTS, SPOTS, VB, weatherHTML, type SpotKey } from './island';
import { moodByValue } from './Weather';
import { openSheet, push, setV2, useV2, type PerchKey } from './ui';
import { go } from '../state/actions';
import { openPlant, pickPlantNow } from './garden-actions';
import type { Garden } from '../api';

const pctX = (v: number) => `${((v / VB.w) * 100).toFixed(2)}%`;
const pctY = (v: number) => `${(((v - VB.y0) / VB.h) * 100).toFixed(2)}%`;

/** Which place today's suggested thing lives in, so its spot can quietly say "this one". */
export function pickPlace(oneId: string | null | undefined, bodyDone: boolean): PerchKey | null {
  if (!oneId || bodyDone) return null;
  return ({ voice: 'talk', breathe: 'calm', walk: 'out', meditate: 'calm', plan: 'plan', sleep: 'sleep', boat: 'calm', rangoli: 'out', jar: 'journal' } as Record<string, PerchKey>)[oneId] ?? null;
}

const MOTES = Array.from({ length: 16 }, (_, i) => <span key={i} style={{ left: `${(i * 37 + 9) % 96}%`, animationDelay: `-${((i * 53) % 140) / 10}s`, animationDuration: `${11 + (i % 5) * 2}s` }} />);
const TREE_WORD = ['a seedling', 'a sapling', 'growing well', 'tall now', 'in full leaf'];
const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Say { title: string; sub: string; cta: string; run: () => void }
/** What each part of the garden is, in the garden's own words, and what to do there. */
function describe(k: SpotKey, g: Garden, checked: boolean): Say {
  const c = g.counts as Record<string, number>;
  switch (k) {
    case 'tree': return { title: 'Your tree', sub: `It is ${TREE_WORD[Math.min(4, g.treeLevel)]}. It drinks a little each time you check in.`, cta: checked ? 'See your garden' : 'Check in', run: () => (checked ? push({ id: 'garden' }) : openSheet({ id: 'checkin' })) };
    case 'journal': return { title: 'Journal flowers', sub: (c.journal ?? 0) > 0 ? `${s(c.journal ?? 0, 'flower', 'flowers')}, one for every page you have written.` : 'A flower grows here for every page you write.', cta: 'Open journal', run: () => go('journal') };
    case 'calm': { const n = (c.breathe ?? 0) + (c.meditate ?? 0); return { title: 'Quiet pond', sub: n > 0 ? `${s(n, 'slow moment', 'slow moments')} so far. A lotus opens every third.` : 'It fills after your first breathing or meditation.', cta: 'Breathe', run: () => go('calm', { calmTab: 'meditate' }) }; }
    case 'plan': return { title: 'Herb patch', sub: (c.plan ?? 0) > 0 ? `${s(c.plan ?? 0, 'small step', 'small steps')} done. They stay, always.` : 'It grows with the steps you tick off in your gentle plan.', cta: 'Open plan', run: () => push({ id: 'plan' }) };
    case 'sleep': return { title: 'Sleep corner', sub: (c.sleep ?? 0) > 0 ? `${s(c.sleep ?? 0, 'night', 'nights')} of rest. The lantern stays lit.` : 'A lantern is lit here after your first sleep story.', cta: 'Sleep stories', run: () => go('calm', { calmTab: 'sleep' }) };
    case 'talk': return { title: 'The bench', sub: 'Sit for a while. Say it out loud, or type it. No hurry.', cta: 'Talk', run: () => go('talk') };
    case 'out': { const n = (c.walk ?? 0) + (c.event ?? 0); return { title: 'The garden gate', sub: n > 0 ? `${s(n, 'step', 'steps')} outside, each one a stone on the path.` : 'A stone is laid on the path for every walk or outing.', cta: 'Go outside', run: () => go('outside') }; }
    case 'house': return { title: 'The greenhouse', sub: g.seeds.planted > 0 ? `${s(g.seeds.planted, 'seed', 'seeds')} planted, ${g.seeds.sprouted} sprouted.` : 'Your first seed will grow here.', cta: 'See your garden', run: () => push({ id: 'garden' }) };
  }
}

/** The garden: a layered scene you can look at, touch and be greeted by. `children` sit on the sky (the date and greeting). */
export function Hero({ pick, interactive = true, children }: { pick?: PerchKey | null; interactive?: boolean; children?: ReactNode }) {
  const garden = useGarden(s => s.garden);
  const fresh = useGarden(s => s.fresh);
  const creation = useGarden(s => s.creation);
  const phase = useSkyPhase();
  const mood = useStore(s => s.mood);
  const birdAt = useV2(s => s.birdAt);
  const say = useV2(s => s.say);
  const [fly, setFly] = useState(false);
  const [bubbleOut, setBubbleOut] = useState(false);
  const [open, setOpen] = useState<SpotKey | null>(null);
  const [hop, setHop] = useState<{ x: number; y: number; n: number } | null>(null);
  const [bits, setBits] = useState<{ id: number; x: number; y: number }[]>([]);
  const prev = useRef<string>(birdAt);
  const box = useRef<HTMLDivElement>(null);

  const wx = moodByValue(mood)?.wx ?? 'sun';
  const grey = wx === 'rain' || wx === 'mist';
  const night = phase === 'night';
  const skyClass = night ? 'sky-night' : phase === 'golden' ? 'sky-golden' : grey ? 'sky-grey' : 'sky-day';
  const checked = !!(garden?.today?.checkin || mood !== null);

  const skyHTML = useMemo(() => skySVG(phase, grey, garden?.keepsakes.skies ?? []), [phase, grey, garden?.keepsakes.skies]);
  const sceneHTML = useMemo(() => (garden ? islandSVG({ garden, night, fresh, creation }) : ''), [garden, night, fresh, creation]);
  const lightsHTML = useMemo(() => (night && garden ? lightsSVG(garden) : ''), [night, garden]);
  const wxHTML = useMemo(() => weatherHTML(), []);

  // The bird flies when it changes place.
  const where = hop ? `${hop.x},${hop.y}` : birdAt;
  useEffect(() => {
    if (prev.current === where) return;
    prev.current = where;
    setFly(true);
    const t = setTimeout(() => setFly(false), 1500);
    return () => clearTimeout(t);
  }, [where]);

  useEffect(() => {
    if (!say) return;
    setBubbleOut(false);
    const a = setTimeout(() => setBubbleOut(true), 4200);
    const b = setTimeout(() => setV2(st => (st.say === say ? { say: null } : {})), 4600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [say]);

  // A caption closes by itself, and on Escape.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(null), 9000);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [open]);

  // Touching the ground: a few petals lift, and the bird hops over. Nothing is asked of anyone.
  const touchGround = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="dialog"]')) return;
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * VB.w, y = VB.y0 + ((e.clientY - r.top) / r.height) * VB.h;
    setOpen(null);
    if (y < 262) return;
    const id = Date.now();
    setBits(b => [...b.slice(-3), { id, x, y }]);
    setTimeout(() => setBits(b => b.filter(q => q.id !== id)), 1300);
    setHop({ x: Math.min(360, Math.max(30, x)), y: Math.min(420, Math.max(272, y)), n: id });
    setTimeout(() => setHop(h => (h && h.n === id ? null : h)), 5200);
  };

  const stage = garden?.stage ?? 0;
  const next = STAGES[stage + 1];
  const progress = garden && next ? Math.round(((garden.sunlight - STAGES[stage].at) / (next.at - STAGES[stage].at)) * 100) : 100;
  const R = 11, C = 2 * Math.PI * R;
  const freeSlots = garden ? Array.from({ length: garden.slots }, (_, i) => i).filter(i => !garden.plants.some(p => p.slot === i)).slice(0, 3) : [];

  const perch = hop ? [hop.x, hop.y] as const : PERCH[birdAt];
  const bw = (58 * sc(perch[1])) / VB.w * 100;
  const sp = open && garden ? describe(open, garden, checked) : null;
  // The caption sits where it hides nothing: low places speak from the sky, high ones from the foot of the picture.
  const high = open ? SPOTS[open].y < 300 : false;

  return (
    <div ref={box} className={`hero ${skyClass}`} role="group" aria-label="Your garden" onPointerDown={interactive ? touchGround : undefined}>
      <div className="skyart" dangerouslySetInnerHTML={{ __html: skyHTML }} />
      <div className="rays" aria-hidden="true" />
      <div className="scene" dangerouslySetInnerHTML={{ __html: sceneHTML }} />
      <div className="lights" dangerouslySetInnerHTML={{ __html: lightsHTML }} />
      <div className="fog" aria-hidden="true"><i /><i /></div>
      <div className="mt" aria-hidden="true">{MOTES}</div>
      <div className={'hwx ' + (night ? '' : wx)} dangerouslySetInnerHTML={{ __html: wxHTML }} />
      <div className={'grade ' + (night ? 'night' : phase === 'golden' ? 'golden' : '')} />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {interactive && garden && (
        <div className="spots">
          {(Object.keys(SPOTS) as SpotKey[]).map(k => {
            const p = SPOTS[k], today = pick === k || (pick === 'home' && false);
            const d = describe(k, garden, checked);
            return (
              <button key={k} className={'spot' + (open === k ? ' on' : '') + (today ? ' today' : '')} data-track={`spot.${k}`} style={{ left: pctX(p.x), top: pctY(p.y), width: pctX(p.w), height: pctY(p.h) }}
                aria-label={`${d.title}. ${d.sub}`} aria-expanded={open === k}
                onClick={() => { setOpen(o => (o === k ? null : k)); setHop(null); setV2({ birdAt: k }); }}>
                {today && <i className="beacon" aria-hidden="true" />}
              </button>
            );
          })}
          {freeSlots.map(i => (
            <button key={i} className="plot" style={{ left: pctX(SLOTS[i][0]), top: pctY(SLOTS[i][1] - 2) }} aria-label="Plant something here" onClick={() => openPlant(i)} />
          ))}
          {garden.plants.filter(p => p.ready).map(p => (
            <button key={p.id} className="plot ready" style={{ left: pctX((SLOTS[p.slot] ?? SLOTS[0])[0]), top: pctY((SLOTS[p.slot] ?? SLOTS[0])[1] - 40) }} aria-label={`Pick your ${p.kind}`} onClick={() => void pickPlantNow(p.id)}><Ic n="star" /></button>
          ))}
        </div>
      )}

      {bits.map(b => (
        <div key={b.id} className="touch" aria-hidden="true" style={{ left: pctX(b.x), top: pctY(b.y) }}>
          <i /><i /><i /><i /><i />
        </div>
      ))}

      {sp && open && (
        <div className={'say-card' + (high ? ' low' : ' up')} role="dialog" aria-label={sp.title}>
          <b>{sp.title}</b>
          <span>{sp.sub}</span>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={() => { const r = sp.run; setOpen(null); r(); }}>{sp.cta}</button>
            <button className="btn sm ghost" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}

      <div className="onsky">
        {children}
        <button className="hchip" aria-label={`Day ${garden?.activeDays ?? 0}, ${STAGES[stage].name}. See how your garden grows`} onClick={() => push({ id: 'garden' })}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r={R} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="4" /><circle className="rg" cx="16" cy="16" r={R} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - progress / 100)).toFixed(1)} /></svg>
        <span>Day {garden?.activeDays ?? 0} · {STAGES[stage].name}</span>
        </button>

      </div>

      <div className={'bird' + (fly ? ' fly' : '') + (perch[0] < 190 ? ' left' : '') + (say ? ' talk' : '')} aria-hidden="true" style={{ left: pctX(perch[0]), top: pctY(perch[1]), width: `${bw.toFixed(2)}%` }}><Bird size={80} /></div>
      <div className={'bubble' + (bubbleOut ? ' out' : '')} aria-live="polite">{say && <div>{say}</div>}</div>
      {interactive && garden && garden.activeDays === 0 && <div className="hhint">Touch the garden. It is yours.</div>}
    </div>
  );
}
