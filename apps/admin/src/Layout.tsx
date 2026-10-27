import { useEffect, useState, type ReactNode } from 'react';
import { api, useLoad } from './lib/api';
import { go, useRoute } from './lib/router';
import { useSession } from './lib/session';
import { Button, Dialog, Field, useAction } from './lib/ui';

interface NavItem { id: string; label: string; perm?: string; badge?: number }
const GROUPS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ id: 'overview', label: 'Overview' }] },
  { title: 'Business', items: [{ id: 'users', label: 'People', perm: 'users.read' }, { id: 'cost', label: 'Cost and pricing', perm: 'cost.read' }] },
  { title: 'AI', items: [{ id: 'prompts', label: 'Prompts', perm: 'prompts.read' }, { id: 'evals', label: 'Evaluations', perm: 'prompts.read' }, { id: 'safety', label: 'Safety review', perm: 'safety.read' }] },
  { title: 'Product', items: [{ id: 'settings', label: 'Settings and flags', perm: 'flags.read' }, { id: 'content', label: 'Content', perm: 'content.read' }, { id: 'analytics', label: 'Usage analytics', perm: 'analytics.read' }] },
  { title: 'Platform', items: [{ id: 'changes', label: 'Approvals', perm: 'changes.read' }, { id: 'integrations', label: 'Integrations and keys', perm: 'integrations.read' }, { id: 'infra', label: 'Infrastructure', perm: 'infra.read' }, { id: 'developer', label: 'Developer', perm: 'dev.read' }, { id: 'audit', label: 'Audit log', perm: 'audit.read' }, { id: 'admins', label: 'Admins', perm: 'admins.manage' }] },
];

function useTheme() {
  const [t, setT] = useState<'auto' | 'light' | 'dark'>(() => { try { return (localStorage.getItem('saathi.admin.theme') as 'auto' | 'light' | 'dark') ?? 'auto'; } catch { return 'auto'; } });
  useEffect(() => {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
    try { localStorage.setItem('saathi.admin.theme', t); } catch { /* private window */ }
  }, [t]);
  return [t, () => setT(x => (x === 'auto' ? 'dark' : x === 'dark' ? 'light' : 'auto'))] as const;
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const act = useAction();
  return (
    <Dialog title="Change password" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!current || next.length < 12} onClick={async () => { setBusy(true); const r = await act(() => api.post('/auth/password', { current, next }), 'Password changed. Other sessions were signed out.'); setBusy(false); if (r) onClose(); }}>Change password</Button></>}>
      <Field label="Current password">{id => <input id={id} className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />}</Field>
      <Field label="New password" hint="At least 12 characters, with lower case and upper case or numbers.">{id => <input id={id} className="input" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />}</Field>
    </Dialog>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, can, signOut } = useSession();
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const [theme, cycle] = useTheme();
  const [pw, setPw] = useState(false);
  const queue = useLoad<{ stats: { level: number; unreviewed: number }[] }>(can('safety.read') ? '/safety/events?level=2&reviewed=no&limit=1' : null, { every: 60_000 });
  const waiting = (queue.data?.stats ?? []).filter(s => s.level >= 2).reduce((a, s) => a + s.unreviewed, 0);
  const changes = useLoad<{ inbox: number; mine: number }>(can('changes.read') ? '/changes/count' : null, { every: 30_000 });
  useEffect(() => { const f = () => void changes.reload(); window.addEventListener('saathi:changes', f); return () => window.removeEventListener('saathi:changes', f); });
  useEffect(() => setOpen(false), [route.join('/')]);

  return (
    <div className="app">
      <aside className={`side${open ? ' open' : ''}`} aria-label="Sections">
        <div className="brand"><span className="logo"><svg width="16" height="16" viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r="18" fill="#FBF7F0" /><circle cx="32" cy="32" r="7" fill="#2F6F66" /></svg></span><div>Saathi<small>Control room</small></div></div>
        <nav className="nav">
          {GROUPS.map(g => {
            const items = g.items.filter(i => !i.perm || can(i.perm));
            if (!items.length) return null;
            return <div key={g.title ?? 'top'}>{g.title && <div className="nav-group">{g.title}</div>}{items.map(i => (
              <a key={i.id} href={`#/${i.id}`} aria-current={route[0] === i.id ? 'page' : undefined}>{i.label}{i.id === 'safety' && waiting > 0 && <span className="count" aria-label={`${waiting} waiting`}>{waiting}</span>}{i.id === 'changes' && (changes.data?.inbox ?? 0) > 0 && <span className="count" aria-label={`${changes.data!.inbox} to approve`}>{changes.data!.inbox}</span>}</a>
            ))}</div>;
          })}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <Button className="menu-btn" size="sm" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open}>☰</Button>
          <span className={`env ${me?.environment ?? ''}`} title="Which environment this portal is talking to">{me?.environment ?? '…'}</span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" onClick={cycle} title="Theme">{theme === 'auto' ? 'Theme: auto' : theme === 'dark' ? 'Theme: dark' : 'Theme: light'}</Button>
          <span className="muted" style={{ fontSize: 13 }}>{me?.admin.name} · {me?.admin.role}</span>
          <Button size="sm" onClick={() => setPw(true)}>Password</Button>
          <Button size="sm" onClick={() => void signOut()}>Sign out</Button>
        </div>
        <main className="content" id="main">{children}</main>
      </div>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

export { go };
