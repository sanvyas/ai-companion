import type { CSSProperties } from 'react';

export function Svg({ d, size = 22, stroke = '#2A2E45', sw = 1.75, fill = 'none', style, label }: { d: string; size?: number; stroke?: string; sw?: number; fill?: string; style?: CSSProperties; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={d} />
    </svg>
  );
}

export const P = {
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  wave: 'M3 12c3-4 6-4 9 0s6 4 9 0',
  pen: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  walker: 'M13 4.5a1.5 1.5 0 1 0 0 .01M10 21l2-6 3 3v3M12 15l-1-5 4 2 2 2M11 10l-3 2v3',
  mic: 'M9 3h6v8a3 3 0 0 1-6 0V3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M9 3h6v8a3 3 0 0 1-6 0V3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18',
  cc: 'M3 6h18v12H3zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5l11 7-11 7z',
  pauseSolid: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  text: 'M4 5h16v11H9l-5 4z',
  video: 'M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5',
  person: 'M12 3.5a3 3 0 1 0 0 .01M5.5 20c0-4 2.9-6.5 6.5-6.5s6.5 2.5 6.5 6.5',
  send: 'M12 19V5M6 11l6-6 6 6',
  prev: 'M11 7l-5 5 5 5M18 7l-5 5 5 5',
  next: 'M6 7l5 5-5 5M13 7l5 5-5 5',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z',
  clock: 'M12 7.5V12l3 2M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z',
  phone: 'M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z',
  stop: 'M8 8h8v8H8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};
