import { useEffect, useRef, useState } from 'react';
import { C, shadow } from '../theme';
import { signInWithGoogle } from '../state/session';

// "Continue with Google", drawn in the app's own style. Google only issues a sign-in token through its own button, so
// that real button is rendered invisibly on top of ours and receives the tap. The token is verified server-side.
interface GsiWindow { google?: { accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } } } }

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  loading ??= new Promise((res, rej) => {
    if ((window as unknown as GsiWindow).google) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { loading = null; rej(new Error('gsi')); };
    document.head.appendChild(s);
  });
  return loading;
}

const HEIGHT = 52;
const GIS_HEIGHT = 40; // the height of Google's "large" button; it is stretched to fill ours

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({ clientId }: { clientId: string }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    loadGsi().then(() => {
      const g = (window as unknown as GsiWindow).google;
      const el = overlay.current;
      if (dead || !g || !el) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => void signInWithGoogle(r.credential), ux_mode: 'popup' });
      g.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, Math.round(el.offsetWidth)) });
      setReady(true);
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [clientId]);
  return (
    <div style={{ position: 'relative', height: HEIGHT, borderRadius: HEIGHT / 2, overflow: 'hidden' }}>
      {/* What people see: matches the other buttons. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.white, border: `1.5px solid ${C.track}`, boxShadow: shadow.cardSoft, borderRadius: HEIGHT / 2, fontSize: 17, fontWeight: 600, color: C.ink, opacity: ready ? 1 : 0.6 }}>
        <GoogleG /> Continue with Google
      </div>
      {/* What receives the tap: Google's own button, invisible and stretched to fill ours. */}
      <div ref={overlay} style={{ position: 'absolute', inset: 0, opacity: 0.01, transform: `scaleY(${HEIGHT / GIS_HEIGHT})`, transformOrigin: 'top', display: 'flex', justifyContent: 'center' }} />
    </div>
  );
}
