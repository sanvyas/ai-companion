import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { ago } from '../lib/format';
import { useSession } from '../lib/session';
import { ModelPicker } from '../lib/ModelPicker';
import { Badge, Banner, Button, Card, Confirm, Dialog, Field, Loading, PageHead, Problem, Table, Toggle, useAction } from '../lib/ui';

interface SettingView { def: { key: string; group: string; label: string; description: string; kind: 'text' | 'long' | 'int' | 'number' | 'bool' | 'json' | 'select' | 'openrouter_model'; options?: { value: string; label: string }[]; ownerOnly?: boolean }; value: unknown; isDefault: boolean; updatedAt: string | null; updatedBy: string | null }
interface Flag { key: string; description: string; enabled: boolean; rolloutPct: number; updatedBy: string | null; updatedAt: string; overrides: number }

/** Switches that affect everyone ask first: turning on a pause, or turning sign-ups off. */
const isRisky = (key: string, next: boolean) => (key === 'access.signups_open' ? !next : key === 'access.maintenance' || key === 'kill.voice' ? next : false);

function SettingRow({ s, reload }: { s: SettingView; reload: () => void }) {
  const { me, can } = useSession();
  const act = useAction();
  const [draft, setDraft] = useState<string>(typeof s.value === 'string' ? s.value : JSON.stringify(s.value, null, s.def.kind === 'json' ? 2 : 0));
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [picking, setPicking] = useState(false);
  const allowed = can('settings.write') && (!s.def.ownerOnly || me?.admin.role === 'owner');
  const save = (value: unknown) => act(() => api.put(`/settings/${s.def.key}`, { value }).then(() => { reload(); return true; }), 'Saved. The app picks it up within seconds.');
  const dirty = typeof s.value === 'string' ? draft !== s.value : draft !== JSON.stringify(s.value, null, s.def.kind === 'json' ? 2 : 0);
  const parse = (): unknown => (s.def.kind === 'int' || s.def.kind === 'number' ? Number(draft) : s.def.kind === 'json' ? JSON.parse(draft) : draft);

  return (
    <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div className="row tight"><b>{s.def.label}</b>{s.def.ownerOnly && <Badge>owner</Badge>}{!s.isDefault && <Badge tone="accent">changed</Badge>}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{s.def.description}</div>
        {s.updatedAt && <div className="faint" style={{ fontSize: 12 }}>Changed {ago(s.updatedAt)} by {s.updatedBy}</div>}
      </div>
      <div style={{ flex: '1 1 260px', minWidth: 0 }} className="row">
        {s.def.kind === 'bool' ? (
          <Toggle on={s.value as boolean} label={s.def.label} disabled={!allowed} onChange={v => (isRisky(s.def.key, v) ? setConfirm(v) : void save(v))} />
        ) : s.def.kind === 'long' || s.def.kind === 'json' ? (
          <textarea className="input mono" rows={s.def.kind === 'json' ? 5 : 3} value={draft} onChange={e => setDraft(e.target.value)} disabled={!allowed} aria-label={s.def.label} />
        ) : s.def.kind === 'openrouter_model' ? (
          <>
            <code style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{String(s.value)}</code>
            <Button size="sm" disabled={!allowed} onClick={() => setPicking(true)}>Choose model</Button>
            {picking && <ModelPicker title={s.def.label} current={String(s.value)} onClose={() => setPicking(false)} onChoose={id => save(id)} />}
          </>
        ) : s.def.kind === 'select' ? (
          <select className="input" value={draft} onChange={e => setDraft(e.target.value)} disabled={!allowed} aria-label={s.def.label}>
            {!s.def.options?.some(o => o.value === draft) && <option value={draft}>{draft}</option>}
            {s.def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className="input" value={draft} onChange={e => setDraft(e.target.value)} disabled={!allowed} aria-label={s.def.label} inputMode={s.def.kind === 'text' ? undefined : 'decimal'} />
        )}
        {s.def.kind !== 'bool' && s.def.kind !== 'openrouter_model' && <Button size="sm" variant="primary" disabled={!allowed || !dirty} onClick={() => { try { void save(parse()); } catch { void act(async () => { throw new Error('That isn’t valid JSON.'); }); } }}>Save</Button>}
        {!s.isDefault && allowed && <Button size="sm" variant="ghost" onClick={() => void act(() => api.del(`/settings/${s.def.key}`).then(reload), 'Back to the default.')}>Reset</Button>}
      </div>
      {confirm !== null && (
        <Confirm title={`Turn ${s.def.label.toLowerCase()} ${confirm ? 'on' : 'off'}?`} confirmLabel="Yes, do it" danger onClose={() => setConfirm(null)} onConfirm={async () => { await save(confirm); }}>
          <p>{s.def.key === 'access.maintenance' ? 'Everyone will see the maintenance message instead of the app. Helplines and safety screens keep working.' : s.def.key === 'kill.voice' ? 'Voice and video calls stop for everyone straight away. Text chat keeps working.' : 'Nobody new can create an account. People who already have one can still sign in.'}</p>
        </Confirm>
      )}
    </div>
  );
}

function FlagDialog({ onClose, done }: { onClose: () => void; done: () => void }) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const act = useAction();
  return (
    <Dialog title="New feature flag" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!/^[a-z][a-z0-9_.]{1,48}$/.test(key)} onClick={async () => { const r = await act(() => api.put(`/flags/${key}`, { description, enabled: false, rolloutPct: 100 }), 'Flag created, switched off.'); if (r) { done(); onClose(); } }}>Create flag</Button></>}>
      <Field label="Name" hint="Lower case letters, numbers, dots and underscores. For example ui.new_home">{id => <input id={id} className="input mono" value={key} onChange={e => setKey(e.target.value.trim())} autoComplete="off" />}</Field>
      <Field label="What it controls">{id => <input id={id} className="input" value={description} onChange={e => setDescription(e.target.value)} />}</Field>
    </Dialog>
  );
}

export function Settings() {
  const s = useLoad<{ items: SettingView[] }>('/settings');
  const f = useLoad<{ items: Flag[] }>('/flags');
  const { can } = useSession();
  const act = useAction();
  const [adding, setAdding] = useState(false);
  if (s.error) return <Problem message={s.error} onRetry={s.reload} />;
  if (!s.data || !f.data) return <Loading />;
  const groups = [...new Set(s.data.items.map(i => i.def.group))];
  const active = s.data.items.filter(i => (i.def.key === 'access.maintenance' || i.def.key === 'kill.voice') && i.value === true);

  return (
    <>
      <PageHead title="Settings and flags" sub="Change how the live app behaves without a deploy. Changes reach every user within a few seconds, and each one is recorded in the audit log." />
      {active.map(a => <Banner key={a.def.key} tone="bad"><span><b>{a.def.label} is ON.</b> {a.def.description}</span></Banner>)}

      <Card flush title="Feature flags" sub="Switch features on for some people first, then everyone." actions={can('flags.write') && <Button variant="primary" size="sm" onClick={() => setAdding(true)}>New flag</Button>}>
        <Table rows={f.data.items} rowKey={x => x.key} empty="No flags yet. Create one to ship a feature dark and turn it on for a few friends first." cols={[
          { head: 'Flag', cell: x => <><code>{x.key}</code><div className="muted" style={{ fontSize: 12.5 }}>{x.description}</div></> },
          { head: 'On', cell: x => <Toggle on={x.enabled} label={`${x.key} on`} disabled={!can('flags.write')} onChange={v => void act(() => api.put(`/flags/${x.key}`, { enabled: v }).then(f.reload))} /> },
          { head: 'Rollout', cell: x => <div className="row"><input type="range" min={0} max={100} step={5} value={x.rolloutPct} disabled={!can('flags.write')} aria-label={`${x.key} rollout`} onChange={e => void act(() => api.put(`/flags/${x.key}`, { rolloutPct: Number(e.target.value) }).then(f.reload))} /><span className="num">{x.rolloutPct}%</span></div> },
          { head: 'Overrides', cell: x => x.overrides || '–', right: true },
          { head: '', cell: x => can('flags.write') ? <Button size="sm" variant="ghost" onClick={() => void act(() => api.del(`/flags/${x.key}`).then(f.reload), 'Flag deleted.')}>Delete</Button> : null },
        ]} />
      </Card>

      {groups.map(g => (
        <Card key={g} flush title={g}>{s.data!.items.filter(i => i.def.group === g).map(i => <SettingRow key={i.def.key + String(i.updatedAt)} s={i} reload={s.reload} />)}</Card>
      ))}
      {adding && <FlagDialog onClose={() => setAdding(false)} done={f.reload} />}
    </>
  );
}
