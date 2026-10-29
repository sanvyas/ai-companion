import { useEffect, useRef, useState } from 'react';
import { api, type Creation, type JarItem } from '../api';
import { errMsg, go, toast } from '../state/actions';
import { Ic } from './icons';
import { ScreenFrame } from './Chrome';
import { loadGarden, takeGarden } from './garden';
import { keepsake } from './garden-actions';
import { pop } from './ui';

// Small things to make that need no skill. What is made is only ever what the person chose to keep: a rangoli picture, a good thing for the
// jar. A paper boat keeps nothing at all; only the fact that one was let go.

// ---------------------------------------------------------------------------------------------- rangoli
const COLORS = ['#FFB11F', '#FF6B8B', '#7BD7C9', '#FFFFFF', '#9C8CFF', '#8FD36B'];
const COLOR_NAME: Record<string, string> = { '#FFB11F': 'Marigold', '#FF6B8B': 'Rose', '#7BD7C9': 'Mint', '#FFFFFF': 'White', '#9C8CFF': 'Violet', '#8FD36B': 'Leaf green' };
interface Stroke { c: string; pts: [number, number][] }

export function RangoliScreen() {
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const color = useRef(COLORS[0]);
  const [col, setCol] = useState(COLORS[0]);
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Creation[]>([]);
  const redraw = useRef<() => void>(() => undefined);

  useEffect(() => { api.creations().then(setMine).catch(() => undefined); }, []);
  useEffect(() => {
    const el = cv.current; const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const W = el.width;
    let cur: Stroke | null = null;
    const seg = (a: [number, number], b: [number, number], c: string) => {
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < 8; k++) for (let m = 0; m < 2; m++) {
        ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate((k * Math.PI) / 4); if (m) ctx.scale(1, -1);
        ctx.beginPath(); ctx.moveTo(a[0] - W / 2, a[1] - W / 2); ctx.lineTo(b[0] - W / 2, b[1] - W / 2); ctx.stroke(); ctx.restore();
      }
    };
    const all = () => {
      ctx.clearRect(0, 0, W, W);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      [80, 170, 260, 340].forEach(r => { ctx.beginPath(); ctx.arc(W / 2, W / 2, r, 0, 7); ctx.stroke(); });
      ctx.restore();
      strokes.current.forEach(s => { if (s.pts.length === 1) seg(s.pts[0], [s.pts[0][0] + .1, s.pts[0][1]], s.c); for (let i = 1; i < s.pts.length; i++) seg(s.pts[i - 1], s.pts[i], s.c); });
      ctx.shadowBlur = 0;
    };
    redraw.current = () => { all(); setN(strokes.current.length); };
    all();
    const pos = (e: PointerEvent): [number, number] => { const r = el.getBoundingClientRect(); return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * W) / r.height]; };
    const dn = (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture(e.pointerId); cur = { c: color.current, pts: [pos(e)] }; strokes.current.push(cur); setN(strokes.current.length); seg(cur.pts[0], [cur.pts[0][0] + .1, cur.pts[0][1]], cur.c); };
    const mv = (e: PointerEvent) => { if (!cur) return; const p = pos(e); seg(cur.pts[cur.pts.length - 1], p, cur.c); cur.pts.push(p); };
    const up = () => { cur = null; };
    el.addEventListener('pointerdown', dn); el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', dn); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, []);

  const save = async () => {
    const el = cv.current;
    if (!el || !strokes.current.length) return;
    setBusy(true);
    try {
      const o = document.createElement('canvas'); o.width = o.height = 200;
      const x = o.getContext('2d');
      if (!x) throw new Error('canvas');
      x.fillStyle = '#1B2556'; x.fillRect(0, 0, 200, 200); x.drawImage(el, 0, 0, 200, 200);
      const g = await api.addCreation(o.toDataURL('image/jpeg', .8));
      takeGarden(g, { celebrate: true });
      toast('Your rangoli now decorates the garden gate.');
      go('today');
    } catch (e) { toast(errMsg(e, 'I couldn’t save that. Please try again.')); setBusy(false); }
  };

  return (
    <ScreenFrame title="Draw a rangoli" onBack={pop}>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Draw anywhere. Your pattern repeats around the centre, so it always looks lovely.</p>
      <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', background: 'radial-gradient(circle at 50% 45%,#2B3A7A,#161E4A)', boxShadow: 'var(--sh2)', aspectRatio: '1' }}>
        <canvas ref={cv} width={720} height={720} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} aria-label="Rangoli drawing area" />
        {n === 0 && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#C9D3F5', fontWeight: 700, textAlign: 'center', padding: 30 }}>Touch and drag to draw</div>}
      </div>
      <div className="row" role="radiogroup" aria-label="Colour" style={{ justifyContent: 'center', gap: 12, margin: '16px 0' }}>
        {COLORS.map(c => (
          <button key={c} role="radio" aria-checked={col === c} aria-label={COLOR_NAME[c]} onClick={() => { color.current = c; setCol(c); }} style={{ width: 40, height: 40, borderRadius: '50%', background: c, boxShadow: col === c ? `0 0 0 4px var(--bg),0 0 0 7px ${c}` : '0 0 0 1px var(--line)' }} />
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn soft sm" onClick={() => { strokes.current.pop(); redraw.current(); }} disabled={n === 0}>Undo</button>
        <button className="btn soft sm" onClick={() => { strokes.current = []; redraw.current(); }} disabled={n === 0}>Clear</button>
        <button className="btn grow1" onClick={() => void save()} disabled={n === 0 || busy}><Ic n="check" />{busy ? 'Saving…' : 'Add to my garden'}</button>
      </div>
      {mine.length > 0 && (
        <>
          <div className="sec-h" style={{ marginTop: 22 }}><h2 className="h3">Your rangolis</h2></div>
          <div className="hscroll">
            {mine.slice(0, 8).map(c => (
              <div key={c.id} style={{ flex: 'none', position: 'relative', width: 92, height: 92, borderRadius: 20, overflow: 'hidden', background: '#1F2A5C' }}>
                <img src={c.image} alt="A rangoli you drew" style={{ width: '100%', height: '100%', display: 'block' }} />
                <button className="iconbtn" aria-label="Delete this rangoli" style={{ position: 'absolute', right: 4, top: 4, width: 30, height: 30, background: 'rgba(0,0,0,.45)', color: '#fff', boxShadow: 'none' }} onClick={() => { void api.deleteCreation(c.id).then(() => setMine(m => m.filter(x => x.id !== c.id))).catch(e => toast(errMsg(e))); }}><Ic n="x" size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- paper boat
export function BoatScreen() {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<'write' | 'go' | 'gone'>('write');
  const [line, setLine] = useState('Folding…');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const go1 = () => {
    setStage('go'); setText(''); // what was written is never sent anywhere, and is cleared as the boat leaves
    timers.current.push(setTimeout(() => setLine('Floating away…'), 1200));
    timers.current.push(setTimeout(() => setLine('Gone. You carried it, and now it is carried away.'), 4200));
    timers.current.push(setTimeout(async () => { const g = await keepsake('boat'); if (g) { setStage('gone'); go('today'); } else setStage('write'); }, 6200));
  };
  return (
    <ScreenFrame title="Paper boat" onBack={pop}>
      {stage === 'write' ? (
        <>
          <h1 className="h1" style={{ marginTop: 8 }}>What is weighing on you?</h1>
          <p className="muted" style={{ margin: '8px 0 14px' }}>Write it here. Then fold it into a boat and let it float away. <b>Boats are not saved.</b> Nothing you write here is stored.</p>
          <textarea rows={5} placeholder="Say it however it comes" aria-label="What is weighing on you" value={text} onChange={e => setText(e.target.value)} maxLength={500} />
          <button className="btn block" style={{ marginTop: 16 }} disabled={!text.trim()} onClick={go1}><Ic n="leaf" />Fold and float away</button>
        </>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginTop: 30 }}><div className="h1">Let it go</div><p className="muted" role="status" style={{ marginTop: 6 }}>{line}</p></div>
          <div style={{ position: 'relative', height: 260, marginTop: 20, borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(180deg,#CFE9F5,#7FC2E0 55%,#4D93C0)' }} aria-hidden="true">
            <svg viewBox="0 0 340 260" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <path d="M0 170Q40 156 85 170T170 170T255 170T340 170V260H0Z" fill="#6FB5D8" opacity=".7" /><path d="M0 200Q40 186 85 200T170 200T255 200T340 200V260H0Z" fill="#4D93C0" opacity=".8" />
              <g className="boatgo"><path d="M110 150h120l-18 26h-84z" fill="#fff" /><path d="M170 80v70h-48z" fill="#F7F3EA" /><path d="M170 96v54h38z" fill="#E7DFCB" /><path d="M110 150h120" stroke="#D5CBB2" strokeWidth="2" /></g>
            </svg>
          </div>
        </>
      )}
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- good-things jar
const JAR_COLS = ['#FFB11F', '#FF8FA8', '#7BD7C9', '#9C8CFF', '#8FD36B', '#FFD36B'];

function JarArt({ items, drop }: { items: JarItem[]; drop: string | null }) {
  const shown = items.slice(0, 24).reverse();
  const stars = shown.map((it, i) => {
    const row = Math.floor(i / 5), col = i % 5, x = 116 + col * 17 + (row % 2 ? 8 : 0) + ((i * 7) % 4), y = 262 - row * 19, r = ((i * 37) % 50) - 25;
    return `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0-12l3.2 8 8.6.6-6.6 5.6 2.2 8.4L0 4.8l-7.4 4.6 2.2-8.4-6.6-5.6 8.6-.6z" fill="${JAR_COLS[i % 6]}" stroke="rgba(0,0,0,.12)" stroke-width=".8"${drop && it.id === drop ? ' class="jdrop"' : ''}/></g>`;
  }).join('');
  const html = `<defs><linearGradient id="jg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient></defs><ellipse cx="150" cy="284" rx="86" ry="10" fill="rgba(0,0,0,.12)"/><rect x="104" y="30" width="92" height="22" rx="8" fill="#B07A45"/><path d="M92 62Q92 52 104 52H196Q208 52 208 62V260Q208 284 184 284H116Q92 284 92 260Z" fill="rgba(210,235,245,.5)" stroke="#9CC6D8" stroke-width="3"/>${stars}<path d="M104 70V250" stroke="url(#jg)" stroke-width="8" stroke-linecap="round" opacity=".7"/>`;
  return <svg viewBox="0 0 300 300" role="img" aria-label={`A jar with ${items.length} good things in it`} style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function JarScreen() {
  const [items, setItems] = useState<JarItem[] | null>(null);
  const [text, setText] = useState('');
  const [drop, setDrop] = useState<string | null>(null);
  const [out, setOut] = useState<JarItem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.jar().then(setItems).catch(() => setItems([])); }, []);
  const list = items ?? [];
  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const j = await api.addJarItem(t);
      setItems(l => [j, ...(l ?? [])]); setText(''); setDrop(j.id); setOut(null);
      void loadGarden();
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };
  const take = () => { if (list.length) setOut(list[Math.floor(Math.random() * list.length)]); };
  const remove = async (j: JarItem) => { try { await api.deleteJarItem(j.id); setItems(l => (l ?? []).filter(x => x.id !== j.id)); setOut(null); } catch (e) { toast(errMsg(e)); } };
  return (
    <ScreenFrame title="Good-things jar" onBack={pop}>
      <p className="muted" style={{ margin: '4px 0 6px' }}>One small good thing from today. On a hard day, take one out and read it.</p>
      <JarArt items={list} drop={drop} />
      <div className="fine" style={{ textAlign: 'center', margin: '0 0 12px' }} role="status">{list.length} saved</div>
      {out && (
        <div className="card" style={{ background: 'var(--t-sand)', marginBottom: 12 }}>
          <div className="eyebrow">From {new Date(out.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
          <p style={{ fontFamily: 'var(--disp)', fontSize: 19, marginTop: 4 }}>“{out.text}”</p>
          <button className="link" style={{ marginTop: 4 }} onClick={() => void remove(out)}>Remove this one</button>
        </div>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); void add(); }}>
        <input type="text" aria-label="A good thing" placeholder="Today, something good was…" maxLength={90} autoComplete="off" value={text} onChange={e => setText(e.target.value)} />
        <button type="submit" className="btn" aria-label="Add to jar" disabled={!text.trim() || busy}><Ic n="plus" /></button>
      </form>
      {list.length > 0 && <button className="btn line block" style={{ marginTop: 12 }} onClick={take}>Take one out</button>}
    </ScreenFrame>
  );
}
