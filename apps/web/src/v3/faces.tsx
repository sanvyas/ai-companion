// Five faces for five ways of being, so "how are you?" can be answered at a glance and never by colour alone: the shape of the
// mouth and brows says it, the colour only warms it.

const INK = '#2A2E45';
export const FACE_FILL = ['#C9C5EC', '#F6C3AE', '#E6DBC4', '#B5DEC4', '#F8D77A'];

export function Face({ mood, size = 44 }: { mood: number; size?: number }) {
  const eye = (x: number, y = 21) => <circle cx={x} cy={y} r="2.2" fill={INK} />;
  const f = { fill: 'none', stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
      <circle cx="24" cy="24" r="23" fill={FACE_FILL[mood]} />
      {mood === 0 && <><path d="M14.5 22 Q17.5 26 20.5 22 M27.5 22 Q30.5 26 33.5 22" {...f} /><path d="M17 35.5 Q24 29.5 31 35.5" {...f} /><path d="M36 26 q2.4 3.4 0 5.2 q-2.4 -1.8 0 -5.2z" fill="#7FB3E6" stroke={INK} strokeWidth="1.2" /></>}
      {mood === 1 && <><path d="M14 17.5 L20 15.5 M34 17.5 L28 15.5" {...f} />{eye(17.5)}{eye(30.5)}<path d="M16 34 q2.7 -3 5.3 0 t5.3 0 t5.3 0" {...f} /></>}
      {mood === 2 && <>{eye(17.5)}{eye(30.5)}<path d="M17 33.5 H31" {...f} /></>}
      {mood === 3 && <>{eye(17.5)}{eye(30.5)}<path d="M16.5 31 Q24 38 31.5 31" {...f} /></>}
      {mood === 4 && <><path d="M14.5 22 Q17.5 17.5 20.5 22 M27.5 22 Q30.5 17.5 33.5 22" {...f} /><path d="M14 29.5 Q24 42 34 29.5 Z" fill="#FFFFFF" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" /></>}
    </svg>
  );
}
