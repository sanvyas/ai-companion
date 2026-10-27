import { useState } from 'react';
import { useLoad } from '../lib/api';
import { when } from '../lib/format';
import { Button, Card, Loading, PageHead, Problem, Table } from '../lib/ui';

interface Row { id: number; admin_email: string; action: string; target: string | null; before: unknown; after: unknown; ip: string | null; created_at: string }

export function Audit() {
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const { data, error, reload } = useLoad<{ items: Row[] }>(`/audit?limit=200&action=${encodeURIComponent(action)}`);
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHead title="Audit log" sub="Every change made in this portal: who, what, when and from where. It can’t be edited or deleted. API keys are never recorded, only the last four characters." />
      <Card flush title={<div className="row"><input className="input" style={{ width: 240 }} placeholder="Filter, e.g. setting. or user." value={action} onChange={e => setAction(e.target.value)} aria-label="Filter by action" /><Button size="sm" onClick={reload}>Refresh</Button></div>}>
        <Table rows={data.items} rowKey={r => r.id} empty="Nothing recorded yet." onRow={r => setOpen(open === r.id ? null : r.id)} cols={[
          { head: 'When', cell: r => when(r.created_at), nowrap: true }, { head: 'Who', cell: r => r.admin_email },
          { head: 'Action', cell: r => <><span className="mono">{r.action}</span>{open === r.id && <div className="stack tight" style={{ marginTop: 8 }}>{r.before != null && <div><div className="faint">Before</div><div className="codeblock">{JSON.stringify(r.before, null, 2)}</div></div>}{r.after != null && <div><div className="faint">After</div><div className="codeblock">{JSON.stringify(r.after, null, 2)}</div></div>}{r.before == null && r.after == null && <div className="faint">No details.</div>}</div>}</> },
          { head: 'Target', cell: r => <span className="mono">{r.target ?? '–'}</span> }, { head: 'From', cell: r => <span className="mono faint">{r.ip ?? '–'}</span> },
        ]} />
      </Card>
    </>
  );
}
