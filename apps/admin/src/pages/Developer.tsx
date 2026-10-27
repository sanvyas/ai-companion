import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Confirm, Copy, Dot, Field, Loading, PageHead, Problem, Table, useAction } from '../lib/ui';

interface Env { name: string; url: string; ok: boolean; latencyMs: number | null; version: string | null; commit: string | null; builtAt: string | null; environment: string | null; error: string | null }
interface Data {
  build: { version: string; commit: string | null; builtAt: string | null; node: string }; environments: Env[]; configured: boolean; missing?: string[]; error?: string;
  repo?: { name: string; defaultBranch: string; url: string; private: boolean; pushedAt: string };
  commits?: { sha: string; message: string; author: string; at: string; url: string }[];
  pulls?: { number: number; title: string; author: string; draft: boolean; branch: string; updatedAt: string; url: string }[];
  runs?: { id: number; workflow: string; title: string; status: string; conclusion: string | null; branch: string; sha: string; event: string; startedAt: string; url: string }[];
  workflows?: { id: number; name: string; file: string; state: string }[];
}

const runTone = (r: { status: string; conclusion: string | null }) => (r.status !== 'completed' ? 'warn' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'cancelled' ? undefined : 'bad');
const runLabel = (r: { status: string; conclusion: string | null }) => (r.status !== 'completed' ? r.status.replace('_', ' ') : r.conclusion ?? 'done');

export function Developer() {
  const { data, error, reload } = useLoad<Data>('/dev', { every: 30_000 });
  const { can } = useSession();
  const act = useAction();
  const [env, setEnv] = useState<'staging' | 'production'>('staging');
  const [ref, setRef] = useState('main');
  const [confirm, setConfirm] = useState(false);
  if (error && !data) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const deploy = async () => { await act(() => api.post('/dev/deploy', { environment: env, ref, confirm: env === 'production' ? 'production' : undefined }).then(reload), 'Deploy started. Watch it under Recent runs.'); };

  return (
    <>
      <PageHead title="Developer" sub="The code and where it runs: which version each environment has, what CI is doing, and the deploy buttons. Code itself is changed in GitHub, so every change is reviewed and tested before it can ship." />

      <Card flush title="Environments" sub="Add or rename these under Settings and flags → Developer.">
        <Table rows={data.environments} rowKey={e => e.name} empty="No environments listed yet. Add the address of each deployed API under Settings and flags → Developer → Environments." cols={[
          { head: 'Environment', cell: e => <span className="row tight"><Dot status={e.ok ? 'ok' : 'down'} /><b>{e.name}</b></span> }, { head: 'Address', cell: e => <span className="mono">{e.url}</span> },
          { head: 'Version', cell: e => (e.version ? <>v{e.version}{e.commit && <span className="mono faint"> · {e.commit.slice(0, 7)}</span>}</> : '–') }, { head: 'Built', cell: e => (e.builtAt ? ago(e.builtAt) : '–') },
          { head: 'Health', cell: e => (e.ok ? <Badge tone="ok">{e.latencyMs} ms</Badge> : <Badge tone="bad">{e.error ?? 'Down'}</Badge>) },
        ]} />
        <div className="body faint" style={{ fontSize: 12.5 }}>This server: v{data.build.version}{data.build.commit ? ` · ${data.build.commit.slice(0, 7)}` : ''}{data.build.builtAt ? ` · built ${ago(data.build.builtAt)}` : ''}</div>
      </Card>

      {!data.configured && (
        <Banner tone="info"><span><b>Connect GitHub to see commits, pull requests and runs, and to deploy from here.</b> Still needed: {data.missing?.join(' and ')}. Create a fine-grained token with read access to contents and pull requests, and read/write access to Actions, then add it under Integrations → GitHub.</span></Banner>
      )}
      {data.error && <Problem message={`GitHub: ${data.error}`} onRetry={reload} />}

      {data.configured && data.repo && (
        <>
          {can('dev.deploy') && (
            <Card title="Deploy" sub="Starts the Deploy workflow in GitHub. It builds this branch, publishes the image and tells your host to pull it.">
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Field label="Where">{id => <select id={id} className="input" style={{ width: 160 }} value={env} onChange={e => setEnv(e.target.value as 'staging' | 'production')}><option value="staging">Staging</option><option value="production" disabled={!can('dev.deploy_prod')}>Production{can('dev.deploy_prod') ? '' : ' (owner)'}</option></select>}</Field>
                <Field label="Branch, tag or commit">{id => <input id={id} className="input mono" style={{ width: 220 }} value={ref} onChange={e => setRef(e.target.value)} />}</Field>
                <Button variant={env === 'production' ? 'solid-danger' : 'primary'} onClick={() => (env === 'production' ? setConfirm(true) : void deploy())}>Deploy to {env}</Button>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Production deploys can also require a second reviewer if you turn on required reviewers for the production environment in GitHub.</div>
            </Card>
          )}

          <div className="cols">
            <Card flush title="Recent runs" sub={<a href={`${data.repo.url}/actions`} target="_blank" rel="noreferrer">Open in GitHub ↗</a>}>
              <Table rows={data.runs ?? []} rowKey={r => r.id} empty="No runs yet." cols={[
                { head: 'Run', cell: r => <><a href={r.url} target="_blank" rel="noreferrer"><b>{r.workflow}</b></a> <span className="muted">{r.title}</span><div className="mono faint" style={{ fontSize: 12 }}>{r.branch} · {r.sha} · {r.event}</div></> },
                { head: 'Result', cell: r => <Badge tone={runTone(r)}>{runLabel(r)}</Badge> }, { head: 'Started', cell: r => ago(r.startedAt), nowrap: true },
                { head: '', right: true, cell: r => can('dev.deploy') && r.status === 'completed' && r.conclusion !== 'success' && <Button size="sm" onClick={() => void act(() => api.post(`/dev/runs/${r.id}/rerun`).then(reload), 'Re-run started.')}>Re-run</Button> },
              ]} />
            </Card>
            <div className="stack">
              <Card flush title="Open pull requests" sub={<a href={`${data.repo.url}/pulls`} target="_blank" rel="noreferrer">Open in GitHub ↗</a>}>
                <Table rows={data.pulls ?? []} rowKey={p => p.number} empty="Nothing waiting for review." cols={[{ head: 'Pull request', cell: p => <><a href={p.url} target="_blank" rel="noreferrer">#{p.number} {p.title}</a>{p.draft && <> <Badge>draft</Badge></>}<div className="faint" style={{ fontSize: 12 }}>{p.author} · {p.branch} · {ago(p.updatedAt)}</div></> }]} />
              </Card>
            </div>
          </div>

          <Card flush title="Latest commits" sub={<>{data.repo.name} · default branch <span className="mono">{data.repo.defaultBranch}</span></>}>
            <Table rows={data.commits ?? []} rowKey={c => c.sha} cols={[{ head: 'Commit', cell: c => <a className="mono" href={c.url} target="_blank" rel="noreferrer">{c.sha}</a> }, { head: 'Message', cell: c => c.message }, { head: 'By', cell: c => c.author }, { head: 'When', cell: c => when(c.at), nowrap: true }]} />
          </Card>
          <Card title="Workflows in this repository"><div className="chips">{(data.workflows ?? []).map(w => <Badge key={w.id} tone={w.state === 'active' ? 'accent' : undefined}>{w.name} · {w.file}</Badge>)}</div></Card>
        </>
      )}

      <Card title="How changes reach users">
        <ol className="stack tight" style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Code</b> changes through a pull request on GitHub. CI runs the type check, all tests and a security scan on every one.</li>
          <li><b>Deploy</b> to staging from this page, try it with the team, then deploy the same version to production.</li>
          <li><b>Behaviour</b> that doesn’t need new code (prompts, models, limits, kill switches, feature flags, helplines, events) changes instantly from Settings, Prompts and Content, with no deploy at all.</li>
          <li><b>Database</b> changes ship as forward-only migrations in the same release, and are applied before the new version starts.</li>
        </ol>
        <div className="row" style={{ marginTop: 10 }}><span className="faint">Image build command</span><code>docker build -f apps/api/Dockerfile -t saathi-api .</code><Copy text="docker build -f apps/api/Dockerfile -t saathi-api ." /></div>
      </Card>

      {confirm && <Confirm title="Deploy to production?" confirmLabel="Deploy to production" danger typed="production" onClose={() => setConfirm(false)} onConfirm={deploy}><p>This puts <b className="mono">{ref}</b> in front of everyone. Check that staging looks right first.</p></Confirm>}
    </>
  );
}
