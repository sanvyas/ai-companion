import { useEffect, useRef } from 'react';
import { signInWithGoogle } from '../state/session';

// Google Sign-In (shown only when the server has a client id). The ID token is verified server-side.
interface GsiWindow { google?: { accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } } } }

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  loading ??= new Promise((res, rej) => {
    if ((window as unknown as GsiWindow).google) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('gsi'));
    document.head.appendChild(s);
  });
  return loading;
}

export function GoogleButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    loadGsi().then(() => {
      const g = (window as unknown as GsiWindow).google;
      if (dead || !g || !ref.current) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => void signInWithGoogle(r.credential), ux_mode: 'popup' });
      g.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [clientId]);
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />;
}
