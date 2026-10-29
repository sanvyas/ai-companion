import { useEffect, useMemo, useRef, useState } from 'react';
import { go } from '../state/actions';
import { Ic } from './icons';
import { ScreenFrame } from './Chrome';
import { useGarden } from './garden';
import { keepsake } from './garden-actions';
import { CONS } from './island';
import { pop } from './ui';

// Three quiet games. Each is earned by something kind the person did (the server counts those), has no timer and no score, and what
// is earned never expires. Playing one spends the thing that earned it and adds something lasting to the garden.

const POT_BODY = 'M92 92Q70 130 78 190Q84 240 120 262Q150 272 180 262Q216 240 222 190Q230 130 208 92Z';
const CRACKS = ['M150 80L138 108L158 130L141 160', 'M104 122L128 142L117 172L141 192', 'M200 120L177 144L190 174L167 198', 'M92 192L119 207L112 236', 'M216 186L190 212L201 240', 'M150 198L163 224L148 250L158 264'];
const POT_COL = ['#C98B5B', '#B9737F', '#8CA3B8'];
const TCOL = ['#F29A2E', '#E4577E', '#4FB3A5', '#7A6BE0', '#6DB35A', '#F2C14E'];

function toSvgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? q.matrixTransform(m.inverse()) : q;
}

const Seeit = () => <button className="btn soft block" style={{ marginTop: 10 }} onClick={() => go('today')}><Ic n="leaf" />See it in my garden</button>;

// ---------------------------------------------------------------------------------------------- mend the pot
export function PotGame() {
  const g = useGarden(s => s.garden);
  const svgRef = useRef<SVGSVGElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const seams = g?.keepsakes.potSeams ?? 0;
  const pots = g?.keepsakes.pots ?? 0;
  const gold = g?.tokens.gold ?? 0;
  const whole = seams >= 6 && !fresh;
  const n = fresh ? 0 : seams;
  const can = gold > 0 && !whole;
  const col = POT_COL[(pots + (fresh ? 1 : 0)) % 3];

  const svgMarkup = useMemo(() => {
    let o = `<defs><clipPath id="pc"><path d="${POT_BODY}"/></clipPath><radialGradient id="pgl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9A0" stop-opacity=".8"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient></defs>`;
    o += `<ellipse cx="150" cy="276" rx="84" ry="10" fill="rgba(0,0,0,.14)"/><ellipse cx="150" cy="92" rx="64" ry="15" fill="${col}"/><ellipse cx="150" cy="92" rx="52" ry="10" fill="rgba(0,0,0,.28)"/><path d="${POT_BODY}" fill="${col}"/><path d="M96 110Q82 160 92 215" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".18" fill="none"/><path d="M206 110Q222 170 205 230" stroke="#000" stroke-width="14" stroke-linecap="round" opacity=".1" fill="none"/>`;
    o += '<g clip-path="url(#pc)" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    CRACKS.forEach((d, i) => {
      if (i < n) o += `<path d="${d}" stroke="#F7C948" stroke-width="6" style="filter:drop-shadow(0 0 5px #FFD36B)"/>`;
      else {
        o += `<path d="${d}" stroke="rgba(50,25,10,.6)" stroke-width="3.2"/>`;
        if (i === n && can) o += `<path id="kcur" data-cur="1" d="${d}" stroke="#FFF0B8" stroke-width="16" opacity=".5" class="kpulse"/><path data-fill="1" d="${d}" stroke="#F7C948" stroke-width="7" style="filter:drop-shadow(0 0 6px #FFD36B)"/>`;
      }
    });
    o += `</g>${whole ? '<circle cx="150" cy="170" r="110" fill="url(#pgl)"/>' : ''}`;
    return o;
  }, [n, can, col, whole]);

  useEffect(() => {
    const svg = svgRef.current;
    const cur = svg?.querySelector<SVGPathElement>('[data-cur]') ?? null, fill = svg?.querySelector<SVGPathElement>('[data-fill]') ?? null;
    if (!cur || !fill || !svg || !can) return;
    const L = cur.getTotalLength(), N = 40, pts: [number, number][] = [], vis: boolean[] = [];
    let cnt = 0, fin = false, down = false;
    for (let i = 0; i <= N; i++) { const p = cur.getPointAtLength((L * i) / N); pts.push([p.x, p.y]); vis.push(false); }
    fill.style.strokeDasharray = `${L} ${L}`; fill.style.strokeDashoffset = String(L);
    const mv = (e: PointerEvent) => {
      if (fin) return;
      const p = toSvgPoint(svg, e);
      for (let i = 0; i <= N; i++) if (!vis[i] && Math.hypot(pts[i][0] - p.x, pts[i][1] - p.y) < 28) { vis[i] = true; cnt++; }
      const fr = cnt / (N + 1);
      fill.style.strokeDashoffset = String(L * (1 - Math.min(1, fr / .75)));
      if (fr >= .75) { fin = true; fill.style.strokeDashoffset = '0'; setTimeout(() => void done(), 450); }
    };
    const dn = (e: PointerEvent) => { e.preventDefault(); down = true; svg.setPointerCapture(e.pointerId); mv(e); };
    const mm = (e: PointerEvent) => { if (down) mv(e); };
    const up = () => { down = false; };
    const done = async () => {
      setBusy(true);
      const after = await keepsake('seam');
      setBusy(false);
      if (after) { setFresh(false); setMsg(after.keepsakes.potSeams >= 6 ? 'Your pot is whole, and more beautiful for the cracks.' : 'A crack in your pot turned to gold.'); }
    };
    svg.addEventListener('pointerdown', dn); svg.addEventListener('pointermove', mm); svg.addEventListener('pointerup', up);
    return () => { svg.removeEventListener('pointerdown', dn); svg.removeEventListener('pointermove', mm); svg.removeEventListener('pointerup', up); };
  }, [can, n, gold, svgMarkup]);


  return (
    <ScreenFrame title="Mend the pot" onBack={pop}>
      <p className="muted" style={{ margin: '4px 0 8px' }}>{whole ? 'Your pot is whole, and more beautiful for the cracks.' : can ? 'Trace the glowing crack with your finger. The gold follows you. Take your time.' : 'No gold right now. It arrives on a hard day when you still show up, in any small way. It never expires.'}</p>
      <div className="row" style={{ gap: 8 }}><span className={'pill' + (gold ? ' leaf' : '')}>{gold} gold ready</span><span className="pill">{n} of 6 seams</span></div>
      <svg ref={svgRef} viewBox="0 0 300 300" role="img" aria-label={`A clay pot with ${n} of 6 cracks mended in gold`} style={{ width: '100%', maxWidth: 340, display: 'block', margin: '6px auto', touchAction: 'none' }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
      {msg && <div className="card" role="status" style={{ background: '#FFF6DF', boxShadow: 'none', textAlign: 'center', marginTop: 6 }}><b>{msg}</b></div>}
      <p className="fine" style={{ textAlign: 'center', marginTop: 10 }}>Hard days leave gold seams, not scars.</p>
      {whole && gold > 0 && <button className="btn block" style={{ marginTop: 12 }} onClick={() => { setFresh(true); setMsg(null); }}>Start a new pot</button>}
      {busy && <p className="fine" role="status" style={{ textAlign: 'center' }}>Saving…</p>}
      <Seeit />
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- untangle the thread
const tangledPt = (t: number): [number, number] => [160 + 92 * Math.sin(2.1 * t + .5) * Math.cos(.9 * t) + 34 * Math.sin(7 * t), 160 + 92 * Math.cos(1.7 * t) * Math.sin(1.1 * t + 1) + 34 * Math.cos(6 * t)];
function threadPath(k: number) {
  const N = 240, e = k * k * (3 - 2 * k);
  let o = '';
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = tangledPt(f * 9.4), sx = 34 + f * 252, sy = 160 + Math.sin(f * 12.5) * 9;
    o += `${i ? 'L' : 'M'}${(a[0] + (sx - a[0]) * e).toFixed(1)} ${(a[1] + (sy - a[1]) * e).toFixed(1)}`;
  }
  return o;
}

export function ThreadGame() {
  const g = useGarden(s => s.garden);
  const svgRef = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(0);
  const [done, setDone] = useState(false);
  const kRef = useRef(0);
  const doneRef = useRef(false);
  const flags = g?.keepsakes.flags ?? 0;
  const threads = g?.tokens.thread ?? 0;
  const can = threads > 0 && !done;
  const col = TCOL[(flags - (done ? 1 : 0) + 6) % 6];
  const finish = async () => { const after = await keepsake('flag'); if (!after) { doneRef.current = false; setDone(false); } };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !can) return;
    let last: { x: number; y: number } | null = null, down = false;
    const dn = (e: PointerEvent) => { e.preventDefault(); down = true; svg.setPointerCapture(e.pointerId); last = toSvgPoint(svg, e); };
    const mv = (e: PointerEvent) => {
      if (!down || doneRef.current || !last) return;
      const p = toSvgPoint(svg, e), d = Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
      kRef.current = Math.min(1, kRef.current + d / 1200);
      setK(kRef.current);
      if (kRef.current >= 1) { doneRef.current = true; setDone(true); setTimeout(() => void finish(), 350); }
    };
    const up = () => { down = false; };
    svg.addEventListener('pointerdown', dn); svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up);
    return () => { svg.removeEventListener('pointerdown', dn); svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); };
  }, [can]);

  const again = () => { kRef.current = 0; doneRef.current = false; setK(0); setDone(false); };
  const d = threadPath(can || done ? k : 1);
  return (
    <ScreenFrame title="Untangle the thread" onBack={pop}>
      <p className="muted" style={{ margin: '4px 0 8px' }}>{done ? 'There. It was only ever a thread.' : can ? 'Drag your finger over the thread. Slowly is fine. It loosens as you go.' : 'No thread right now. One arrives after each breathing session or meditation. It never expires.'}</p>
      <div className="row" style={{ gap: 8 }}><span className={'pill' + (threads ? ' leaf' : '')}>{threads} thread ready</span><span className="pill">{flags} flag{flags === 1 ? '' : 's'} hung</span></div>
      <div style={{ borderRadius: 28, background: 'linear-gradient(160deg,#EAF6FB,#D3ECF5)', margin: '12px 0', boxShadow: 'var(--sh1)' }}>
        <svg ref={svgRef} viewBox="0 0 320 320" role="img" aria-label="A tangled thread" style={{ width: '100%', display: 'block', touchAction: 'none' }}>
          <path d={d} fill="none" stroke="rgba(31,42,68,.12)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" transform="translate(3 5)" />
          <path d={d} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {done && <div className="card" role="status" style={{ background: '#E7F4EC', boxShadow: 'none', textAlign: 'center' }}><b>A new flag now hangs in your garden.</b></div>}
      {done && threads > 0 && <button className="btn block" style={{ marginTop: 10 }} onClick={again}>Untangle another</button>}
      <Seeit />
      <p className="fine" style={{ textAlign: 'center', marginTop: 10 }}>A knot loosens when you stop pulling.</p>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- constellations
export function StarsGame() {
  const g = useGarden(s => s.garden);
  const [sp, setSp] = useState(0);
  const [found, setFound] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const skies = g?.keepsakes.skies.length ?? 0;
  const tokens = g?.tokens.sky ?? 0;
  const idx = found ?? skies % CONS.length;
  const cn = CONS[idx];
  const can = tokens > 0 && found === null;
  const stars = useMemo(() => { let s = 77; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; return Array.from({ length: 40 }, () => ({ x: Math.round(r() * 320), y: Math.round(r() * 320), r: +(0.6 + r() * 1.2).toFixed(1), o: +(0.2 + r() * 0.5).toFixed(2), d: +(r() * 3).toFixed(1) })); }, []);

  const tap = async (n: number) => {
    if (!can) return;
    if (n !== sp) { setHint('Try the glowing one'); return; }
    setHint(null);
    if (sp + 1 >= cn.pts.length) {
      setSp(sp + 1);
      const after = await keepsake('sky');
      if (after) setFound(idx);
    } else setSp(sp + 1);
  };
  const upto = found !== null ? cn.pts.length : sp;
  const again = () => { setFound(null); setSp(0); setHint(null); };
  return (
    <ScreenFrame title="Constellations" onBack={pop}>
      <p className="muted" style={{ margin: '4px 0 8px' }}>{found !== null ? '' : can ? 'Tap the glowing star, then the next one. There are no wrong taps.' : 'No new sky right now. One opens after each sleep story. It never expires.'}</p>
      <div className="row" style={{ gap: 8 }}><span className={'pill' + (tokens ? ' leaf' : '')}>{tokens} sky ready</span><span className="pill">{skies} sk{skies === 1 ? 'y' : 'ies'} mapped</span></div>
      <div style={{ borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(180deg,#0E1536,#25376E)', margin: '12px 0', boxShadow: 'var(--sh2)' }}>
        <svg viewBox="0 0 320 320" role="group" aria-label="Stars" style={{ width: '100%', display: 'block' }}>
          <defs><radialGradient id="sg2"><stop offset="0" stopColor="#FFF6D0" /><stop offset="1" stopColor="#FFF6D0" stopOpacity="0" /></radialGradient></defs>
          {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} className="st" style={{ animationDelay: `-${s.d}s` }} />)}
          {(found !== null || (can && sp > 0)) && cn.pts.slice(1, upto).map((p, a) => <line key={a} x1={cn.pts[a][0]} y1={cn.pts[a][1]} x2={p[0]} y2={p[1]} stroke="#FFE9A0" strokeWidth="2.4" strokeLinecap="round" className="sline" opacity=".9" />)}
          {cn.closed && upto >= cn.pts.length && <line x1={cn.pts[cn.pts.length - 1][0]} y1={cn.pts[cn.pts.length - 1][1]} x2={cn.pts[0][0]} y2={cn.pts[0][1]} stroke="#FFE9A0" strokeWidth="2.4" strokeLinecap="round" className="sline" opacity=".9" />}
          {(can || found !== null) && cn.pts.map((p, n) => {
            const lit = found !== null || n < sp, nx = found === null && n === sp;
            return (
              <g key={n} style={{ cursor: 'pointer' }} role={nx ? 'button' : undefined} aria-label={nx ? 'The next star' : undefined} tabIndex={nx ? 0 : -1} onClick={() => void tap(n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void tap(n); } }}>
                <circle cx={p[0]} cy={p[1]} r="26" fill="transparent" />
                {(lit || nx) && <circle cx={p[0]} cy={p[1]} r={lit ? 18 : 22} fill="url(#sg2)" opacity={lit ? .9 : .6} className={nx ? 'kpulse' : undefined} />}
                <circle cx={p[0]} cy={p[1]} r={lit ? 5.5 : 4} fill={lit ? '#FFF6D0' : '#B9C4F0'} />
              </g>
            );
          })}
        </svg>
      </div>
      <div role="status" className="fine" style={{ minHeight: 18, textAlign: 'center' }}>{hint}</div>
      {found !== null && (
        <div className="card" style={{ background: '#EDE9FB', boxShadow: 'none', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: '#5A4FA8' }}>You found</div><div className="h2" style={{ margin: '2px 0' }}>{cn.n}</div><p className="small">{cn.l}</p>
          <p className="fine" style={{ marginTop: 6 }}>It now glows over your garden at night.</p>
        </div>
      )}
      {found !== null && tokens > 0 && <button className="btn block" style={{ marginTop: 10 }} onClick={again}>Open another sky</button>}
      <Seeit />
    </ScreenFrame>
  );
}
