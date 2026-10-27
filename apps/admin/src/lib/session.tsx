import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onSignedOut, setCsrf } from './api';

export type Role = 'owner' | 'engineer' | 'support' | 'viewer';
export interface Me { admin: { id: string; email: string; name: string; role: Role }; csrf: string; permissions: string[]; environment: string }

interface Session { me: Me | null; ready: boolean; can: (p: string) => boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<Session>({ me: null, ready: false, can: () => false, refresh: async () => undefined, signOut: async () => undefined });
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const load = async () => {
    try { const m = await api.get<Me>('/auth/me'); setCsrf(m.csrf); setMe(m); } catch { setMe(null); setCsrf(''); }
    setReady(true);
  };
  useEffect(() => { void load(); return onSignedOut(() => { setMe(null); setCsrf(''); }); }, []);
  const value: Session = {
    me, ready, refresh: load,
    can: p => !!me?.permissions.includes(p),
    signOut: async () => { try { await api.post('/auth/logout'); } catch { /* already out */ } setMe(null); setCsrf(''); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
