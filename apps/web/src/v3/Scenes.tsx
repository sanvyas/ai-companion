import { useRef, useState } from 'react';
import { s } from './css';
import { SCENE_NAMES, isDark, isSceneId, scenesFor, type SceneId } from './scenes';

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


/** A bird crossing the view, wings beating. */
const Bird = ({ y, delay = 0, dur = 18, k = 1 }: { y: number; delay?: number; dur?: number; k?: number }) => (
  <g className="m-fly" style={{ animationDuration: `${dur}s`, animationDelay: `${-delay}s` }}><g transform={`translate(0 ${y}) scale(${k})`}><path className="m-flap" d="M-7 0 q3.5 -5 7 0 q3.5 -5 7 0" stroke="#3B4560" strokeWidth="1.5" fill="none" strokeLinecap="round" /></g></g>
);
/** A butterfly wandering. */
const Butterfly = ({ c1, c2, cls = 'v3-fly' }: { c1: string; c2: string; cls?: string }) => (
  <g className={cls}><g><ellipse cx="-4" cy="0" rx="4" ry="5.5" fill={c1} className="v3-wing" /><ellipse cx="4" cy="0" rx="4" ry="5.5" fill={c2} className="v3-wing" /><rect x="-.8" y="-4" width="1.6" height="8" rx=".8" fill="#2A2E45" /></g></g>
);
/** Grass that sways. */
const Blades = ({ y, from = 0, to = W, n = 26, color = '#5E9A66' }: { y: number; from?: number; to?: number; n?: number; color?: string }) => (
  <>{Array.from({ length: n }, (_, i) => { const x = from + ((to - from) * (i + 0.5)) / n + ((i * 7) % 5); const h = 8 + ((i * 13) % 11); return <path key={i} className="v3-sway" d={`M${x} ${y} q-1 -${h / 2} 2 -${h}`} stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" style={{ animationDelay: `${-((i * 37) % 30) / 10}s` }} />; })}</>
);
/** Little lights floating about. */
const Fireflies = ({ pts, color = '#F7E58A' }: { pts: [number, number][]; color?: string }) => (
  <>{pts.map(([x, y], i) => <g key={i} className="m-firefly" style={{ animationDelay: `${-i * 1.3}s`, animationDuration: `${5 + (i % 3)}s` }}><circle cx={x} cy={y} r="2" fill={color} /><circle cx={x} cy={y} r="6" fill={color} opacity=".22" /></g>)}</>
);
const Leaves = ({ n = 5, color = '#E7A45B' }: { n?: number; color?: string }) => (
  <>{Array.from({ length: n }, (_, i) => <g key={i} className="m-leaf" style={{ animationDelay: `${-i * 1.9}s`, animationDuration: `${8 + (i % 3)}s` }}><ellipse cx={30 + ((i * 67) % 290)} cy="-6" rx="4" ry="2.2" fill={color} transform="rotate(30)" /></g>)}</>
);
/** Ripples spreading on water. */
const Ripples = ({ pts, color = '#FFFFFF' }: { pts: [number, number][]; color?: string }) => (
  <>{pts.map(([x, y], i) => <ellipse key={i} className="v3-ripple" cx={x} cy={y} rx="16" ry="3.4" fill="none" stroke={color} strokeWidth="1.2" opacity=".6" style={{ animationDelay: `${-i * 0.8}s` }} />)}</>
);
/** Rows of small waves that keep rolling. */
const Waves = ({ rows, color = '#FFFFFF', op = 0.5 }: { rows: number[]; color?: string; op?: number }) => (
  <>{rows.map((y, i) => <g key={y} className={i % 2 ? 'm-wave m-wave2' : 'm-wave'} opacity={op - i * 0.04}><path d={`M-40 ${y} ${Array.from({ length: 24 }, () => 'q8 -4 16 0 t16 0').join(' ')}`} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" /></g>)}</>
);

function Meadow({ night }: { night: boolean }) {
  const spots: [number, number, string][] = [[34, 122, '#F27C9B'], [76, 130, '#F4C95D'], [120, 120, '#FFFFFF'], [168, 132, '#B7A6F0'], [214, 121, '#F27C9B'], [262, 130, '#F4C95D'], [306, 122, '#FFFFFF']];
  return (<>
    <Sky id={`sc-m${night ? 'n' : 'd'}`} a={night ? '#274B5A' : '#CBE6F2'} b={night ? '#3C7A74' : '#F6EBD3'} />
    {night && <Stars n={8} />}
    <Glow cx={274} cy={36} r={13} night={night} />
    <Cloud x={20} y={34} cls="m-cloud" /><Cloud x={-120} y={52} k={0.8} o={0.65} cls="m-cloud m-cloud2" />
    <Bird y={44} dur={22} /><Bird y={30} dur={30} delay={9} k={0.8} />
    <path d="M0 86 C50 60 100 74 150 80 C214 88 262 60 342 76 V150 H0z" fill="#C8E4C4" />
    <path d="M0 108 C60 88 120 102 180 104 C240 106 290 92 342 100 V150 H0z" fill="#A5D1AA" />
    <path d="M0 128 C70 114 140 124 210 122 C270 120 310 118 342 120 V150 H0z" fill="#82BA8B" />
    <Blades y={150} n={34} />
    {spots.map(([x, y, c], i) => <g key={i} className="v3-sway" style={{ animationDelay: `${-i * 0.6}s` }}><path d={`M${x} ${y} V${y + 18}`} stroke="#4E8F5C" strokeWidth="2" strokeLinecap="round" /><circle cx={x} cy={y} r="6" fill={c} /><circle cx={x} cy={y} r="2.4" fill="#FFF3D6" /></g>)}
    <Butterfly c1="#F2B33D" c2="#E8789B" /><Butterfly c1="#B7A6F0" c2="#7FD1C3" cls="v3-fly v3-fly2" />
  </>);
}

function Sea({ night }: { night: boolean }) {
  return (<>
    <Sky id={`sc-s${night ? 'n' : 'd'}`} a={night ? '#1F3F4A' : '#FAD9B8'} b={night ? '#3A6A78' : '#F6EEDB'} />
    {night && <Stars n={10} />}
    <Glow cx={230} cy={74} r={16} night={night} />
    <Cloud x={-100} y={34} cls="m-cloud" o={night ? 0.25 : 0.7} />
    <Bird y={36} dur={20} /><Bird y={52} dur={27} delay={8} k={0.85} />
    <rect y="74" width={W} height="76" fill={night ? '#2A5866' : '#8FC6D6'} />
    <rect y="74" width={W} height="26" fill={night ? '#3B7283' : '#F2D5A8'} opacity=".55" />
    {[0, 1, 2, 3, 4].map(i => <rect key={i} className="m-shimmer" x={206 + (i % 2) * 8 + i * 3} y={80 + i * 5} width={40 - i * 5} height="1.8" rx=".9" fill="#FFF3D6" style={{ animationDelay: `${-i * 0.5}s` }} />)}
    <Waves rows={[86, 98, 110, 122, 136]} />
    <g className="m-glide"><g className="v3-bob"><g transform="rotate(-2 106 74)"><path d="M96 72 L96 48 L118 70 Z" fill="#FFFFFF" /><path d="M94 72 H122 L116 78 H100 Z" fill={night ? '#9AA9B5' : '#C8744F'} /></g></g></g>
  </>);
}

function Mountains({ night }: { night: boolean }) {
  return (<>
    <Sky id={`sc-t${night ? 'n' : 'd'}`} a={night ? '#243A5C' : '#D8EAF4'} b={night ? '#4A6E8C' : '#F7EEDC'} />
    {night ? <Stars n={9} /> : <><Cloud x={-110} y={30} cls="m-cloud" /><Cloud x={-250} y={46} k={0.8} o={0.6} cls="m-cloud m-cloud2" /></>}
    <Glow cx={266} cy={34} r={11} night={night} />
    <Bird y={52} dur={24} /><Bird y={40} dur={32} delay={12} k={0.8} />
    <path d="M0 96 L60 40 L98 78 L150 28 L214 92 L262 56 L342 98 V104 H0z" fill={night ? '#5A7896' : '#A9C3D6'} />
    <path d="M150 28 L136 46 L150 40 L162 50z M60 40 L50 52 L60 48 L68 54z" fill="#FFFFFF" opacity=".9" />
    <path d="M0 108 L40 74 L88 100 L142 66 L196 104 L250 76 L342 110 V118 H0z" fill={night ? '#3C5A78' : '#7FA2BA'} />
    <g className="m-cloud m-cloud3" opacity=".5"><ellipse cx="-60" cy="100" rx="60" ry="6" fill="#FFFFFF" /></g>
    <rect y="104" width={W} height="46" fill={night ? '#2A4A68' : '#9CC9D6'} />
    <Waves rows={[116, 128, 140]} op={0.4} />
    {[0, 1, 2, 3].map(i => <rect key={i} className="m-shimmer" x={40 + i * 76} y={110 + (i % 2) * 8} width="26" height="1.8" rx=".9" fill="#FFFFFF" style={{ animationDelay: `${-i * 0.7}s` }} />)}
    {[[286, 112], [300, 118], [316, 112]].map(([x, y], i) => <path key={i} className="m-treesway" d={`M${x} ${y} l5 -16 l5 16z M${x + 1} ${y - 8} l4 -14 l4 14z`} fill={night ? '#2E5A4E' : '#4F8F62'} style={{ animationDelay: `${-i}s` }} />)}
  </>);
}

function Forest() {
  const trees: [number, number, number, string][] = [[24, 150, 70, '#4F8F62'], [70, 150, 96, '#3F7F55'], [130, 150, 64, '#5FA070'], [200, 150, 104, '#3A7650'], [256, 150, 74, '#4F8F62'], [312, 150, 92, '#3F7F55']];
  return (<>
    <Sky id="sc-f" a="#E6F2D6" b="#F6F0CF" />
    {[60, 150, 240].map((x, i) => <path key={x} className="m-beam" d={`M${x} 0 L${x + 38} 0 L${x + 6 - i * 14} 150 L${x - 40} 150z`} fill="#FFFFFF" opacity=".16" style={{ animationDelay: `${-i * 2}s` }} />)}
    <Bird y={26} dur={26} />
    {trees.map(([x, y, h, c], i) => <g key={i}><rect x={x - 3} y={y - h * 0.4} width="6" height={h * 0.4} fill="#6B4F3A" /><path className="m-treesway" d={`M${x} ${y - h} L${x + h * 0.26} ${y - h * 0.38} L${x - h * 0.26} ${y - h * 0.38}z M${x} ${y - h * 0.75} L${x + h * 0.32} ${y - h * 0.12} L${x - h * 0.32} ${y - h * 0.12}z`} fill={c} style={{ animationDelay: `${-i * 0.9}s` }} /></g>)}
    <path d="M150 150 Q168 124 196 112 Q214 104 232 100" stroke="#F1DDB8" strokeWidth="18" fill="none" strokeLinecap="round" opacity=".9" />
    <Blades y={150} n={28} color="#4E8F5C" />
    <Leaves n={6} /><Fireflies pts={[[50, 90], [110, 70], [170, 100], [236, 80], [292, 96], [330, 70]]} color="#FFF3A0" />
  </>);
}

function Backwaters({ night }: { night: boolean }) {
  const palm = (x: number, flip: number) => (<g transform={`translate(${x} 0) scale(${flip} 1)`}>
    <path d="M0 150 C6 120 10 96 4 66" stroke="#6B4F3A" strokeWidth="5" fill="none" strokeLinecap="round" />
    <g className="m-frond">{[[-24, -8], [-16, -18], [0, -22], [18, -14], [26, -2]].map(([dx, dy], i) => <path key={i} d={`M4 66 q${dx / 2} ${dy - 6} ${dx} ${dy + 10}`} stroke="#3F8A56" strokeWidth="5" fill="none" strokeLinecap="round" />)}</g>
  </g>);
  return (<>
    <Sky id={`sc-b${night ? 'n' : 'd'}`} a={night ? '#2A4A5E' : '#FBDDBF'} b={night ? '#3F7478' : '#DDEFE0'} />
    {night && <Stars n={8} />}
    <Glow cx={190} cy={52} r={13} night={night} />
    <Cloud x={-90} y={30} cls="m-cloud" o={night ? 0.2 : 0.7} />
    <Bird y={34} dur={22} /><Bird y={48} dur={30} delay={10} k={0.8} />
    <path d="M0 78 C60 70 110 80 170 76 C240 72 290 80 342 74 V150 H0z" fill={night ? '#2F6A62' : '#9FD0B0'} />
    <rect y="86" width={W} height="64" fill={night ? '#2B5C70' : '#8EC8D0'} />
    <Waves rows={[100, 118, 132, 144]} op={0.45} />
    {palm(26, 1)}{palm(318, -1)}
    <g className="m-glide m-glide2"><g className="v3-bob"><path d="M122 104 H196 L186 114 H132z" fill="#8A5A3C" /><path d="M134 104 q25 -26 52 0z" fill="#F0C75E" /><path d="M134 104 h52" stroke="#6B4F3A" strokeWidth="2" /></g></g>
  </>);
}

function Rain() {
  return (<>
    <Sky id="sc-r" a="#B9C9D6" b="#DCE6E4" />
    <g className="m-cloud m-cloud3" opacity=".95"><ellipse cx="-80" cy="30" rx="48" ry="16" fill="#8FA3B4" /><ellipse cx="-42" cy="22" rx="32" ry="14" fill="#8FA3B4" /></g>
    <g className="m-cloud m-cloud2" opacity=".9"><ellipse cx="-230" cy="38" rx="52" ry="16" fill="#9CB0C0" /><ellipse cx="-196" cy="28" rx="32" ry="13" fill="#9CB0C0" /></g>
    <path d="M0 108 C60 94 120 104 190 102 C250 100 300 94 342 98 V150 H0z" fill="#9CC7A8" />
    <path d="M0 126 C70 114 150 124 220 122 C270 120 310 116 342 120 V150 H0z" fill="#79B48B" />
    <Blades y={150} n={30} color="#5E9A66" />
    {Array.from({ length: 56 }, (_, i) => <path key={i} className="v3-rain" d={`M${6 + i * 6.2} ${(i * 17) % 70 + 20} l-3 10`} stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity=".75" style={{ animationDelay: `${-(i % 11) * 0.12}s` }} />)}
    <Ripples pts={[[70, 138], [180, 142], [270, 136], [120, 146]]} />
  </>);
}

function Lotus({ night }: { night: boolean }) {
  const flower = (x: number, y: number, k: number, d: number) => (<g transform={`translate(${x} ${y}) scale(${k})`}><g className="m-bloom" style={{ animationDelay: `${-d}s` }}>
    {[-40, -20, 0, 20, 40].map(a => <ellipse key={a} cx="0" cy="-9" rx="5.6" ry="11" fill={a === 0 ? '#F7B9CC' : '#F29BB6'} transform={`rotate(${a})`} />)}<circle r="3.4" fill="#F7D56B" /></g></g>);
  return (<>
    <Sky id={`sc-l${night ? 'n' : 'd'}`} a={night ? '#27485A' : '#F8DCCB'} b={night ? '#3A7478' : '#BFE0D6'} />
    {night && <Stars n={8} />}
    <Glow cx={64} cy={36} r={12} night={night} />
    <Cloud x={-90} y={26} cls="m-cloud" o={night ? 0.2 : 0.6} />
    <rect y="70" width={W} height="80" fill={night ? '#2B6068' : '#7DBFB5'} />
    <Waves rows={[84, 140]} op={0.3} />
    <Ripples pts={[[70, 118], [250, 112], [160, 140]]} />
    {[[40, 100, 36, 9], [120, 126, 40, 10], [206, 106, 34, 8], [284, 130, 42, 10], [160, 90, 24, 6], [320, 96, 28, 7]].map(([x, y, rx, ry], i) => <ellipse key={i} className="v3-bob" cx={x} cy={y} rx={rx} ry={ry} fill={night ? '#3E8A6C' : '#5FA67A'} style={{ animationDelay: `${-i * 0.7}s` }} />)}
    {flower(120, 122, 1.1, 0)}{flower(208, 102, 0.9, 1.6)}{flower(284, 126, 1.2, 3.1)}{flower(42, 98, 0.8, 2.2)}
    <g className="v3-fly v3-fly2"><g><ellipse cx="-4" cy="0" rx="4" ry="1.6" fill="#7FD1E3" className="v3-wing" /><ellipse cx="4" cy="0" rx="4" ry="1.6" fill="#7FD1E3" className="v3-wing" /><rect x="-5" y="-.7" width="10" height="1.4" rx=".7" fill="#2E6FA0" /></g></g>
  </>);
}

function StarryHills() {
  return (<>
    <Sky id="sc-n" a="#1B2F4D" b="#3B6F77" />
    <Stars n={22} />
    <path className="m-shoot" d="M0 0 L26 12" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
    <path className="m-shoot m-shoot2" d="M0 0 L22 10" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    <g className="m-cloud m-cloud3" opacity=".18"><ellipse cx="-70" cy="48" rx="50" ry="7" fill="#FFFFFF" /></g>
    <g className="v3-glow" style={{ transformOrigin: '270px 38px' }}><circle cx="270" cy="38" r="30" fill="#DCE8F5" opacity=".1" /><circle cx="270" cy="38" r="15" fill="#F6F1DA" /><circle cx="263" cy="34" r="13" fill="#25405E" /></g>
    <path d="M0 98 C60 74 110 90 170 88 C230 86 280 70 342 84 V150 H0z" fill="#2C5A66" />
    <path d="M0 124 C70 104 140 118 210 116 C270 114 310 104 342 110 V150 H0z" fill="#1F4650" />
    <Blades y={150} n={30} color="#2F6A60" />
    <Fireflies pts={[[60, 108], [112, 124], [214, 112], [286, 126], [168, 130], [250, 100], [30, 130], [330, 112]]} />
  </>);
}

function Himalaya() {
  const flags = ['#E8584A', '#F4C95D', '#FFFFFF', '#4E9F7A', '#3F6FB5'];
  return (<>
    <Sky id="sc-h" a="#BBD3EC" b="#F7C79F" />
    <g className="m-rays" style={{ transformOrigin: '178px 80px' }} opacity=".18">{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M178 80 L${178 + Math.cos((i * Math.PI) / 5) * 220} ${80 + Math.sin((i * Math.PI) / 5) * 220} L${178 + Math.cos(((i + 0.45) * Math.PI) / 5) * 220} ${80 + Math.sin(((i + 0.45) * Math.PI) / 5) * 220}z`} fill="#FFF3CF" />)}</g>
    <g className="v3-glow" style={{ transformOrigin: '178px 78px' }}><circle cx="178" cy="78" r="56" fill="#FFE7B8" opacity=".5" /><circle cx="178" cy="78" r="26" fill="#FFF3CF" opacity=".8" /><circle cx="178" cy="80" r="15" fill="#FFD27A" /></g>
    <path d="M0 92 L48 52 L82 78 L128 36 L176 88 L214 58 L262 30 L312 76 L342 62 V110 H0z" fill="#EAB7A8" />
    <path d="M128 36 L116 52 L128 46 L138 56z M262 30 L249 48 L262 42 L274 52z M48 52 L40 62 L48 58 L55 64z" fill="#FFFFFF" opacity=".95" />
    <path d="M0 112 L36 84 L74 104 L120 72 L170 108 L222 78 L270 104 L316 84 L342 100 V124 H0z" fill="#8C8DB8" />
    <g className="m-cloud m-cloud3" opacity=".55"><ellipse cx="-70" cy="108" rx="44" ry="7" fill="#FFFFFF" /></g>
    <g className="m-cloud m-cloud2" opacity=".5"><ellipse cx="-200" cy="116" rx="50" ry="8" fill="#FFFFFF" /></g>
    <path d="M0 128 C70 112 130 126 200 122 C260 118 310 112 342 118 V150 H0z" fill="#4C5B7C" />
    <path d="M14 130 V92 M326 118 V80" stroke="#2F3A55" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M14 94 Q170 114 326 82" stroke="#2F3A55" strokeWidth="1.2" fill="none" />
    {flags.map((c, i) => { const t = (i + 0.7) / (flags.length + 0.4); const x = 14 + t * 312; const y = 94 + Math.sin(t * Math.PI) * 14 - t * 12 + 2; return <path key={i} className="m-flag" d={`M${x} ${y} l9 0 l-1 11 l-8 0z`} fill={c} style={{ animationDelay: `${-i * 0.35}s` }} />; })}
    <Bird y={50} dur={20} /><Bird y={40} dur={28} delay={9} k={0.8} />
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
    <Bird y={44} dur={24} />
    <path d="M0 96 C60 80 120 96 190 90 C250 84 300 82 342 90 V150 H0z" fill="#EEC399" />
    <path d="M0 112 C70 92 140 110 210 106 C270 102 310 100 342 104 V150 H0z" fill="#DD9F72" />
    <g className="m-walk"><Camel x={0} y={101} k={1} /><Camel x={22} y={100} k={0.95} /><Camel x={44} y={101} k={0.9} /></g>
    <path d="M0 132 C80 112 150 130 220 124 C280 118 320 116 342 120 V150 H0z" fill="#BF7F55" />
    {[[40, 140], [120, 136], [210, 142], [290, 134]].map(([x, y], i) => <path key={i} d={`M${x} ${y} q10 -4 20 0`} stroke="#9F6342" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".7" />)}
    <g className="m-cloud m-cloud3" opacity=".3"><ellipse cx="-60" cy="122" rx="40" ry="5" fill="#FFF3DC" /></g>
    <g className="m-cloud m-cloud2" opacity=".25"><ellipse cx="-190" cy="134" rx="46" ry="5" fill="#FFF3DC" /></g>
    {[0, 1, 2].map(i => <rect key={i} className="m-shimmer" x={190 + i * 28} y={92 + i * 2} width="24" height="1.6" rx=".8" fill="#FFF3DC" style={{ animationDelay: `${-i * 0.8}s` }} />)}
  </>);
}

function Temple() {
  const tiers = [0, 1, 2, 3, 4, 5];
  return (<>
    <Sky id="sc-p" a="#4B4A86" b="#F5A874" />
    <circle className="v3-twinkle" cx="40" cy="22" r="1.5" fill="#FFFFFF" /><circle className="v3-twinkle" cx="300" cy="18" r="1.3" fill="#FFFFFF" style={{ animationDelay: '1s' }} /><circle className="v3-twinkle" cx="200" cy="12" r="1.2" fill="#FFFFFF" style={{ animationDelay: '2s' }} />
    <g className="m-cloud" opacity=".35"><ellipse cx="-80" cy="40" rx="40" ry="6" fill="#FFD9C0" /></g>
    <g className="v3-glow" style={{ transformOrigin: '70px 92px' }}><circle cx="70" cy="92" r="34" fill="#FFD9A0" opacity=".4" /><circle cx="70" cy="92" r="13" fill="#FFC27A" /></g>
    <g fill="#2E2A55">
      <path d="M0 108 C60 98 120 106 342 100 V150 H0z" fill="#3A3566" />
      <rect x="132" y="86" width="96" height="30" /><rect x="124" y="108" width="112" height="8" /><rect x="118" y="114" width="124" height="8" />
      {tiers.map(i => <path key={i} d={`M${180 - (46 - i * 7)} ${86 - i * 9} H${180 + (46 - i * 7)} L${180 + (40 - i * 7)} ${77 - i * 9} H${180 - (40 - i * 7)}z`} />)}
      <path d="M170 33 q10 -14 20 0 v6 h-20z" /><rect x="179" y="14" width="2.4" height="20" /><path className="m-flag" d="M181 14 l10 3 l-10 3z" fill="#F0A860" />
      <rect x="92" y="94" width="26" height="22" /><path d="M90 94 L105 76 L120 94z" /><rect x="242" y="94" width="26" height="22" /><path d="M240 94 L255 76 L270 94z" />
    </g>
    <path d="M170 116 v-14 q10 -12 20 0 v14z" fill="#F7B65E" />
    {[104, 150, 210, 256].map((x, i) => <g key={x} className="m-flicker" style={{ animationDelay: `${-i * 0.45}s` }}><circle cx={x} cy="124" r="7" fill="#FFC96B" opacity=".35" /><ellipse cx={x} cy="124" rx="2.2" ry="3.4" fill="#FFD983" /></g>)}
    <g className="m-smoke"><path d="M60 124 q-4 -8 0 -16 q4 -8 0 -16" stroke="#F6D9C4" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".55" /></g>
    <rect y="126" width={W} height="24" fill="#3B3868" /><rect y="126" width={W} height="24" fill="#F4A874" opacity=".22" />
    <Waves rows={[134, 142]} color="#FFD9A0" op={0.45} />
    <Bird y={44} dur={22} /><Bird y={56} dur={30} delay={11} k={0.8} />
  </>);
}

export const ART: Record<SceneId, (n: boolean) => React.ReactElement> = {
  meadow: n => <Meadow night={n} />, sea: n => <Sea night={n} />, mountains: n => <Mountains night={n} />, forest: () => <Forest />,
  backwaters: n => <Backwaters night={n} />, rain: () => <Rain />, lotus: n => <Lotus night={n} />, stars: () => <StarryHills />,
  himalaya: () => <Himalaya />, desert: () => <Desert />, temple: () => <Temple />,
};

/** The app has been opened this many times on this device. It moves on by one each time and walks through the places. */
let opens = (() => { try { const n = Number(localStorage.getItem('saathi.v3.view') ?? '-1') + 1; localStorage.setItem('saathi.v3.view', String(n)); return n; } catch { return Math.floor(Math.random() * 100); } })();

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function Scene({ mood, height = 150 }: { mood: number | null; height?: number }) {
  const [extra, setExtra] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [petals, setPetals] = useState<{ id: number; x: number }[]>([]);
  const down = useRef<number | null>(null);
  const hour = new Date().getHours();
  const pool = scenesFor({ hour, mood });
  // ?scene=desert shows that place first (for trying them out); the arrows and swiping carry on from there.
  const asked = new URLSearchParams(location.search).get('scene');
  const id: SceneId = asked && isSceneId(asked) && extra === 0 ? asked : pool[mod(opens + extra, pool.length)];
  const pos = Math.max(0, pool.indexOf(id));
  const name = SCENE_NAMES[id];
  const night = isDark(hour);
  const go = (d: 1 | -1) => { setDir(d); setExtra(n => n + d); };
  const sparkle = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const pid = Date.now();
    setPetals(p => [...p.slice(-2), { id: pid, x: ((clientX - r.left) / r.width) * 100 }]);
    setTimeout(() => setPetals(p => p.filter(q => q.id !== pid)), 1500);
  };
  const arrow = (d: 1 | -1) => (
    <button onClick={e => { e.stopPropagation(); go(d); }} aria-label={d === 1 ? 'Next view' : 'Previous view'} data-track={d === 1 ? 'home.view.next' : 'home.view.prev'} style={s(`position:absolute;${d === 1 ? 'right' : 'left'}:8px;top:50%;margin-top:-20px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.78);display:grid;place-items:center;box-shadow:0 4px 12px rgba(30,36,48,.15);padding:0`)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E2430" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d === 1 ? 'M9 5 L16 12 L9 19' : 'M15 5 L8 12 L15 19'} /></svg>
    </button>
  );
  return (
    <div role="group" aria-roledescription="carousel" aria-label={`${name}. Swipe or use the arrows for another view`}
      onPointerDown={e => { down.current = e.clientX; }}
      onPointerUp={e => { if (down.current === null) return; const dx = e.clientX - down.current; down.current = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); else if (!(e.target as HTMLElement).closest('button')) sparkle(e.clientX, e.currentTarget); }}
      onPointerCancel={() => { down.current = null; }}
      style={s(`position:relative;width:100%;height:${height}px;border-radius:28px;overflow:hidden;background:#DDE7E2;box-shadow:0 10px 26px rgba(30,36,48,.08);touch-action:pan-y;user-select:none`)}>
      <svg key={`${id}-${extra}`} className={dir === 1 ? 'm-slide-next' : 'm-slide-prev'} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0 }}>{ART[id](night)}</svg>
      {petals.map(p => <span key={p.id} aria-hidden="true" className="v3-petal" style={{ left: `${p.x}%`, bottom: 28, ['--dx' as string]: `${(p.x % 2 ? 1 : -1) * 22}px`, background: '#F7C948' }} />)}
      {arrow(-1)}{arrow(1)}
      <div aria-hidden="true" style={s('position:absolute;left:0;right:0;top:10px;display:flex;justify-content:center;gap:5px')}>
        {pool.map((_, i) => <span key={i} style={{ width: i === pos ? 16 : 6, height: 6, borderRadius: 3, background: '#FFFFFF', opacity: i === pos ? 0.95 : 0.55, boxShadow: '0 1px 3px rgba(30,36,48,.25)', transition: 'width 240ms, opacity 240ms' }} />)}
      </div>
      <span style={s('position:absolute;left:50%;transform:translateX(-50%);bottom:10px;padding:5px 14px;border-radius:14px;background:rgba(255,255,255,.88);color:#1E2430;font-size:13px;font-weight:600;white-space:nowrap')}>{name}</span>
    </div>
  );
}
