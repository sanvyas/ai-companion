import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago, inr, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Dialog, Field, Loading, PageHead, Problem, Table, Toggle, useAction } from '../lib/ui';

interface Suite { name: 'classifier' | 'reviewer' | 'replies'; label: string; description: string; for: string[]; cases: number; last: { id: number; passed: number; failed: number; total: number; created_at: string } | null }
interface Case { id: number; suite: string; label: string; input: string; expect: Record<string, unknown>; active: boolean }
interface Run { id: number; suite: string; prompt_key: string | null; prompt_version_id: number | null; model: string; started_by: string; passed: number; failed: number; total: number; cost_inr: number | null; created_at: string }
interface Out { runId: number; passed: number; failed: number; criticalFailed: number; gate: boolean; costInr: number | null; results: { label: string; input: string; pass: boolean; critical: boolean; expected: string; got: string }[] }

function AddCase({ suite, onClose, done }: { suite: Suite['name']; onClose: () => void; done: () => void }) {
  const act = useAction();
  const [label, setLabel] = useState('');
  const [input, setInput] = useState('');
  const [min, setMin] = useState(0), [max, setMax] = useState(1), [ok, setOk] = useState(false), [critical, setCritical] = useState(false);
  const [level, setLevel] = useState(0), [req, setReq] = useState(''), [forbid, setForbid] = useState('');
  const expect = suite === 'classifier' ? { min, max, critical } : suite === 'reviewer' ? { ok, critical } : { level, require: req.split('\n').map(s => s.trim()).filter(Boolean), forbid: forbid.split('\n').map(s => s.trim()).filter(Boolean), critical };
  return (
    <Dialog title="Add a case" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={label.trim().length < 3 || !input.trim()} onClick={async () => { const r = await act(() => api.post('/evals/cases', { suite, label, input, expect }), 'Case added.'); if (r) { done(); onClose(); } }}>Add case</Button></>}>
      <Field label="Name">{id => <input id={id} className="input" value={label} onChange={e => setLabel(e.target.value)} />}</Field>
      <Field label={suite === 'reviewer' ? 'Draft reply to review' : 'What the person says'} hint="Write a made-up example. Never paste a real person’s words.">{id => <textarea id={id} className="input" rows={2} value={input} onChange={e => setInput(e.target.value)} />}</Field>
      {suite === 'classifier' && <div className="row"><Field label="Lowest acceptable level">{id => <input id={id} className="input" type="number" min={0} max={3} value={min} onChange={e => setMin(Number(e.target.value))} />}</Field><Field label="Highest acceptable level">{id => <input id={id} className="input" type="number" min={0} max={3} value={max} onChange={e => setMax(Number(e.target.value))} />}</Field></div>}
      {suite === 'reviewer' && <div className="row"><Toggle on={ok} onChange={setOk} label="The reviewer should accept this draft" /><span>The reviewer should {ok ? 'accept' : 'reject'} this draft</span></div>}
      {suite === 'replies' && <>
        <Field label="Risk level given to the model">{id => <select id={id} className="input" value={level} onChange={e => setLevel(Number(e.target.value))}><option value={0}>0 calm</option><option value={1}>1 distress</option><option value={2}>2 elevated</option></select>}</Field>
        <Field label="Reply must match (one pattern per line)" hint="Regular expressions, case-insensitive. For example: Tele-MANAS|14416">{id => <textarea id={id} className="input mono" rows={2} value={req} onChange={e => setReq(e.target.value)} />}</Field>
        <Field label="Reply must not match (one pattern per line)">{id => <textarea id={id} className="input mono" rows={2} value={forbid} onChange={e => setForbid(e.target.value)} />}</Field>
      </>}
      <div className="row"><Toggle on={critical} onChange={setCritical} label="Critical" /><span>Critical: a failure blocks publishing a safety prompt</span></div>
    </Dialog>
  );
}

export function Evals() {
  const suites = useLoad<{ suites: Suite[] }>('/evals/suites');
  const runs = useLoad<{ items: Run[] }>('/evals/runs');
  const [suite, setSuite] = useState<Suite['name']>('classifier');
  const cases = useLoad<{ items: Case[] }>(`/evals/cases?suite=${suite}`);
  const { can } = useSession();
  const act = useAction();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out | null>(null);
  const [adding, setAdding] = useState(false);
  if (suites.error) return <Problem message={suites.error} onRetry={suites.reload} />;
  if (!suites.data) return <Loading />;
  const cur = suites.data.suites.find(s => s.name === suite)!;

  const run = async () => { setBusy(true); setOut(null); const r = await act(() => api.post<Out>('/evals/run', { suite })); setBusy(false); if (r) { setOut(r); suites.reload(); runs.reload(); } };

  return (
    <>
      <PageHead title="Evaluations" sub="Test sets for the AI’s safety behaviour. Run them against what is live, or from the Prompts page against a change before it goes out. Every call here is recorded as admin usage, never against a person." />
      <div className="grid g3">
        {suites.data.suites.map(s => (
          <button key={s.name} className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 16, borderColor: s.name === suite ? 'var(--accent)' : undefined }} onClick={() => { setSuite(s.name); setOut(null); }} aria-pressed={s.name === suite}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>{s.label}</b><Badge>{s.cases} cases</Badge></div>
            <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>{s.description}</div>
            {s.last ? <div className="row tight"><Badge tone={s.last.failed ? 'warn' : 'ok'}>{s.last.passed}/{s.last.total} passed</Badge><span className="faint" style={{ fontSize: 12 }}>{ago(s.last.created_at)}</span></div> : <Badge tone="warn">Never run</Badge>}
          </button>
        ))}
      </div>

      <Card title={cur.label} sub={`Used for: ${cur.for.join(', ')}`} actions={can('prompts.write') && <><Button size="sm" onClick={() => setAdding(true)}>Add a case</Button><Button size="sm" variant="primary" busy={busy} onClick={() => void run()}>Run now</Button></>}>
        {out && (
          <div className="stack" style={{ marginBottom: 12 }}>
            <div className="row"><Badge tone={out.gate ? 'ok' : 'bad'}>{out.gate ? 'All critical cases pass' : `${out.criticalFailed} critical failed`}</Badge><span className="num">{out.passed}/{out.passed + out.failed} passed</span><span className="faint">{out.costInr === null ? 'cost not priced yet' : inr(out.costInr)}</span></div>
            {out.failed > 0 && <Table rows={out.results.filter(r => !r.pass)} rowKey={r => r.label} cols={[{ head: 'Failed case', cell: r => <>{r.label}{r.critical && <> <Badge tone="bad">critical</Badge></>}<div className="mono faint" style={{ fontSize: 12 }}>{r.input}</div></> }, { head: 'Wanted', cell: r => r.expected }, { head: 'Got', cell: r => r.got }]} />}
          </div>
        )}
        {!out && !cases.data && <Loading />}
        {!out && cases.data && (
          <Table rows={cases.data.items} rowKey={c => c.id} cols={[
            { head: 'Case', cell: c => <>{c.label}{(c.expect as { critical?: boolean }).critical && <> <Badge tone="warn">critical</Badge></>}<div className="mono faint" style={{ fontSize: 12 }}>{c.input}</div></> },
            { head: 'Expect', cell: c => <span className="mono" style={{ fontSize: 12 }}>{JSON.stringify({ ...c.expect, critical: undefined })}</span> },
            { head: 'On', cell: c => <Toggle on={c.active} label={`${c.label} active`} disabled={!can('prompts.write')} onChange={v => void act(() => api.patch(`/evals/cases/${c.id}`, { active: v }).then(cases.reload))} /> },
          ]} />
        )}
      </Card>

      <Card flush title="Recent runs">
        <Table rows={runs.data?.items ?? []} rowKey={r => r.id} empty="No runs yet." cols={[
          { head: 'When', cell: r => when(r.created_at), nowrap: true }, { head: 'Suite', cell: r => r.suite }, { head: 'Prompt', cell: r => r.prompt_key ? `${r.prompt_key}${r.prompt_version_id ? ' (saved version)' : ' (unsaved text)'}` : 'Live prompts' },
          { head: 'Result', cell: r => <Badge tone={r.failed ? 'warn' : 'ok'}>{r.passed}/{r.total}</Badge> }, { head: 'Model', cell: r => <span className="mono">{r.model}</span> }, { head: 'By', cell: r => r.started_by }, { head: 'Cost', cell: r => (r.cost_inr === null ? '–' : inr(r.cost_inr)), right: true },
        ]} />
      </Card>
      {adding && <AddCase suite={suite} onClose={() => setAdding(false)} done={() => { cases.reload(); suites.reload(); }} />}
      {!can('prompts.write') && <Banner tone="info"><span>You can read evaluations. Engineers and owners can run them.</span></Banner>}
    </>
  );
}
