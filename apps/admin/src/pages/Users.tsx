import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago, day, inr, num, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Confirm, Copy, Dialog, Empty, Field, Loading, PageHead, Problem, Table, Toggle, useAction } from '../lib/ui';
import { go, useRoute } from '../lib/router';

interface Row { id: string; nickname: string; phone: string | null; signIn: string; createdAt: string; lastActiveAt: string; plan: 'basic' | 'plus'; onboarded: boolean; language: string; city: string | null; status: 'active' | 'suspended' | 'pending_deletion'; conversations30d: number; consent: { remember: boolean; notifications: boolean; analytics: boolean } }

const statusBadge = (s: Row['status']) => s === 'active' ? <Badge tone="ok">Active</Badge> : s === 'suspended' ? <Badge tone="bad">Paused</Badge> : <Badge tone="warn">Leaving</Badge>;

export function Users() {
  const route = useRoute();
  return route[1] ? <Detail id={route[1]} /> : <List />;
}

interface Invite { id: string; phone: string; label: string; createdBy: string; createdAt: string; lastUsedAt: string | null; status: 'waiting' | 'signed_in' | 'locked' | 'revoked' }
const inviteBadge = (s: Invite['status']) => s === 'signed_in' ? <Badge tone="ok">Signed in</Badge> : s === 'waiting' ? <Badge tone="warn">Waiting</Badge> : s === 'locked' ? <Badge tone="bad">Locked</Badge> : <Badge>Revoked</Badge>;

/** Shows a sign-in code once. It is never stored in clear, so this is the only chance to copy it. */
function CodeShown({ title, phone, code, onClose }: { title: string; phone: string; code: string; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p>Give <b className="mono">{phone}</b> this code. It is how they sign in to Saathi until text-message codes are connected.</p>
      <div className="row" style={{ justifyContent: 'center', margin: '16px 0' }}><code style={{ fontSize: 32, letterSpacing: 6 }}>{code}</code><Copy text={code} /></div>
      <Banner tone="warn"><span>This is the only time the code is shown. It isn’t stored, so if it’s lost you’ll need to make a new one.</span></Banner>
    </Dialog>
  );
}

function AddPerson({ onClose, done }: { onClose: () => void; done: (r: { phone: string; code: string }) => void }) {
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const act = useAction();
  const valid = phone.replace(/\D/g, '').length >= 10 && (!code || /^\d{6}$/.test(code));
  return (
    <Dialog title="Add a person" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!valid} onClick={async () => { setBusy(true); const r = await act(() => api.post<{ code: string; phone: string }>('/invites', { phone, label: label || undefined, code: code || undefined })); setBusy(false); if (r) { done(r); onClose(); } }}>Add and show code</Button></>}>
      <Field label="Phone number" hint="Indian numbers can be typed without +91.">{id => <input id={id} className="input mono" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="off" placeholder="98765 43210" />}</Field>
      <Field label="Name or note (only you see this)">{id => <input id={id} className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Priya, cousin" />}</Field>
      <Field label="Sign-in code" hint="Leave empty to make a random six-digit code.">{id => <input id={id} className="input mono" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="off" placeholder="Random" />}</Field>
    </Dialog>
  );
}

function Invited() {
  const { data, error, reload } = useLoad<{ items: Invite[] }>('/invites');
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<{ title: string; phone: string; code: string } | null>(null);
  const [revoke, setRevoke] = useState<Invite | null>(null);
  const act = useAction();
  return (
    <Card flush title="Invited people" sub="Only these phone numbers can sign in while text-message codes aren’t connected. Each gets a six-digit code from you."
      actions={<Button variant="primary" size="sm" onClick={() => setAdding(true)}>Add a person</Button>}>
      {error ? <Problem message={error} onRetry={reload} /> : !data ? <Loading /> : (
        <Table rows={data.items} rowKey={r => r.id} empty="No one invited yet. Add a person to give them a sign-in code." cols={[
          { head: 'Person', cell: r => <><b>{r.label || 'No note'}</b><div className="faint mono">{r.phone}</div></> },
          { head: 'Status', cell: r => inviteBadge(r.status) },
          { head: 'Added by', cell: r => r.createdBy, nowrap: true },
          { head: 'Last signed in', cell: r => (r.lastUsedAt ? ago(r.lastUsedAt) : '·'), nowrap: true },
          { head: '', right: true, cell: r => <div className="row tight" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={() => void act(async () => { const x = await api.post<{ code: string; phone: string }>(`/invites/${r.id}/reset`); setShown({ title: 'New sign-in code', ...x }); void reload(); })}>New code</Button>
            {r.status !== 'revoked' && <Button size="sm" variant="danger" onClick={() => setRevoke(r)}>Remove</Button>}
          </div> },
        ]} />
      )}
      {adding && <AddPerson onClose={() => setAdding(false)} done={r => { setShown({ title: 'Person added', ...r }); void reload(); }} />}
      {shown && <CodeShown {...shown} onClose={() => setShown(null)} />}
      {revoke && <Confirm title="Remove this person’s sign-in?" confirmLabel="Remove" danger onClose={() => setRevoke(null)} onConfirm={async () => { await act(() => api.del(`/invites/${revoke.id}`).then(reload), 'Removed. Their code no longer works.'); }}><p>{revoke.label || revoke.phone} won’t be able to sign in with their code. Their existing account and data stay as they are.</p></Confirm>}
    </Card>
  );
}

function List() {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [pages, setPages] = useState<Row[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const first = useLoad<{ items: Row[]; nextCursor: string | null }>(`/users?q=${encodeURIComponent(q)}&status=${status}`);
  const rows = [...(first.data?.items ?? []), ...pages.flat()];
  const next = pages.length ? cursor : first.data?.nextCursor ?? null;
  return (
    <>
      <PageHead title="People" sub="Who has an account and how they use the app. You see profile settings and counts only, never journals, chats, memories or summaries." />
      {can('users.invite') && <Invited />}
      <Card flush title={<div className="row"><input className="input" style={{ width: 240 }} placeholder="Search by nickname or id" value={q} onChange={e => { setQ(e.target.value); setPages([]); setCursor(null); }} aria-label="Search people" /><select className="input" style={{ width: 160 }} value={status} onChange={e => { setStatus(e.target.value); setPages([]); }} aria-label="Filter"><option value="">Everyone</option><option value="plus">Plus</option><option value="suspended">Paused</option><option value="pending_deletion">Leaving</option></select></div>}>
        {first.error ? <Problem message={first.error} onRetry={first.reload} /> : first.loading && !first.data ? <Loading /> : (
          <Table rows={rows} rowKey={r => r.id} onRow={r => go(`users/${r.id}`)} empty="No one matches."
            cols={[
              { head: 'Person', cell: r => <><b>{r.nickname || 'No nickname'}</b><div className="faint mono">{r.id.slice(0, 8)}</div></> },
              { head: 'Phone', cell: r => <span className="mono">{r.phone ?? 'Google'}</span> },
              { head: 'Status', cell: r => statusBadge(r.status) },
              { head: 'Plan', cell: r => <Badge tone={r.plan === 'plus' ? 'accent' : undefined}>{r.plan}</Badge> },
              { head: 'Joined', cell: r => day(r.createdAt), nowrap: true },
              { head: 'Last active', cell: r => ago(r.lastActiveAt), nowrap: true },
              { head: 'Chats (30 d)', cell: r => num(r.conversations30d), right: true },
              { head: 'Setup', cell: r => r.onboarded ? <Badge tone="ok">Done</Badge> : <Badge>Pending</Badge> },
            ]} />
        )}
        {next && <div className="body"><Button onClick={async () => { const r = await api.get<{ items: Row[]; nextCursor: string | null }>(`/users?q=${encodeURIComponent(q)}&status=${status}&cursor=${encodeURIComponent(next)}`); setPages(p => [...p, r.items]); setCursor(r.nextCursor); }}>Show more</Button></div>}
      </Card>
    </>
  );
}

interface DetailData {
  profile: { id: string; nickname: string; language: string; timezone: string; city: string | null; subscription: 'basic' | 'plus'; created_at: string; onboarded_at: string | null; last_active_at: string; suspended_at: string | null; deletion_requested_at: string | null; phone: string | null; google: boolean };
  consent: Record<string, unknown> | undefined; privacy: Record<string, unknown> | undefined; notifications: Record<string, unknown> | undefined;
  counts: Record<string, number>; usage30d: { tokens: number; cost_inr: number; calls: number; failed: number };
  conversationsByMode: { mode: string; n: number }[];
  safetyEvents: { id: number; level: number; mode: string; source: string; action: string | null; created_at: string; reviewed: boolean }[];
  flagOverrides: { key: string; enabled: boolean }[]; flags: Record<string, boolean>;
}

function Detail({ id }: { id: string }) {
  const { data, error, reload } = useLoad<DetailData>(`/users/${id}`);
  const { can } = useSession();
  const act = useAction();
  const [dlg, setDlg] = useState<null | 'suspend' | 'delete'>(null);
  const [reason, setReason] = useState('');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const p = data.profile;
  const write = can('users.write');
  const status = p.suspended_at ? 'suspended' : p.deletion_requested_at ? 'pending_deletion' : 'active';
  const yes = (v: unknown) => (v ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>);
  const c = data.consent ?? {}, pr = data.privacy ?? {}, n = data.notifications ?? {};

  return (
    <>
      <PageHead title={p.nickname || 'No nickname'} sub={<span><a href="#/users">← All people</a> · <span className="mono">{p.id}</span></span>}
        actions={write && <>
          <Button onClick={() => void act(() => api.patch(`/users/${id}/plan`, { subscription: p.subscription === 'plus' ? 'basic' : 'plus' }).then(reload), `Plan is now ${p.subscription === 'plus' ? 'Basic' : 'Plus'}.`)}>Make {p.subscription === 'plus' ? 'Basic' : 'Plus'}</Button>
          {status === 'suspended' ? <Button onClick={() => void act(() => api.post(`/users/${id}/unsuspend`).then(reload), 'Account restored.')}>Restore access</Button> : <Button variant="danger" onClick={() => { setReason(''); setDlg('suspend'); }}>Pause account</Button>}
          <Button variant="danger" onClick={() => { setReason(''); setDlg('delete'); }}>Delete account…</Button>
        </>} />

      <div className="grid g4">
        <div className="card stat"><div className="label">Status</div><div className="value" style={{ fontSize: 18 }}>{statusBadge(status)}</div><div className="hint">{p.onboarded_at ? `Set up ${day(p.onboarded_at)}` : 'Setup not finished'}</div></div>
        <div className="card stat"><div className="label">Plan</div><div className="value">{p.subscription === 'plus' ? 'Plus' : 'Basic'}</div><div className="hint">Joined {day(p.created_at)}</div></div>
        <div className="card stat"><div className="label">Last active</div><div className="value" style={{ fontSize: 18 }}>{ago(p.last_active_at)}</div><div className="hint">{when(p.last_active_at)}</div></div>
        <div className="card stat"><div className="label">Cost, 30 days</div><div className="value">{inr(data.usage30d.cost_inr)}</div><div className="hint">{num(data.usage30d.calls)} model calls · {num(data.usage30d.failed)} failed</div></div>
      </div>

      <div className="cols">
        <Card title="Account">
          <dl className="kv">
            <dt>Sign-in</dt><dd>{p.phone ?? 'Google'}{p.google && p.phone ? ' + Google' : ''}</dd>
            <dt>Language</dt><dd>{p.language}</dd><dt>City</dt><dd>{p.city ?? 'Not set'}</dd><dt>Time zone</dt><dd>{p.timezone}</dd>
            <dt>Remember</dt><dd>{yes(c.remember)}</dd><dt>Notifications</dt><dd>{yes(c.notifications)}</dd><dt>Calls</dt><dd>{yes(c.calls)}</dd><dt>Location</dt><dd>{String(c.location ?? 'off')}</dd><dt>Share analytics</dt><dd>{yes(c.analytics)}</dd>
            <dt>Discreet mode</dt><dd>{yes(pr.discreet_mode)}</dd><dt>Keeps chats for</dt><dd>{pr.transcript_retention_days === 0 ? 'Not kept' : pr.transcript_retention_days === 36500 ? 'Until deleted' : `${pr.transcript_retention_days} days`}</dd>
            <dt>Check-in</dt><dd>{String(n.checkin_time ?? '–')}{n.push ? ' · push on' : ''}</dd>
          </dl>
        </Card>
        <Card title="Activity" sub="Counts only. The content is encrypted and not shown here.">
          <dl className="kv">
            {Object.entries(data.counts).map(([k, v]) => <><dt key={`k${k}`}>{k.replace(/_/g, ' ')}</dt><dd key={`v${k}`} className="num">{num(v)}</dd></>)}
            <dt>By mode</dt><dd>{data.conversationsByMode.map(m => `${m.mode} ${m.n}`).join(' · ') || 'None yet'}</dd>
          </dl>
        </Card>
      </div>

      <div className="cols">
        <Card flush title="Safety events" sub="When and how it was caught. Never what was said.">
          <Table rows={data.safetyEvents} rowKey={e => e.id} empty="None." cols={[
            { head: 'When', cell: e => when(e.created_at), nowrap: true }, { head: 'Level', cell: e => <Badge tone={e.level >= 3 ? 'bad' : e.level === 2 ? 'warn' : undefined}>{e.level}</Badge> },
            { head: 'Caught by', cell: e => e.source }, { head: 'They', cell: e => e.action ?? '–' }, { head: 'Reviewed', cell: e => (e.reviewed ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>) },
          ]} />
        </Card>
        <Card title="Feature flags" sub="What this person sees. Override one to test it with them.">
          {Object.keys(data.flags).length === 0 ? <Empty>No flags exist yet.</Empty> : (
            <div className="stack tight">
              {Object.entries(data.flags).map(([k, on]) => {
                const ov = data.flagOverrides.find(o => o.key === k);
                return <div key={k} className="row"><code style={{ flex: 1 }}>{k}</code>{ov && <Badge tone="accent">override</Badge>}<Toggle on={on} label={`${k} for this person`} disabled={!can('flags.write')} onChange={v => void act(() => api.put(`/users/${id}/flags/${k}`, { enabled: v }).then(reload))} />{ov && <Button size="sm" variant="ghost" onClick={() => void act(() => api.put(`/users/${id}/flags/${k}`, { enabled: null }).then(reload))}>Clear</Button>}</div>;
              })}
            </div>
          )}
        </Card>
      </div>

      {dlg && (
        <Confirm title={dlg === 'suspend' ? 'Pause this account?' : 'Delete this account?'} confirmLabel={dlg === 'suspend' ? 'Pause account' : 'Start deletion'} danger ready={reason.trim().length >= 3} typed={dlg === 'delete' ? 'delete' : undefined} onClose={() => setDlg(null)}
          onConfirm={async () => { await act(() => api.post(`/users/${id}/${dlg === 'suspend' ? 'suspend' : 'delete'}`, { reason }).then(reload), dlg === 'suspend' ? 'Account paused. Sessions ended.' : 'Deletion scheduled. Everything is removed after 30 days.'); }}>
          <p>{dlg === 'suspend' ? 'They are signed out everywhere and can’t sign in until you restore them. Nothing is deleted.' : 'This starts the same 30-day removal a person can start themselves. They are signed out now, and all their data is deleted after 30 days.'}</p>
          <Field label="Reason (kept in the audit log)">{id2 => <input id={id2} className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. asked by email" />}</Field>
          {reason.trim().length < 3 && <small className="muted">Enter a short reason to continue.</small>}
        </Confirm>
      )}
    </>
  );
}
