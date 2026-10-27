import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago } from '../lib/format';
import { useSession } from '../lib/session';
import { ModelPicker } from '../lib/ModelPicker';
import { Badge, Banner, Button, Card, Confirm, Copy, Dialog, Field, Loading, PageHead, Problem, useAction } from '../lib/ui';

interface FieldStatus { name: string; label: string; secret: boolean; hint?: string; source: 'portal' | 'env' | 'none'; last4: string | null; value: string | null; updatedAt: string | null; updatedBy: string | null; lastTestAt: string | null; lastTestOk: boolean | null; lastTestNote: string | null }
interface Integration { id: string; label: string; category: string; purpose: string; status: 'live' | 'pending'; statusNote: string; docsUrl: string; hosts: string[]; testable: boolean; fields: FieldStatus[] }

function SetKey({ it, field, onClose, done }: { it: Integration; field: FieldStatus; onClose: () => void; done: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const act = useAction();
  return (
    <Dialog title={`${it.label}: ${field.label}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!value.trim()} onClick={async () => { setBusy(true); const r = await act(() => api.put(`/integrations/${it.id}/${field.name}`, { value }), it.status === 'live' ? 'Saved. The app uses it from the next request.' : 'Saved. It will be used once this integration’s adapter is built.'); setBusy(false); if (r) { setValue(''); done(); onClose(); } }}>Save</Button></>}>
      <form onSubmit={e => e.preventDefault()}>
        <Field label={field.label} hint={<>{field.hint ? `${field.hint} ` : ''}{field.secret ? 'It is encrypted before it is stored and can’t be shown again, only replaced.' : ''}</>}>
          {id => <input id={id} className={`input ${field.secret ? 'mono' : ''}`} type={field.secret ? 'password' : 'text'} value={value} onChange={e => setValue(e.target.value)} autoComplete="off" spellCheck={false} data-1p-ignore />}
        </Field>
      </form>
      <p className="muted">Create one at <a href={it.docsUrl} target="_blank" rel="noreferrer">{new URL(it.docsUrl).host}</a>. {it.hosts.length > 0 && <>If this environment limits outbound traffic, allow <span className="mono">{it.hosts.join(', ')}</span>.</>}</p>
    </Dialog>
  );
}

interface SettingRow { def: { key: string; label: string }; value: unknown }

/** Everything about using OpenRouter: which vendor serves the app, and which model does each job. */
function OpenRouterPanel() {
  const { data, reload } = useLoad<{ items: SettingRow[] }>('/settings');
  const act = useAction();
  const [picking, setPicking] = useState<SettingRow | null>(null);
  const [switching, setSwitching] = useState<'openrouter' | 'anthropic' | null>(null);
  const get = (k: string) => data?.items.find(i => i.def.key === k);
  const provider = (get('llm.provider')?.value as string | undefined) ?? 'anthropic';
  const slots = ['companion', 'safety', 'analysis'].map(s => get(`openrouter.models.${s}`)).filter((x): x is SettingRow => !!x);
  if (!data) return null;
  return (
    <div className="stack" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><b>AI provider</b><div className="muted" style={{ fontSize: 12.5 }}>Right now the app’s replies come from <b>{provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'}</b>.</div></div>
        {provider === 'openrouter'
          ? <Button size="sm" onClick={() => setSwitching('anthropic')}>Switch back to Anthropic</Button>
          : <Button size="sm" variant="primary" onClick={() => setSwitching('openrouter')}>Use OpenRouter for the app</Button>}
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>Models used when OpenRouter is the provider:</div>
      {slots.map(s => (
        <div key={s.def.key} className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}><b>{s.def.label.replace('OpenRouter: ', '')}</b><div className="mono muted" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{String(s.value)}</div></div>
          <Button size="sm" onClick={() => setPicking(s)}>Choose model</Button>
        </div>
      ))}
      {picking && <ModelPicker title={picking.def.label} current={String(picking.value)} onClose={() => setPicking(null)} onChoose={id => act(() => api.put(`/settings/${picking.def.key}`, { value: id }).then(() => { void reload(); return true; }), 'Saved. The app picks it up within seconds.')} />}
      {switching && (
        <Confirm title={switching === 'openrouter' ? 'Serve the app from OpenRouter?' : 'Go back to Anthropic?'} confirmLabel="Yes, switch" danger onClose={() => setSwitching(null)} onConfirm={async () => { await act(() => api.put('/settings/llm.provider', { value: switching }).then(() => { void reload(); return true; }), 'Saved. The next message uses it.'); }}>
          <p>{switching === 'openrouter' ? 'Every reply, safety check, journal reading and letter will use the OpenRouter models above, starting with the next message.' : 'Every reply, safety check, journal reading and letter will use the Claude models set under Settings.'}</p>
          <p><b>Then run the safety evaluations</b> (Evaluations page). A different model can judge risky messages differently, and they are the check that it still catches the ones that matter.</p>
        </Confirm>
      )}
    </div>
  );
}

function Card1({ it, reload }: { it: Integration; reload: () => void }) {
  const { can } = useSession();
  const act = useAction();
  const [editing, setEditing] = useState<FieldStatus | null>(null);
  const [removing, setRemoving] = useState<FieldStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const write = can('integrations.write');
  const allSet = it.fields.every(f => f.source !== 'none');
  const anySet = it.fields.some(f => f.source !== 'none');
  const test = it.fields.find(f => f.lastTestAt);

  return (
    <Card title={<span className="row tight">{it.label} <Badge tone={it.status === 'live' ? 'ok' : undefined}>{it.status === 'live' ? 'Used by the app' : 'Key stored only'}</Badge> <Badge tone={allSet ? 'accent' : anySet ? 'warn' : undefined}>{allSet ? 'Connected' : anySet ? 'Incomplete' : 'Not set'}</Badge></span>} sub={it.purpose}
      actions={<>{it.testable && write && <Button size="sm" busy={testing} disabled={!allSet} onClick={async () => { setTesting(true); const r = await act(() => api.post<{ ok: boolean | null; note: string }>(`/integrations/${it.id}/test`)); setTesting(false); if (r) { void act(async () => { if (!r.ok) throw new Error(r.note); }, r.note); reload(); } }}>Test connection</Button>}<a className="btn sm" href={it.docsUrl} target="_blank" rel="noreferrer">Get a key ↗</a></>}>
      <div className="stack">
        <div className="muted" style={{ fontSize: 12.5 }}>{it.statusNote}</div>
        {it.fields.map(f => (
          <div key={f.name} className="row" style={{ justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <b>{f.label}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {f.source === 'none' ? 'Not set' : f.source === 'env' ? <>From the server’s environment · {f.secret ? <span className="mono">••••{f.last4}</span> : <span className="mono">{f.value}</span>}</> : <>Saved in the portal {f.updatedBy ? `by ${f.updatedBy} ` : ''}{ago(f.updatedAt)} · {f.secret ? <span className="mono">••••{f.last4}</span> : <span className="mono">{f.value}</span>}</>}
              </div>
            </div>
            {write && <div className="row"><Button size="sm" onClick={() => setEditing(f)}>{f.source === 'portal' ? 'Replace' : 'Set'}</Button>{f.source === 'portal' && <Button size="sm" variant="ghost" onClick={() => setRemoving(f)}>Remove</Button>}</div>}
          </div>
        ))}
        {test && <div className="row tight"><Badge tone={test.lastTestOk ? 'ok' : 'bad'}>{test.lastTestOk ? 'Test passed' : 'Test failed'}</Badge><span className="muted" style={{ fontSize: 12.5 }}>{test.lastTestNote} · {ago(test.lastTestAt)}</span></div>}
        {it.id === 'openrouter' && allSet && write && <OpenRouterPanel />}
        {it.hosts.length > 0 && <div className="row tight faint" style={{ fontSize: 12 }}>Hosts to allow: <span className="mono">{it.hosts.join(', ')}</span><Copy text={it.hosts.join('\n')} label="Copy" /></div>}
      </div>
      {editing && <SetKey it={it} field={editing} onClose={() => setEditing(null)} done={reload} />}
      {removing && <Confirm title={`Remove ${removing.label}?`} confirmLabel="Remove" danger onClose={() => setRemoving(null)} onConfirm={async () => { await act(() => api.del(`/integrations/${it.id}/${removing.name}`).then(reload), 'Removed.'); }}><p>{it.status === 'live' ? 'The app stops using it straight away. If the server’s environment has a value for it, that one is used instead.' : 'Nothing in the app uses this yet, so nothing changes for users.'}</p></Confirm>}
    </Card>
  );
}

export function Integrations() {
  const { data, error, reload } = useLoad<{ items: Integration[] }>('/integrations');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const cats = [...new Set(data.items.map(i => i.category))];
  const set = (id: string) => !!data.items.find(i => i.id === id)?.fields.every(f => f.source !== 'none');
  const aiOff = !set('anthropic') && !set('openrouter');
  return (
    <>
      <PageHead title="Integrations and keys" sub="Connect the outside services Saathi uses. Keys are encrypted, never shown again, and take effect without a restart where the app already uses them." />
      {aiOff && <Banner tone="bad"><span><b>The AI isn’t connected.</b> Conversations are off until the Anthropic or OpenRouter key is added below.</span></Banner>}
      <Banner tone="info"><span><b>Used by the app</b> means the app already reads that key. <b>Key stored only</b> means you can save it now, but the part of the app that would use it (speech, SMS) hasn’t been built yet, so saving it changes nothing for users.</span></Banner>
      {cats.map(c => <div key={c} className="stack"><h2>{c}</h2><div className="grid g2">{data.items.filter(i => i.category === c).map(i => <Card1 key={i.id} it={i} reload={reload} />)}</div></div>)}
    </>
  );
}
