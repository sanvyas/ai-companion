import { PLANT_KINDS, SLOTS_BY_STAGE } from '@saathi/domain';
import type { Garden } from '../api';

// The garden, drawn from what the server says the person has done. A layered landscape (sky, far hills, meadow, the garden itself,
// out-of-focus foreground) lit from the upper right. Everything here is fixed artwork built from numbers and our own colours;
// nothing a person typed is ever put into the markup (the one image, a rangoli they made, is a data URL that the server only
// accepts as a small JPEG).

export type SkyPhase = 'day' | 'golden' | 'night';
export const skyPhase = (d: Date = new Date()): SkyPhase => { const h = d.getHours(); return h >= 19 || h < 6 ? 'night' : h >= 17 ? 'golden' : 'day'; };

/** The scene is drawn 390 wide and 440 tall; the top is cropped so the garden, not the sky, fills the picture. */
export const VB = { w: 390, y0: 44, h: 396 } as const;

export interface IslandModel {
  garden: Garden;
  night: boolean;
  /** Things that just grew, so they can pop in: tree, journal, talk, calm, sleep, house, out, pot, plant. */
  fresh: string[];
  /** The latest rangoli they made, if any. */
  creation: string | null;
}

/** Weather-of-the-day colours for the flowers in the journal bed. Index is the mood value 0 (heaviest) to 4. */
const FLOWER = ['#7F9BD6', '#F2A25E', '#B79BE0', '#F08FA6', '#F2CF45'];
const PLANT_COLOR: Record<string, string> = { marigold: '#F5A21A', sunflower: '#F7C816', jasmine: '#FFFFFF', mango: '#F5A524', banyan: '#3A9049' };

/** Perspective: things lower on the screen are nearer, so they are drawn larger. */
export const sc = (y: number) => .5 + (y - 250) * .0046;

// Where each place stands (the point on the ground it touches). Plots sit in the clear spaces between them.
export const AT = { tree: [236, 290], bench: [266, 328], sleep: [66, 326], house: [54, 288], beds: [98, 384], herbs: [338, 330], pond: [298, 386], gate: [198, 258], path: [196, 440] } as const;
const SLOTS: [number, number][] = [[122, 314], [150, 346], [238, 352], [348, 354], [326, 298], [22, 350], [98, 342], [24, 308]];
/** Where the bird perches for each place (its feet). */
export const PERCH = { tree: [212, 226], sleep: [66, 278], calm: [256, 372], journal: [150, 372], talk: [266, 304], plan: [338, 308], out: [198, 238], house: [54, 262], home: [266, 304] } as const;

/** What each part of the garden is and how it speaks when touched; hit areas are in scene coordinates. */
export const SPOTS = {
  tree: { x: 236, y: 226, w: 130, h: 150 },
  house: { x: 54, y: 266, w: 60, h: 56 },
  sleep: { x: 66, y: 296, w: 64, h: 56 },
  talk: { x: 266, y: 314, w: 66, h: 40 },
  plan: { x: 338, y: 314, w: 66, h: 40 },
  journal: { x: 98, y: 368, w: 140, h: 52 },
  calm: { x: 298, y: 372, w: 140, h: 50 },
  out: { x: 198, y: 236, w: 72, h: 62 },
} as const;
export type SpotKey = keyof typeof SPOTS;

const POT_COL = ['#C98B5B', '#B9737F', '#8CA3B8'];
const POT_BODY = 'M92 92Q70 130 78 190Q84 240 120 262Q150 272 180 262Q216 240 222 190Q230 130 208 92Z';
const CRACKS = ['M150 80L138 108L158 130L141 160', 'M104 122L128 142L117 172L141 192', 'M200 120L177 144L190 174L167 198', 'M92 192L119 207L112 236', 'M216 186L190 212L201 240', 'M150 198L163 224L148 250L158 264'];
const TCOL = ['#E9A23B', '#D9667F', '#5FB5A6', '#8C7CE0', '#7DB85E', '#F0C557'];
export const CONS = [
  { n: 'The Peacock', l: 'Spread wide, it was always beautiful.', pts: [[70, 250], [60, 190], [85, 140], [130, 105], [175, 100], [215, 125], [240, 170], [235, 225]] },
  { n: 'The Lantern', l: 'One small light is enough to walk by.', closed: true, pts: [[160, 50], [125, 95], [125, 165], [160, 205], [195, 165], [195, 95]] },
  { n: 'The Boat', l: 'Carried, even when you are tired.', pts: [[50, 200], [90, 242], [230, 242], [270, 200], [160, 200], [160, 90], [222, 190]] },
  { n: 'The Lotus', l: 'It grew through the mud, and opened anyway.', pts: [[160, 245], [112, 205], [88, 145], [126, 172], [160, 100], [194, 172], [232, 145], [208, 205]] },
  { n: 'The Bird', l: 'It was never far from you.', pts: [[55, 165], [108, 122], [160, 152], [212, 112], [265, 155], [205, 175], [160, 225], [118, 175]] },
  { n: 'The Diya', l: 'Lit once, it lights a hundred more.', pts: [[80, 205], [120, 240], [200, 240], [240, 205], [160, 205], [160, 150], [176, 108], [150, 66]] },
] as { n: string; l: string; closed?: boolean; pts: number[][] }[];

function rng(seed: number) { let s = seed || 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const n1 = (v: number) => v.toFixed(1);
const n0 = (v: number) => v.toFixed(0);

/** A smooth ribbon (the path) through points [x, y, width]. */
function ribbon(pts: number[][]): string {
  const L = pts.map(p => [p[0] - p[2] / 2, p[1]]), R = pts.map(p => [p[0] + p[2] / 2, p[1]]);
  const side = (a: number[][]) => a.slice(1, -1).map((p, i) => `Q${n1(p[0])} ${n1(p[1])} ${n1((p[0] + a[i + 2][0]) / 2)} ${n1((p[1] + a[i + 2][1]) / 2)}`).join('');
  const back = R.slice().reverse();
  return `M${n1(L[0][0])} ${n1(L[0][1])}${side(L)}L${n1(L[L.length - 1][0])} ${n1(L[L.length - 1][1])}L${n1(back[0][0])} ${n1(back[0][1])}${side(back)}L${n1(R[0][0])} ${n1(R[0][1])}Z`;
}
const PATH_PTS = [[199, 256, 8], [204, 276, 14], [192, 300, 22], [176, 326, 30], [190, 356, 42], [186, 392, 58], [196, 440, 84]];

export function islandSVG(m: IslandModel): string {
  const { garden: g, night: NT } = m;
  const isF = (k: string) => m.fresh.includes(k);
  const G = (k: string, inner: string) => `<g${isF(k) ? ' class="grow"' : ''}>${inner}</g>`;
  const D = <T,>(day: T, night: T) => (NT ? night : day);
  let uid = 0;
  const at = (x: number, y: number, inner: string, k = 1) => `<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(sc(y) * k)})">${inner}</g>`;
  const shadow = (rx: number, ry = rx * .26, o = .26) => `<ellipse cx="${n1(-rx * .22)}" cy="2" rx="${n1(rx)}" ry="${n1(ry)}" fill="${D('#1F3D2A', '#050B18')}" opacity="${o}"/>`;

  const P = {
    grassTop: D('#BBD88A', '#2F6A62'), grassMid: D('#9CC579', '#265A55'), grassLow: D('#78AA68', '#1D4A4B'),
    can: D(['#2F7440', '#4C9B50', '#8CC96A', '#C5E69A'], ['#17453F', '#24655A', '#3C8E7A', '#6CBDA2']),
    trunk: D(['#6A4630', '#8B5F40', '#A87952'], ['#2D2438', '#41344D', '#5B4A66']),
    wood: D(['#8F6240', '#B9885A', '#D8AE80'], ['#3D3048', '#5A4660', '#7B6483']),
    soil: D(['#7A5238', '#93664A'], ['#2B2030', '#3A2C40']),
    stone: D(['#BDB19B', '#D9CFB9', '#EDE5D2'], ['#5B5F7E', '#7A7F9F', '#9AA0BF']),
    sand: D(['#E7D6AE', '#F1E4C0'], ['#6E6E8E', '#8A8AA8']),
    leaf: D('#4C9645', '#2F7A5E'),
  };

  function defs() {
    const lg = (id: string, a: string, b: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    return `<defs>${lg('sGround', P.grassTop, P.grassLow)}
<radialGradient id="sCan" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="${P.can[1]}"/><stop offset="1" stop-color="${P.can[0]}"/></radialGradient>
<radialGradient id="sPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${D('#FFF3B8', '#8FD3C0')}" stop-opacity="${D('.55', '.18')}"/><stop offset="1" stop-color="${D('#FFF3B8', '#8FD3C0')}" stop-opacity="0"/></radialGradient>
<radialGradient id="sGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9A0" stop-opacity=".95"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>
${lg('sWater', D('#A9D8E4', '#4E6FA8'), D('#5FA3BC', '#2A3F78'))}${lg('sWood', P.wood[2], P.wood[0])}${lg('sSoil', P.soil[1], P.soil[0])}
<filter id="sBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.7"/></filter><filter id="sBlur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.4"/></filter></defs>`;
  }

  /** A canopy of leaves: dark body, a lit upper-right side, a few highlights and a scatter of leaf marks. Origin at the middle. */
  function canopy(R: number, seed: number, dense = 1) {
    const id = `cp${uid++}`, r = rng(seed);
    const bl = [[0, 0, 1], [-.72, .28, .72], [.74, .24, .74], [-.34, -.56, .68], [.4, -.52, .64], [-1, .5, .46], [1.02, .5, .48], [0, -.92, .5]];
    const c = (b: number[], k = 1, dx = 0, dy = 0) => `<circle cx="${n1(b[0] * R + dx)}" cy="${n1(b[1] * R + dy)}" r="${n1(b[2] * R * k)}"/>`;
    let o = `<clipPath id="${id}">${bl.map(b => c(b)).join('')}</clipPath>`;
    o += `<g fill="${P.can[0]}">${bl.map(b => c(b, 1, 0, R * .1)).join('')}</g><g fill="url(#sCan)">${bl.map(b => c(b)).join('')}</g>`;
    o += `<g clip-path="url(#${id})"><g fill="${P.can[2]}" opacity=".55">${bl.map(b => c(b, .82, R * .24, -R * .24)).join('')}</g><g fill="${P.can[3]}" opacity=".5">${bl.slice(0, 5).map(b => c(b, .42, R * .4, -R * .42)).join('')}</g><ellipse cx="${n1(-R * .45)}" cy="${n1(R * .78)}" rx="${n1(R * 1.1)}" ry="${n1(R * .55)}" fill="${P.can[0]}" opacity=".5"/>`;
    for (let i = 0; i < Math.round(26 * dense); i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R * 1.3, x = Math.cos(a) * d, y = Math.sin(a) * d * .8 - R * .1, lit = x - y > 0; o += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(R * .09)}" ry="${n1(R * .05)}" transform="rotate(${n0(r() * 180)} ${n1(x)} ${n1(y)})" fill="${lit ? P.can[3] : P.can[0]}" opacity="${n1(.35 + r() * .35)}"/>`; }
    o += '</g>';
    return o;
  }

  function treeSprite(lv: number, lantern: boolean) {
    const tw = [3, 5, 7, 9, 11][lv], th = [16, 32, 50, 66, 80][lv], R = [0, 17, 25, 33, 41][lv];
    let o = `<ellipse cx="${n1(-R * .5)}" cy="3" rx="${n1(20 + R * 1.9)}" ry="${n1(6 + R * .32)}" fill="${D('#1F3D2A', '#050B18')}" opacity=".3"/>`;
    o += `<path d="M${-tw * 1.5} 2Q${-tw * .6} -4 ${-tw * .55} ${-th * .4}Q${-tw * .45} ${-th * .8} ${-tw * .4} ${-th}L${tw * .4} ${-th}Q${tw * .5} ${-th * .7} ${tw * .6} ${-th * .4}Q${tw * .6} -4 ${tw * 1.6} 2Z" fill="${P.trunk[1]}"/>`;
    o += `<path d="M${tw * .15} 2Q${tw * .5} ${-th * .45} ${tw * .1} ${-th}L${tw * .4} ${-th}Q${tw * .5} ${-th * .7} ${tw * .6} ${-th * .4}Q${tw * .6} -4 ${tw * 1.6} 2Z" fill="${P.trunk[2]}" opacity=".7"/><path d="M${-tw * 1.5} 2Q${-tw * .6} -4 ${-tw * .55} ${-th * .4}L${-tw * .2} ${-th * .4}Q${-tw * .1} -6 ${-tw * .3} 2Z" fill="${P.trunk[0]}" opacity=".7"/>`;
    if (lv >= 2) o += `<path d="M0 ${-th * .55}Q${-R * .5} ${-th * .75} ${-R * .8} ${-th - R * .2}M0 ${-th * .6}Q${R * .5} ${-th * .8} ${R * .8} ${-th - R * .1}" stroke="${P.trunk[1]}" stroke-width="${n1(tw * .55)}" fill="none" stroke-linecap="round"/>`;
    if (lv === 0) return `${o}<g class="sway" style="transform-origin:0 0"><path d="M0 ${-th}Q-12 ${-th - 6} -14 ${-th - 2}Q-8 ${-th + 5} 0 ${-th}Z" fill="${P.can[1]}"/><path d="M0 ${-th}Q12 ${-th - 10} 15 ${-th - 5}Q9 ${-th + 3} 0 ${-th}Z" fill="${P.can[2]}"/></g>`;
    const cy = -th - R * .55;
    let can = `<g class="leafy" style="transform-origin:0 ${-th}px"><g transform="translate(0 ${n1(cy)})">${canopy(R, 5 + lv, lv >= 3 ? 1 : .7)}`;
    if (lv === 4) { const r = rng(5); for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * R * 1.05; can += `<circle cx="${n1(Math.cos(a) * d)}" cy="${n1(Math.sin(a) * d * .8)}" r="2.3" fill="#FBD2DC"/>`; } }
    if (lantern) can += `<g class="chm" style="transform-origin:${n1(R * .75)}px ${n1(R * .6)}px"><path d="M${n1(R * .75)} ${n1(R * .5)}v10" stroke="#6b4a2b" stroke-width="1.2"/><rect x="${n1(R * .75 - 5)}" y="${n1(R * .5 + 10)}" width="10" height="14" rx="4" fill="#FFC857"/><circle cx="${n1(R * .75)}" cy="${n1(R * .5 + 17)}" r="12" fill="url(#sGlow)"/></g>`;
    can += '</g></g>';
    return o + can;
  }

  const bushSprite = (r: number) => `${shadow(26)}<g transform="translate(0 -12)">${canopy(r, 9, .5)}</g>`;

  function bloom(c: string, sz: number, i: number) {
    const rr = rng(i + 3);
    let p = '';
    for (let a = 0; a < 6; a++) p += `<ellipse cx="0" cy="-${n1(sz * .6)}" rx="${n1(sz * .36)}" ry="${n1(sz * .58)}" transform="rotate(${a * 60 + n0(rr() * 10)})"/>`;
    return `<g fill="${c}" stroke="rgba(40,20,20,.12)" stroke-width=".5">${p}</g><g fill="#fff" opacity=".28"><ellipse cx="${n1(-sz * .15)}" cy="${n1(-sz * .85)}" rx="${n1(sz * .18)}" ry="${n1(sz * .3)}"/></g><circle r="${n1(sz * .3)}" fill="#F7D463"/><circle cx="${n1(sz * .08)}" cy="${n1(-sz * .06)}" r="${n1(sz * .12)}" fill="#C98A1D" opacity=".6"/>`;
  }
  function flowerAt(x: number, y: number, c: string, sz: number, i: number, cls = '') {
    const h = sz * 2.3, lean = (i % 3 - 1) * 2.4;
    return `<g${cls ? ` class="${cls}"` : ''}><g class="sway" style="transform-origin:${n1(x)}px ${n1(y)}px;animation-delay:-${n1((i % 7) * .55)}s"><path d="M${n1(x)} ${n1(y)}Q${n1(x + lean)} ${n1(y - h * .5)} ${n1(x + lean * .5)} ${n1(y - h)}" stroke="${P.leaf}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M${n1(x)} ${n1(y - h * .35)}q${i % 2 ? 7 : -7} -5 ${i % 2 ? 11 : -11} -1q${i % 2 ? -5 : 5} 5 ${i % 2 ? -11 : 11} 1z" fill="${D('#5DAE50', '#3F9170')}"/><g transform="translate(${n1(x + lean * .5)} ${n1(y - h)})">${bloom(c, sz, i)}</g></g></g>`;
  }

  /** A raised bed in perspective: wooden sides, dark soil. */
  function bedShape(hw: number, d: number) {
    const top = `M${-hw + 8} ${-d}L${hw - 8} ${-d}L${hw + 6} ${d}L${-hw - 6} ${d}Z`;
    return `${shadow(hw + 6, d * .7, .22)}<path d="M${-hw - 6} ${d}L${hw + 6} ${d}L${hw + 6} ${d + 10}L${-hw - 6} ${d + 10}Z" fill="url(#sWood)"/><path d="M${-hw - 6} ${d}L${hw + 6} ${d}" stroke="${P.wood[2]}" stroke-width="1.5"/><path d="M${-hw / 2} ${d + 1}v9M${hw / 2} ${d + 1}v9" stroke="${P.wood[0]}" stroke-width="1" opacity=".5"/><path d="${top}" fill="url(#sSoil)" stroke="${P.wood[1]}" stroke-width="3" stroke-linejoin="round"/><path d="M${-hw + 14} ${-d + 5}Q0 ${-d + 9} ${hw - 14} ${-d + 5}" stroke="rgba(255,255,255,.1)" stroke-width="2" fill="none"/>`;
  }
  const ghostRing = (rx: number, ry: number, cls = 'ghost') => `<ellipse class="${cls}" cx="0" cy="0" rx="${rx}" ry="${ry}" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.85)" stroke-width="1.6" stroke-dasharray="4 5"/>`;

  function beds() {
    const list = g.flowers, n = g.counts.journal ?? 0, [bx, by] = AT.beds;
    if (!n && !list.length) return at(bx, by, ghostRing(54, 17), 1.1);
    const count = Math.max(1, Math.min(14, n || list.length)), hw = count <= 3 ? 30 : count <= 6 ? 42 : 54, d = count <= 3 ? 12 : 15, cols = count <= 3 ? count : count <= 6 ? 3 : 5, rows = Math.ceil(count / cols);
    const pts = Array.from({ length: count }, (_, i) => { const e = list[i - (count - list.length)]; const col = i % cols, row = Math.floor(i / cols), u = (col + .5) / Math.min(cols, count), v = (row + .5) / rows; return { x: (u - .5) * (hw * 1.6) + (row % 2 ? 5 : -3), y: -d * .45 + v * d * 1.4, c: FLOWER[e ?? (i * 3) % 5] ?? FLOWER[3], i }; }).sort((a, b) => a.y - b.y);
    let o = bedShape(hw, d);
    pts.forEach(p => { o += flowerAt(p.x, p.y, p.c, 8.5, p.i, isF('journal') && p.i === count - 1 ? 'grow' : ''); });
    return at(bx, by, o, 1.1);
  }

  function herbs() {
    const n = g.counts.plan ?? 0, [x, y] = AT.herbs;
    if (!n) return at(x, y, ghostRing(36, 12), 1);
    const spots = [[-22, -3], [10, -6], [-4, 5], [24, 3], [-30, 6], [6, 9]];
    let o = bedShape(36, 11);
    for (let i = 0; i < Math.min(6, n); i++) {
      const [sx, sy] = spots[i];
      o += `<g class="sway" style="transform-origin:${sx}px ${sy}px;animation-delay:-${n1(i * .4)}s"><g transform="translate(${sx} ${sy})"><circle cx="-5" cy="-7" r="6" fill="${D('#3F8F48', '#1F6A55')}"/><circle cx="5" cy="-8" r="6.5" fill="${D('#5BAF55', '#2F8A6A')}"/><circle cx="0" cy="-13" r="6" fill="${D('#86CB6A', '#4DAE88')}"/><circle cx="2" cy="-14" r="2.4" fill="#fff" opacity=".25"/>${n >= 4 && i < 2 ? '<circle cx="3" cy="-4" r="2.6" fill="#E5533D"/><circle cx="-6" cy="-3" r="2.2" fill="#E5533D"/>' : ''}</g></g>`;
    }
    return at(x, y, o, 1);
  }

  function pond() {
    const n = (g.counts.breathe ?? 0) + (g.counts.meditate ?? 0), [cx, cy] = AT.pond;
    if (!n) return at(cx, cy, ghostRing(60, 17), 1.1);
    let o = `<ellipse cx="0" cy="5" rx="66" ry="20" fill="${D('#1F3D2A', '#050B18')}" opacity=".25"/>`;
    const rr = rng(4);
    const blob = (rx: number, ry: number, j: number) => { let d = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, k = 1 + (rr() - .5) * j; d += `${i ? 'L' : 'M'}${n1(Math.cos(a) * rx * k)} ${n1(Math.sin(a) * ry * k)}`; } return d + 'Z'; };
    o += `<path d="${blob(64, 21, .06)}" fill="${P.stone[0]}" stroke="${P.stone[0]}" stroke-width="5" stroke-linejoin="round"/>`;
    for (let i = 0; i < 17; i++) { const a = i / 17 * 6.283 + .2, sx = Math.cos(a) * 63, sy = Math.sin(a) * 20.5, back = sy < 0; o += `<ellipse cx="${n1(sx)}" cy="${n1(sy + (back ? 0 : 1.5))}" rx="${n1(6 + (i % 3) * 1.6)}" ry="${n1(3.4 + (i % 2) * .7)}" fill="${P.stone[i % 2 ? 1 : 2]}" stroke="${P.stone[0]}" stroke-width=".6"/>`; }
    o += `<ellipse cx="0" cy="0" rx="54" ry="16" fill="url(#sWater)"/><ellipse cx="-12" cy="-6" rx="30" ry="5" fill="#fff" opacity=".32"/><ellipse cx="22" cy="4" rx="16" ry="3" fill="#fff" opacity=".18"/>`;
    const r2 = rng(3);
    for (let i = 0; i < 8; i++) { const a = r2() * 6.28, d = .3 + r2() * .6; o += `<ellipse cx="${n1(Math.cos(a) * 46 * d)}" cy="${n1(Math.sin(a) * 13 * d)}" rx="3" ry="1" fill="#fff" opacity=".45"/>`; }
    o += `<ellipse class="rip" cx="12" cy="2" rx="14" ry="4.5" fill="none" stroke="#fff" stroke-width="1.4"/><ellipse class="rip" style="animation-delay:-2s" cx="-18" cy="3" rx="12" ry="4" fill="none" stroke="#fff" stroke-width="1.2"/>`;
    const pads = [[-30, 1], [24, -5], [4, 7], [-10, -7], [34, 5], [-38, 6], [14, 9], [-2, -1]];
    for (let p = 0; p < Math.min(pads.length, n); p++) {
      const [px, py] = pads[p], last = p === Math.min(pads.length, n) - 1;
      o += G(isF('calm') && last ? 'calm' : '-', `<ellipse cx="${px}" cy="${py + 1.5}" rx="9" ry="3.4" fill="${D('#2F7D3F', '#14503F')}"/><ellipse cx="${px}" cy="${py}" rx="9" ry="3.4" fill="${D('#6CC067', '#2F8A6A')}"/><path d="M${px} ${py}l7-1.4" stroke="${D('#3E9A4B', '#1F6A55')}" stroke-width="1"/>`);
    }
    for (let l = 0; l < Math.min(3, Math.floor(n / 3)); l++) { const lp = pads[l * 2 + 1]; o += G(isF('calm') && l === Math.min(3, Math.floor(n / 3)) - 1 && n % 3 === 0 ? 'calm' : '-', `<g transform="translate(${lp[0]} ${lp[1] - 3})"><path d="M0 0c-7-1-10-7-7-12 5 1 7 6 7 12zM0 0c7-1 10-7 7-12-5 1-7 6-7 12z" fill="#F29BB0"/><path d="M0 0c-3-5-3-10 0-14 3 4 3 9 0 14z" fill="#FBCFDA"/><circle cy="-3" r="2" fill="#FFD36B"/></g>`); }
    for (let bt = 0; bt < Math.min(3, g.boats); bt++) { const bx = -26 + bt * 24, by = 6 - bt * 5; o += `<g class="drift" style="animation-delay:-${bt * 2.5}s"><path d="M${bx - 7} ${by}h14l-3 4h-8z" fill="#fff"/><path d="M${bx} ${by - 9}v9h-6z" fill="#F7F3EA"/><path d="M${bx} ${by - 7}v7h5z" fill="#E2D9C2"/></g>`; }
    if (g.visitors.kingfisher) o += `<g transform="translate(46 -9)"><ellipse rx="6" ry="5" fill="#2F9CC4"/><ellipse cx="1" cy="2" rx="3.5" ry="3" fill="#F2A55E"/><circle cx="3" cy="-1.5" r="1.2" fill="#111"/><path d="M5 -1l8 1-8 2z" fill="#222"/></g>`;
    return at(cx, cy, o, 1.1);
  }

  const benchSprite = () => `${shadow(34, 8, .26)}<g><rect x="-26" y="-9" width="4" height="11" rx="1" fill="${P.wood[0]}"/><rect x="22" y="-9" width="4" height="11" rx="1" fill="${P.wood[0]}"/><path d="M-30 -17h60l-3 9h-54z" fill="${P.wood[1]}"/><path d="M-30 -17h60v2.4h-60z" fill="${P.wood[2]}"/><path d="M-28 -25h56v6h-56z" fill="${P.wood[1]}"/><path d="M-28 -25h56v2h-56z" fill="${P.wood[2]}"/><rect x="-25" y="-31" width="4" height="14" rx="1" fill="${P.wood[0]}"/><rect x="21" y="-31" width="4" height="14" rx="1" fill="${P.wood[0]}"/><path d="M-26 -34h52v5h-52z" fill="${P.wood[1]}"/><path d="M-26 -34h52v1.8h-52z" fill="${P.wood[2]}"/></g>`;

  function nook() {
    const n = g.counts.sleep ?? 0, [x, y] = AT.sleep;
    if (!n) return at(x, y, ghostRing(30, 10), 1);
    let o = `${shadow(32, 9)}<ellipse cx="0" cy="3" rx="32" ry="10" fill="${D('#3B3F86', '#1A1D4A')}"/><ellipse cx="0" cy="0" rx="32" ry="10" fill="${D('#5A5FB5', '#383C8A')}"/><ellipse cx="0" cy="0" rx="23" ry="6.5" fill="none" stroke="#FFD36B" stroke-width="1.1" stroke-dasharray="2 4"/>`;
    o += `<ellipse cx="7" cy="-3" rx="11" ry="5.5" fill="#F29BB0"/><ellipse cx="7" cy="-6" rx="9" ry="3.6" fill="#F9C9D3"/>`;
    o += `<path d="M-24 2V-38" stroke="#6b4a2b" stroke-width="2.4" stroke-linecap="round"/><circle cx="-24" cy="-44" r="18" fill="url(#sGlow)" class="flick"/><path d="M-24 -52a9 9 0 1 0 0 18a7 7 0 1 1 0-18z" fill="#FFE08A"/>`;
    return at(x, y, G(isF('sleep') ? 'sleep' : '-', o), 1);
  }

  function house() {
    const n = g.seeds.planted, [x, y] = AT.house;
    if (!n) return at(x, y, `<g class="ghost"><path d="M-30 0v-26l30-16l30 16v26z" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.85)" stroke-width="1.6" stroke-dasharray="4 5" stroke-linejoin="round"/></g>`, 1);
    let sp = '';
    for (let i = 0; i < Math.min(3, n); i++) { const sx = -16 + i * 16, grown = i < g.seeds.sprouted; sp += `<path d="M${sx} -1v-${grown ? 13 : 5}" stroke="#3E9A4B" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="${sx - 4}" cy="${-(grown ? 14 : 6)}" rx="4.4" ry="2.3" fill="#7BCB66"/><ellipse cx="${sx + 4}" cy="${-(grown ? 17 : 8)}" rx="4.4" ry="2.3" fill="#5DB85A"/>`; }
    const glass = D('#D8EEF0', '#2B4A78'), frame = D('#F6F1E4', '#8C86A8');
    const o = `${shadow(38, 9, .24)}<path d="M-30 0V-28L0 -44L30 -28V0Z" fill="${glass}" opacity=".78"/><path d="M-30 0V-28L0 -44L30 -28V0Z" fill="none" stroke="${frame}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-10 0V-36M10 0V-36M-30 -14H30M0 -44V0" stroke="${frame}" stroke-width="1.2" opacity=".9"/><path d="M-26 -30L-4 -42" stroke="#fff" stroke-width="2.4" opacity=".5" stroke-linecap="round"/>${sp}`;
    return at(x, y, G(isF('house') ? 'house' : '-', o), 1);
  }

  function gate() {
    const st = (g.counts.walk ?? 0) + (g.counts.event ?? 0), [x, y] = AT.gate;
    let o = '';
    const arch = `${shadow(32, 6, .22)}<rect x="-27" y="-34" width="5" height="36" rx="2" fill="${P.wood[0]}"/><rect x="22" y="-34" width="5" height="36" rx="2" fill="${P.wood[0]}"/><rect x="-23" y="-34" width="1.6" height="36" fill="${P.wood[2]}" opacity=".6"/><path d="M-32 -35Q0 -48 32 -35" stroke="${P.wood[1]}" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M-32 -37Q0 -50 32 -37" stroke="${P.wood[2]}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>`;
    let gar = '';
    for (let k = 0; k < 11; k++) { const t = k / 10, gx = -26 + t * 52, gy = -36 + Math.sin(t * Math.PI) * -9 + Math.sin(t * Math.PI) * 11; gar += `<circle cx="${n1(gx)}" cy="${n1(gy + 4)}" r="3.2" fill="${k % 2 ? '#F5A21A' : '#E8751A'}"/><circle cx="${n1(gx - .8)}" cy="${n1(gy + 3)}" r="1.1" fill="#fff" opacity=".35"/>`; }
    o += at(x, y, arch + gar + `<path d="M-22 -2Q0 -10 22 -2" stroke="${P.sand[0]}" stroke-width="2" fill="none" opacity=".0"/>`, 1);
    // Stepping stones along the path: one for each walk.
    const stones = [[190, 396], [182, 366], [176, 340], [188, 318], [200, 298]];
    for (let i = 0; i < Math.min(5, st); i++) { const [sx, sy] = stones[i]; o += at(sx, sy, G(isF('out') && i === Math.min(5, st) - 1 ? 'out' : '-', `<ellipse cx="0" cy="2" rx="12" ry="4.4" fill="${P.stone[0]}"/><ellipse cx="0" cy="0" rx="12" ry="4.4" fill="${P.stone[1]}"/><ellipse cx="-3" cy="-1" rx="7" ry="2" fill="#fff" opacity=".3"/>`), 1); }
    return o;
  }

  function rangoli() {
    const [x, y] = [214, 424];
    if (m.creation) return at(x, y, `<clipPath id="rgc"><circle r="21"/></clipPath><g transform="scale(1,.46)"><circle r="24" fill="#fff" opacity=".6"/><image href="${m.creation}" x="-21" y="-21" width="42" height="42" clip-path="url(#rgc)"/></g>`, 1.1);
    if ((g.counts.event ?? 0) > 0) return at(x, y, `<g transform="scale(1,.46)"><circle r="22" fill="#fff" opacity=".6"/><circle r="17" fill="#F29BB0"/><circle r="12" fill="#FFD36B"/><circle r="7" fill="#7DBFE0"/><circle r="3" fill="#fff"/></g>`, 1.1);
    return '';
  }

  function visitors() {
    const v = g.visitors, cols = ['#F29BB8', '#F6C34A', '#86AEEA'];
    let o = '';
    for (let i = 0; i < Math.min(2, v.butterflies); i++) { const bx = 140 + i * 110, by = 330 + (i % 2) * 14; o += `<g class="flit" style="animation-delay:-${i * 1.7}s;animation-duration:${6 + i}s"><g transform="translate(${bx} ${by})"><g class="wing"><ellipse cx="-4.5" cy="-2" rx="5" ry="3.8" fill="${cols[i]}"/><ellipse cx="4.5" cy="-2" rx="5" ry="3.8" fill="${cols[i]}"/><ellipse cx="-3.4" cy="-2" rx="2" ry="1.6" fill="#fff" opacity=".4"/></g><ellipse cx="0" cy="0" rx="1" ry="3.2" fill="#463"/></g></g>`; }
    if (v.bulbul) o += '<g transform="translate(262 214)"><ellipse rx="7" ry="5.5" fill="#6B5B4B"/><ellipse cx="2" cy="2" rx="4" ry="3" fill="#E9DCC6"/><circle cx="5" cy="-2" r="1.2" fill="#111"/><path d="M8 -2l5 1-5 2z" fill="#F4A62E"/><path d="M-6 1l-8 3 8-0z" fill="#6B5B4B"/></g>';
    if (v.squirrel) o += at(176, 344, '<ellipse rx="7" ry="5" fill="#B9763F"/><circle cx="6" cy="-4" r="3.8" fill="#B9763F"/><path d="M-6 -1c-10-2-12-14-4-16 3 5 2 9 4 12z" fill="#D18F55"/><circle cx="7" cy="-4.6" r="1.1" fill="#111"/>', 1);
    return o;
  }

  function potMini(x: number, y: number, n: number, pots: number) {
    const s = .2, col = POT_COL[pots % 3];
    let o = `<g transform="translate(${-150 * s} ${-272 * s}) scale(${s})"><ellipse cx="150" cy="276" rx="86" ry="12" fill="rgba(0,0,0,.2)"/><ellipse cx="150" cy="92" rx="64" ry="15" fill="${col}"/><path d="${POT_BODY}" fill="${col}"/><clipPath id="pcm"><path d="${POT_BODY}"/></clipPath><g clip-path="url(#pcm)" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
    CRACKS.forEach((d, i) => { o += `<path d="${d}" stroke="${i < n ? '#F7C948' : 'rgba(50,25,10,.5)'}" stroke-width="${i < n ? 9 : 5}"/>`; });
    return at(x, y, G(isF('pot') ? 'pot' : '-', `${o}</g></g>`), 1.1);
  }

  /** A string of flags from the greenhouse to the tree: one for each kept flag. */
  function bunting(n: number) {
    const A = [60, 246], B = [226, 214], mx = (A[0] + B[0]) / 2, my = Math.max(A[1], B[1]) + 26;
    let o = `<path d="M${A[0]} ${A[1]}Q${mx} ${my} ${B[0]} ${B[1]}" stroke="${D('#6b4a2b', '#2D2438')}" stroke-width="1.2" fill="none"/>`;
    for (let i = 0; i < Math.min(8, n); i++) { const t = (i + .7) / (Math.min(8, n) + .4), x = (1 - t) * (1 - t) * A[0] + 2 * t * (1 - t) * mx + t * t * B[0], y = (1 - t) * (1 - t) * A[1] + 2 * t * (1 - t) * my + t * t * B[1]; o += `<path d="M${n1(x - 5.5)} ${n1(y)}h11l-5.5 12z" fill="${TCOL[i % 6]}"/>`; }
    return o;
  }

  function plant(p: Garden['plants'][number], last: boolean) {
    const kind = PLANT_KINDS.find(k => k.id === p.kind);
    if (!kind) return '';
    const gr = p.growth, [x, y] = SLOTS[p.slot] ?? SLOTS[0], ready = p.ready, c = PLANT_COLOR[p.kind] ?? '#fff';
    let o = '';
    if (kind.kind === 'flower') {
      const n = p.kind === 'marigold' ? 3 : 1, h = 9 + gr * (p.kind === 'sunflower' ? 40 : 26);
      o += shadow(15, 4, .24);
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 12, hh = h * (1 - Math.abs(i - (n - 1) / 2) * .15), by = -hh;
        o += `<g class="sway" style="transform-origin:${dx}px 0;animation-delay:-${n1(i * .7)}s"><path d="M${dx} 0Q${dx + 2} ${-hh * .5} ${dx} ${by}" stroke="${P.leaf}" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="${dx + 5}" cy="${-hh * .4}" rx="5" ry="2.4" fill="${D('#5DAE50', '#3F9170')}" transform="rotate(-25 ${dx + 5} ${-hh * .4})"/><ellipse cx="${dx - 5}" cy="${-hh * .22}" rx="4.6" ry="2.2" fill="${D('#4C9645', '#2F7A5E')}" transform="rotate(25 ${dx - 5} ${-hh * .22})"/>`;
        if (gr >= .3) {
          const r = 3 + Math.min(1, (gr - .3) / .7) * (p.kind === 'sunflower' ? 9 : 5.6);
          let petals = '';
          for (let k = 0; k < (p.kind === 'jasmine' ? 5 : 11); k++) petals += `<ellipse cx="0" cy="-${n1(r * .8)}" rx="${n1(r * .4)}" ry="${n1(r * .7)}" transform="rotate(${k * (p.kind === 'jasmine' ? 72 : 33)})"/>`;
          o += `<g transform="translate(${dx} ${by})" fill="${c}" stroke="rgba(0,0,0,.14)" stroke-width=".5">${petals}<circle r="${n1(r * .45)}" fill="${p.kind === 'sunflower' ? '#5A3318' : p.kind === 'jasmine' ? '#FFE08A' : '#B8520C'}" stroke="none"/><circle cx="${n1(-r * .12)}" cy="${n1(-r * .12)}" r="${n1(r * .16)}" fill="#fff" opacity=".3" stroke="none"/></g>`;
        }
        o += '</g>';
      }
    } else {
      const lv = gr < .2 ? 0 : gr < .5 ? 1 : gr < 1 ? 2 : 3, sc2 = p.kind === 'banyan' ? .56 : .5;
      o += `<g transform="scale(${sc2})">${treeSprite(Math.min(4, lv + (p.kind === 'banyan' && lv === 3 ? 1 : 0)), false)}</g>`;
      if (ready && p.kind === 'mango') [[-10, -50], [8, -58], [-1, -42], [14, -46]].forEach(q => { o += `<ellipse cx="${q[0]}" cy="${q[1]}" rx="3.6" ry="4.6" fill="#F5A524" stroke="#C97A0E" stroke-width=".6"/>`; });
    }
    if (ready) o += `<circle cx="0" cy="-22" r="26" fill="url(#sGlow)" class="flick"/>`;
    return at(x, y, G(isF('plant') && last ? 'plant' : '-', o), 1);
  }

  // ----- the ground -----
  function ground() {
    const r = rng(11);
    let o = `<path d="M-10 262C50 250 100 258 160 254S300 248 400 260V452H-10Z" fill="url(#sGround)"/>`;
    o += `<ellipse cx="290" cy="336" rx="240" ry="120" fill="url(#sPool)"/>`;
    o += `<ellipse cx="90" cy="420" rx="170" ry="60" fill="${P.grassLow}" opacity=".35"/><ellipse cx="320" cy="270" rx="120" ry="14" fill="${P.grassTop}" opacity=".5"/>`;
    // Soft broad patches of light and shade across the lawn, so it reads as ground rather than one flat colour.
    o += `<g filter="url(#sBlur2)"><ellipse cx="70" cy="300" rx="90" ry="22" fill="${D('#E6F2A8', '#4C9C8A')}" opacity=".5"/><ellipse cx="340" cy="360" rx="80" ry="20" fill="${D('#E6F2A8', '#4C9C8A')}" opacity=".45"/><ellipse cx="150" cy="395" rx="110" ry="18" fill="${D('#5E9A5C', '#143C40')}" opacity=".35"/><ellipse cx="30" cy="350" rx="60" ry="14" fill="${D('#5E9A5C', '#143C40')}" opacity=".3"/><ellipse cx="250" cy="274" rx="120" ry="9" fill="${D('#FFF6C0', '#7FD2C0')}" opacity=".4"/></g>`;
    // The tree's shade falls to the lower left.
    o += `<ellipse cx="212" cy="298" rx="100" ry="19" fill="${D('#1F3D2A', '#050B18')}" opacity=".16" transform="rotate(-4 212 298)"/>`;
    // The path to the gate.
    o += `<path d="${ribbon(PATH_PTS.map(p => [p[0] + 3, p[1] + 3, p[2] + 4]))}" fill="${P.grassLow}" opacity=".55"/><path d="${ribbon(PATH_PTS)}" fill="${P.sand[0]}"/><path d="${ribbon(PATH_PTS.map(p => [p[0] - 1, p[1], p[2] * .6]))}" fill="${P.sand[1]}" opacity=".8"/>`;
    for (let i = 0; i < 26; i++) { const t = r(), py = 262 + t * 176, w = (8 + t * 76) * .7, px = 196 + Math.sin(t * 5) * 8 + (r() - .5) * w; o += `<ellipse cx="${n0(px)}" cy="${n0(py)}" rx="${n1(1 + r() * 2.2 * sc(py))}" ry="${n1(.5 + r() * 1.1)}" fill="${P.stone[0]}" opacity=".55"/>`; }
    // Tufts and tiny wildflowers, small in the distance and larger near.
    const tuft = (x: number, y: number, k: number) => { const s = sc(y) * k; return `<path d="M${n1(x - 4 * s)} ${n1(y)}q${n1(1 * s)} ${n1(-8 * s)} ${n1(3 * s)} ${n1(-11 * s)}q${n1(1 * s)} ${n1(5 * s)} ${n1(-1 * s)} ${n1(11 * s)}M${n1(x)} ${n1(y)}q${n1(2 * s)} ${n1(-10 * s)} ${n1(6 * s)} ${n1(-13 * s)}q${n1(0)} ${n1(7 * s)} ${n1(-3 * s)} ${n1(13 * s)}" stroke="${D('#6AA05C', '#58B49A')}" stroke-width="${n1(1.6 * s)}" fill="none" stroke-linecap="round" opacity=".9"/>`; };
    const tf: number[][] = [];
    for (let j = 0; j < 70; j++) tf.push([r() * 400 - 5, 262 + Math.pow(r(), .8) * 180, 1]);
    tf.sort((a, b) => a[1] - b[1]);
    tf.forEach(([x, y, k]) => { if (Math.abs(x - 196) < (8 + (y - 256) * .33)) return; o += tuft(x, y, k); });
    const wf = rng(17);
    for (let j = 0; j < 46; j++) { const x = wf() * 390, y = 266 + Math.pow(wf(), .85) * 170, s = sc(y); if (Math.abs(x - 196) < (8 + (y - 256) * .32)) continue; o += `<g transform="translate(${n0(x)} ${n0(y)})"><circle r="${n1(2 * s)}" fill="${['#fff', '#FBE38A', '#F4B6C6', '#CFC4F4'][j % 4]}" opacity=".9"/><circle r="${n1(.7 * s)}" fill="#E9B94A"/></g>`; }
    return o;
  }

  /** Hedge and distant trees behind the garden, closing the back of the meadow. */
  function backdrop() {
    let o = '';
    const spots: [number, number, number][] = [[-8, 262, 36], [30, 258, 30], [92, 256, 24], [140, 256, 20], [262, 254, 22], [318, 256, 28], [370, 260, 38], [410, 262, 34]];
    spots.forEach(([x, y, R], i) => { o += `<g transform="translate(${x} ${y})">${shadow(R * 1.1, 4, .2)}<g transform="translate(0 ${-R * .45})">${canopy(R, 31 + i, .6)}</g></g>`; });
    return o;
  }

  function foreground() {
    const r = rng(41);
    const blade = (x: number, h: number, lean: number, col: string) => `<path d="M${x - 3.5} 436Q${n1(x + lean * .4)} ${n1(436 - h * .55)} ${n1(x + lean)} ${n1(436 - h)}Q${n1(x + lean * .5 + 3)} ${n1(436 - h * .5)} ${x + 3.5} 436Z" fill="${col}"/>`;
    const cols = D(['#3F7A45', '#2F6A3C', '#52904F'], ['#17453F', '#0F342F', '#245A50']);
    let o = '<g filter="url(#sBlur)">';
    for (let i = 0; i < 12; i++) o += blade(-6 + i * 3.4 + r() * 3, 30 + r() * 52, (r() - .3) * 20, cols[i % 3]);
    for (let i = 0; i < 12; i++) o += blade(350 + i * 3.6 + r() * 3, 30 + r() * 56, (r() - .7) * 20, cols[(i + 1) % 3]);
    o += '</g>';
    o += `<g filter="url(#sBlur2)" opacity=".85"><circle cx="20" cy="392" r="15" fill="#F29BB0"/><circle cx="20" cy="392" r="5" fill="#F7D463"/><path d="M20 406V440" stroke="${cols[0]}" stroke-width="5"/><circle cx="372" cy="398" r="12" fill="#F6C34A"/><circle cx="372" cy="398" r="4" fill="#C98A1D"/><path d="M372 410V440" stroke="${cols[0]}" stroke-width="5"/></g>`;
    return o;
  }

  /** A little tilled patch for each free plot (the first three), so an empty plot looks like somewhere to plant. */
  function plots() {
    let o = '';
    Array.from({ length: g.slots }, (_, i) => i).filter(i => !g.plants.some(p => p.slot === i)).slice(0, 3).forEach(i => {
      const [x, y] = SLOTS[i] ?? SLOTS[0];
      o += at(x, y, `<ellipse cx="0" cy="2.5" rx="19" ry="6.6" fill="${D('#1F3D2A', '#050B18')}" opacity=".22"/><ellipse cx="0" cy="0" rx="17" ry="5.8" fill="${D('#9C6E4C', '#4A3556')}"/><ellipse cx="0" cy="-.8" rx="14" ry="4.2" fill="url(#sSoil)"/><ellipse cx="-3" cy="-1.6" rx="9" ry="1.8" fill="#fff" opacity=".12"/>${[[-17, 0], [-12, 4], [-4, 6], [5, 6], [13, 4], [17, 0], [12, -4], [-12, -4]].map(q => `<ellipse cx="${q[0]}" cy="${q[1]}" rx="2.6" ry="1.5" fill="${P.stone[1]}"/>`).join('')}<g class="sway" style="transform-origin:0 0"><path d="M0 -1Q.6 -6 0 -9" stroke="${D('#8CCB6C', '#6FD0A8')}" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="-3" cy="-9" rx="3.4" ry="1.7" fill="${D('#A6DC84', '#86E0B8')}" transform="rotate(-25 -3 -9)"/><ellipse cx="3" cy="-10" rx="3.4" ry="1.7" fill="${D('#8CCB6C', '#6FD0A8')}" transform="rotate(25 3 -10)"/></g><ellipse class="ghost" cx="0" cy="-2" rx="9" ry="9" fill="url(#sGlow)" opacity=".5"/>`, 1);
    });
    return o;
  }

  const st = g.stage;
  let o = defs() + backdrop() + ground();
  if (st >= 4) { const rr = rng(21); for (let i = 0; i < 14; i++) { const x = 20 + rr() * 350, y = 276 + rr() * 150; if (Math.abs(x - 196) < 40) continue; o += at(x, y, `<circle r="2.6" fill="${['#F29BB8', '#FFD36B', '#fff'][i % 3]}"/>`, 1); } }
  // Back to front, so nearer things stand in front.
  o += house();
  o += gate();
  if (st >= 1) o += at(358, 312, bushSprite(26), 1) + at(24, 372, bushSprite(24), 1);
  if (g.keepsakes.flags > 0) o += bunting(g.keepsakes.flags);
  o += nook();
  o += at(AT.tree[0], AT.tree[1], G(isF('tree') ? 'tree' : '-', treeSprite(g.treeLevel, (g.counts.talk ?? 0) >= 2)), 1.3);
  o += plots();
  o += herbs();
  o += at(AT.bench[0], AT.bench[1], G(isF('talk') ? 'talk' : '-', benchSprite()), 1);
  if (st >= 2) o += [[168, 346], [226, 352]].map(([lx, ly]) => at(lx, ly, `${shadow(9, 3, .22)}<rect x="-2.5" y="-24" width="5" height="24" rx="1.5" fill="${P.stone[0]}"/><rect x="-6" y="-34" width="12" height="11" rx="3.5" fill="${D('#F0DEA8', '#FFD98A')}"/><circle cy="-28" r="12" fill="url(#sGlow)" class="flick"/>`, 1)).join('');
  if (g.keepsakes.potSeams > 0 || g.keepsakes.pots > 0) o += potMini(130, 372, g.keepsakes.potSeams, g.keepsakes.pots);
  const byY = [...g.plants].sort((a, b) => (SLOTS[a.slot]?.[1] ?? 0) - (SLOTS[b.slot]?.[1] ?? 0));
  const newest = g.plants.length ? g.plants[g.plants.length - 1].id : '';
  o += byY.map(p => plant(p, p.id === newest)).join('');
  o += pond();
  o += beds();
  o += rangoli();
  o += visitors();
  o += foreground();
  if (m.fresh.length) {
    const key = m.fresh[0] as keyof typeof PERCH;
    const p = PERCH[key] ?? [195, 300];
    let sp = '';
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; sp += `<circle cx="${p[0]}" cy="${p[1] - 14}" r="2.8" fill="#FFD36B" style="--dx:${n0(Math.cos(a) * 32)}px;--dy:${n0(Math.sin(a) * 26 - 12)}px"/>`; }
    o += `<g class="spark">${sp}</g>`;
  }
  return `<svg viewBox="0 ${VB.y0} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${o}</svg>`;
}

/** Sky, sun or moon, far hills with a temple, and clouds behind the garden. */
export function skySVG(phase: SkyPhase, grey: boolean, skies: number[]): string {
  const night = phase === 'night', gold = phase === 'golden';
  let o = `<svg viewBox="0 ${VB.y0} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">`;
  const far = night ? '#2A3770' : gold ? '#D9A58E' : grey ? '#A9BDC0' : '#B7D0C3', mid = night ? '#22305F' : gold ? '#C99483' : grey ? '#98B0B0' : '#9CC3A9', near = night ? '#1B2850' : gold ? '#B7836F' : grey ? '#86A09E' : '#86B493';
  if (night) {
    const r = rng(9);
    o += '<defs><radialGradient id="mG"><stop offset="0" stop-color="#FFF6D6" stop-opacity=".55"/><stop offset=".5" stop-color="#BFD0FF" stop-opacity=".18"/><stop offset="1" stop-color="#BFD0FF" stop-opacity="0"/></radialGradient></defs>';
    for (let i = 0; i < 46; i++) o += `<circle class="st" cx="${n0(r() * 390)}" cy="${n0(48 + r() * 170)}" r="${n1(.5 + r() * 1.3)}" fill="#fff" style="animation-delay:-${n1(r() * 3)}s"/>`;
    const cpos = [[14, 150], [92, 168], [236, 150], [322, 160], [8, 196], [330, 190]];
    skies.slice(-6).forEach((ci, k) => {
      const cn = CONS[ci % CONS.length], ps = cpos[k % 6], sc2 = .16;
      const pp = cn.pts.map(q => [ps[0] + q[0] * sc2, ps[1] + q[1] * sc2]);
      o += `<g opacity=".85">${pp.map((q, j) => (j ? `<line x1="${n1(pp[j - 1][0])}" y1="${n1(pp[j - 1][1])}" x2="${n1(q[0])}" y2="${n1(q[1])}" stroke="#FFE9A0" stroke-width=".9" opacity=".7"/>` : '')).join('')}${pp.map(q => `<circle cx="${n1(q[0])}" cy="${n1(q[1])}" r="1.8" fill="#FFF6D0"/>`).join('')}</g>`;
    });
    o += '<circle cx="312" cy="150" r="80" fill="url(#mG)"/><circle cx="312" cy="150" r="22" fill="#FFF6DA"/><circle cx="305" cy="144" r="3.6" fill="#E8DDB8" opacity=".7"/><circle cx="318" cy="157" r="2.6" fill="#E8DDB8" opacity=".6"/><circle cx="316" cy="141" r="2" fill="#E8DDB8" opacity=".6"/>';
  } else if (!grey) {
    const sx = gold ? 92 : 318, sy = gold ? 214 : 150;
    o += `<defs><radialGradient id="sunG"><stop offset="0" stop-color="#FFF4C4" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE9A8" stop-opacity=".5"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient></defs><circle cx="${sx}" cy="${sy}" r="${gold ? 120 : 110}" fill="url(#sunG)"/><circle cx="${sx}" cy="${sy}" r="${gold ? 24 : 19}" fill="${gold ? '#FFD9A0' : '#FFF3B8'}"/>`;
  }
  const hazeId = night ? '#5A6AB0' : gold ? '#FFD9B8' : '#EAF3E6';
  o += `<defs><linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hazeId}" stop-opacity="0"/><stop offset="1" stop-color="${hazeId}" stop-opacity=".9"/></linearGradient></defs>`;
  // Far hills, a temple on the farthest, then nearer, darker hills; haze between them gives depth.
  o += `<path d="M-10 228C40 196 90 204 140 220C190 190 250 196 300 214C340 196 376 206 400 214V300H-10Z" fill="${far}"/>`;
  const tc = night ? '#3A4888' : gold ? '#C99483' : '#A5C0B4';
  o += `<g transform="translate(298 196)" fill="${tc}"><rect x="-9" y="6" width="18" height="12"/><path d="M-8 6L-6 -4L-4 -10L-2 -16L0 -22L2 -16L4 -10L6 -4L8 6Z"/><rect x="-0.8" y="-30" width="1.6" height="9"/><path d="M0 -30l7 2.4l-7 2.4z"/></g>`;
  o += `<g fill="${tc}" opacity=".8"><circle cx="262" cy="214" r="9"/><circle cx="276" cy="212" r="7"/><circle cx="332" cy="214" r="8"/><circle cx="60" cy="226" r="8"/><circle cx="74" cy="223" r="10"/><circle cx="170" cy="216" r="7"/></g>`;
  o += `<rect x="0" y="200" width="390" height="70" fill="url(#hz)"/>`;
  o += `<path d="M-10 250C30 226 80 232 124 244C176 222 240 228 290 242C334 228 372 234 400 242V300H-10Z" fill="${mid}"/><g fill="${mid}"><circle cx="30" cy="238" r="11"/><circle cx="44" cy="236" r="9"/><circle cx="352" cy="238" r="11"/><circle cx="338" cy="240" r="8"/></g>`;
  o += `<rect x="0" y="228" width="390" height="50" fill="url(#hz)" opacity=".7"/>`;
  o += `<path d="M-10 262C40 244 100 250 150 258C210 242 280 246 400 258V300H-10Z" fill="${near}"/>`;
  if (!night) o += `<g class="bd" fill="none" stroke="${gold ? '#7A5A6A' : '#6F8696'}" stroke-width="1.6" stroke-linecap="round" opacity=".7"><path d="M40 120q5-5 10 0q5-5 10 0M72 106q4-4 8 0q4-4 8 0"/></g>`;
  const cc = night ? '#4C5C9E' : grey ? '#F2F6F7' : '#fff', co = night ? .4 : .9;
  const cloud = (x: number, y: number, s: number, c2: string) => `<g class="cl ${c2}" opacity="${co}"><g transform="translate(${x} ${y}) scale(${s})"><ellipse rx="40" ry="10" fill="${cc}"/><circle cx="-14" cy="-8" r="13" fill="${cc}"/><circle cx="6" cy="-13" r="17" fill="${cc}"/><circle cx="24" cy="-4" r="11" fill="${cc}"/></g></g>`;
  o += cloud(76, 156, 1, '') + cloud(262, 186, .8, 'c2') + cloud(180, 120, .6, 'c2') + (grey ? cloud(150, 96, 1.2, 'c2') + cloud(320, 110, .9, '') : '');
  return `${o}</svg>`;
}

export function weatherHTML(): string {
  let lv = '', pt = '';
  for (let i = 0; i < 9; i++) { lv += `<span style="left:${10 + i * 11}%;animation-delay:-${n1(i * .7)}s"></span>`; pt += `<span style="left:${6 + i * 11}%;animation-delay:-${n1(i * 1.1)}s"></span>`; }
  return `<div class="r1"></div><div class="ms"></div><div class="bm"></div><div class="lv">${lv}</div><div class="pt">${pt}</div>`;
}

/** Warm windows and fireflies for the night view. */
export function lightsSVG(g: Garden): string {
  const r = rng(33);
  let o = `<svg viewBox="0 ${VB.y0} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMax slice" style="width:100%;height:100%" aria-hidden="true" focusable="false"><defs><radialGradient id="wl"><stop offset="0" stop-color="#FFC970" stop-opacity=".85"/><stop offset="1" stop-color="#FFC970" stop-opacity="0"/></radialGradient></defs>`;
  const glows: number[][] = [[AT.sleep[0] - 22, AT.sleep[1] - 40, 30], [AT.gate[0], AT.gate[1] - 26, 30]];
  if (g.stage >= 2) glows.push([168, 322, 22], [226, 328, 22]);
  if (g.seeds.planted) glows.push([AT.house[0], AT.house[1] - 20, 30]);
  if ((g.counts.talk ?? 0) >= 2) glows.push([AT.tree[0] + 30, AT.tree[1] - 90, 22]);
  glows.forEach(q => { o += `<circle cx="${q[0]}" cy="${q[1]}" r="${q[2]}" fill="url(#wl)"/>`; });
  for (let i = 0; i < 12; i++) { const x = 40 + r() * 310, y = 270 + r() * 150; o += `<circle class="fire" cx="${n0(x)}" cy="${n0(y)}" r="${n1(1.6 + r() * 1.2)}" fill="#FFF3A8" style="animation-delay:-${n1(r() * 3)}s"/>`; }
  return `${o}</svg>`;
}

export { SLOTS, SLOTS_BY_STAGE };
