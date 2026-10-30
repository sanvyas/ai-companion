// The icons the third design draws, as paths in a 24 x 24 box.
export const I = {
  mic: 'M9 3h6v8a3 3 0 0 1-6 0V3zM5 11a7 7 0 0 0 14 0M12 18v3', video: 'M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5', chat: 'M4 5h16v11H9l-5 4V5z',
  sit: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 20c0-4 2.7-7 6-7s6 3 6 7', walk: 'M13 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM10 21l2-6 3 3v3M8 11l4-3 3 3 3 1M12 8v5l-3 4',
  breathe: 'M3 12c3-4 6-4 9 0s6 4 9 0', pen: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4', moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  game: 'M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5.2 2L14 14h-4l-1.8 2A3 3 0 0 1 3 14v-2a3 3 0 0 1 3-3zM8 11v3M6.5 12.5h3', home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11', pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z',
  lotus: 'M12 4c2 3 2 6 0 9-2-3-2-6 0-9zM4 10c3 0 6 2 8 7-4 0-7-2-8-7zM20 10c-3 0-6 2-8 7 4 0 7-2 8-7zM4 20h16',
  phone: 'M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z', chev: 'M9 5l7 7-7 7',
  month: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', back: 'M15 5l-7 7 7 7', check: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14',
  send: 'M4 12l16-8-6 16-3-7z', x: 'M6 6l12 12M18 6L6 18', down: 'M5 9l7 7 7-7', refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', play: 'M8 5l11 7-11 7z', pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3',
} as const;

export function Svg({ d, size = 24, sw = 1.8, stroke = 'currentColor', fill = 'none', style }: { d: string; size?: number; sw?: number; stroke?: string; fill?: string; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}><path d={d} /></svg>;
}

/** The ring-and-cross life buoy the Help button wears. */
export function Buoy({ size = 18, color = '#9A3B1E' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></svg>;
}
