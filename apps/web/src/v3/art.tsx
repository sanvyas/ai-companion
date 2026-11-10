import type { Look } from '../state/store';
import { Companion } from '../components/figures';
import { s } from './css';

// Pictures drawn for this app, so Talk and Journal feel like places and not lists of icons. Scenery keeps its own colours (a sun is
// yellow in every palette); only what belongs to the app (the notebook cover, the halo) takes the palette.


/** An open notebook with a pen and a small sprig, for a page waiting to be written. */
export function NotebookArt({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 160 124" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      <ellipse cx="80" cy="112" rx="58" ry="8" fill="#1E2430" opacity=".08" />
      <g transform="rotate(-5 80 70)">
        <rect x="26" y="26" width="108" height="76" rx="9" fill="var(--accent2)" />
        <path d="M80 30 V98" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="1.5" />
        <path d="M32 32 C52 28 70 30 80 36 V100 C70 94 52 92 32 96 Z" fill="#FFFFFF" />
        <path d="M128 32 C108 28 90 30 80 36 V100 C90 94 108 92 128 96 Z" fill="#FFFDF8" />
        {[46, 56, 66, 76, 86].map(y => <path key={y} d={`M40 ${y} H72 M88 ${y} H120`} stroke="#D9D2C5" strokeWidth="1.6" strokeLinecap="round" />)}
        <path d="M40 46 H62 M88 46 H108" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
      </g>
      <g transform="rotate(32 118 36)"><rect x="112" y="6" width="9" height="58" rx="4.5" fill="var(--gold)" /><path d="M112 64 L116.5 76 L121 64 Z" fill="#F4D9B0" /><path d="M115 72 L116.5 76 L118 72 Z" fill="#2A2E45" /><rect x="112" y="6" width="9" height="10" rx="4.5" fill="#E8896B" /></g>
      <g transform="translate(30 22)"><path d="M0 0 C-4 -8 -3 -14 0 -20" stroke="#5E9A66" strokeWidth="2.2" fill="none" strokeLinecap="round" />{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-26" rx="4" ry="6.4" fill="#E8789B" transform={`rotate(${a} 0 -20)`} />)}<circle cx="0" cy="-20" r="3.4" fill="#FFF3C4" /></g>
    </svg>
  );
}

/** A part of the day as a small picture: a sun coming up, the sun high, the moon out. */
export function PartArt({ part, size = 56 }: { part: 'Morning' | 'Afternoon' | 'Evening'; size?: number }) {
  const bg = part === 'Morning' ? ['#FCE3CF', '#FFF4E6'] : part === 'Afternoon' ? ['#CFE5F0', '#EAF4F2'] : ['#E2D8F3', '#F7E4DD'];
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block', borderRadius: 18 }}>
      <defs><linearGradient id={`pa-${part}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bg[0]} /><stop offset="1" stopColor={bg[1]} /></linearGradient></defs>
      <rect width="56" height="56" fill={`url(#pa-${part})`} />
      {part === 'Morning' && <><circle cx="28" cy="36" r="11" fill="#FFD36B" /><path d="M0 40 C14 32 24 38 34 36 C44 34 50 38 56 36 V56 H0z" fill="#A9D4AE" /><path d="M0 47 C16 41 30 48 56 44 V56 H0z" fill="#86BD8F" />{[[10, 14], [44, 18]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.6" fill="#FFFFFF" />)}</>}
      {part === 'Afternoon' && <><circle cx="28" cy="26" r="9" fill="#FFD36B" />{Array.from({ length: 8 }, (_, i) => <path key={i} d="M28 9 V13" stroke="#F2B33D" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${i * 45} 28 26)`} />)}<path d="M2 48 C16 42 26 48 38 45 C46 43 52 46 56 45 V56 H2z" fill="#A9D4AE" /><ellipse cx="44" cy="17" rx="8" ry="3.4" fill="#FFFFFF" opacity=".85" /></>}
      {part === 'Evening' && <><circle cx="30" cy="25" r="11" fill="#FBF1D2" /><circle cx="35" cy="22" r="10" fill={bg[0]} /><circle cx="12" cy="14" r="1.6" fill="#FFFFFF" /><circle cx="46" cy="12" r="1.3" fill="#FFFFFF" /><circle cx="40" cy="38" r="1.2" fill="#FFFFFF" /><path d="M0 46 C14 40 28 46 56 42 V56 H0z" fill="#C9BDE3" /></>}
    </svg>
  );
}

/** A bench under a tree, for sitting together. */
export function SitArt() {
  return (
    <svg width="100%" viewBox="0 0 132 95" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <circle cx="104" cy="20" r="9" fill="#FFE6A8" />
      <path d="M0 80 C30 66 62 76 90 70 C108 66 122 70 132 68 V95 H0z" fill="#FFFFFF" opacity=".28" />
      <rect x="22" y="40" width="7" height="34" rx="3" fill="#7A5A3C" />
      <circle cx="26" cy="32" r="17" fill="#8FC79A" /><circle cx="14" cy="42" r="11" fill="#7DB88A" /><circle cx="38" cy="42" r="12" fill="#7DB88A" /><circle cx="28" cy="24" r="9" fill="#A5D6AE" />
      <rect x="54" y="52" width="58" height="7" rx="3" fill="#E9C58D" /><rect x="56" y="38" width="54" height="6" rx="3" fill="#E9C58D" /><rect x="56" y="45" width="54" height="5" rx="2.5" fill="#E2B87A" />
      <rect x="58" y="58" width="5" height="18" rx="2" fill="#7A5A3C" /><rect x="102" y="58" width="5" height="18" rx="2" fill="#7A5A3C" />
      <circle cx="76" cy="31" r="5" fill="#F4C8A8" /><path d="M69 52 C69 40 83 40 83 52z" fill="#F28C6B" />
      <circle cx="92" cy="33" r="5" fill="#E7B58F" /><path d="M85 52 C85 41 99 41 99 52z" fill="#FFFFFF" opacity=".92" />
    </svg>
  );
}

/** A path through hills with the sun up, for walking together. */
export function WalkArt() {
  return (
    <svg width="100%" viewBox="0 0 132 95" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <circle cx="98" cy="22" r="10" fill="#FFE6A8" /><ellipse cx="38" cy="18" rx="14" ry="5" fill="#FFFFFF" opacity=".5" />
      <path d="M0 62 C24 44 52 54 76 50 C100 46 118 52 132 46 V95 H0z" fill="#FFFFFF" opacity=".26" />
      <path d="M0 74 C30 62 60 72 90 66 C110 62 122 66 132 64 V95 H0z" fill="#FFFFFF" opacity=".34" />
      <path d="M52 95 C60 80 76 78 84 66 C90 58 88 52 94 48" stroke="#F4E3C4" strokeWidth="10" strokeLinecap="round" fill="none" />
      <g transform="translate(78 72)"><circle cx="0" cy="-16" r="4.4" fill="#F4C8A8" /><path d="M-5 -10 C-5 -20 5 -20 5 -10 L4 4 H-4z" fill="#F28C6B" /><path d="M-3 4 L-6 13 M3 4 L6 13" stroke="#2A2E45" strokeWidth="2.2" strokeLinecap="round" /></g>
      <rect x="14" y="52" width="5" height="16" rx="2" fill="#7A5A3C" /><circle cx="16" cy="48" r="11" fill="#9BD0A5" /><rect x="112" y="56" width="4" height="12" rx="2" fill="#7A5A3C" /><circle cx="114" cy="52" r="8" fill="#9BD0A5" />
      <path d="M30 30 q4 -4 8 0 q4 -4 8 0" stroke="#FFFFFF" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

/** A little speech bubble that bobs, for the top of Talk. */
function Bubble({ style, children }: { style: string; children: React.ReactNode }) {
  return <span aria-hidden="true" style={{ ...s(`position:absolute;display:grid;place-items:center;background:#FFFFFF;border-radius:18px;box-shadow:0 8px 20px rgba(30,36,48,.1);animation:kBob 4.2s ease-in-out infinite;${style}`) }}>{children}</span>;
}

/** Flint, with a soft glow behind and a few quiet words floating near, so Talk opens like a friend's doorstep. */
export function TalkHero({ look }: { look: Look }) {
  return (
    <div style={s('position:relative;height:214px;display:grid;place-items:center')}>
      <span aria-hidden="true" style={s('position:absolute;width:236px;height:236px;border-radius:50%;background:radial-gradient(circle,#FFFFFF 0%,var(--wash) 46%,rgba(255,255,255,0) 72%)')} />
      <div style={s('position:relative;width:176px;height:176px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 36%,#FFFFFF,var(--t1));box-shadow:0 14px 34px rgba(30,36,48,.12);display:flex;justify-content:center;align-items:flex-end')}><Companion look={look} size={176} /></div>
      <Bubble style="left:6px;top:26px;width:58px;height:38px;animation-delay:-1s">
        <svg width="34" height="12" viewBox="0 0 34 12"><circle cx="5" cy="6" r="3.4" fill="var(--accent2)" /><circle cx="17" cy="6" r="3.4" fill="var(--accent2)" opacity=".7" /><circle cx="29" cy="6" r="3.4" fill="var(--accent2)" opacity=".45" /></svg>
      </Bubble>
      <Bubble style="right:8px;top:14px;width:46px;height:46px;border-radius:50%;animation-delay:-2.4s">
        <svg width="24" height="22" viewBox="0 0 24 22"><path d="M12 20 C-4 9 3 -2 12 5 C21 -2 28 9 12 20z" fill="#E8789B" /></svg>
      </Bubble>
      <Bubble style="right:2px;bottom:34px;width:40px;height:40px;border-radius:50%;animation-delay:-3.2s">
        <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 1 L13.2 8.8 L21 11 L13.2 13.2 L11 21 L8.8 13.2 L1 11 L8.8 8.8z" fill="var(--gold)" /></svg>
      </Bubble>
    </div>
  );
}
