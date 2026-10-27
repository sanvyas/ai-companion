import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { BarChart } from '../lib/charts';
import { ago, inr, num } from '../lib/format';
import { go } from '../lib/router';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Dialog, Field, Loading, PageHead, Problem, Stat, Table, Tabs, Toggle, useAction } from '../lib/ui';

interface CostData {
  days: number; totals: { cost_inr: number; calls: number; uncosted: number; activeUsers: number; perActiveUser: number | null };
  byProvider: { provider: string; calls: number; failed: number; units: number; cost_inr: number; uncosted: number; avg_latency_ms: number; p95_latency_ms: number }[];
  byTask: { kind: string; calls: number; units: number; cost_inr: number }[]; byDay: { day: string; cost_inr: number; calls: number }[];
  topUsers: { user_id: string; nickname: string; calls: number; units: number; cost_inr: number }[];
  missingRates: { provider: string; tokens: boolean; chars: boolean; seconds: boolean }[];
}
interface Rate { id: number; provider: string; unit: string; rate: number; currency: 'INR' | 'USD'; sourceNote: string; verified: boolean; updatedBy: string | null; updatedAt: string }
const UNIT_LABEL: Record<string, string> = { input_mtok: 'per 1M input tokens', output_mtok: 'per 1M output tokens', cache_read_mtok: 'per 1M cached-read tokens', cache_write_mtok: 'per 1M cache-write tokens', per_1k_chars: 'per 1,000 characters', per_hour: 'per hour of audio', per_message: 'per message' };

function RateDialog({ initial, units, onClose, done }: { initial?: Partial<Rate>; units: string[]; onClose: () => void; done: () => void }) {
  const act = useAction();
  const [f, setF] = useState({ provider: initial?.provider ?? '', unit: initial?.unit ?? 'input_mtok', rate: String(initial?.rate ?? ''), currency: initial?.currency ?? 'USD', sourceNote: initial?.sourceNote ?? '', verified: initial?.verified ?? false });
  return (
    <Dialog title="Set a price" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.provider || f.rate === '' || Number.isNaN(Number(f.rate))} onClick={async () => { const r = await act(() => api.put('/pricing', { ...f, rate: Number(f.rate) }), 'Price saved. Use “Price past usage” to apply it to calls already made.'); if (r) { done(); onClose(); } }}>Save price</Button></>}>
      <Field label="Provider" hint="Exactly as shown in the usage table, e.g. anthropic:claude-sonnet-5-5, or sarvam, soniox, elevenlabs.">{id => <input id={id} className="input mono" value={f.provider} onChange={e => setF({ ...f, provider: e.target.value })} />}</Field>
      <div className="grid g2">
        <Field label="Unit">{id => <select id={id} className="input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>{units.map(u => <option key={u} value={u}>{UNIT_LABEL[u] ?? u}</option>)}</select>}</Field>
        <Field label="Price">{id => <div className="row"><input id={id} className="input" inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} /><select className="input" style={{ width: 90 }} aria-label="Currency" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value as 'INR' | 'USD' })}><option>USD</option><option>INR</option></select></div>}</Field>
      </div>
      <Field label="Where this price comes from" hint="Copy it from the vendor’s own price page and note the link.">{id => <input id={id} className="input" value={f.sourceNote} onChange={e => setF({ ...f, sourceNote: e.target.value })} />}</Field>
      <div className="row"><Toggle on={f.verified} onChange={v => setF({ ...f, verified: v })} label="Checked against the vendor’s price page" /><span>I checked this against the vendor’s own price page</span></div>
    </Dialog>
  );
}

export function Cost() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<'usage' | 'prices'>('usage');
  const cost = useLoad<CostData>(`/cost?days=${days}`);
  const prices = useLoad<{ items: Rate[]; units: string[]; usdInr: number }>('/pricing');
  const { can } = useSession();
  const act = useAction();
  const [editing, setEditing] = useState<Partial<Rate> | null>(null);
  if (cost.error) return <Problem message={cost.error} onRetry={cost.reload} />;
  if (!cost.data || !prices.data) return <Loading />;
  const d = cost.data;

  return (
    <>
      <PageHead title="Cost and pricing" sub="What the platform costs, from the usage the app records. Amounts are in rupees at the prices you enter under Prices." actions={<select className="input" style={{ width: 140 }} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Period"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>} />
      {d.missingRates.length > 0 && <Banner><span><b>Some usage has no price, so it shows as ₹0.</b> Add prices for {d.missingRates.map(m => m.provider).join(', ')} under <a href="#/cost" onClick={() => setTab('prices')}>Prices</a>, then press “Price past usage”.</span></Banner>}
      <div className="grid g4">
        <Stat label={`Spend, ${days} days`} value={inr(d.totals.cost_inr, 0)} hint={d.totals.uncosted ? `${num(d.totals.uncosted)} calls unpriced` : 'All calls priced'} />
        <Stat label="Model and voice calls" value={num(d.totals.calls)} />
        <Stat label="People who used it" value={num(d.totals.activeUsers)} />
        <Stat label="Per active person" value={d.totals.perActiveUser === null ? '–' : inr(d.totals.perActiveUser)} hint="Spend ÷ people with usage" />
      </div>
      <Tabs tabs={[{ id: 'usage', label: 'Usage' }, { id: 'prices', label: `Prices (${prices.data.items.length})` }]} value={tab} onChange={setTab} />

      {tab === 'usage' && (
        <>
          <Card title="Spend per day"><BarChart label="Spend per day" data={d.byDay.map(x => ({ x: x.day, y: x.cost_inr }))} format={n => inr(n, n < 10 ? 1 : 0)} /></Card>
          <div className="cols">
            <Card flush title="By provider and model"><Table rows={d.byProvider} rowKey={p => p.provider} empty="No usage recorded yet." cols={[
              { head: 'Provider', cell: p => <span className="mono">{p.provider}</span> }, { head: 'Calls', cell: p => <>{num(p.calls)}{p.failed > 0 && <span className="faint"> · {p.failed} failed</span>}</>, right: true },
              { head: 'Speed', cell: p => `${num(p.avg_latency_ms)} / ${num(p.p95_latency_ms)} ms`, right: true, nowrap: true }, { head: 'Cost', cell: p => (p.uncosted ? <Badge tone="warn">{inr(p.cost_inr)} + {p.uncosted} unpriced</Badge> : inr(p.cost_inr)), right: true },
            ]} /></Card>
            <Card flush title="By job"><Table rows={d.byTask} rowKey={t => t.kind} empty="–" cols={[{ head: 'Job', cell: t => t.kind }, { head: 'Calls', cell: t => num(t.calls), right: true }, { head: 'Cost', cell: t => inr(t.cost_inr), right: true }]} /></Card>
          </div>
          <Card flush title="Highest spend per person" sub="Useful for spotting heavy use or a runaway loop."><Table rows={d.topUsers} rowKey={u => u.user_id} empty="No per-person usage yet." onRow={u => go(`users/${u.user_id}`)} cols={[{ head: 'Person', cell: u => u.nickname || u.user_id.slice(0, 8) }, { head: 'Calls', cell: u => num(u.calls), right: true }, { head: 'Tokens', cell: u => num(u.units), right: true }, { head: 'Cost', cell: u => inr(u.cost_inr), right: true }]} /></Card>
          <div className="faint" style={{ fontSize: 12 }}>The monthly budget and warning level are set under Settings and flags → Cost.</div>
        </>
      )}

      {tab === 'prices' && (
        <Card flush title="Prices" sub={`Dollar prices convert at ₹${prices.data.usdInr} (change under Settings).`} actions={can('cost.write') && <><Button size="sm" onClick={() => void act(async () => { const r = await api.post<{ updated: number }>('/pricing/recost'); cost.reload(); return r; }, 'Past usage priced.')}>Price past usage</Button><Button size="sm" variant="primary" onClick={() => setEditing({})}>Add a price</Button></>}>
          <Table rows={prices.data.items} rowKey={r => r.id} empty="No prices yet. Add the price of each model and voice vendor you use." cols={[
            { head: 'Provider', cell: r => <span className="mono">{r.provider}</span> }, { head: 'Unit', cell: r => UNIT_LABEL[r.unit] ?? r.unit },
            { head: 'Price', cell: r => `${r.currency === 'USD' ? '$' : '₹'}${r.rate}`, right: true }, { head: 'Checked', cell: r => (r.verified ? <Badge tone="ok">verified</Badge> : <Badge tone="warn">unverified</Badge>) },
            { head: 'Source', cell: r => <span className="muted">{r.sourceNote || '–'} · {ago(r.updatedAt)}</span> },
            { head: '', right: true, cell: r => can('cost.write') && <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => setEditing(r)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void act(() => api.del(`/pricing/${r.id}`).then(prices.reload), 'Price removed.')}>Remove</Button></div> },
          ]} />
        </Card>
      )}
      {editing && <RateDialog initial={editing} units={prices.data.units} onClose={() => setEditing(null)} done={() => { prices.reload(); cost.reload(); }} />}
    </>
  );
}
