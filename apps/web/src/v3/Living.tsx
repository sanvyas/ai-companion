import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { partOf, type Part } from './theme';

// A small garden that is simply alive: the sky is the sky outside, grass and flowers sway, a butterfly drifts across. It is not a
// score and counts nothing; it is there so opening the app feels like arriving somewhere, not like opening a list. Touch it and
// a few petals lift. With reduced motion it holds still (the app-wide rule), and it never goes dark.

const SKY: Record<Part, [string, string]> = { morning: ['#FCE3CF', '#FFF4E6'], afternoon: ['#CFE5F0', '#EAF4F2'], evening: ['#F4D2C0', '#EFDDE8'], night: ['#DAD5EE', '#ECE8F6'] };
const FLOWER = ['#F2B33D', '#E8789B', '#B7A6F0', '#FFFFFF', '#F28C6B', '#F2B33D', '#E8789B'];
const SPOTS = [[30, 118, 0.9], [66, 128, 1.05], [112, 116, 0.8], [168, 130, 1], [214, 120, 0.85], [262, 128, 1.1], [306, 118, 0.9]] as const;

function Flower({ x, y, k, color, i }: { x: number; y: number; k: number; color: string; i: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <g className="v3-sway" style={{ animationDelay: `${-i * 0.7}s`, animationDuration: `${3.6 + (i % 3) * 0.6}s` }}>
        <path d="M0 0 C-1 12 1 22 0 34" stroke="#5E9A66" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M0 22 C-9 17 -12 20 -13 25 C-8 27 -3 26 0 22z" fill="#6FAE76" />
        {[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-7" rx="4.6" ry="7" fill={color} transform={`rotate(${a})`} />)}
        <circle r="4" fill={color === '#FFFFFF' ? '#F2B33D' : '#FFF3C4'} />
      </g>
    </g>
  );
}

export function Living() {
  const mood = useStore(x => x.mood);
  const part = partOf(new Date().getHours());
  const [a, b] = SKY[part];
  const [petals, setPetals] = useState<{ id: number; x: number }[]>([]);
  const night = part === 'night';
  // A heavy day gets more sun in the picture; a good one gets more company.
  const glow = mood !== null && mood <= 1 ? 1.25 : 1;
  const extra = mood !== null && mood >= 3;
  const blades = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: 6 + i * 10 + ((i * 7) % 5), h: 10 + ((i * 13) % 12), d: -((i * 37) % 30) / 10 })), []);
  const touch = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setPetals(p => [...p.slice(-2), { id, x: ((e.clientX - r.left) / r.width) * 100 }]);
    setTimeout(() => setPetals(p => p.filter(q => q.id !== id)), 1600);
  };
  return (
    <div role="img" aria-label="A small garden, swaying gently in the light" onPointerDown={touch} style={{ position: 'relative', height: 176, borderRadius: 28, overflow: 'hidden', background: `linear-gradient(180deg,${a},${b})`, boxShadow: '0 12px 30px rgba(30,36,48,.08)', touchAction: 'manipulation' }}>
      <svg viewBox="0 0 342 176" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0 }}>
        <defs><radialGradient id="v3sun"><stop offset="0" stopColor="#FFF7D6" stopOpacity="1" /><stop offset="1" stopColor="#FFF7D6" stopOpacity="0" /></radialGradient></defs>
        <g className="v3-glow" style={{ transformOrigin: '270px 44px' }}>
          <circle cx="270" cy="44" r={46 * glow} fill="url(#v3sun)" opacity={night ? 0.55 : 0.9} />
          <circle cx="270" cy="44" r="15" fill={night ? '#FBF4DA' : '#FFE08A'} />
          {night && <circle cx="264" cy="40" r="13" fill={b} opacity=".9" />}
        </g>
        {night && [[40, 30], [90, 52], [150, 24], [205, 40], [318, 70], [60, 80]].map(([x, y], i) => <circle key={i} className="v3-twinkle" cx={x} cy={y} r="1.6" fill="#FFFFFF" style={{ animationDelay: `${-i * 0.8}s` }} />)}
        <g className="v3-drift" opacity=".9"><ellipse cx="70" cy="40" rx="30" ry="9" fill="#FFFFFF" opacity=".75" /><ellipse cx="92" cy="34" rx="20" ry="8" fill="#FFFFFF" opacity=".75" /></g>
        <g className="v3-drift2" opacity=".8"><ellipse cx="190" cy="62" rx="24" ry="7" fill="#FFFFFF" opacity=".6" /><ellipse cx="208" cy="57" rx="15" ry="6" fill="#FFFFFF" opacity=".6" /></g>
        <path d="M0 112 C50 84 96 96 150 104 C214 114 262 84 342 98 V176 H0z" fill="#CBE6CB" />
        <path d="M0 132 C60 108 120 124 180 126 C240 128 290 112 342 122 V176 H0z" fill="#A9D4AE" />
        <path d="M0 150 C70 136 140 148 210 146 C270 144 310 140 342 144 V176 H0z" fill="#86BD8F" />
        {blades.map((g, i) => <path key={i} className="v3-sway" d={`M${g.x} 176 q-1 -${g.h / 2} 2 -${g.h}`} stroke="#5E9A66" strokeWidth="1.6" fill="none" strokeLinecap="round" style={{ animationDelay: `${g.d}s` }} />)}
        {SPOTS.map(([x, y, k], i) => <Flower key={i} x={x} y={y + 8} k={k * 0.8} color={FLOWER[i]} i={i} />)}
        <g className="v3-fly"><g transform="translate(0 0)"><ellipse cx="-4" cy="0" rx="4" ry="5.5" fill="#F2B33D" className="v3-wing" /><ellipse cx="4" cy="0" rx="4" ry="5.5" fill="#E8789B" className="v3-wing" /><rect x="-.8" y="-4" width="1.6" height="8" rx=".8" fill="#2A2E45" /></g></g>
        {extra && <g className="v3-fly v3-fly2"><g><ellipse cx="-3.4" cy="0" rx="3.4" ry="4.6" fill="#B7A6F0" className="v3-wing" /><ellipse cx="3.4" cy="0" rx="3.4" ry="4.6" fill="#7FD1C3" className="v3-wing" /><rect x="-.7" y="-3.4" width="1.4" height="6.8" rx=".7" fill="#2A2E45" /></g></g>}
      </svg>
      {petals.map(p => (
        <span key={p.id} aria-hidden="true" style={{ position: 'absolute', left: `${p.x}%`, bottom: 36, pointerEvents: 'none' }}>
          {[0, 1, 2, 3, 4].map(n => <i key={n} className="v3-petal" style={{ animationDelay: `${n * 70}ms`, ['--dx' as string]: `${(n - 2) * 16}px`, background: FLOWER[n] }} />)}
        </span>
      ))}
    </div>
  );
}
