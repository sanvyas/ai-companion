import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Dialog, Empty, Field, Loading, PageHead, Problem, Table, useAction } from '../lib/ui';

interface Change {
  id: string; summary: string; method: string; path: string; body: unknown; status: 'pending' | 'applying' | 'applied' | 'failed' | 'rejected' | 'withdrawn';
  requestedBy: string; requestedRole: string; requestedAt: string; decidedBy: string | null; decidedAt: string | null; note: string | null; error: string | null;
  canDecide: boolean; canWithdraw: boolean; approvers: string[];
}
interface Data { required: boolean; inbox: Change[]; waiting: Change[]; history: Change[] }

const tone = (s: Change['status']) => (s === 'applied' ? 'ok' : s === 'rejected' || s === 'failed' ? 'bad' : s === 'pending' ? 'warn' : undefined);
const label: Record<Change['status'], string> = { pending: 'Waiting', applying: 'Applying', applied: 'Applied', failed: 'Could not apply', rejected: 'Rejected', withdrawn: 'Withdrawn' };

function Details({ c }: { c: Change }) {
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="muted" style={{ cursor: 'pointer', fontSize: 12.5 }}>Exact request</summary>
      <pre className="codeblock mono" style={{ margin: '6px 0 0' }}>{c.method} {c.path}{c.body ? `\n${JSON.stringify(c.body, null, 2)}` : ''}</pre>
    </details>
  );
}

function Reject({ c, onClose, done }: { c: Change; onClose: () => void; done: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction();
  return (
    <Dialog title="Reject this change?" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="solid-danger" disabled={note.trim().length < 3} onClick={async () => { const r = await act(() => api.post(`/changes/${c.id}/reject`, { note }), 'Rejected. The app is unchanged.'); if (r) { done(); onClose(); } }}>Reject</Button></>}>
      <p><b>{c.summary}</b><br /><span className="muted">asked by {c.requestedBy}</span></p>
      <Field label="Why?" hint="They will see this, so they know what to change.">{id => <textarea id={id} className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} />}</Field>
    </Dialog>
  );
}

export function Changes() {
  const { data, error, reload } = useLoad<Data>('/changes', { every: 20_000 });
  const { me } = useSession();
  const act = useAction();
  const [rejecting, setRejecting] = useState<Change | null>(null);
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const after = () => { void reload(); window.dispatchEvent(new Event('saathi:changes')); };

  return (
    <>
      <PageHead title="Approvals" sub="Changes by anyone below owner wait here until someone more senior approves them. Approving applies the change to the live app straight away." />
      {!data.required && <Banner tone="warn"><span><b>Approvals are switched off.</b> Changes apply immediately. Turn “Changes need approval” back on under Settings.</span></Banner>}
      {me?.admin.role === 'owner' && <Banner><span>You’re an owner, so your own changes apply straight away. They are still recorded in the audit log.</span></Banner>}

      <Card title={`Waiting for you${data.inbox.length ? ` (${data.inbox.length})` : ''}`} sub="People below you asked for these.">
        {data.inbox.length === 0 ? <Empty>Nothing to approve.</Empty> : data.inbox.map(c => (
          <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c.summary}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>Asked by {c.requestedBy} ({c.requestedRole}) {ago(c.requestedAt)}</div>
                <Details c={c} />
              </div>
              <Button variant="primary" size="sm" onClick={() => void act(() => api.post(`/changes/${c.id}/approve`, {}).then(after), 'Approved and applied. The app picks it up within seconds.')}>Approve</Button>
              <Button size="sm" onClick={() => setRejecting(c)}>Reject</Button>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Waiting for someone else" sub="Asked for, not decided yet.">
        {data.waiting.length === 0 ? <Empty>Nothing is waiting.</Empty> : data.waiting.map(c => (
          <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c.summary}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>Asked by {c.requestedBy} {ago(c.requestedAt)} · needs {c.approvers.join(' or ') || 'an owner'}</div>
                <Details c={c} />
              </div>
              {c.canWithdraw && <Button size="sm" onClick={() => void act(() => api.post(`/changes/${c.id}/withdraw`, {}).then(after), 'Withdrawn.')}>Withdraw</Button>}
            </div>
          </div>
        ))}
      </Card>

      <Card flush title="Decided" sub="The most recent sixty.">
        <Table rows={data.history} rowKey={c => c.id} empty="Nothing decided yet." cols={[
          { head: 'Change', cell: c => <><b>{c.summary}</b>{c.error && <div style={{ color: 'var(--bad)', fontSize: 12.5 }}>{c.error}</div>}{c.note && <div className="muted" style={{ fontSize: 12.5 }}>“{c.note}”</div>}</> },
          { head: 'Asked by', cell: c => <>{c.requestedBy}<div className="faint" style={{ fontSize: 12 }}>{c.requestedRole}</div></> },
          { head: 'Result', cell: c => <Badge tone={tone(c.status)}>{label[c.status]}</Badge> },
          { head: 'Decided by', cell: c => c.decidedBy ?? '·' },
          { head: 'When', cell: c => (c.decidedAt ? when(c.decidedAt) : when(c.requestedAt)), nowrap: true },
        ]} />
      </Card>
      {rejecting && <Reject c={rejecting} onClose={() => setRejecting(null)} done={after} />}
    </>
  );
}
