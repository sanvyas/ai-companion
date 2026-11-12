import { useState } from 'react';
import { s } from './css';
import { SCENE_NAMES, isDark, isSceneId, sceneFor, type SceneId } from './scenes';

// A small illustrated view for Home. A different place each time the app is opened; a tap shows the next one. Each is drawn
// in the same soft way and moves very slowly (nothing moves for people who ask for that, see v3.css).

const W = 342, H = 150;
const Sky = ({ id, a, b }: { id: string; a: string; b: string }) => (
  <><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs><rect width={W} height={H} fill={`url(#${id})`} /></>
);
const Glow = ({ cx, cy, r, night }: { cx: number; cy: number; r: number; night: boolean }) => (
  <g className="v3-glow" style={{ transformOrigin: `${cx}px ${cy}px` }}>
    <circle cx={cx} cy={cy} r={r * 2.6} fill={night ? '#DCE8F5' : '#FFF1C2'} opacity={night ? 0.12 : 0.35} />
    <circle cx={cx} cy={cy} r={r} fill={night ? '#F6F1DA' : '#FFE08A'} />
  </g>
);
const Cloud = ({ x, y, k = 1, o = 0.8, cls = 'v3-drift' }: { x: number; y: number; k?: number; o?: number; cls?: string }) => (
  <g className={cls} opacity={o}><ellipse cx={x} cy={y} rx={26 * k} ry={8 * k} fill="#FFFFFF" /><ellipse cx={x + 18 * k} cy={y - 5 * k} rx={17 * k} ry={7 * k} fill="#FFFFFF" /></g>
);
const Stars = ({ n = 14 }: { n?: number }) => <>{Array.from({ length: n }, (_, i) => <circle key={i} className="v3-twinkle" cx={14 + ((i * 53) % 320)} cy={8 + ((i * 29) % 60)} r={i % 3 ? 1.1 : 1.7} fill="#FFFFFF" style={{ animationDelay: `${(i % 7) * 0.5}s` }} />)}</>;

function Meadow({ night }: { night: boolean }) {
  const spots: [number, number, string][] = [[34, 122, '#F27C9B'], [76, 130, '#F4C95D'], [120, 120, '#FFFFFF'], [168, 132, '#B7A6F0'], [214, 121, '#F27C9B'], [262, 130, '#F4C95D'], [306, 122, '#FFFFFF']];
  return (<>
    <Sky id={`sc-m${night ? "n" : "d"}`} a={night ? '#274B5A' : '#CBE6F2'} b={night ? '#3C7A74' : '#F6EBD3'} />
    <Glow cx={274} cy={36} r={13} night={night} />
    <Cloud x={60} y={34} /><Cloud x={190} y={52} k={0.8} o={0.65} cls="v3-drift2" />
    <path d="M0 86 C50 60 100 74 150 80 C214 88 262 60 342 76 V150 H0z" fill="#C8E4C4" />
    <path d="M0 108 C60 88 120 102 180 104 C240 106 290 92 342 100 V150 H0z" fill="#A5D1AA" />
    <path d="M0 128 C70 114 140 124 210 122 C270 120 310 118 342 120 V150 H0z" fill="#82BA8B" />
    {spots.map(([x, y, c], i) => <g key={i}><path className="v3-sway" d={`M${x} ${y} V${y + 18}`} stroke="#4E8F5C" strokeWidth="2" strokeLinecap="round" style={{ animationDelay: `${i * 0.3}s` }} /><circle cx={x} cy={y} r="6" fill={c} /><circle cx={x} cy={y} r="2.4" fill="#FFF3D6" /></g>)}
  </>);
}

function Sea({ night }: { night: boolean }) {
  return (<>
    <Sky id={`sc-s${night ? "n" : "d"}`} a={night ? '#1F3F4A' : '#FAD9B8'} b={night ? '#3A6A78' : '#F6EEDB'} />
    {night && <Stars n={10} />}
    <Glow cx={230} cy={74} r={16} night={night} />
    <rect y="74" width={W} height="76" fill={night ? '#2A5866' : '#8FC6D6'} />
    <rect y="74" width={W} height="26" fill={night ? '#3B7283' : '#F2D5A8'} opacity=".55" />
    {[84, 96, 108, 120, 134].map((y, i) => <path key={y} className={i % 2 ? 'v3-drift2' : 'v3-drift'} d={`M${20 + i * 40} ${y} q8 -4 16 0 t16 0 t16 0`} stroke="#FFFFFF" strokeWidth="1.6" fill="none" opacity={0.5 - i * 0.05} strokeLinecap="round" />)}
    <g className="v3-bob"><path d="M96 72 L96 50 L116 70 Z" fill="#FFFFFF" /><path d="M94 72 H120 L114 78 H100 Z" fill={night ? '#9AA9B5' : '#C8744F'} /></g>
  </>);
}

function Mountains({ night }: { night: boolean }) {
  return (<>
    <Sky id={`sc-t${night ? "n" : "d"}`} a={night ? '#243A5C' : '#D8EAF4'} b={night ? '#4A6E8C' : '#F7EEDC'} />
    {night ? <Stars n={9} /> : <Cloud x={70} y={30} />}
    <Glow cx={266} cy={34} r={11} night={night} />
    <path d="M0 96 L60 40 L98 78 L150 28 L214 92 L262 56 L342 98 V104 H0z" fill={night ? '#5A7896' : '#A9C3D6'} />
    <path d="M150 28 L136 46 L150 40 L162 50z M60 40 L50 52 L60 48 L68 54z" fill="#FFFFFF" opacity=".9" />
    <path d="M0 108 L40 74 L88 100 L142 66 L196 104 L250 76 L342 110 V118 H0z" fill={night ? '#3C5A78' : '#7FA2BA'} />
    <rect y="104" width={W} height="46" fill={night ? '#2A4A68' : '#9CC9D6'} />
    {[0, 1, 2].map(i => <path key={i} className="v3-drift2" d={`M${70 + i * 90} ${118 + i * 8} h34`} stroke="#FFFFFF" strokeWidth="1.5" opacity=".45" strokeLinecap="round" />)}
  </>);
}

function Forest() {
  const trees: [number, number, number, string][] = [[24, 150, 70, '#4F8F62'], [70, 150, 96, '#3F7F55'], [130, 150, 64, '#5FA070'], [200, 150, 104, '#3A7650'], [256, 150, 74, '#4F8F62'], [312, 150, 92, '#3F7F55']];
  return (<>
    <Sky id="sc-f" a="#E6F2D6" b="#F6F0CF" />
    {[60, 150, 240].map((x, i) => <path key={x} d={`M${x} 0 L${x + 38} 0 L${x + 6 - i * 14} 150 L${x - 40} 150z`} fill="#FFFFFF" opacity=".16" />)}
    {trees.map(([x, y, h, c], i) => <g key={i}><rect x={x - 3} y={y - h * 0.4} width="6" height={h * 0.4} fill="#6B4F3A" /><path className="v3-sway-tree" d={`M${x} ${y - h} L${x + h * 0.26} ${y - h * 0.38} L${x - h * 0.26} ${y - h * 0.38}z M${x} ${y - h * 0.75} L${x + h * 0.32} ${y - h * 0.12} L${x - h * 0.32} ${y - h * 0.12}z`} fill={c} /></g>)}
    <path d="M150 150 Q168 124 196 112 Q214 104 232 100" stroke="#F1DDB8" strokeWidth="18" fill="none" strokeLinecap="round" opacity=".9" />
  </>);
}

function Backwaters({ night }: { night: boolean }) {
  const palm = (x: number, flip: number) => (<g transform={`translate(${x} 0) scale(${flip} 1)`}>
    <path d="M0 150 C6 120 10 96 4 66" stroke="#6B4F3A" strokeWidth="5" fill="none" strokeLinecap="round" />
    {[[-24, -8], [-16, -18], [0, -22], [18, -14], [26, -2]].map(([dx, dy], i) => <path key={i} className="v3-sway-tree" d={`M4 66 q${dx / 2} ${dy - 6} ${dx} ${dy + 10}`} stroke="#3F8A56" strokeWidth="5" fill="none" strokeLinecap="round" />)}
  </g>);
  return (<>
    <Sky id={`sc-b${night ? "n" : "d"}`} a={night ? '#2A4A5E' : '#FBDDBF'} b={night ? '#3F7478' : '#DDEFE0'} />
    {night && <Stars n={8} />}
    <Glow cx={190} cy={52} r={13} night={night} />
    <path d="M0 78 C60 70 110 80 170 76 C240 72 290 80 342 74 V150 H0z" fill={night ? '#2F6A62' : '#9FD0B0'} />
    <rect y="86" width={W} height="64" fill={night ? '#2B5C70' : '#8EC8D0'} />
    {palm(26, 1)}{palm(318, -1)}
    <g className="v3-bob"><path d="M122 104 H196 L186 114 H132z" fill="#8A5A3C" /><path d="M134 104 q25 -26 52 0z" fill="#F0C75E" /><path d="M134 104 h52" stroke="#6B4F3A" strokeWidth="2" /></g>
    {[120, 132, 144].map((y, i) => <path key={y} className={i % 2 ? 'v3-drift2' : 'v3-drift'} d={`M${40 + i * 70} ${y} q8 -3 16 0 t16 0`} stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity=".5" strokeLinecap="round" />)}
  </>);
}

function Rain() {
  return (<>
    <Sky id="sc-r" a="#B9C9D6" b="#DCE6E4" />
    <g className="v3-drift" opacity=".95"><ellipse cx="80" cy="30" rx="48" ry="16" fill="#8FA3B4" /><ellipse cx="118" cy="22" rx="32" ry="14" fill="#8FA3B4" /></g>
    <g className="v3-drift2" opacity=".9"><ellipse cx="240" cy="38" rx="52" ry="16" fill="#9CB0C0" /><ellipse cx="274" cy="28" rx="32" ry="13" fill="#9CB0C0" /></g>
    <path d="M0 108 C60 94 120 104 190 102 C250 100 300 94 342 98 V150 H0z" fill="#9CC7A8" />
    <path d="M0 126 C70 114 150 124 220 122 C270 120 310 116 342 120 V150 H0z" fill="#79B48B" />
    {Array.from({ length: 34 }, (_, i) => <path key={i} className="v3-rain" d={`M${10 + i * 10} ${(i * 17) % 60 + 40} l-3 9`} stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity=".7" style={{ animationDelay: `${(i % 9) * 0.15}s` }} />)}
    {[70, 180, 270].map((x, i) => <ellipse key={x} className="v3-ripple" cx={x} cy={136 + (i % 2) * 6} rx="14" ry="3.4" fill="none" stroke="#FFFFFF" strokeWidth="1.2" opacity=".6" style={{ animationDelay: `${i * 0.5}s` }} />)}
  </>);
}

function Lotus({ night }: { night: boolean }) {
  const flower = (x: number, y: number, k: number) => (<g transform={`translate(${x} ${y}) scale(${k})`}>
    {[-40, -20, 0, 20, 40].map(a => <ellipse key={a} cx="0" cy="-9" rx="5.6" ry="11" fill={a === 0 ? '#F7B9CC' : '#F29BB6'} transform={`rotate(${a})`} />)}<circle r="3.4" fill="#F7D56B" /></g>);
  return (<>
    <Sky id={`sc-l${night ? "n" : "d"}`} a={night ? '#27485A' : '#F8DCCB'} b={night ? '#3A7478' : '#BFE0D6'} />
    {night && <Stars n={8} />}
    <Glow cx={64} cy={36} r={12} night={night} />
    <rect y="70" width={W} height="80" fill={night ? '#2B6068' : '#7DBFB5'} />
    {[[40, 100, 36, 9], [120, 126, 40, 10], [206, 106, 34, 8], [284, 130, 42, 10], [160, 90, 24, 6], [320, 96, 28, 7]].map(([x, y, rx, ry], i) => <ellipse key={i} className="v3-bob" cx={x} cy={y} rx={rx} ry={ry} fill={night ? '#3E8A6C' : '#5FA67A'} style={{ animationDelay: `${i * 0.4}s` }} />)}
    {flower(120, 122, 1.1)}{flower(208, 102, 0.9)}{flower(284, 126, 1.2)}{flower(42, 98, 0.8)}
  </>);
}

function StarryHills() {
  return (<>
    <Sky id="sc-n" a="#1B2F4D" b="#3B6F77" />
    <Stars n={20} />
    <g className="v3-glow" style={{ transformOrigin: '270px 38px' }}><circle cx="270" cy="38" r="30" fill="#DCE8F5" opacity=".1" /><circle cx="270" cy="38" r="15" fill="#F6F1DA" /><circle cx="263" cy="34" r="13" fill="#25405E" /></g>
    <path d="M0 98 C60 74 110 90 170 88 C230 86 280 70 342 84 V150 H0z" fill="#2C5A66" />
    <path d="M0 124 C70 104 140 118 210 116 C270 114 310 104 342 110 V150 H0z" fill="#1F4650" />
    {[[60, 108], [112, 124], [214, 112], [286, 126], [168, 130]].map(([x, y], i) => <g key={i} className="v3-twinkle" style={{ animationDelay: `${i * 0.6}s` }}><circle cx={x} cy={y} r="2.4" fill="#F7E58A" /><circle cx={x} cy={y} r="7" fill="#F7E58A" opacity=".2" /></g>)}
  </>);
}

function Himalaya() {
  const flags = ['#E8584A', '#F4C95D', '#FFFFFF', '#4E9F7A', '#3F6FB5'];
  return (<>
    <Sky id="sc-h" a="#BBD3EC" b="#F7C79F" />
    <g className="v3-glow" style={{ transformOrigin: '178px 78px' }}><circle cx="178" cy="78" r="56" fill="#FFE7B8" opacity=".5" /><circle cx="178" cy="78" r="26" fill="#FFF3CF" opacity=".8" /><circle cx="178" cy="80" r="15" fill="#FFD27A" /></g>
    <path d="M0 92 L48 52 L82 78 L128 36 L176 88 L214 58 L262 30 L312 76 L342 62 V110 H0z" fill="#EAB7A8" />
    <path d="M128 36 L116 52 L128 46 L138 56z M262 30 L249 48 L262 42 L274 52z M48 52 L40 62 L48 58 L55 64z" fill="#FFFFFF" opacity=".95" />
    <path d="M0 112 L36 84 L74 104 L120 72 L170 108 L222 78 L270 104 L316 84 L342 100 V124 H0z" fill="#8C8DB8" />
    <g className="v3-drift" opacity=".55"><ellipse cx="70" cy="108" rx="44" ry="7" fill="#FFFFFF" /></g>
    <g className="v3-drift2" opacity=".5"><ellipse cx="250" cy="116" rx="50" ry="8" fill="#FFFFFF" /></g>
    <path d="M0 128 C70 112 130 126 200 122 C260 118 310 112 342 118 V150 H0z" fill="#4C5B7C" />
    <path d="M14 130 V92 M326 118 V80" stroke="#2F3A55" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M14 94 Q170 114 326 82" stroke="#2F3A55" strokeWidth="1.2" fill="none" />
    {flags.map((c, i) => { const t = (i + 0.7) / (flags.length + 0.4); const x = 14 + t * 312; const y = 94 + Math.sin(t * Math.PI) * 14 - t * 12 + 2; return <path key={i} className="v3-sway-tree" d={`M${x} ${y} l9 0 l-1 11 l-8 0z`} fill={c} style={{ animationDelay: `${i * 0.5}s` }} />; })}
    {[[88, 52], [102, 46], [226, 40]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q3 -3 6 0 q3 -3 6 0`} stroke="#3B4560" strokeWidth="1.3" fill="none" strokeLinecap="round" />)}
  </>);
}

function Camel({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (<g transform={`translate(${x} ${y}) scale(${k})`} fill="#7A4A32" stroke="#7A4A32" strokeLinecap="round">
    <ellipse cx="0" cy="-12" rx="11" ry="5.5" stroke="none" /><path d="M-4 -16 q3 -9 7 0z M10 -14 q6 -2 8 -12 q1 -4 5 -4 l3 2 l-3 3 q-2 8 -9 16z" stroke="none" />
    <path d="M-8 -9 V0 M-3 -8 V0 M4 -8 V0 M9 -9 V0" strokeWidth="1.8" fill="none" />
  </g>);
}

function Desert() {
  return (<>
    <Sky id="sc-d" a="#A9B9DA" b="#F8D9B7" />
    {[[40, 14], [96, 26], [170, 10], [230, 22], [300, 12], [130, 40]].map(([x, y], i) => <circle key={i} className="v3-twinkle" cx={x} cy={y} r="1.2" fill="#FFFFFF" style={{ animationDelay: `${i * 0.5}s` }} />)}
    <g className="v3-glow" style={{ transformOrigin: '252px 84px' }}><circle cx="252" cy="84" r="40" fill="#FFE2B0" opacity=".5" /><circle cx="252" cy="84" r="16" fill="#FFD08A" /></g>
    <path d="M0 96 C60 80 120 96 190 90 C250 84 300 82 342 90 V150 H0z" fill="#EEC399" />
    <path d="M0 112 C70 92 140 110 210 106 C270 102 310 100 342 104 V150 H0z" fill="#DD9F72" />
    <Camel x={70} y={100} k={1} /><Camel x={92} y={99} k={0.95} /><Camel x={114} y={100} k={0.9} />
    <path d="M0 132 C80 112 150 130 220 124 C280 118 320 116 342 120 V150 H0z" fill="#BF7F55" />
    {[[40, 140], [120, 136], [210, 142], [290, 134]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q10 -4 20 0`} stroke="#9F6342" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".7" />)}
    <path className="v3-drift" d="M10 122 h26 M200 118 h30" stroke="#FFFFFF" strokeWidth="1.2" opacity=".3" strokeLinecap="round" />
  </>);
}

function Temple() {
  const tiers = [0, 1, 2, 3, 4, 5];
  return (<>
    <Sky id="sc-p" a="#4B4A86" b="#F5A874" />
    <circle className="v3-twinkle" cx="40" cy="22" r="1.5" fill="#FFFFFF" /><circle className="v3-twinkle" cx="300" cy="18" r="1.3" fill="#FFFFFF" style={{ animationDelay: '1s' }} />
    <g className="v3-glow" style={{ transformOrigin: '70px 92px' }}><circle cx="70" cy="92" r="34" fill="#FFD9A0" opacity=".4" /><circle cx="70" cy="92" r="13" fill="#FFC27A" /></g>
    <g fill="#2E2A55">
      <path d="M0 108 C60 98 120 106 342 100 V150 H0z" fill="#3A3566" />
      <rect x="132" y="86" width="96" height="30" /><rect x="124" y="108" width="112" height="8" /><rect x="118" y="114" width="124" height="8" />
      {tiers.map(i => <path key={i} d={`M${180 - (46 - i * 7)} ${86 - i * 9} H${180 + (46 - i * 7)} L${180 + (40 - i * 7)} ${77 - i * 9} H${180 - (40 - i * 7)}z`} />)}
      <path d="M170 33 q10 -14 20 0 v6 h-20z" /><rect x="179" y="14" width="2.4" height="20" /><path d="M181 14 l10 3 l-10 3z" fill="#F0A860" />
      <rect x="92" y="94" width="26" height="22" /><path d="M90 94 L105 76 L120 94z" /><rect x="242" y="94" width="26" height="22" /><path d="M240 94 L255 76 L270 94z" />
    </g>
    <path d="M170 116 v-14 q10 -12 20 0 v14z" fill="#F7B65E" />
    {[104, 150, 210, 256].map((x, i) => <g key={x} className="v3-twinkle" style={{ animationDelay: `${i * 0.4}s` }}><circle cx={x} cy="124" r="6" fill="#FFC96B" opacity=".35" /><ellipse cx={x} cy="124" rx="2" ry="3" fill="#FFD983" /></g>)}
    <rect y="126" width={W} height="24" fill="#3B3868" />
    <rect y="126" width={W} height="24" fill="#F4A874" opacity=".22" />
    {[134, 142].map((y, i) => <path key={y} className={i ? 'v3-drift2' : 'v3-drift'} d={`M${60 + i * 80} ${y} q8 -3 16 0 t16 0`} stroke="#FFD9A0" strokeWidth="1.4" fill="none" opacity=".45" strokeLinecap="round" />)}
    <g stroke="#2E2A55" strokeWidth="1.2" fill="none" strokeLinecap="round"><path d="M230 40 q3 -3 6 0 q3 -3 6 0" /><path d="M248 50 q2 -2 4 0 q2 -2 4 0" /></g>
  </>);
}

export const ART: Record<SceneId, (n: boolean) => React.ReactElement> = {
  meadow: n => <Meadow night={n} />, sea: n => <Sea night={n} />, mountains: n => <Mountains night={n} />, forest: () => <Forest />,
  backwaters: n => <Backwaters night={n} />, rain: () => <Rain />, lotus: n => <Lotus night={n} />, stars: () => <StarryHills />,
  himalaya: () => <Himalaya />, desert: () => <Desert />, temple: () => <Temple />,
};

/** The app has been opened this many times on this device. It moves on by one each time and walks through the places. */
let opens = (() => { try { const n = Number(localStorage.getItem('saathi.v3.view') ?? '-1') + 1; localStorage.setItem('saathi.v3.view', String(n)); return n; } catch { return Math.floor(Math.random() * 100); } })();

export function Scene({ mood, height = 150 }: { mood: number | null; height?: number }) {
  const [extra, setExtra] = useState(0);
  const hour = new Date().getHours();
  // ?scene=desert shows that place (for trying them out); it still moves on when tapped.
  const asked = new URLSearchParams(location.search).get('scene');
  const id = asked && isSceneId(asked) && extra === 0 ? asked : sceneFor({ hour, mood, n: opens + extra });
  const name = SCENE_NAMES[id];
  const night = isDark(hour);
  return (
    <button onClick={() => setExtra(n => n + 1)} data-track="home.view" aria-label={`${name}. Show another view`} style={s(`position:relative;display:block;width:100%;height:${height}px;padding:0;border:none;border-radius:28px;overflow:hidden;background:#DDE7E2;box-shadow:0 10px 26px rgba(30,36,48,.08)`)}>
      <svg key={id} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0, animation: 'kFade 700ms' }}>{ART[id](night)}</svg>
      <span style={s('position:absolute;left:14px;bottom:12px;padding:5px 12px;border-radius:14px;background:rgba(255,255,255,.88);color:#1E2430;font-size:13px;font-weight:600')}>{name}</span>
      <span aria-hidden="true" style={s('position:absolute;right:14px;bottom:12px;padding:5px 12px;border-radius:14px;background:rgba(255,255,255,.88);color:#1E2430;font-size:13px;font-weight:600')}>Another view</span>
    </button>
  );
}
