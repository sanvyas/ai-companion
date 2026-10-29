import type { CSSProperties } from 'react';

/** Line icons (24 x 24, 2px stroke). The paths are fixed strings written here, never user text. */
const PATHS = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1.5h12"/><path d="M9 8h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.5-3.8 4.3-5.5 7.5-5.5s6 1.7 7.5 5.5"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  rain: '<path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18 9a3.5 3.5 0 0 1-.5 7"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  wave: '<path d="M3 12c3-5 6-5 9 0s6 5 9 0"/><path d="M3 17c3-4 6-4 9 0s6 4 9 0"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/>',
  star: '<path d="M12 3l2.5 5.5 6 .7-4.5 4 1.3 6L12 16.3 6.7 19.2 8 13.2 3.5 9.2l6-.7z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  lotus: '<path d="M12 20c-4 0-7-2.6-7-6.5 3.2 0 5.6 1.4 7 4 1.4-2.6 3.8-4 7-4 0 3.9-3 6.5-7 6.5z"/><path d="M12 18c-2.6-2.4-2.6-8 0-13 2.6 5 2.6 10.6 0 13z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  leaf: '<path d="M12 21V11"/><path d="M12 13c-4.500 0-6.500-3-6.500-7 4.500 0 6.500 3 6.500 7z"/><path d="M12 15c4 0 6-2.600 6-6-4 0-6 2.600-6 6z"/>',
  mute: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M3 9h18v-3H3zM12 6c-1-3-5-3-5-1s3 1 5 1zm0 0c1-3 5-3 5-1s-3 1-5 1z"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.500C10 5 12 3 12 3s2 2 0 6.500zM14.500 12c4.500-2 6.500 0 6.500 0s-2 2-6.500 0zM12 14.500c2 4.500 0 6.500 0 6.500s-2-2 0-6.500zM9.500 12C5 14 3 12 3 12s2-2 6.500 0z"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function Ic({ n, color, size, style }: { n: IconName; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <svg className="i" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width={size} height={size} style={style} dangerouslySetInnerHTML={{ __html: PATHS[n] }} />
  );
}
