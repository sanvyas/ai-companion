import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago, when } from '../lib/format';
import { go } from '../lib/router';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Dialog, Field, Loading, PageHead, Problem, Table, useAction } from '../lib/ui';

interface Ev { id: number; level: number; mode: string; source: string; action: string | null; created_at: string; user_id: string; nickname: string; reviewed_by: string | null; note: string | null; reviewed_at: string | null }

export function Safety() {
  const [level, setLevel] = useState('2');
  const [reviewed, setReviewed] = useState('no');
  const { data, error, reload } = useLoad<{ items: Ev[]; stats: { level: number; n: number; unreviewed: number }[] }>(`/safety/events?level=${level}&reviewed=${reviewed}&limit=100`);
  const { can } = useSession();
  const act = useAction();
  const [open, setOpen] = useState<Ev | null>(null);
  const [note, setNote] = useState('');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  return (
    <>
      <PageHead title="Safety review" sub="Every elevated or crisis moment, so a human can check that someone followed up. This list shows when something happened, how it was caught and what the person did next. It never shows what they said." />
      <div className="grid g3">
        {[3, 2, 1].map(l => { const s = data.stats.find(x => x.level === l); return <div key={l} className="card stat"><div className="label">Level {l} · {l === 3 ? 'crisis' : l === 2 ? 'elevated' : 'mild'}, 30 days</div><div className="value">{s?.n ?? 0}</div><div className="hint">{s?.unreviewed ?? 0} not yet reviewed</div></div>; })}
      </div>
      <Banner tone="info"><span>To check in with someone, open their record from <a href="#/users">People</a> and contact them yourself outside the app. Add a short note here so the team knows it was handled.</span></Banner>
      <Card flush title={<div className="row"><select className="input" style={{ width: 170 }} value={level} onChange={e => setLevel(e.target.value)} aria-label="Level"><option value="3">Crisis only</option><option value="2">Elevated and crisis</option><option value="1">Everything</option></select><select className="input" style={{ width: 160 }} value={reviewed} onChange={e => setReviewed(e.target.value)} aria-label="Review state"><option value="no">Waiting for review</option><option value="yes">Reviewed</option><option value="">All</option></select></div>}>
        <Table rows={data.items} rowKey={e => e.id} empty={reviewed === 'no' ? 'Nothing waiting. Everything has been reviewed.' : 'Nothing here.'} cols={[
          { head: 'When', cell: e => <>{when(e.created_at)}<div className="faint">{ago(e.created_at)}</div></>, nowrap: true },
          { head: 'Level', cell: e => <Badge tone={e.level >= 3 ? 'bad' : e.level === 2 ? 'warn' : undefined}>{e.level}</Badge> },
          { head: 'Person', cell: e => <a href={`#/users/${e.user_id}`} onClick={ev => { ev.preventDefault(); go(`users/${e.user_id}`); }}>{e.nickname || e.user_id.slice(0, 8)}</a> },
          { head: 'Where', cell: e => e.mode }, { head: 'Caught by', cell: e => e.source }, { head: 'They then', cell: e => e.action ?? 'no action' },
          { head: 'Review', cell: e => e.reviewed_by ? <div><Badge tone="ok">Reviewed</Badge><div className="faint" style={{ fontSize: 12 }}>{e.reviewed_by}{e.note ? ` · ${e.note}` : ''}</div></div> : can('safety.review') ? <Button size="sm" onClick={() => { setOpen(e); setNote(''); }}>Mark reviewed</Button> : <Badge>Waiting</Badge> },
        ]} />
      </Card>
      {open && (
        <Dialog title="Mark as reviewed" onClose={() => setOpen(null)} footer={<><Button onClick={() => setOpen(null)}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await act(() => api.post(`/safety/events/${open.id}/review`, { note }), 'Marked as reviewed.'); if (r) { setOpen(null); reload(); } }}>Save</Button></>}>
          <p>Level {open.level} event for {open.nickname || 'this person'} on {when(open.created_at)}.</p>
          <Field label="What was done" hint="For example: messaged them, they are okay. Don’t write what they said.">{id => <textarea id={id} className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />}</Field>
        </Dialog>
      )}
    </>
  );
}
