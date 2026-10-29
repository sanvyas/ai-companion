import { PLANT_KINDS, SLOTS_BY_STAGE } from '@saathi/domain';
import type { Garden } from '../api';

// The garden island, drawn from what the server says the person has done. Everything here is fixed artwork built from numbers
// and our own colours; nothing a person typed is ever put into the markup (the one image, a rangoli they made, is a data URL that
// the server only accepts as a small JPEG).

export type SkyPhase = 'day' | 'golden' | 'night';
export const skyPhase = (d: Date = new Date()): SkyPhase => { const h = d.getHours(); return h >= 19 || h < 6 ? 'night' : h >= 17 ? 'golden' : 'day'; };

export interface IslandModel {
  garden: Garden;
  night: boolean;
  /** Things that just grew, so they can pop in: tree, journal, talk, calm, sleep, house, out, pot, plant. */
  fresh: string[];
  /** The latest rangoli they made, if any. */
  creation: string | null;
}

/** Weather-of-the-day colours for the flowers in the journal bed. Index is the mood value 0 (heaviest) to 4. */
const FLOWER = ['#7F9BD6', '#F2A25E', '#B79BE0', '#F3A6B8', '#F0D84F'];
const PLANT_COLOR: Record<string, string> = { marigold: '#FFB11F', sunflower: '#FFD21F', jasmine: '#FFFFFF', mango: '#F5A524', banyan: '#3A9049' };
const SLOTS: [number, number][] = [[150, 148], [234, 150], [170, 124], [300, 150], [238, 198], [96, 200], [120, 176], [276, 122]];
export const AT = { tree: [196, 96], sleep: [118, 124], calm: [262, 122], beds: [124, 174], bench: [190, 170], herbs: [278, 178], gate: [196, 242], house: [58, 154] } as const;
/** Where the bird perches for each place, and where its label pin sits. */
export const PERCH = { tree: [170, 104], sleep: [150, 128], calm: [222, 142], journal: [142, 194], talk: [184, 176], plan: [244, 190], out: [196, 226], house: [96, 164], home: [184, 176] } as const;
const POT_COL = ['#C98B5B', '#B9737F', '#8CA3B8'];
const POT_BODY = 'M92 92Q70 130 78 190Q84 240 120 262Q150 272 180 262Q216 240 222 190Q230 130 208 92Z';
const CRACKS = ['M150 80L138 108L158 130L141 160', 'M104 122L128 142L117 172L141 192', 'M200 120L177 144L190 174L167 198', 'M92 192L119 207L112 236', 'M216 186L190 212L201 240', 'M150 198L163 224L148 250L158 264'];
const TCOL = ['#F29A2E', '#E4577E', '#4FB3A5', '#7A6BE0', '#6DB35A', '#F2C14E'];
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

export function islandSVG(m: IslandModel): string {
  const { garden: g, night: NT } = m;
  const isF = (k: string) => m.fresh.includes(k);
  const G = (k: string, inner: string) => `<g${isF(k) ? ' class="grow"' : ''}>${inner}</g>`;
  const dia = (cx: number, cy: number, hw: number, hh: number, a: string) => `<path d="M${cx} ${cy - hh}L${cx + hw} ${cy}L${cx} ${cy + hh}L${cx - hw} ${cy}Z" ${a}/>`;
  const shd = (x: number, y: number, rx: number, ry: number, o = .2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${NT ? '#0c1a2e' : '#1d3b22'}" opacity="${o}"/>`;

  function defs() {
    const P = NT
      ? { t: ['#5A9C8E', '#2E6B66'], l: ['#5D4F82', '#2A2347'], r: ['#6F5E94', '#31284F'], w: ['#5C93CC', '#244B8E'], s: ['#7A5560', '#523A47'], c1: ['#6CC3A8', '#237565'], c2: ['#58AE96', '#1B5E55'] }
      : { t: ['#C6E98A', '#84C86C'], l: ['#A27048', '#5A3A29'], r: ['#B8804F', '#6B4631'], w: ['#8FDCEE', '#48A5CC'], s: ['#A06E48', '#7E5435'], c1: ['#97DC72', '#3A9049'], c2: ['#7FCB63', '#2F7D3F'] };
    const lg = (id: string, p: string[]) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>`;
    const rg = (id: string, p: string[]) => `<radialGradient id="${id}" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></radialGradient>`;
    return `<defs>${lg('iTop', P.t)}${lg('iL', P.l)}${lg('iR', P.r)}${lg('iWater', P.w)}${lg('iSoil', P.s)}${rg('iCan', P.c1)}${rg('iCan2', P.c2)}<radialGradient id="iGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset="1" stop-color="#FFF3B0" stop-opacity="0"/></radialGradient></defs>`;
  }

  function base() {
    const r = rng(11);
    let o = shd(195, 336, 140, 14, .14);
    o += '<path d="M11 152L195 247V322C186 308 172 300 160 296C150 286 138 282 126 272C112 262 100 256 88 244C70 230 54 218 40 202C26 190 15 176 11 164Z" fill="url(#iL)"/>';
    o += '<path d="M379 152L195 247V322C204 308 218 300 230 296C240 286 252 282 264 272C278 262 290 256 302 244C320 230 336 218 350 202C364 190 375 176 379 164Z" fill="url(#iR)"/>';
    o += '<path d="M195 247V322" stroke="rgba(0,0,0,.16)" stroke-width="2"/>';
    o += '<path d="M22 172C70 204 130 228 190 258M60 208C106 236 150 262 190 290" stroke="rgba(0,0,0,.13)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    o += '<path d="M368 172C320 204 260 228 200 258M330 208C284 236 240 262 200 290" stroke="rgba(0,0,0,.13)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    for (let i = 0; i < 9; i++) { const side = i % 2 ? 1 : -1, px = 195 + side * (24 + r() * 120), py = 214 + r() * 50 - Math.abs(px - 195) * .12; o += `<ellipse cx="${n0(px)}" cy="${n0(py)}" rx="${n1(3 + r() * 4)}" ry="${n1(2 + r() * 3)}" fill="rgba(255,255,255,.13)"/>`; }
    o += '<ellipse cx="112" cy="300" rx="7" ry="5" fill="#8A5A3A"/><ellipse cx="282" cy="308" rx="6" ry="4.5" fill="#8A5A3A"/><ellipse cx="236" cy="330" rx="4" ry="3" fill="#8A5A3A"/>';
    o += dia(195, 152, 171, 85, `fill="url(#iTop)" stroke="${NT ? '#3F8077' : '#8BCB6E'}" stroke-width="14" stroke-linejoin="round"`);
    o += dia(195, 150, 150, 74, `fill="${NT ? '#8FD9C4' : '#DDF5A8'}" opacity="${NT ? '.16' : '.38'}" stroke="${NT ? '#8FD9C4' : '#DDF5A8'}" stroke-width="12" stroke-linejoin="round"`);
    o += `<path d="M24 150L195 64L366 150" fill="none" stroke="${NT ? 'rgba(190,235,255,.3)' : 'rgba(255,255,255,.35)'}" stroke-width="3" stroke-linecap="round"/>`;
    o += `<path d="M184 244Q192 222 189 198L205 198Q203 224 208 244Z" fill="${NT ? '#8C87AE' : '#EBDDB6'}" opacity=".9"/>`;
    for (let j = 0; j < 30; j++) {
      const u = r(), v = r(), x = 195 + (u - v) * 150, y = 152 + (u + v - 1) * 74;
      if (Math.abs(x - 195) / 150 + Math.abs(y - 152) / 74 > .92) continue;
      o += `<path d="M${n0(x - 3)} ${n0(y)}q1-6 3-8q1 4 0 8M${n0(x)} ${n0(y)}q2-7 5-9q0 5-1 9" stroke="${NT ? '#7FD6BA' : '#5FAE4F'}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/>`;
    }
    return o;
  }

  function bloom(x: number, y: number, c: string, sz: number, i: number, cls: string) {
    let p = '';
    for (let a = 0; a < 5; a++) p += `<ellipse cx="0" cy="-${n1(sz * .62)}" rx="${n1(sz * .4)}" ry="${n1(sz * .6)}" transform="rotate(${a * 72})"/>`;
    const h = sz * 1.9;
    return `<g${cls ? ` class="${cls}"` : ''}><g class="sway" style="transform-origin:${x}px ${y}px;animation-delay:-${n1((i % 7) * .5)}s"><path d="M${x} ${y}Q${x + (i % 2 ? 3 : -3)} ${y - h * .5} ${x} ${y - h}" stroke="#4A9645" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="${x + (i % 2 ? 4 : -4)}" cy="${y - h * .4}" rx="4" ry="2.2" fill="#5DAE50" transform="rotate(${i % 2 ? -30 : 30} ${x + (i % 2 ? 4 : -4)} ${y - h * .4})"/><g transform="translate(${x} ${y - h})" fill="${c}" stroke="rgba(0,0,0,.08)" stroke-width=".6">${p}<circle r="${n1(sz * .34)}" fill="#F8D96B" stroke="none"/></g></g></g>`;
  }

  function tree(x: number, y: number, lv: number, lantern: boolean, F: string) {
    const o = shd(x, y + 3, 12 + lv * 8, 4 + lv * 1.6, .22), s = [0, .55, .8, 1, 1.18][lv];
    const tw = [3, 5, 7, 10, 12][lv], th = [20, 30, 44, 58, 68][lv];
    const tr = `<path d="M${x - tw} ${y + 2}Q${x - tw * .35} ${y - th * .5} ${x - tw * .45} ${y - th}L${x + tw * .45} ${y - th}Q${x + tw * .35} ${y - th * .5} ${x + tw} ${y + 2}Z" fill="#7A4E30"/><path d="M${x + tw * .2} ${y + 2}Q${x + tw * .5} ${y - th * .5} ${x + tw * .1} ${y - th}L${x + tw * .45} ${y - th}Q${x + tw * .35} ${y - th * .5} ${x + tw} ${y + 2}Z" fill="#5E3A22" opacity=".55"/>`;
    let can = '';
    if (lv === 0) {
      can = `<g class="sway" style="transform-origin:${x}px ${y}px"><ellipse cx="${x - 6}" cy="${y - th - 2}" rx="7" ry="3.5" fill="#6FC25C" transform="rotate(-25 ${x - 6} ${y - th - 2})"/><ellipse cx="${x + 6}" cy="${y - th - 4}" rx="7" ry="3.5" fill="#8AD36B" transform="rotate(25 ${x + 6} ${y - th - 4})"/></g>`;
    } else {
      const cy = y - th - 8 * s, R = [0, 18, 24, 30, 36][lv];
      const blobs: number[][] = [[0, 0, R], [-R * .75, R * .35, R * .72], [R * .75, R * .3, R * .74]];
      if (lv >= 2) blobs.push([-R * .35, -R * .55, R * .7], [R * .4, -R * .5, R * .66]);
      if (lv >= 3) blobs.push([-R * 1.05, R * .5, R * .5], [R * 1.05, R * .5, R * .52], [0, -R * .95, R * .55]);
      can += `<g class="leafy" style="transform-origin:${x}px ${y - th}px">`;
      blobs.forEach(b => { can += `<circle cx="${n1(x + b[0])}" cy="${n1(cy + b[1] + 3)}" r="${n1(b[2])}" fill="#2F7D3F" opacity=".95"/>`; });
      blobs.forEach(b => { can += `<circle cx="${n1(x + b[0])}" cy="${n1(cy + b[1])}" r="${n1(b[2])}" fill="url(#iCan)"/>`; });
      blobs.forEach((b, i) => { if (i < 3) can += `<ellipse cx="${n1(x + b[0] - b[2] * .28)}" cy="${n1(cy + b[1] - b[2] * .4)}" rx="${n1(b[2] * .35)}" ry="${n1(b[2] * .2)}" fill="#fff" opacity=".18"/>`; });
      if (lv === 4) { const rr = rng(5); for (let i = 0; i < 12; i++) { const a = rr() * 6.28, d = rr() * R * 1.1; can += `<circle cx="${n1(x + Math.cos(a) * d)}" cy="${n1(cy - 4 + Math.sin(a) * d * .8)}" r="2.4" fill="#F9C6D2"/>`; } }
      if (lantern) can += `<g class="chm" style="transform-origin:${x + R * .7}px ${cy + R * .6}px"><path d="M${x + R * .7} ${cy + R * .55}v8" stroke="#6b4a2b" stroke-width="1.2"/><rect x="${x + R * .7 - 5}" y="${cy + R * .55 + 8}" width="10" height="13" rx="4" fill="#FFC857"/><circle cx="${x + R * .7}" cy="${cy + R * .55 + 14}" r="9" fill="url(#iGlow)"/></g>`;
      can += '</g>';
    }
    return G(F, o + tr + can);
  }

  const bush = (x: number, y: number, s: number) => `<g>${shd(x, y + 2, 16 * s, 5 * s, .18)}<circle cx="${x - 9 * s}" cy="${y - 6 * s}" r="${10 * s}" fill="url(#iCan2)"/><circle cx="${x + 8 * s}" cy="${y - 7 * s}" r="${11 * s}" fill="url(#iCan)"/><circle cx="${x}" cy="${y - 12 * s}" r="${10 * s}" fill="url(#iCan)"/><circle cx="${x + 3 * s}" cy="${y - 10 * s}" r="2" fill="#F9C6D2"/><circle cx="${x - 8 * s}" cy="${y - 7 * s}" r="2" fill="#F9C6D2"/></g>`;
  const ghost = (cx: number, cy: number, hw: number, hh: number) => dia(cx, cy, hw, hh, 'fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="2" stroke-dasharray="5 5" stroke-linejoin="round"');
  const bedSides = (cx: number, cy: number, hw: number, hh: number, d: number) => `<path d="M${cx - hw} ${cy}L${cx} ${cy + hh}L${cx} ${cy + hh + d}L${cx - hw} ${cy + d}Z" fill="#9A683E"/><path d="M${cx} ${cy + hh}L${cx + hw} ${cy}L${cx + hw} ${cy + d}L${cx} ${cy + hh + d}Z" fill="#B57F4F"/>`;

  function beds(cx: number, cy: number) {
    const list = g.flowers, n = g.counts.journal ?? 0;
    if (!n && !list.length) return ghost(cx, cy, 48, 24);
    const hw = 48, hh = 24;
    let o = bedSides(cx, cy, hw, hh, 8) + dia(cx, cy, hw, hh, 'fill="url(#iSoil)" stroke="#C99A64" stroke-width="3" stroke-linejoin="round"');
    const count = Math.max(1, Math.min(12, n || list.length));
    const items = Array.from({ length: count }, (_, i) => { const e = list[i - (count - list.length)]; return { c: FLOWER[e ?? (i * 3) % 5] ?? FLOWER[3], i }; });
    const pts = items.map(it => { const col = it.i % 4, row = Math.floor(it.i / 4), u = (col + .5) / 4, v = (row + .5) / 3; return { x: cx + (u - v) * hw * .9, y: cy + (u + v - 1) * hh * .9 + 4, c: it.c, i: it.i }; }).sort((a, b) => a.y - b.y);
    pts.forEach(p => { o += bloom(+n1(p.x), +n1(p.y), p.c, 9, p.i, isF('journal') && p.i === items.length - 1 ? 'grow' : ''); });
    return o;
  }

  function pond(cx: number, cy: number) {
    const n = (g.counts.breathe ?? 0) + (g.counts.meditate ?? 0);
    if (!n) return `<ellipse cx="${cx}" cy="${cy}" rx="44" ry="21" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="2" stroke-dasharray="5 5"/>`;
    let o = shd(cx, cy + 6, 50, 22, .18);
    o += `<ellipse cx="${cx}" cy="${cy + 4}" rx="47" ry="23" fill="${NT ? '#5C5F86' : '#B9A98A'}"/><ellipse cx="${cx}" cy="${cy}" rx="47" ry="23" fill="${NT ? '#8E92B8' : '#D9CDB1'}"/>`;
    o += `<ellipse cx="${cx}" cy="${cy}" rx="41" ry="19" fill="url(#iWater)"/><ellipse cx="${cx - 8}" cy="${cy - 6}" rx="22" ry="6" fill="#fff" opacity=".28"/>`;
    const rr = rng(3);
    for (let i = 0; i < 9; i++) { const a = rr() * 6.28, d = .3 + rr() * .6; o += `<ellipse cx="${n1(cx + Math.cos(a) * 38 * d)}" cy="${n1(cy + Math.sin(a) * 16 * d)}" rx="2" ry="1" fill="#fff" opacity=".35"/>`; }
    o += `<g><ellipse class="rip" cx="${cx + 10}" cy="${cy + 2}" rx="14" ry="6" fill="none" stroke="#fff" stroke-width="1.6"/></g><g><ellipse class="rip" style="animation-delay:-2s" cx="${cx - 14}" cy="${cy + 4}" rx="12" ry="5" fill="none" stroke="#fff" stroke-width="1.4"/></g>`;
    const pads = [[-22, 0], [18, -5], [2, 8], [-8, -9], [26, 6], [-30, 6], [10, 10], [-2, -1]];
    for (let p = 0; p < Math.min(pads.length, n); p++) {
      const px = cx + pads[p][0], py = cy + pads[p][1];
      o += G(isF('calm') && p === Math.min(pads.length, n) - 1 ? 'calm' : '-', `<ellipse cx="${px}" cy="${py + 1.5}" rx="9" ry="4.2" fill="#2F7D3F"/><ellipse cx="${px}" cy="${py}" rx="9" ry="4.2" fill="#6CC067"/><path d="M${px} ${py}l7-2" stroke="#3E9A4B" stroke-width="1"/>`);
    }
    const lot = Math.floor(n / 3);
    for (let l = 0; l < Math.min(3, lot); l++) {
      const lp = pads[l * 2 + 1], lx = cx + lp[0], ly = cy + lp[1] - 3;
      o += G(isF('calm') && l === Math.min(3, lot) - 1 && n % 3 === 0 ? 'calm' : '-', `<g transform="translate(${lx} ${ly})"><path d="M0 0c-6-1-8-6-6-10 4 1 6 5 6 10zM0 0c6-1 8-6 6-10-4 1-6 5-6 10z" fill="#F4A6B7"/><path d="M0 0c-2-4-2-8 0-12 2 4 2 8 0 12z" fill="#FBD0DB"/><circle cy="-3" r="1.8" fill="#FFD36B"/></g>`);
    }
    for (let bt = 0; bt < Math.min(3, g.boats); bt++) { const bx = cx - 24 + bt * 22, by = cy + 6 - bt * 5; o += `<g class="drift" style="animation-delay:-${bt * 2.5}s"><path d="M${bx - 7} ${by}h14l-3 4h-8z" fill="#fff"/><path d="M${bx} ${by - 9}v9h-6z" fill="#F7F3EA"/><path d="M${bx} ${by - 7}v7h5z" fill="#E2D9C2"/></g>`; }
    if (g.visitors.kingfisher) o += `<g transform="translate(${cx + 34} ${cy - 10})"><ellipse cx="0" cy="0" rx="6" ry="5" fill="#2F9CC4"/><ellipse cx="1" cy="2" rx="3.5" ry="3" fill="#F2A55E"/><circle cx="3" cy="-1.5" r="1.2" fill="#111"/><path d="M5 -1l7 1-7 2z" fill="#222"/></g>`;
    return o;
  }

  const bench = (x: number, y: number) => `${shd(x, y + 4, 28, 6, .2)}<g><path d="M${x - 22} ${y - 24}h44v6h-44z" fill="#9A683E"/><path d="M${x - 22} ${y - 24}h44v2h-44z" fill="#C79660"/><path d="M${x - 24} ${y - 14}h48l-3 8h-42z" fill="#C79660"/><path d="M${x - 24} ${y - 14}h48v2h-48z" fill="#E2B987"/><rect x="${x - 19}" y="${y - 6}" width="4" height="10" rx="1" fill="#7A4E30"/><rect x="${x + 15}" y="${y - 6}" width="4" height="10" rx="1" fill="#7A4E30"/><rect x="${x - 21}" y="${y - 26}" width="4" height="12" rx="1" fill="#7A4E30"/><rect x="${x + 17}" y="${y - 26}" width="4" height="12" rx="1" fill="#7A4E30"/></g>`;

  function herbs(cx: number, cy: number) {
    const n = g.counts.plan ?? 0;
    if (!n) return ghost(cx, cy, 34, 17);
    const hw = 34, hh = 17;
    let o = bedSides(cx, cy, hw, hh, 6) + dia(cx, cy, hw, hh, 'fill="url(#iSoil)" stroke="#C99A64" stroke-width="2.5" stroke-linejoin="round"');
    const spots = [[-14, -3], [8, -8], [-2, 4], [16, 2], [-20, 5], [4, 10]];
    for (let i = 0; i < Math.min(6, n); i++) {
      const x = cx + spots[i][0], y = cy + spots[i][1];
      o += `<g class="sway" style="transform-origin:${x}px ${y}px;animation-delay:-${i * .4}s"><circle cx="${x - 4}" cy="${y - 6}" r="5" fill="#3E9A4B"/><circle cx="${x + 4}" cy="${y - 7}" r="5.5" fill="#5DB85A"/><circle cx="${x}" cy="${y - 11}" r="5" fill="#7BCB66"/>${n >= 4 && i < 2 ? `<circle cx="${x + 2}" cy="${y - 4}" r="2.4" fill="#E5533D"/>` : ''}</g>`;
    }
    return o;
  }

  function nook(x: number, y: number) {
    const n = g.counts.sleep ?? 0;
    if (!n) return `<ellipse cx="${x}" cy="${y}" rx="30" ry="13" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="2" stroke-dasharray="5 5"/>`;
    let o = `${shd(x, y + 3, 32, 12, .18)}<ellipse cx="${x}" cy="${y + 2}" rx="30" ry="12" fill="#3C3F86"/><ellipse cx="${x}" cy="${y}" rx="30" ry="12" fill="#5A5FB5"/><ellipse cx="${x}" cy="${y}" rx="21" ry="8" fill="none" stroke="#FFD36B" stroke-width="1.2" stroke-dasharray="2 4"/>`;
    o += `<ellipse cx="${x + 6}" cy="${y - 3}" rx="10" ry="6" fill="#F4A6B7"/><ellipse cx="${x + 6}" cy="${y - 6}" rx="8" ry="4" fill="#F9C9D3"/>`;
    o += `<path d="M${x - 22} ${y + 2}V${y - 34}" stroke="#6b4a2b" stroke-width="2.4" stroke-linecap="round"/><circle cx="${x - 22}" cy="${y - 38}" r="14" fill="url(#iGlow)"/><path d="M${x - 22} ${y - 46}a8 8 0 1 0 0 16a6 6 0 1 1 0-16z" fill="#FFE08A"/>`;
    return G(isF('sleep') ? 'sleep' : '-', o);
  }

  function house(x: number, y: number) {
    const n = g.seeds.planted;
    if (!n) return `<g opacity=".7"><rect x="${x - 20}" y="${y - 14}" width="40" height="16" rx="3" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/></g>`;
    let sp = '';
    for (let i = 0; i < Math.min(3, n); i++) { const sx = x - 12 + i * 12, grown = i < g.seeds.sprouted; sp += `<path d="M${sx} ${y - 1}v-${grown ? 9 : 4}" stroke="#3E9A4B" stroke-width="2" stroke-linecap="round"/><ellipse cx="${sx - 3}" cy="${y - (grown ? 10 : 5)}" rx="3.6" ry="2" fill="#7BCB66"/><ellipse cx="${sx + 3}" cy="${y - (grown ? 12 : 6)}" rx="3.6" ry="2" fill="#5DB85A"/>`; }
    return G(isF('house') ? 'house' : '-', `${shd(x, y + 3, 26, 6, .2)}<rect x="${x - 22}" y="${y - 22}" width="44" height="24" rx="2" fill="#DDF3F4" opacity=".75" stroke="#fff" stroke-width="2"/><path d="M${x - 26} ${y - 21}L${x} ${y - 38}L${x + 26} ${y - 21}Z" fill="#CFEAEC" opacity=".9" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M${x} ${y - 38}V${y + 2}" stroke="#fff" stroke-width="1.5"/>${sp}`);
  }

  function gate(x: number, y: number) {
    const st = (g.counts.walk ?? 0) + (g.counts.event ?? 0);
    let o = '';
    const pos = [[-4, -14], [5, -23], [-5, -32], [4, -41], [-4, -50]];
    for (let i = 0; i < Math.min(5, st); i++) o += G(isF('out') && i === Math.min(5, st) - 1 ? 'out' : '-', `<ellipse cx="${x + pos[i][0]}" cy="${y + pos[i][1] + 2}" rx="8" ry="3.6" fill="#8D7E66"/><ellipse cx="${x + pos[i][0]}" cy="${y + pos[i][1]}" rx="8" ry="3.6" fill="#D6C8AA"/>`);
    const arch = `<rect x="${x - 30}" y="${y - 30}" width="6" height="34" rx="2" fill="#7A4E30"/><rect x="${x + 24}" y="${y - 30}" width="6" height="34" rx="2" fill="#7A4E30"/><path d="M${x - 34} ${y - 32}Q${x} ${y - 42} ${x + 34} ${y - 32}" stroke="#8D5A34" stroke-width="7" stroke-linecap="round" fill="none"/>`;
    let gar = '';
    for (let k = 0; k < 9; k++) { const t = k / 8, gx = x - 28 + t * 56, gy = y - 33 + Math.sin(t * Math.PI) * -1 * 3 + Math.sin(t * Math.PI) * 9; gar += `<circle cx="${n1(gx)}" cy="${n1(gy + 4)}" r="3.4" fill="${k % 2 ? '#FFB11F' : '#FF8A1F'}"/>`; }
    o += shd(x, y + 4, 34, 6, .2) + arch + gar;
    if (m.creation) o += `<g transform="translate(${x + 46} ${y - 2}) scale(1,.48)"><clipPath id="rgc"><circle r="17"/></clipPath><circle r="19" fill="#fff" opacity=".7"/><image href="${m.creation}" x="-17" y="-17" width="34" height="34" clip-path="url(#rgc)"/></g>`;
    else if ((g.counts.event ?? 0) > 0) o += `<g transform="translate(${x + 44} ${y - 2})"><ellipse rx="15" ry="6.5" fill="#fff" opacity=".6"/><ellipse rx="11" ry="4.6" fill="#F4A6B7"/><ellipse rx="7" ry="3" fill="#FFD36B"/><ellipse rx="3" ry="1.3" fill="#7DBFE0"/></g>`;
    return o;
  }

  function visitors() {
    const v = g.visitors, cols = ['#F9A3C0', '#FFC857', '#8FB8F0'];
    let o = '';
    for (let i = 0; i < Math.min(3, v.butterflies); i++) { const bx = 140 + i * 60, by = 130 + (i % 2) * 14; o += `<g class="flit" style="animation-delay:-${i * 1.7}s;animation-duration:${5 + i}s"><g transform="translate(${bx} ${by})"><g class="wing"><ellipse cx="-4" cy="-2" rx="4.5" ry="3.4" fill="${cols[i]}"/><ellipse cx="4" cy="-2" rx="4.5" ry="3.4" fill="${cols[i]}"/></g><ellipse cx="0" cy="0" rx="1" ry="3" fill="#463"/></g></g>`; }
    if (v.bulbul) o += '<g transform="translate(219 66)"><ellipse rx="7" ry="5.5" fill="#6B5B4B"/><ellipse cx="2" cy="2" rx="4" ry="3" fill="#E9DCC6"/><circle cx="5" cy="-2" r="1.2" fill="#111"/><path d="M8 -2l5 1-5 2z" fill="#F4A62E"/><path d="M-6 1l-7 3 7-0z" fill="#6B5B4B"/></g>';
    if (v.squirrel) o += '<g transform="translate(222 108)"><ellipse rx="6" ry="4.5" fill="#B9763F"/><circle cx="5" cy="-3" r="3.4" fill="#B9763F"/><path d="M-5 -1c-9-2-11-12-4-14 3 4 2 8 4 10z" fill="#D18F55"/><circle cx="6" cy="-3.6" r="1" fill="#111"/></g>';
    return o;
  }

  function extras(st: number) {
    let o = '';
    if (st >= 1) o += bush(330, 168, 1) + bush(70, 176, .9);
    if (st >= 2) o += `<g>${[[150, 214], [246, 214]].map(p => `${shd(p[0], p[1] + 2, 8, 3, .2)}<rect x="${p[0] - 3}" y="${p[1] - 16}" width="6" height="16" rx="1.5" fill="#B8AB92"/><rect x="${p[0] - 6}" y="${p[1] - 24}" width="12" height="10" rx="3" fill="#EAD9A8"/><circle cx="${p[0]}" cy="${p[1] - 19}" r="9" fill="url(#iGlow)"/>`).join('')}</g>`;
    if (st >= 3) o += tree(266, 100, 2, false, '-') + tree(120, 98, 1, false, '-');
    if (st >= 4) { const rr = rng(21); for (let i = 0; i < 14; i++) { const u = rr(), v = rr(), x = 195 + (u - v) * 140, y = 152 + (u + v - 1) * 68; o += `<circle cx="${n0(x)}" cy="${n0(y)}" r="2.4" fill="${['#F9A3C0', '#FFD36B', '#fff'][i % 3]}"/>`; } }
    return o;
  }

  function potMini(x: number, y: number, n: number, pots: number) {
    const s = .2, col = POT_COL[pots % 3];
    let o = `<g transform="translate(${x - 150 * s} ${y - 272 * s}) scale(${s})"><ellipse cx="150" cy="276" rx="86" ry="12" fill="rgba(0,0,0,.2)"/><ellipse cx="150" cy="92" rx="64" ry="15" fill="${col}"/><path d="${POT_BODY}" fill="${col}"/><clipPath id="pcm"><path d="${POT_BODY}"/></clipPath><g clip-path="url(#pcm)" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
    CRACKS.forEach((d, i) => { o += `<path d="${d}" stroke="${i < n ? '#F7C948' : 'rgba(50,25,10,.5)'}" stroke-width="${i < n ? 9 : 5}"/>`; });
    return G(isF('pot') ? 'pot' : '-', `${o}</g></g>`);
  }

  function bunting(n: number) {
    const A = [92, 106], B = [190, 80];
    let o = `<path d="M${A[0]} ${A[1]}Q141 108 ${B[0]} ${B[1]}" stroke="#6b4a2b" stroke-width="1.4" fill="none"/>`;
    for (let i = 0; i < Math.min(8, n); i++) { const t = (i + .7) / 8.4, x = (1 - t) * (1 - t) * A[0] + 2 * t * (1 - t) * 141 + t * t * B[0], y = (1 - t) * (1 - t) * A[1] + 2 * t * (1 - t) * 108 + t * t * B[1]; o += `<path d="M${n1(x - 5)} ${n1(y)}h10l-5 11z" fill="${TCOL[i % 6]}"/>`; }
    return o;
  }

  function plant(p: Garden['plants'][number], last: boolean) {
    const kind = PLANT_KINDS.find(k => k.id === p.kind);
    if (!kind) return '';
    const gr = p.growth, sp = SLOTS[p.slot] ?? SLOTS[0], x = sp[0], y = sp[1], ready = p.ready, c = PLANT_COLOR[p.kind] ?? '#fff';
    let o = '';
    if (kind.kind === 'flower') {
      const n = p.kind === 'marigold' ? 3 : 1, h = 7 + gr * (p.kind === 'sunflower' ? 30 : 20);
      o += shd(x, y + 2, 11, 3.5, .2);
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 10, hh = h * (1 - Math.abs(i - (n - 1) / 2) * .15), bx = x + dx, by = y - hh;
        o += `<g class="sway" style="transform-origin:${bx}px ${y}px;animation-delay:-${i * .7}s"><path d="M${bx} ${y}Q${bx + 2} ${y - hh * .5} ${bx} ${by}" stroke="#4A9645" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="${bx + 4}" cy="${y - hh * .4}" rx="4" ry="2" fill="#5DAE50" transform="rotate(-25 ${bx + 4} ${y - hh * .4})"/>`;
        if (gr >= .3) {
          const r = 2.5 + Math.min(1, (gr - .3) / .7) * (p.kind === 'sunflower' ? 7 : 4.5);
          let petals = '';
          for (let k = 0; k < (p.kind === 'jasmine' ? 5 : 9); k++) petals += `<ellipse cx="0" cy="-${n1(r * .8)}" rx="${n1(r * .42)}" ry="${n1(r * .7)}" transform="rotate(${k * (p.kind === 'jasmine' ? 72 : 40)})"/>`;
          o += `<g transform="translate(${bx} ${by})" fill="${c}" stroke="rgba(0,0,0,.12)" stroke-width=".5">${petals}<circle r="${n1(r * .42)}" fill="${p.kind === 'sunflower' ? '#6B3F1E' : p.kind === 'jasmine' ? '#FFE08A' : '#C25E0F'}" stroke="none"/></g>`;
        }
        o += '</g>';
      }
    } else {
      const lv = gr < .2 ? 0 : gr < .5 ? 1 : gr < 1 ? 2 : 3, sc = p.kind === 'banyan' ? .62 : .5;
      let fr = '';
      o += `<g transform="translate(${x} ${y}) scale(${sc}) translate(${-x} ${-y})">${tree(x, y, Math.min(4, lv + (p.kind === 'banyan' && lv === 3 ? 1 : 0)), false, '-')}</g>`;
      if (ready && p.kind === 'mango') [[-9, -24], [7, -30], [-1, -18], [12, -22]].forEach(q => { fr += `<ellipse cx="${x + q[0]}" cy="${y + q[1]}" rx="3.2" ry="4" fill="#F5A524" stroke="#C97A0E" stroke-width=".6"/>`; });
      o += fr;
    }
    if (ready) o += `<circle cx="${x}" cy="${y - 16}" r="20" fill="url(#iGlow)" opacity=".8"/>`;
    return G(isF('plant') && last ? 'plant' : '-', o);
  }

  const st = g.stage;
  let o = defs() + base() + extras(st);
  o += house(AT.house[0], AT.house[1]);
  o += nook(AT.sleep[0], AT.sleep[1]);
  o += pond(AT.calm[0], AT.calm[1]);
  o += tree(AT.tree[0], AT.tree[1], g.treeLevel, (g.counts.talk ?? 0) >= 2, isF('tree') ? 'tree' : '-');
  o += beds(AT.beds[0], AT.beds[1]);
  o += herbs(AT.herbs[0], AT.herbs[1]);
  o += G(isF('talk') ? 'talk' : '-', bench(AT.bench[0], AT.bench[1]));
  o += gate(AT.gate[0], AT.gate[1]);
  if (g.keepsakes.potSeams > 0 || g.keepsakes.pots > 0) o += potMini(226, 176, g.keepsakes.potSeams, g.keepsakes.pots);
  if (g.keepsakes.flags > 0) o += bunting(g.keepsakes.flags);
  const byY = [...g.plants].sort((a, b) => (SLOTS[a.slot]?.[1] ?? 0) - (SLOTS[b.slot]?.[1] ?? 0));
  const newest = g.plants.length ? g.plants[g.plants.length - 1].id : '';
  o += byY.map(p => plant(p, p.id === newest)).join('');
  o += visitors();
  if (m.fresh.length) {
    const key = m.fresh[0] as keyof typeof PERCH;
    const p = PERCH[key] ?? [195, 150];
    let sp = '';
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; sp += `<circle cx="${p[0]}" cy="${p[1] - 20}" r="2.6" fill="#FFD36B" style="--dx:${n0(Math.cos(a) * 28)}px;--dy:${n0(Math.sin(a) * 22 - 10)}px"/>`; }
    o += `<g class="spark">${sp}</g>`;
  }
  return `<svg viewBox="0 0 390 360" aria-hidden="true" focusable="false">${o}</svg>`;
}

/** Sky, hills and clouds behind the island. */
export function skySVG(phase: SkyPhase, grey: boolean, skies: number[]): string {
  const night = phase === 'night', gold = phase === 'golden';
  let o = '<svg viewBox="0 0 390 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
  const hill1 = night ? '#1E2A63' : gold ? '#E7A98A' : grey ? '#9DB5B5' : '#B8DDB0', hill2 = night ? '#2B3A7A' : gold ? '#D8977D' : grey ? '#8EA8A8' : '#9ACE9A';
  if (night) {
    const r = rng(9);
    o += '<defs><radialGradient id="mG"><stop offset="0" stop-color="#FFF6D6" stop-opacity=".55"/><stop offset=".5" stop-color="#BFD0FF" stop-opacity=".18"/><stop offset="1" stop-color="#BFD0FF" stop-opacity="0"/></radialGradient><radialGradient id="hz" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#7A86C8" stop-opacity=".55"/><stop offset="1" stop-color="#7A86C8" stop-opacity="0"/></radialGradient></defs><rect x="0" y="150" width="390" height="210" fill="url(#hz)"/>';
    for (let i = 0; i < 34; i++) o += `<circle class="st" cx="${n0(r() * 390)}" cy="${n0(r() * 180)}" r="${n1(.6 + r() * 1.4)}" fill="#fff" style="animation-delay:-${n1(r() * 3)}s"/>`;
    const cpos = [[14, 64], [104, 4], [192, 0], [256, 62], [6, 134], [290, 120]];
    skies.slice(-6).forEach((ci, k) => {
      const cn = CONS[ci % CONS.length], ps = cpos[k % 6], sc = .26;
      const pp = cn.pts.map(q => [ps[0] + q[0] * sc, ps[1] + q[1] * sc]);
      o += `<g opacity=".85">${pp.map((q, j) => (j ? `<line x1="${n1(pp[j - 1][0])}" y1="${n1(pp[j - 1][1])}" x2="${n1(q[0])}" y2="${n1(q[1])}" stroke="#FFE9A0" stroke-width=".9" opacity=".7"/>` : '')).join('')}${pp.map(q => `<circle cx="${n1(q[0])}" cy="${n1(q[1])}" r="1.9" fill="#FFF6D0"/>`).join('')}</g>`;
    });
    o += '<circle cx="316" cy="56" r="70" fill="url(#mG)"/><circle cx="316" cy="56" r="21" fill="#FFF6DA"/><circle cx="309" cy="50" r="3.5" fill="#E8DDB8" opacity=".7"/><circle cx="322" cy="63" r="2.6" fill="#E8DDB8" opacity=".6"/><circle cx="320" cy="47" r="2" fill="#E8DDB8" opacity=".6"/>';
  } else if (!grey) {
    o += `<defs><radialGradient id="sunG"><stop offset="0" stop-color="#FFF6C8"/><stop offset="1" stop-color="#FFF6C8" stop-opacity="0"/></radialGradient></defs><circle cx="${gold ? 90 : 320}" cy="${gold ? 170 : 56}" r="${gold ? 90 : 70}" fill="url(#sunG)" opacity=".85"/><circle cx="${gold ? 90 : 320}" cy="${gold ? 170 : 56}" r="${gold ? 24 : 20}" fill="${gold ? '#FFE2A8' : '#FFF1B0'}"/>`;
  }
  o += `<path d="M0 250C50 200 90 210 140 232C200 186 250 200 300 226C340 206 370 214 390 224V360H0Z" fill="${hill2}" opacity=".85"/><path d="M0 280C70 240 120 250 170 268C230 236 300 248 390 270V360H0Z" fill="${hill1}" opacity=".95"/>`;
  const cc = night ? '#5566A8' : grey ? '#F2F6F7' : '#fff', co = night ? .42 : .92;
  const cloud = (x: number, y: number, s: number, c2: string) => `<g class="cl ${c2}" opacity="${co}"><g transform="translate(${x} ${y}) scale(${s})"><ellipse rx="34" ry="11" fill="${cc}"/><circle cx="-12" cy="-8" r="13" fill="${cc}"/><circle cx="8" cy="-12" r="16" fill="${cc}"/><circle cx="22" cy="-3" r="10" fill="${cc}"/></g></g>`;
  o += cloud(70, 48, 1, '') + cloud(250, 92, .8, 'c2') + (grey ? cloud(160, 30, 1.2, 'c2') + cloud(330, 30, .9, '') : '');
  o += `<g opacity="${night ? .5 : .95}" fill="${night ? '#4A5A9A' : cc}"><ellipse cx="80" cy="318" rx="62" ry="16"/><ellipse cx="320" cy="322" rx="66" ry="17"/><ellipse cx="195" cy="342" rx="90" ry="16"/><circle cx="48" cy="308" r="16"/><circle cx="344" cy="310" r="18"/></g>`;
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
  let o = '<svg viewBox="0 0 390 360" style="width:100%;height:100%" aria-hidden="true" focusable="false"><defs><radialGradient id="wl"><stop offset="0" stop-color="#FFC970" stop-opacity=".85"/><stop offset="1" stop-color="#FFC970" stop-opacity="0"/></radialGradient><radialGradient id="ml"><stop offset="0" stop-color="#BFD4FF" stop-opacity=".5"/><stop offset="1" stop-color="#BFD4FF" stop-opacity="0"/></radialGradient></defs>';
  o += '<ellipse cx="196" cy="150" rx="150" ry="70" fill="url(#ml)"/>';
  const glows = [[AT.sleep[0] - 22, AT.sleep[1] - 36, 34], [AT.gate[0], AT.gate[1] - 30, 40], [AT.bench[0], AT.bench[1] - 18, 26]];
  if (g.stage >= 2) glows.push([150, 194, 26], [246, 194, 26]);
  if (g.seeds.planted) glows.push([AT.house[0], AT.house[1] - 12, 28]);
  if ((g.counts.talk ?? 0) >= 2) glows.push([AT.tree[0] + 26, AT.tree[1] - 34, 26]);
  glows.forEach(q => { o += `<circle cx="${q[0]}" cy="${q[1]}" r="${q[2]}" fill="url(#wl)"/>`; });
  for (let i = 0; i < 14; i++) { const x = 60 + r() * 270, y = 70 + r() * 150; o += `<circle class="fire" cx="${n0(x)}" cy="${n0(y)}" r="2.4" fill="#FFF3A8" style="animation-delay:-${n1(r() * 3)}s"/><circle class="fire" cx="${n0(x)}" cy="${n0(y)}" r="5" fill="#FFF3A8" opacity=".18" style="animation-delay:-${n1(r() * 3)}s"/>`; }
  return `${o}</svg>`;
}

export { SLOTS, SLOTS_BY_STAGE };
