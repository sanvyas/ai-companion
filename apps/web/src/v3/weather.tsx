// Five kinds of weather for five ways of being, so "how are you?" can be answered at a glance and never by colour alone:
// the drawing says it (storm, wind, cloud, sun behind cloud, sun), the colour of the sky only warms it. The first is the
// heaviest day and the last the lightest, the same order as the numbers kept on the server.

const INK = '#2A2E45';
/** The sky behind each one. */
export const SKY_FILL = ['#C9C5EC', '#F6D2C0', '#E6E2D8', '#CFE6DB', '#F8D77A'];
/** The plain word for each, shown beside the feeling's own word. */
export const WEATHER_NAMES = ['Stormy', 'Windy', 'Cloudy', 'Partly sunny', 'Sunny'];

const CLOUD = 'M15 34 Q8 34 8.5 28 Q9 23 14.5 22.5 Q16 15 24 15 Q31 15 33 21.5 Q40 22 40 28 Q40 34 33 34 Z';
const RAYS = (cx: number, cy: number, r1: number, r2: number) => Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return `M${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)}`;
}).join(' ');

/** `live` lets it move, slowly: wind drifts, clouds float, the bolt flickers, the sun's rays turn. Nothing moves for people who ask for less. */
export function Weather({ mood, size = 44, live = false }: { mood: number; size?: number; live?: boolean }) {
  const c = (name: string) => (live ? name : undefined);
  // Drawn big, the same lines would look heavy, so they get thinner as it grows.
  const k = size >= 100 ? 0.62 : 1;
  const line = { fill: 'none', stroke: INK, strokeWidth: 2.2 * k, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const cloud = (fill: string, t = '') => <path d={CLOUD} fill={fill} stroke={INK} strokeWidth={2.2 * k} strokeLinejoin="round" transform={t || undefined} />;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
      <circle cx="24" cy="24" r="23" fill={SKY_FILL[mood]} />
      {mood === 0 && <><g className={c('wx-float')}>{cloud('#8E8BC4', 'translate(0 -4)')}</g><path className={c('wx-flicker')} d="M26 28 L19.5 38 H25 L22.5 45 L30.5 34 H25.5 Z" fill="#F7C948" stroke={INK} strokeWidth={1.8 * k} strokeLinejoin="round" /></>}
      {mood === 1 && <><g className={c('wx-wind')}><path d="M9 19 H29 a4.5 4.5 0 1 0 -4.5 -4.5" {...line} /><path d="M9 26 H36 a5 5 0 1 1 -5 5" {...line} /><path d="M9 33 H21 a3.5 3.5 0 1 1 -3.5 3.5" {...line} /></g></>}
      {mood === 2 && <g className={c('wx-float')}>{cloud('#FFFFFF', 'translate(0 1)')}</g>}
      {mood === 3 && <><path className={c('wx-spin')} d={RAYS(31, 17, 9.5, 12.5)} {...line} strokeWidth={2 * k} /><circle cx="31" cy="17" r="6.5" fill="#F7C948" stroke={INK} strokeWidth={2 * k} /><g className={c('wx-float')}>{cloud('#FFFFFF', 'translate(1 8) scale(.84)')}</g></>}
      {mood === 4 && <><path className={c('wx-spin')} d={RAYS(24, 24, 12.5, 17)} {...line} /><circle cx="24" cy="24" r="8.5" fill="#FFFFFF" stroke={INK} strokeWidth={2.2 * k} /><circle cx="24" cy="24" r="6" fill="#F7C948" /></>}
    </svg>
  );
}
