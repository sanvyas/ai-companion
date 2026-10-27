import { api, useLoad } from '../lib/api';
import { ago, bytes, num, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Button, Card, Loading, PageHead, Problem, Stat, Table, useAction } from '../lib/ui';

interface Data {
  build: { version: string; commit: string | null; builtAt: string | null; node: string }; environment: string; liveConversations: number; uptimeMinutes: number;
  database: { latencyMs: number; bytes: number; connections: { n: number; max: number }; migrations: { n: number | null; latest: string | null } };
  jobs: { byStatus: { status: string; n: number }[]; byKind: { kind: string; n: number; failed: number }[]; failed: { id: number; kind: string; attempts: number; error: string; run_at: string }[] };
  errors: { id: number; source: string; route: string | null; code: string | null; message: string; count: number; first_seen: string; last_seen: string; resolved: boolean }[];
  memory: { rssMb: number; heapMb: number };
}

export function Infra() {
  const { data, error, reload } = useLoad<Data>('/infra', { every: 15_000 });
  const { can } = useSession();
  const act = useAction();
  if (error && !data) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const st = (s: string) => data.jobs.byStatus.find(j => j.status === s)?.n ?? 0;
  const open = data.errors.filter(e => !e.resolved);
  return (
    <>
      <PageHead title="Infrastructure" sub="The running system: database, background jobs and errors. Refreshes every 15 seconds." />
      <div className="grid g4">
        <Stat label="Version" value={`v${data.build.version}`} hint={`${data.build.commit ? data.build.commit.slice(0, 7) : 'no commit id'} · Node ${data.build.node.replace('v', '')}`} />
        <Stat label="Up for" value={data.uptimeMinutes > 120 ? `${Math.round(data.uptimeMinutes / 60)} h` : `${data.uptimeMinutes} min`} hint={`${data.liveConversations} live conversations · ${data.memory.rssMb} MB memory`} />
        <Stat label="Database" value={`${data.database.latencyMs} ms`} hint={`${bytes(data.database.bytes)} · ${data.database.connections.n}/${data.database.connections.max} connections`} />
        <Stat label="Migrations" value={data.database.migrations.n ?? '–'} hint={data.database.migrations.latest ?? ''} />
      </div>

      <div className="cols">
        <Card flush title="Background jobs" sub="Check-ins, letters, reminders and clean-up." actions={can('infra.write') && st('failed') > 0 && <Button size="sm" onClick={() => void act(async () => { const r = await api.post<{ retried: number }>('/infra/jobs/retry-failed'); reload(); return r; }, 'Failed jobs queued again.')}>Retry all failed</Button>}>
          <div className="body row">{['pending', 'running', 'done', 'failed', 'skipped'].map(s => <Badge key={s} tone={s === 'failed' && st(s) ? 'bad' : undefined}>{s} {num(st(s))}</Badge>)}</div>
          <Table rows={data.jobs.byKind} rowKey={k => k.kind} empty="No jobs in the last 7 days." cols={[{ head: 'Kind (7 days)', cell: k => <span className="mono">{k.kind}</span> }, { head: 'Runs', cell: k => num(k.n), right: true }, { head: 'Failed', cell: k => (k.failed ? <Badge tone="bad">{k.failed}</Badge> : '–'), right: true }]} />
        </Card>
        <Card flush title="Failed jobs"><Table rows={data.jobs.failed} rowKey={j => j.id} empty="None. Everything that ran, worked." cols={[
          { head: 'Job', cell: j => <><span className="mono">{j.kind}</span><div className="faint" style={{ fontSize: 12 }}>{j.error || 'no message'}</div></> }, { head: 'Tries', cell: j => j.attempts, right: true },
          { head: '', right: true, cell: j => can('infra.write') && <Button size="sm" onClick={() => void act(() => api.post(`/infra/jobs/${j.id}/retry`).then(reload), 'Queued again.')}>Retry</Button> },
        ]} /></Card>
      </div>

      <Card flush title="Errors" sub={`${open.length} open. Grouped by where and what, with names, numbers and emails removed.`}>
        <Table rows={data.errors} rowKey={e => e.id} empty="No errors recorded." cols={[
          { head: 'Where', cell: e => <><span className="mono">{e.source}</span> <span className="mono faint">{e.route ?? ''}</span></> },
          { head: 'What', cell: e => <>{e.code && <Badge>{e.code}</Badge>} {e.message}</> }, { head: 'Times', cell: e => num(e.count), right: true },
          { head: 'Last seen', cell: e => <span title={when(e.last_seen)}>{ago(e.last_seen)}</span>, nowrap: true },
          { head: '', right: true, cell: e => can('infra.write') && (e.resolved ? <Badge tone="ok">resolved</Badge> : <Button size="sm" onClick={() => void act(() => api.post(`/infra/errors/${e.id}/resolve`, { resolved: true }).then(reload))}>Mark resolved</Button>) },
        ]} />
      </Card>
    </>
  );
}
