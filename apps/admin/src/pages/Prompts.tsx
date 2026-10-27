import { useEffect, useMemo, useState } from 'react';
import { api, useLoad } from '../lib/api';
import { when } from '../lib/format';
import { go, useRoute } from '../lib/router';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Confirm, Empty, Field, Loading, PageHead, Problem, Table, useAction } from '../lib/ui';

interface Item { key: string; label: string; group: string; description: string; safetyCritical: boolean; vars: string[]; liveVersion: number | null; drafts: number; versions: number; suite: string | null }
interface Version { id: number; version: number; body: string; note: string; status: 'draft' | 'active' | 'archived'; createdBy: string; createdAt: string; publishedBy: string | null; publishedAt: string | null; evalRunId: number | null }
interface Detail { def: { key: string; label: string; group: string; description: string; safetyCritical: boolean; vars: string[]; mustContain: string[]; suite: string | null }; defaultBody: string; liveBody: string; liveVersion: number | null; versions: Version[] }
interface EvalOut { runId: number; suite: string; total: number; passed: number; failed: number; criticalFailed: number; gate: boolean; costInr: number | null; uncosted: boolean; results: { label: string; input: string; pass: boolean; critical: boolean; expected: string; got: string }[] }

export function Prompts() {
  const route = useRoute();
  return route[1] ? <Editor pkey={decodeURIComponent(route[1])} /> : <List />;
}

function List() {
  const { data, error, reload } = useLoad<{ items: Item[] }>('/prompts');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const groups = [...new Set(data.items.map(i => i.group))];
  return (
    <>
      <PageHead title="Prompts" sub="The instructions the AI follows. Edit a draft, try it in the test bench, check it against the safety evaluations, then publish. The previous version is kept and you can go back at any time." />
      <Banner tone="info"><span>The level-3 crisis script and the rule-based reply checks are not here on purpose. They are clinically reviewed and change only through a release.</span></Banner>
      {groups.map(g => (
        <Card key={g} flush title={g}>
          <Table rows={data.items.filter(i => i.group === g)} rowKey={i => i.key} onRow={i => go(`prompts/${encodeURIComponent(i.key)}`)} cols={[
            { head: 'Prompt', cell: i => <><b>{i.label}</b> {i.safetyCritical && <Badge tone="warn">safety critical</Badge>}<div className="muted" style={{ fontSize: 12.5 }}>{i.description}</div></> },
            { head: 'Live', cell: i => (i.liveVersion ? <Badge tone="accent">v{i.liveVersion}</Badge> : <Badge>built-in</Badge>), nowrap: true },
            { head: 'Drafts', cell: i => i.drafts || '–', right: true }, { head: 'Versions', cell: i => i.versions || '–', right: true },
          ]} />
        </Card>
      ))}
    </>
  );
}

/** A plain line diff: lines only in the old text struck through, lines only in the new text highlighted. */
function lineDiff(a: string, b: string) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: 'same' | 'add' | 'del'; s: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { out.push({ t: 'same', s: A[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: 'del', s: A[i++] }); else out.push({ t: 'add', s: B[j++] }); }
  while (i < n) out.push({ t: 'del', s: A[i++] }); while (j < m) out.push({ t: 'add', s: B[j++] });
  return out;
}

function Editor({ pkey }: { pkey: string }) {
  const { data, error, reload } = useLoad<Detail>(`/prompts/${encodeURIComponent(pkey)}`);
  const { can } = useSession();
  const act = useAction();
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'edit' | 'diff' | 'history'>('edit');
  const [evalOut, setEvalOut] = useState<EvalOut | null>(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'publish'; v: Version } | { kind: 'revert' }>(null);
  const [pg, setPg] = useState({ text: 'I feel stuck today', language: 'en', mode: 'text', level: 0 });
  const [pgOut, setPgOut] = useState<{ text: string; latencyMs: number; outputRule: string } | null>(null);

  useEffect(() => { if (data) { setBody(data.liveBody); setEvalOut(null); setPgOut(null); } }, [data?.def.key, data?.liveVersion]);  // eslint-disable-line react-hooks/exhaustive-deps
  const drafts = data?.versions.filter(v => v.status === 'draft') ?? [];
  const latestDraft = drafts[0];
  const dirty = !!data && body !== data.liveBody;
  const diff = useMemo(() => (data ? lineDiff(data.liveBody, body) : []), [data, body]);
  const problems = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    for (const m of body.matchAll(/\{\{(\w+)\}\}/g)) if (!data.def.vars.includes(m[1])) out.push(`Unknown variable {{${m[1]}}}.`);
    for (const v of data.def.vars) if (!body.includes(`{{${v}}}`)) out.push(`Missing {{${v}}}.`);
    for (const p of data.def.mustContain) if (!body.includes(p)) out.push(`Must still contain “${p}”.`);
    if (!body.trim()) out.push('The prompt is empty.');
    return out;
  }, [data, body]);

  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const d = data.def;
  const canWrite = can('prompts.write');
  const canPublish = can('prompts.publish') && (!d.safetyCritical || can('prompts.publish_safety'));

  const saveDraft = async () => act(async () => { const v = await api.post<Version>(`/prompts/${encodeURIComponent(d.key)}/drafts`, { body, note }); await reload(); return v; }, 'Draft saved.');
  const runEval = async (v: Version | null) => {
    if (!d.suite) return;
    setBusy('eval'); setEvalOut(null);
    const r = await act(() => api.post<EvalOut>('/evals/run', v ? { suite: d.suite, versionId: v.id } : { suite: d.suite, promptKey: d.key, body }));
    setBusy(''); if (r) setEvalOut(r);
  };
  const runPlayground = async () => {
    setBusy('pg'); setPgOut(null);
    const r = await act(() => api.post<{ text: string; latencyMs: number; outputRule: string }>('/prompts/playground', { key: d.key, body, language: pg.language, mode: pg.mode, level: pg.level, messages: [{ role: 'user', content: pg.text }] }));
    setBusy(''); if (r) setPgOut(r);
  };

  return (
    <>
      <PageHead title={d.label} sub={<span><a href="#/prompts">← All prompts</a> · {d.description}</span>}
        actions={<>{d.safetyCritical && <Badge tone="warn">Safety critical: owner publishes, evaluation must pass</Badge>}{data.liveVersion ? <Badge tone="accent">Live: v{data.liveVersion}</Badge> : <Badge>Live: built-in default</Badge>}</>} />

      <div className="cols">
        <div className="stack">
          <div className="tabs" role="tablist">{(['edit', 'diff', 'history'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'edit' ? 'Edit' : t === 'diff' ? `Changes${dirty ? ' •' : ''}` : `History (${data.versions.length})`}</button>)}</div>

          {tab === 'edit' && (
            <Card>
              <div className="stack">
                <div className="row tight">{d.vars.length > 0 ? <>Variables: {d.vars.map(v => <code key={v} className="badge" style={{ cursor: 'pointer' }} onClick={() => setBody(b => `${b}{{${v}}}`)} title="Click to add at the end">{`{{${v}}}`}</code>)}</> : <span className="muted">No variables in this prompt.</span>}</div>
                <textarea className="input mono" style={{ minHeight: 360, fontSize: 13 }} value={body} onChange={e => setBody(e.target.value)} disabled={!canWrite} aria-label="Prompt text" spellCheck={false} />
                <div className="row"><span className="faint num">{body.length.toLocaleString()} characters</span>{problems.length > 0 && <span style={{ color: 'var(--bad)' }}>{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}</span>}</div>
                {canWrite && <div className="row"><input className="input" style={{ maxWidth: 280 }} placeholder="What changed? (optional)" value={note} onChange={e => setNote(e.target.value)} aria-label="Note" /><Button variant="primary" disabled={!dirty || problems.length > 0} onClick={() => void saveDraft()}>Save as draft</Button><Button variant="ghost" disabled={!dirty} onClick={() => setBody(data.liveBody)}>Discard changes</Button></div>}
              </div>
            </Card>
          )}

          {tab === 'diff' && <Card title="Live version compared with your text">{!dirty ? <Empty>No changes yet.</Empty> : <div className="codeblock diff">{diff.map((l, i) => <div key={i} className={l.t === 'same' ? '' : l.t}>{l.s || ' '}</div>)}</div>}</Card>}

          {tab === 'history' && (
            <Card flush>
              <Table rows={data.versions} rowKey={v => v.id} empty="No saved versions yet. The built-in default is in use." cols={[
                { head: 'Version', cell: v => <>v{v.version} <Badge tone={v.status === 'active' ? 'ok' : v.status === 'draft' ? 'warn' : undefined}>{v.status}</Badge></> },
                { head: 'Saved', cell: v => <>{when(v.createdAt)}<div className="faint">{v.createdBy}</div></>, nowrap: true },
                { head: 'Note', cell: v => v.note || '–' },
                { head: '', right: true, cell: v => <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => { setBody(v.body); setTab('edit'); }}>Load</Button>{canWrite && d.suite && <Button size="sm" busy={busy === 'eval'} onClick={() => void runEval(v)}>Run evaluation</Button>}{canPublish && v.status !== 'active' && <Button size="sm" variant="primary" onClick={() => setConfirm({ kind: 'publish', v })}>{v.status === 'archived' ? 'Roll back to this' : 'Publish'}</Button>}</div> },
              ]} />
            </Card>
          )}

          {canPublish && <div className="row">{latestDraft && <Button variant="primary" onClick={() => setConfirm({ kind: 'publish', v: latestDraft })}>Publish latest draft (v{latestDraft.version})</Button>}{data.liveVersion && <Button variant="danger" onClick={() => setConfirm({ kind: 'revert' })}>Go back to the built-in default</Button>}</div>}
          {!canPublish && d.safetyCritical && <Banner tone="info"><span>You can draft and test this prompt. Only an owner can publish it.</span></Banner>}
        </div>

        <div className="stack">
          <Card title="Test bench" sub="Sends your text (not yet saved) to the model. Never uses a real person's data.">
            <div className="stack">
              <Field label="What the person says">{id => <textarea id={id} className="input" rows={2} value={pg.text} onChange={e => setPg({ ...pg, text: e.target.value })} />}</Field>
              <div className="row">
                <select className="input" style={{ width: 120 }} aria-label="Language" value={pg.language} onChange={e => setPg({ ...pg, language: e.target.value })}><option value="en">English</option><option value="hinglish">Hinglish</option><option value="hi">Hindi</option></select>
                <select className="input" style={{ width: 120 }} aria-label="Mode" value={pg.mode} onChange={e => setPg({ ...pg, mode: e.target.value })}>{['text', 'voice', 'video', 'checkin', 'sit', 'walk'].map(m => <option key={m}>{m}</option>)}</select>
                <select className="input" style={{ width: 150 }} aria-label="Risk level" value={pg.level} onChange={e => setPg({ ...pg, level: Number(e.target.value) })}><option value={0}>Risk 0: calm</option><option value={1}>Risk 1: distress</option><option value={2}>Risk 2: elevated</option></select>
              </div>
              <Button variant="primary" busy={busy === 'pg'} disabled={!canWrite || !pg.text.trim() || problems.length > 0} onClick={() => void runPlayground()}>Run</Button>
              {pgOut && <div className="stack tight"><div className="codeblock">{pgOut.text}</div><div className="row tight faint" style={{ fontSize: 12 }}>{pgOut.latencyMs} ms · <Badge tone={pgOut.outputRule === 'ok' ? 'ok' : 'bad'}>{pgOut.outputRule === 'ok' ? 'passes the reply rules' : pgOut.outputRule}</Badge></div></div>}
            </div>
          </Card>

          {d.suite ? (
            <Card title="Safety evaluation" sub={`Runs the “${d.suite}” cases against your text. Cost is shown after the run.`}>
              <div className="stack">
                <Button busy={busy === 'eval'} disabled={!canWrite || problems.length > 0} onClick={() => void runEval(null)}>Evaluate current text</Button>
                {evalOut && (
                  <div className="stack tight">
                    <div className="row"><Badge tone={evalOut.gate ? 'ok' : 'bad'}>{evalOut.gate ? 'All critical cases pass' : `${evalOut.criticalFailed} critical failed`}</Badge><span className="num">{evalOut.passed}/{evalOut.total} passed</span><span className="faint">{evalOut.costInr === null ? 'cost not priced' : `₹${evalOut.costInr.toFixed(2)}`}</span></div>
                    {evalOut.results.filter(r => !r.pass).slice(0, 8).map(r => <div key={r.label} className="banner bad" style={{ display: 'block' }}><b>{r.label}</b>{r.critical ? ' (critical)' : ''}<div className="mono" style={{ fontSize: 12 }}>{r.input}</div><div style={{ fontSize: 12.5 }}>Wanted {r.expected}, got {r.got}</div></div>)}
                    {d.safetyCritical && <div className="faint" style={{ fontSize: 12 }}>To publish, save a draft and run the evaluation on that saved version from History. It counts for 24 hours.</div>}
                  </div>
                )}
              </div>
            </Card>
          ) : <Card title="Evaluation"><p className="muted">This prompt has no safety suite. Use the test bench to check it.</p></Card>}
        </div>
      </div>

      {confirm?.kind === 'publish' && (
        <Confirm title={`Publish v${confirm.v.version}?`} confirmLabel="Publish" onClose={() => setConfirm(null)} onConfirm={async () => { await act(() => api.post(`/prompts/versions/${confirm.v.id}/publish`).then(reload), 'Published. The app uses it from the next message.'); }}>
          <p>Everyone gets this wording from the next message. {d.safetyCritical ? 'This is a safety prompt, so the evaluation on this exact version must have passed in the last 24 hours.' : 'The current live version is kept, so you can go back.'}</p>
          <div className="codeblock" style={{ maxHeight: 180 }}>{confirm.v.body}</div>
        </Confirm>
      )}
      {confirm?.kind === 'revert' && <Confirm title="Go back to the built-in default?" confirmLabel="Revert" danger onClose={() => setConfirm(null)} onConfirm={async () => { await act(() => api.post(`/prompts/${encodeURIComponent(d.key)}/revert`).then(reload), 'Back to the built-in wording.'); }}><p>Your saved versions are kept in History.</p></Confirm>}
    </>
  );
}
