import { Fragment, useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago } from '../lib/format';
import { Badge, Banner, Button, Card, Confirm, Copy, Dialog, Field, Loading, PageHead, Problem, Table, useAction } from '../lib/ui';

interface Admin { id: string; email: string; name: string; role: string; active: boolean; totp_enabled: boolean; last_login_at: string | null; sessions: number }
const ROLE_NOTE: Record<string, string> = { owner: 'Everything, including keys, prices, safety prompts, production deploys and admins.', engineer: 'Prompts (not safety), settings, flags, jobs, staging deploys.', support: 'People, safety review, content.', viewer: 'Read-only.' };

export function Admins() {
  const { data, error, reload } = useLoad<{ items: Admin[]; roles: string[] }>('/admins');
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [role, setRole] = useState('support');
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [reset, setReset] = useState<Admin | null>(null);
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHead title="Admins" sub="People who can sign in to this portal. Everyone needs a password and an authenticator app." actions={<Button variant="primary" onClick={() => setAdding(true)}>Add an admin</Button>} />
      <Card flush><Table rows={data.items} rowKey={a => a.id} cols={[
        { head: 'Admin', cell: a => <><b>{a.name}</b>{!a.active && <> <Badge>off</Badge></>}<div className="muted" style={{ fontSize: 12.5 }}>{a.email}</div></> },
        { head: 'Role', cell: a => <select className="input" style={{ width: 130 }} value={a.role} aria-label={`Role for ${a.email}`} onChange={e => void act(() => api.patch(`/admins/${a.id}`, { role: e.target.value }).then(reload), 'Role changed. Their sessions were ended.')}>{data.roles.map(r => <option key={r}>{r}</option>)}</select> },
        { head: '2-step', cell: a => (a.totp_enabled ? <Badge tone="ok">on</Badge> : <Badge tone="warn">not set up</Badge>) }, { head: 'Last sign-in', cell: a => ago(a.last_login_at), nowrap: true }, { head: 'Sessions', cell: a => a.sessions, right: true },
        { head: '', right: true, cell: a => <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => setReset(a)}>Reset sign-in</Button><Button size="sm" variant={a.active ? 'danger' : undefined} onClick={() => void act(() => api.patch(`/admins/${a.id}`, { active: !a.active }).then(reload), a.active ? 'Deactivated.' : 'Reactivated.')}>{a.active ? 'Deactivate' : 'Reactivate'}</Button></div> },
      ]} /></Card>
      <Card title="What each role can do"><dl className="kv">{data.roles.map(r => <Fragment key={r}><dt><b>{r}</b></dt><dd>{ROLE_NOTE[r]}</dd></Fragment>)}</dl></Card>

      {adding && (
        <Dialog title="Add an admin" onClose={() => setAdding(false)} footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" disabled={!email.includes('@') || !name.trim()} onClick={async () => { const r = await act(() => api.post<{ email: string; temporaryPassword: string }>('/admins', { email, name, role })); if (r) { setSecret({ email: r.email, password: r.temporaryPassword }); setAdding(false); setEmail(''); setName(''); reload(); } }}>Create</Button></>}>
          <Field label="Name">{id => <input id={id} className="input" value={name} onChange={e => setName(e.target.value)} />}</Field>
          <Field label="Email">{id => <input id={id} className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
          <Field label="Role" hint={ROLE_NOTE[role]}>{id => <select id={id} className="input" value={role} onChange={e => setRole(e.target.value)}>{data.roles.map(r => <option key={r}>{r}</option>)}</select>}</Field>
        </Dialog>
      )}
      {secret && (
        <Dialog title="Temporary password" onClose={() => setSecret(null)} footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
          <Banner><span>This is shown once. Send it to {secret.email} privately. They set up their authenticator app when they sign in, and should change the password straight away.</span></Banner>
          <div className="row"><code className="codeblock" style={{ flex: 1 }}>{secret.password}</code><Copy text={secret.password} /></div>
        </Dialog>
      )}
      {reset && <Confirm title={`Reset sign-in for ${reset.name}?`} confirmLabel="Reset" danger onClose={() => setReset(null)} onConfirm={async () => { const r = await act(() => api.post<{ temporaryPassword: string }>(`/admins/${reset.id}/reset`)); if (r) setSecret({ email: reset.email, password: r.temporaryPassword }); reload(); }}><p>Their password is replaced, their authenticator is removed and they are signed out everywhere. They set both up again on the next sign-in.</p></Confirm>}
    </>
  );
}
