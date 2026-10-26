import { C } from '../theme';
import { useStore, type Screen } from '../state/store';
import { go } from "../state/actions";
import { stopAllSounds } from '../audio/sounds';
import { SOUND_DEFS } from '../data/calm';
import { Svg } from '../components/icons';
import { flex } from '../components/ui';

const NAV_KEY: Partial<Record<Screen, 'today' | 'outside' | 'journal' | 'you'>> = { privacy: 'you', notifs: 'you', memory: 'you', studio: 'you', journey: 'journal', calm: 'today' };
export const NAV_SCREENS: Screen[] = ['today', 'talk', 'outside', 'journey', 'you', 'privacy', 'notifs', 'journal', 'memory', 'calm'];

export function Nav() {
  const screen = useStore(s => s.screen);
  const key = NAV_KEY[screen] ?? screen;
  const col = (k: string) => (key === k ? C.teal : C.muted);
  const item = (k: Screen, label: string, d: string, extra?: { fill?: string; round?: boolean }) => (
    <button onClick={() => go(k)} aria-current={key === k ? 'page' : undefined} style={{ background: 'none', border: 'none', ...flex('column', 4), alignItems: 'center', color: col(k) }}>
      <Svg d={d} size={24} stroke="currentColor" fill={extra?.fill ?? 'none'} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
    </button>
  );
  return (
    <nav aria-label="Main" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 'var(--nav-h)', padding: '0 8px var(--sa-bottom)', background: 'rgba(251,247,240,.94)', backdropFilter: 'blur(16px)', boxShadow: '0 -10px 30px rgba(42,46,69,.06)', display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', alignItems: 'center', zIndex: 20 }}>
      {item('today', 'Today', 'M16.5 11a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM3 19.5h18')}
      {item('outside', 'Outside', 'M3 19c3.5-6 6.5-9 9-9s5.5 3 9 9M19 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z')}
      <button onClick={() => go('talk')} aria-label="Talk" aria-current={screen === 'talk' ? 'page' : undefined} style={{ background: 'none', border: 'none', ...flex('column', 4), alignItems: 'center', color: C.teal }}>
        <span style={{ width: 60, height: 60, borderRadius: '50%', background: C.teal, display: 'grid', placeItems: 'center', marginTop: -18, boxShadow: '0 10px 24px rgba(63,122,112,.35)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="1.75" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" /></svg>
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Talk</span>
      </button>
      {item('journal', 'Journal', 'M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5H7.5A2.5 2.5 0 0 1 5 18V4.5a1 1 0 0 1 1-1zM5 18a2.5 2.5 0 0 1 2.5-2.5h11M9 8h6')}
      {item('you', 'You', 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4.5 20.5c1.5-3.8 4.3-5.5 7.5-5.5s6 1.7 7.5 5.5')}
    </nav>
  );
}

/** Mini sound bar above the tabs while background sounds play (PRD §8 global elements). */
export function SoundBar() {
  const screen = useStore(s => s.screen);
  const sounds = useStore(s => s.sounds);
  const player = useStore(s => s.player);
  const on = Object.keys(sounds);
  if (!on.length || player || screen === 'calm' || !NAV_SCREENS.includes(screen)) return null;
  const names = Object.fromEntries(SOUND_DEFS.map(d => [d.id, d.label]));
  return (
    <div role="region" aria-label="Sounds" style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(var(--nav-h) + 12px)', zIndex: 21, height: 52, borderRadius: 26, background: C.ink, color: C.moonText, ...flex('row', 12), alignItems: 'center', padding: '0 6px 0 18px', boxShadow: '0 12px 28px rgba(18,24,43,.25)', animation: 'sUp 400ms' }}>
      <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: '#7FC4B5' }} />
      <button onClick={() => go('calm', { calmTab: 'sounds' })} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: C.moonText, fontSize: 15, padding: 0 }}>{on.length === 1 ? `${names[on[0]]} is playing` : `${on.length} sounds playing`}</button>
      <button onClick={stopAllSounds} style={{ height: 40, padding: '0 16px', borderRadius: 20, border: 'none', background: 'rgba(255,255,255,.14)', color: C.moonText, fontSize: 15, fontWeight: 600 }}>Stop</button>
    </div>
  );
}

export function Toast() {
  const toast = useStore(s => s.toast);
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(var(--nav-h) + 20px)', zIndex: 70, pointerEvents: 'none' }}>
      {toast && <div key={toast} style={{ background: C.ink, color: C.moonText, borderRadius: 20, padding: '14px 18px', fontSize: 15, lineHeight: 1.4, animation: 'sUp 400ms cubic-bezier(.22,.61,.36,1)' }}>{toast}</div>}
    </div>
  );
}

