import { useEffect, useRef, useState } from 'react';
import { go } from '../state/actions';
import { logActivity } from './actions';
import { s } from './css';
import { I, Svg } from './icons';
import { HelpButton } from './Chrome';
import { setV3, useV3, type GameId } from './ui';

// Four quiet games, from the design: draw a rangoli, pop balloons, slice fruit, arrange a cosy room. None has a timer, a score to
// beat or a way to lose. The pictures stay on the device; only "they played, and it helped (or they did not say)" is kept.

const pos = (e: React.PointerEvent, el: HTMLElement, W: number, H: number): [number, number] => { const b = el.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
const setup = (c: HTMLCanvasElement, W: number, H: number) => { const d = 2; c.width = W * d; c.height = H * d; const x = c.getContext('2d')!; x.setTransform(d, 0, 0, d, 0, 0); return x; };

function Rangoli({ color, k }: { color: string; k: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<[number, number] | null>(null);
  const col = useRef(color); col.current = color;
  useEffect(() => {
    const x = setup(ref.current!, 320, 320);
    x.fillStyle = '#2B2350'; x.fillRect(0, 0, 320, 320);
    x.fillStyle = 'rgba(255,255,255,.28)';
    for (let r = 28; r < 160; r += 28) for (let a = 0; a < 16; a++) { x.beginPath(); x.arc(160 + Math.cos(a / 16 * 6.283) * r, 160 + Math.sin(a / 16 * 6.283) * r, 1.8, 0, 7); x.fill(); }
  }, [k]);
  const draw = (p0: [number, number], p1: [number, number]) => {
    const x = ref.current!.getContext('2d')!; x.save(); x.translate(160, 160); x.strokeStyle = col.current; x.lineWidth = 4; x.lineCap = 'round'; x.shadowColor = col.current; x.shadowBlur = 6;
    for (let i = 0; i < 8; i++) for (const m of [1, -1]) { x.save(); x.rotate(i * Math.PI / 4); x.scale(1, m); x.beginPath(); x.moveTo(p0[0] - 160, p0[1] - 160); x.lineTo(p1[0] - 160, p1[1] - 160); x.stroke(); x.restore(); }
    x.restore();
  };
  return <canvas ref={ref} role="img" aria-label="A rangoli. Touch and drag to draw; it mirrors into a pattern." style={{ ...s('width:320px;height:320px;border-radius:50%;touch-action:none;box-shadow:0 0 0 6px rgba(255,255,255,.08)') }}
    onPointerDown={e => { last.current = pos(e, ref.current!, 320, 320); e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (!last.current) return; const p = pos(e, ref.current!, 320, 320); draw(last.current, p); last.current = p; }}
    onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} />;
}

interface Balloon { x: number; y: number; r: number; v: number; c: string; ph: number; dx: number }
interface Spark { x: number; y: number; vx: number; vy: number; c: string; l: number }
function Balloons({ onScore, reduce }: { onScore: () => void; reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onScore); cb.current = onScore;
  const hit = useRef<(px: number, py: number) => boolean>(() => false);
  useEffect(() => {
    const W = 340, H = 520, c = ref.current!, x = setup(c, W, H);
    let bs: Balloon[] = [], ps: Spark[] = [], raf = 0, t = 0;
    const cols = ['#F2B33D', '#E8896B', '#7DB394', '#8E86D9', '#F28DB2', '#6CB6D9'];
    const spawn = (y?: number) => bs.push({ x: 40 + Math.random() * (W - 80), y: y ?? H + 60, r: 24 + Math.random() * 12, v: (reduce ? .25 : .5) + Math.random() * .7, c: cols[Math.random() * 6 | 0], ph: Math.random() * 6, dx: 0 });
    for (let i = 0; i < 5; i++) spawn(H - 60 - i * 95);
    const loop = () => {
      t++; if (t % 48 === 0 && bs.length < 10) spawn();
      x.clearRect(0, 0, W, H);
      bs.forEach(b => {
        b.y -= b.v; b.ph += .02; const bx = b.x + Math.sin(b.ph) * 8; b.dx = bx;
        x.strokeStyle = 'rgba(30,36,48,.3)'; x.lineWidth = 1; x.beginPath(); x.moveTo(bx, b.y + b.r * 1.2); x.quadraticCurveTo(bx + 8, b.y + b.r * 1.7, bx, b.y + b.r * 2.4); x.stroke();
        x.fillStyle = b.c; x.beginPath(); x.ellipse(bx, b.y, b.r, b.r * 1.18, 0, 0, 7); x.fill();
        x.beginPath(); x.moveTo(bx - 5, b.y + b.r * 1.25); x.lineTo(bx + 5, b.y + b.r * 1.25); x.lineTo(bx, b.y + b.r * 1.1); x.fill();
        x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(bx - b.r * .35, b.y - b.r * .45, b.r * .17, b.r * .3, -.5, 0, 7); x.fill();
      });
      bs = bs.filter(b => b.y > -90);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .08; p.l--; x.globalAlpha = Math.max(0, p.l / 40); x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, 3.5, 0, 7); x.fill(); x.globalAlpha = 1; });
      ps = ps.filter(p => p.l > 0);
      raf = requestAnimationFrame(loop);
    };
    loop();
    hit.current = (px, py) => {
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i];
        if (Math.hypot(px - b.dx, (py - b.y) / 1.18) < b.r + 8) { for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283; ps.push({ x: b.dx, y: b.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, c: b.c, l: 40 }); } bs.splice(i, 1); return true; }
      }
      return false;
    };
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return <canvas ref={ref} role="img" aria-label="Balloons floating up. Tap them to pop." style={{ ...s('width:340px;height:520px;touch-action:none;display:block') }} onPointerDown={e => { const [px, py] = pos(e, ref.current!, 340, 520); if (hit.current(px, py)) cb.current(); }} />;
}

interface Fruit { x: number; y: number; vx: number; vy: number; o: string; i: string; r: number; rot: number }
interface Half { x: number; y: number; vx: number; vy: number; a: number; sg: number; o: string; i: string; r: number; rot: number; vr: number }
function Fruits({ onScore }: { onScore: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onScore); cb.current = onScore;
  const swipe = useRef<(p: [number, number]) => number>(() => 0);
  const end = useRef<() => void>(() => undefined);
  const down = useRef(false);
  useEffect(() => {
    const W = 340, H = 520, c = ref.current!, x = setup(c, W, H);
    let fs: Fruit[] = [], hs: Half[] = [], ps: Spark[] = [], trail: { x: number; y: number; l: number }[] = [], raf = 0, t = 0;
    const T = [{ o: '#3E9B4F', i: '#F05D5E', r: 30 }, { o: '#F5A623', i: '#FFD38A', r: 24 }, { o: '#E84B4B', i: '#FFF1D6', r: 23 }, { o: '#F7C948', i: '#FFE79A', r: 25 }, { o: '#7B3FA0', i: '#C79BE0', r: 20 }];
    const spawn = () => { const tp = T[Math.random() * T.length | 0], sx = 60 + Math.random() * (W - 120); fs.push({ x: sx, y: H + 30, vx: (W / 2 - sx) * .008 + (Math.random() - .5), vy: -(9.5 + Math.random() * 2.5), ...tp, rot: 0 }); };
    const segD = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1; let k = ((px - ax) * dx + (py - ay) * dy) / l; k = Math.max(0, Math.min(1, k)); return Math.hypot(px - (ax + k * dx), py - (ay + k * dy)); };
    swipe.current = p => {
      const q = trail[trail.length - 1]; trail.push({ x: p[0], y: p[1], l: 14 }); if (!q) return 0;
      let n = 0;
      fs = fs.filter(f => {
        if (segD(q.x, q.y, p[0], p[1], f.x, f.y) < f.r) {
          const a = Math.atan2(p[1] - q.y, p[0] - q.x), nx = -Math.sin(a), ny = Math.cos(a);
          [1, -1].forEach(sg => hs.push({ x: f.x, y: f.y, vx: f.vx + nx * 2 * sg, vy: f.vy * .4 + ny * 2 * sg, a, sg, o: f.o, i: f.i, r: f.r, rot: 0, vr: .04 * sg }));
          for (let k = 0; k < 12; k++) ps.push({ x: f.x, y: f.y, vx: (Math.random() - .5) * 6, vy: (Math.random() - .7) * 6, c: f.i, l: 36 });
          n++; return false;
        }
        return true;
      });
      return n;
    };
    end.current = () => { trail = []; };
    const loop = () => {
      t++; if (t % 62 === 0) { spawn(); if (Math.random() < .4) spawn(); }
      x.clearRect(0, 0, W, H);
      fs.forEach(f => { f.x += f.vx; f.y += f.vy; f.vy += .18; f.rot += .03; x.save(); x.translate(f.x, f.y); x.rotate(f.rot); x.fillStyle = f.o; x.beginPath(); x.arc(0, 0, f.r, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.arc(-f.r * .35, -f.r * .35, f.r * .25, 0, 7); x.fill(); x.fillStyle = '#4E9A5C'; x.beginPath(); x.ellipse(f.r * .3, -f.r * 1.02, 7, 3.5, -.5, 0, 7); x.fill(); x.restore(); });
      fs = fs.filter(f => f.y < H + 60);
      hs.forEach(o => { o.x += o.vx; o.y += o.vy; o.vy += .22; o.rot += o.vr; x.save(); x.translate(o.x, o.y); x.rotate(o.a + o.rot); const s0 = o.sg > 0 ? 0 : Math.PI; x.fillStyle = o.o; x.beginPath(); x.arc(0, 0, o.r, s0, s0 + Math.PI); x.closePath(); x.fill(); x.fillStyle = o.i; x.beginPath(); x.arc(0, 0, o.r * .82, s0, s0 + Math.PI); x.closePath(); x.fill(); x.restore(); });
      hs = hs.filter(o => o.y < H + 60);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .2; p.l--; x.globalAlpha = Math.max(0, p.l / 36); x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, 3, 0, 7); x.fill(); x.globalAlpha = 1; });
      ps = ps.filter(p => p.l > 0);
      trail.forEach(p => p.l--); trail = trail.filter(p => p.l > 0);
      if (trail.length > 1) { x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); trail.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke(); }
      raf = requestAnimationFrame(loop);
    };
    spawn(); loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} role="img" aria-label="Fruit flying up. Swipe through it to slice." style={{ ...s('width:340px;height:520px;touch-action:none;display:block') }}
    onPointerDown={e => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); swipe.current(pos(e, ref.current!, 340, 520)); }}
    onPointerMove={e => { if (!down.current) return; const n = swipe.current(pos(e, ref.current!, 340, 520)); for (let i = 0; i < n; i++) cb.current(); }}
    onPointerUp={() => { down.current = false; end.current(); }} />;
}

const ROOM_ITEMS: [string, string][] = [['window', 'Window'], ['lights', 'Fairy lights'], ['frame', 'Painting'], ['lamp', 'Lamp'], ['sofa', 'Sofa'], ['plant', 'Plant'], ['rug', 'Rug'], ['cat', 'Cat'], ['books', 'Books']];
const WALLS = ['#F4E3D3', '#DCE8E0', '#E3DDF7', '#F7D9CF'];
const P = (css: string, children?: React.ReactNode) => <div style={s(`position:absolute;${css};animation:kPop 400ms`)}>{children}</div>;
function RoomView({ room, wall }: { room: Record<string, boolean>; wall: string }) {
  const bit = (css: string) => <span style={s(`position:absolute;${css}`)} />;
  return (
    <div role="img" aria-label="A cosy room. Pick things to place in it." style={s('position:relative;width:340px;height:360px;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(30,36,48,.12)')}>
      <div style={s(`position:absolute;left:0;right:0;top:0;height:250px;background:${wall};transition:background 500ms`)} />
      <div style={s('position:absolute;left:0;right:0;top:250px;bottom:0;background:repeating-linear-gradient(90deg,#D9BE98 0 56px,#CFB28A 56px 58px)')} />
      {room.window && P('left:34px;top:40px;width:104px;height:92px;border:6px solid #FFFFFF;border-radius:8px;background:linear-gradient(180deg,#2F2A5E,#6F6BB8)', <>{bit('right:14px;top:12px;width:22px;height:22px;border-radius:50%;background:#F8E9C8')}{bit('left:0;right:0;top:37px;height:6px;background:#FFFFFF')}</>)}
      {room.lights && P('left:150px;top:22px;width:180px;display:flex;justify-content:space-between', ['#F2B33D', '#F28DB2', '#7FD1C3', '#F2B33D', '#F28DB2'].map((c, i) => <span key={i} style={s(`width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 10px ${c};margin-top:${[0, 8, 12, 8, 0][i]}px`)} />))}
      {room.frame && P('left:186px;top:62px;width:64px;height:78px;border:5px solid #8C6A4A;background:#F4C7B8', <>{bit('left:14px;top:16px;width:26px;height:26px;border-radius:50%;background:#E8896B')}{bit('left:0;right:0;bottom:0;height:20px;background:#7DB394')}</>)}
      {room.lamp && P('left:268px;top:120px;width:60px;height:130px', <>{bit('left:-30px;top:-20px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(248,214,122,.55),rgba(248,214,122,0) 70%)')}{bit('left:6px;top:0;width:48px;height:32px;border-radius:10px 10px 4px 4px;background:#F2B33D')}{bit('left:28px;top:32px;width:4px;height:92px;background:#5A4A3A')}{bit('left:14px;top:122px;width:32px;height:8px;border-radius:4px;background:#5A4A3A')}</>)}
      {room.sofa && P('left:66px;top:180px;width:190px;height:90px', <>{bit('left:10px;top:0;width:170px;height:54px;border-radius:18px;background:#4E8A6A')}{bit('left:0;top:40px;width:190px;height:40px;border-radius:14px;background:#3E7458')}{bit('left:24px;top:14px;width:40px;height:32px;border-radius:10px;background:#F2B33D')}{bit('left:126px;top:14px;width:40px;height:32px;border-radius:10px;background:#F28DB2')}{bit('left:12px;top:78px;width:8px;height:12px;background:#5A4A3A')}{bit('left:170px;top:78px;width:8px;height:12px;background:#5A4A3A')}</>)}
      {room.plant && P('left:14px;top:176px;width:56px;height:84px', <>{bit('left:6px;top:0;width:22px;height:46px;border-radius:50%;background:#4E9A5C;transform:rotate(-25deg)')}{bit('left:28px;top:0;width:22px;height:46px;border-radius:50%;background:#6DBB6A;transform:rotate(25deg)')}{bit('left:17px;top:-8px;width:22px;height:48px;border-radius:50%;background:#3E7F4C')}{bit('left:10px;top:44px;width:36px;height:36px;border-radius:4px 4px 12px 12px;background:#C9734B')}</>)}
      {room.rug && P('left:60px;top:282px;width:220px;height:50px;border-radius:50%;background:#E8896B', bit('inset:8px 20px;border-radius:50%;border:3px dashed #FCEFCF'))}
      {room.cat && P('left:206px;top:268px;width:70px;height:40px', <>{bit('left:0;top:10px;width:52px;height:28px;border-radius:50%;background:#3A3A48')}{bit('left:40px;top:0;width:26px;height:24px;border-radius:50%;background:#3A3A48')}{bit('left:42px;top:-5px;width:9px;height:9px;background:#3A3A48;transform:rotate(45deg)')}{bit('left:55px;top:-5px;width:9px;height:9px;background:#3A3A48;transform:rotate(45deg)')}{bit('left:47px;top:9px;width:4px;height:4px;border-radius:50%;background:#F2B33D')}{bit('left:57px;top:9px;width:4px;height:4px;border-radius:50%;background:#F2B33D')}</>)}
      {room.books && P('left:290px;top:262px;width:44px;height:40px', <>{bit('left:0;top:28px;width:44px;height:10px;border-radius:2px;background:#6F6BB8')}{bit('left:4px;top:18px;width:38px;height:10px;border-radius:2px;background:#F2B33D')}{bit('left:2px;top:8px;width:40px;height:10px;border-radius:2px;background:#E8896B')}</>)}
    </div>
  );
}

const META: Record<GameId, [string, string, string, string, 'play']> = {
  rangoli: ['Rangoli', 'Draw anywhere. It mirrors into a pattern.', '#1C1838', '#FFFFFF', 'play'],
  balloon: ['Balloon pop', 'Tap the balloons. No timer, no losing.', 'linear-gradient(180deg,#CFE8F5,#FCEFCF)', '#1E2430', 'play'],
  fruit: ['Fruit slice', 'Swipe through the fruit.', 'linear-gradient(180deg,#2E4A35,#3E7F4C)', '#FFFFFF', 'play'],
  room: ['Cozy room', 'Tap things to place them. Make it yours.', '#FAF6EF', '#1E2430', 'play'],
};

export function GameScreen() {
  const game = useV3(x => x.game) as GameId;
  const [score, setScore] = useState(0);
  const [color, setColor] = useState('#F2B33D');
  const [key, setKey] = useState(0);
  const [room, setRoom] = useState<Record<string, boolean>>({ window: true });
  const [wall, setWall] = useState('#F4E3D3');
  const reduce = typeof document !== 'undefined' && document.documentElement.dataset.reduce === 'true';
  const [title, hint, bg, fg] = META[game] ?? META.rangoli;
  const roomCount = Object.values(room).filter(Boolean).length;
  const back = () => { setV3({ over: null, game: null }); go('calm'); };
  const finish = (helped?: boolean) => { logActivity('play', helped); back(); };
  const dark = game !== 'room';
  const cta = game === 'balloon' || game === 'room';
  return (
    <div className={dark ? 'screen dark' : 'screen'} role="main" aria-label={title} style={{ ...s(`background:${bg};color:${fg};display:flex;flex-direction:column;padding:52px 16px 32px;z-index:30`) }}>
      <div style={s('display:flex;align-items:center;gap:8px')}>
        <button onClick={back} aria-label="Back" style={s('width:44px;height:44px;border:none;background:none;display:grid;place-items:center')}><Svg d={I.back} size={22} /></button>
        <h1 className="serif" style={s('flex:1;font-size:30px;margin:0')}>{title}</h1>
        <span role="status" style={s('font-size:15px;font-weight:700;padding-right:8px')}>{game === 'balloon' ? `${score} popped` : game === 'fruit' ? `${score} sliced` : game === 'room' ? `${roomCount} / 9` : ''}</span>
        <HelpButton dark={dark} small />
      </div>
      <span style={s('font-size:14px;opacity:.85;padding:0 12px')}>{hint}</span>
      <div style={s('flex:1;min-height:0;display:flex;align-items:center;justify-content:center')}>
        {game === 'rangoli' && <Rangoli key={`r${key}`} color={color} k={key} />}
        {game === 'balloon' && <Balloons onScore={() => setScore(n => n + 1)} reduce={reduce} />}
        {game === 'fruit' && <Fruits onScore={() => setScore(n => n + 1)} />}
        {game === 'room' && <RoomView room={room} wall={wall} />}
      </div>
      {game === 'rangoli' && (
        <div role="group" aria-label="Colour" style={s('display:flex;justify-content:center;gap:10px;margin-bottom:14px')}>
          {['#F2B33D', '#F28DB2', '#FFFFFF', '#7FD1C3', '#E8896B', '#A99BF2'].map(c => <button key={c} aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} style={s(`width:44px;height:44px;border-radius:50%;border:none;background:${c};box-shadow:${color === c ? '0 0 0 3px #1C1838, 0 0 0 5px #FFFFFF' : 'none'}`)} />)}
        </div>
      )}
      {game === 'room' && (
        <div style={s('display:flex;flex-direction:column;gap:10px;margin-bottom:14px')}>
          <div role="group" aria-label="Wall colour" style={s('display:flex;gap:8px;justify-content:center')}>{WALLS.map(c => <button key={c} aria-pressed={wall === c} aria-label={`Wall ${c}`} onClick={() => setWall(c)} style={s(`width:44px;height:44px;border-radius:50%;border:none;background:${c};box-shadow:${wall === c ? '0 0 0 3px #1E2430' : '0 0 0 1px #D9D2C5'}`)} />)}</div>
          <div style={s('display:flex;flex-wrap:wrap;gap:6px;justify-content:center')}>{ROOM_ITEMS.map(([k, label]) => <button key={k} aria-pressed={!!room[k]} onClick={() => setRoom(r => ({ ...r, [k]: !r[k] }))} style={s(`height:44px;padding:0 14px;border-radius:22px;border:none;background:${room[k] ? '#2F2A5E' : '#FFFFFF'};color:${room[k] ? '#FFFFFF' : '#1E2430'};font-size:14px;font-weight:600`)}>{label}</button>)}</div>
        </div>
      )}
      <div style={s('display:flex;gap:10px')}>
        {game === 'rangoli' && <button onClick={() => setKey(k => k + 1)} style={s('flex:1;height:52px;border-radius:26px;border:none;background:rgba(255,255,255,.14);color:inherit;font-size:16px;font-weight:700')}>Start over</button>}
        <button onClick={() => finish(true)} data-track="game.better" style={s(`flex:1;height:52px;border-radius:26px;border:none;background:${cta ? '#2F2A5E' : '#FFFFFF'};color:${cta ? '#FFFFFF' : '#1E2430'};font-size:16px;font-weight:700`)}>I feel better</button>
        <button onClick={() => finish()} data-track="game.done" style={s('flex:none;height:52px;padding:0 18px;border-radius:26px;border:none;background:rgba(127,127,127,.18);color:inherit;font-size:15px;font-weight:700')}>Done</button>
      </div>
    </div>
  );
}
