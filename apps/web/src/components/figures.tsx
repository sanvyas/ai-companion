import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useStore, type AvatarMode, type Look } from '../state/store';

/** Reduce motion = in-app setting OR the OS preference (PRD §3.2). */
export function useReduceMotion(): boolean {
  const setting = useStore(s => s.reduceMotion);
  const [os, setOs] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setOs(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return setting || os;
}

const ease = 'cubic-bezier(.45,0,.55,1)';

export function Orb({ size, mode = 'idle' }: { size: number; mode?: AvatarMode }) {
  const reduce = useReduceMotion();
  const m = mode === 'concerned' || mode === 'smiling' ? 'idle' : mode;
  return (
    <div aria-hidden style={{ position: 'relative', width: size, height: size, flex: 'none', opacity: m === 'paused' ? 0.55 : 1, transition: 'opacity 600ms' }}>
      {m === 'listening' && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(207,227,240,.75)', animation: reduce ? 'sFade 2.4s infinite' : 'sRing 2.4s cubic-bezier(.22,.61,.36,1) infinite' }} />}
      {m === 'speaking' && <div style={{ position: 'absolute', inset: '-8%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(241,165,107,0) 52%, rgba(241,165,107,.38) 68%, rgba(241,165,107,0) 78%)', animation: reduce ? 'none' : 'sSpeak .9s ease-in-out infinite' }} />}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', background: 'radial-gradient(circle at 34% 30%, #FFF8EE 0%, #F8D3B4 24%, #D9C2E4 54%, #9FCFC3 84%, #7FC4B5 100%)', boxShadow: `0 ${Math.round(size * 0.12)}px ${Math.round(size * 0.4)}px rgba(183,177,230,.55)`, animation: reduce ? 'sFade 6s ease-in-out infinite' : `sBreathe 6s ${ease} infinite` }}>
        <div style={{ position: 'absolute', inset: '14%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,.8), rgba(255,255,255,0) 60%)', transform: m === 'thinking' ? 'translate(-16%,-12%)' : 'none', transition: 'transform 900ms cubic-bezier(.22,.61,.36,1)' }} />
      </div>
    </div>
  );
}

/** Soft breathing disc used for Walk, Breathe and the Calm player. */
export function Disc({ size, bg }: { size: number; bg: string }) {
  const reduce = useReduceMotion();
  return <div aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: bg, animation: reduce ? 'sFade 6s ease-in-out infinite' : `sBreathe2 6s ${ease} infinite` }} />;
}

type LookKey = Exclude<Look, 'orb'>;
const LOOKS: Record<LookKey, { name: string; skin: string; shade: string; hair: string; brow: string; cloth: string; style: 'long' | 'short' | 'wrap' | 'grey' }> = {
  asha: { name: 'Asha', skin: '#8D5A3B', shade: '#7A4C31', hair: '#1E1512', brow: '#1E1512', cloth: '#3F7A70', style: 'long' },
  dev: { name: 'Dev', skin: '#C68B63', shade: '#B07851', hair: '#2A1D17', brow: '#2A1D17', cloth: '#5A5493', style: 'short' },
  noor: { name: 'Noor', skin: '#E2B48F', shade: '#CF9F7A', hair: '#8C86C9', brow: '#3A2A22', cloth: '#E79A62', style: 'wrap' },
  kabir: { name: 'Kabir', skin: '#A86F4C', shade: '#93603F', hair: '#D9D4CE', brow: '#9C958E', cloth: '#2B3A63', style: 'grey' },
};

export const lookName = (lk: Look) => (lk === 'orb' ? 'Orb' : LOOKS[lk].name);

const A = (st: CSSProperties): CSSProperties => ({ position: 'absolute', ...st });

/** Stylised 2D avatar (never photoreal, PRD §8.7.2). Production: commissioned rigs. */
function Avatar({ look, w, mode, mouth }: { look: LookKey; w: number; mode: AvatarMode; mouth: number }) {
  const reduce = useReduceMotion();
  const L = LOOKS[look];
  const an = (a: string) => (reduce ? 'none' : a);
  const away = mode === 'thinking', smile = mode === 'smiling', worry = mode === 'concerned', talk = mode === 'speaking';
  const mw = 20 + mouth * 8, mh = 4 + mouth * 14;
  const ms: CSSProperties = talk ? { width: mw, height: mh, borderRadius: '50%', left: 120 - mw / 2, top: 167 - mouth * 5 }
    : smile ? { width: 32, height: 13, borderRadius: '0 0 16px 16px', left: 104, top: 162 }
    : worry ? { width: 18, height: 5, borderRadius: 3, left: 111, top: 167 }
    : { width: 26, height: 8, borderRadius: '0 0 13px 13px', left: 107, top: 163 };
  const br = worry ? 12 : smile ? -5 : 0;
  const eyeH = smile ? 7 : 13;
  const wrap = L.style === 'wrap';
  const back: ReactNode[] = [];
  if (L.style === 'long') back.push(<div key="hb" style={A({ left: 50, top: 42, width: 140, height: 210, borderRadius: '70px 70px 44px 44px', background: L.hair })} />);
  if (wrap) back.push(<div key="hb" style={A({ left: 44, top: 32, width: 152, height: 220, borderRadius: '76px 76px 56px 56px', background: L.hair })} />);
  const hairTop: CSSProperties = L.style === 'long' ? { left: 60, top: 42, width: 120, height: 58, borderRadius: '60px 60px 16px 44px', background: L.hair }
    : L.style === 'short' ? { left: 62, top: 38, width: 116, height: 48, borderRadius: '58px 58px 12px 18px', background: L.hair }
    : wrap ? { left: 58, top: 34, width: 124, height: 50, borderRadius: '62px 62px 8px 8px', background: L.hair }
    : { left: 68, top: 44, width: 104, height: 30, borderRadius: '52px 52px 8px 8px', background: L.hair };
  return (
    <div aria-hidden style={{ position: 'relative', width: w, height: w * 1.25, flex: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 240, height: 300, transform: `scale(${w / 240})`, transformOrigin: '0 0' }}>
        {back}
        <div style={A({ left: 0, top: 0, width: 240, height: 300, animation: an(`sChest 6s ${ease} infinite`) })}>
          <div style={A({ left: 104, top: 178, width: 32, height: 64, borderRadius: 16, background: L.shade })} />
          {wrap && <div style={A({ left: 62, top: 196, width: 116, height: 60, borderRadius: '58px 58px 24px 24px', background: L.hair })} />}
          <div style={A({ left: 24, top: 228, width: 192, height: 120, borderRadius: '96px 96px 0 0', background: L.cloth })} />
          <div style={A({ left: 98, top: 226, width: 44, height: 16, borderRadius: '0 0 22px 22px', background: L.shade, opacity: wrap ? 0 : 1 })} />
        </div>
        <div style={A({ left: 0, top: 0, width: 240, height: 300, transformOrigin: '120px 200px', transform: away ? 'rotate(-4deg) translateX(-3px)' : worry ? 'rotate(3deg)' : 'none', transition: 'transform 900ms cubic-bezier(.22,.61,.36,1)' })}>
          <div style={A({ left: 0, top: 0, width: 240, height: 300, transformOrigin: '120px 200px', animation: an(mode === 'listening' ? 'sTilt 6s ease-in-out infinite' : 'sTilt 12s ease-in-out infinite') })}>
            <div style={A({ left: 56, top: 108, width: 16, height: 26, borderRadius: '50%', background: L.shade, opacity: wrap ? 0 : 1 })} />
            <div style={A({ left: 168, top: 108, width: 16, height: 26, borderRadius: '50%', background: L.shade, opacity: wrap ? 0 : 1 })} />
            <div style={A({ left: 64, top: 52, width: 112, height: 142, borderRadius: '50% 50% 46% 46% / 54% 54% 46% 46%', background: L.skin })} />
            <div style={A(hairTop)} />
            <div style={A({ left: 78, top: 146, width: 20, height: 14, borderRadius: '50%', background: 'rgba(232,110,90,.16)' })} />
            <div style={A({ left: 142, top: 146, width: 20, height: 14, borderRadius: '50%', background: 'rgba(232,110,90,.16)' })} />
            <div style={A({ left: 86, top: 104, width: 22, height: 4, borderRadius: 2, background: L.brow, transform: `rotate(${-br}deg) translateY(${worry ? -2 : 0}px)`, transition: 'transform 500ms' })} />
            <div style={A({ left: 132, top: 104, width: 22, height: 4, borderRadius: 2, background: L.brow, transform: `rotate(${br}deg) translateY(${worry ? -2 : 0}px)`, transition: 'transform 500ms' })} />
            <div style={A({ left: 0, top: 0, width: 240, height: 300, transform: away ? 'translate(-6px,-4px)' : 'none', transition: 'transform 700ms cubic-bezier(.22,.61,.36,1)' })}>
              <div style={A({ left: 92, top: 118 + (13 - eyeH) / 2, width: 10, height: eyeH, borderRadius: '50%', background: '#1F1A1C', animation: an('sBlink 5.5s infinite'), transition: 'height 400ms' })} />
              <div style={A({ left: 138, top: 118 + (13 - eyeH) / 2, width: 10, height: eyeH, borderRadius: '50%', background: '#1F1A1C', animation: an('sBlink 5.5s infinite'), transition: 'height 400ms' })} />
            </div>
            <div style={A({ left: 116, top: 140, width: 8, height: 12, borderRadius: '4px 4px 6px 6px', background: L.shade })} />
            <div style={A({ ...ms, background: '#6E2E33', transition: talk ? 'none' : 'all 400ms' })} />
            {L.style === 'grey' && (
              <>
                <div style={A({ left: 84, top: 112, width: 24, height: 24, borderRadius: '50%', border: '2px solid #2A2E45' })} />
                <div style={A({ left: 132, top: 112, width: 24, height: 24, borderRadius: '50%', border: '2px solid #2A2E45' })} />
                <div style={A({ left: 108, top: 122, width: 24, height: 2, background: '#2A2E45' })} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarConnected({ look, w, mode }: { look: LookKey; w: number; mode: AvatarMode }) {
  const mouth = useStore(s => s.mouth);
  return <Avatar look={look} w={w} mode={mode} mouth={mode === 'speaking' ? mouth : 0} />;
}

/** The companion figure for the chosen look: orb or one of the stylised avatars. */
export function Companion({ look, size, mode = 'idle' }: { look: Look; size: number; mode?: AvatarMode }) {
  return look === 'orb' ? <Orb size={size} mode={mode} /> : <AvatarConnected look={look} w={size} mode={mode} />;
}

export const LOOK_OPTIONS: { id: Look; label: string }[] = [
  { id: 'orb', label: 'Orb' }, { id: 'asha', label: 'Asha' }, { id: 'dev', label: 'Dev' }, { id: 'noor', label: 'Noor' }, { id: 'kabir', label: 'Kabir' },
];
