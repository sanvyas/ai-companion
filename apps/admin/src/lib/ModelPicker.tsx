import { useMemo, useState } from 'react';
import { api, useLoad } from './api';
import { Badge, Button, Dialog, Field, Loading, Problem, useAction } from './ui';

export interface OrModel { id: string; name: string; contextLength: number; promptPerM: number; completionPerM: number; structured: boolean; vendor: string }
interface TryResult { ok: boolean; text?: string; error?: string; latencyMs: number; costInr: number | null; inTokens?: number; outTokens?: number }

const usd = (n: number) => (n === 0 ? 'free' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const ctxLabel = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/**
 * Pick a model from the list OpenRouter offers for this key: search it, compare price and size, try one with a real
 * request, then use it. The server checks the choice against the same list again when it is saved.
 */
export function ModelPicker({ title, current, onChoose, onClose }: { title: string; current: string; onChoose: (id: string) => Promise<unknown>; onClose: () => void }) {
  const [fresh, setFresh] = useState(0);
  const { data, error, loading, reload } = useLoad<{ items: OrModel[]; keySet: boolean }>(`/integrations/openrouter/models${fresh ? '?refresh=1' : ''}`);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(current);
  const [onlyStructured, setOnlyStructured] = useState(false);
  const [trying, setTrying] = useState(false);
  const [result, setResult] = useState<(TryResult & { model: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useAction();

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.items ?? []).filter(m => (!onlyStructured || m.structured) && words.every(w => `${m.name} ${m.id}`.toLowerCase().includes(w)));
  }, [data, q, onlyStructured]);
  const sel = data?.items.find(m => m.id === picked);

  return (
    <Dialog wide title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!sel || picked === current} onClick={async () => { setBusy(true); const r = await act(() => onChoose(picked)); setBusy(false); if (r !== undefined) onClose(); }}>Use this model</Button></>}>
      {error ? <Problem message={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          {!data.keySet && <div className="muted">No key is saved yet, so only the public list is shown. Add the key to try a model.</div>}
          <div className="row">
            <div style={{ flex: 1 }}><Field label="Search">{id => <input id={id} className="input" placeholder="claude, llama, gemini, mistral…" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />}</Field></div>
            <label className="row tight" style={{ marginTop: 18 }}><input type="checkbox" checked={onlyStructured} onChange={e => setOnlyStructured(e.target.checked)} /> Reliable structured replies only</label>
            <Button size="sm" style={{ marginTop: 18 }} busy={loading} onClick={() => { setFresh(n => n + 1); }}>Refresh list</Button>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>Prices are per million tokens, input / output. “Structured” models follow the JSON the safety checks need; others still work, but a little less reliably.</div>
          <div role="listbox" aria-label="Models" style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {shown.slice(0, 120).map(m => (
              <button key={m.id} type="button" role="option" aria-selected={m.id === picked} onClick={() => { setPicked(m.id); setResult(null); }}
                className="row" style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, borderBottom: '1px solid var(--line-2)', background: m.id === picked ? 'var(--accent-soft, rgba(47,111,102,.12))' : 'transparent', cursor: 'pointer', justifyContent: 'space-between', color: 'inherit' }}>
                <span style={{ minWidth: 0 }}><b>{m.name}</b>{m.id === current && <> <Badge tone="accent">in use</Badge></>}<div className="faint mono" style={{ fontSize: 12 }}>{m.id}</div></span>
                <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', textAlign: 'right' }}>{usd(m.promptPerM)} / {usd(m.completionPerM)}<div>{ctxLabel(m.contextLength)} context{m.structured ? ' · structured' : ''}</div></span>
              </button>
            ))}
            {shown.length === 0 && <div className="muted" style={{ padding: 16 }}>No model matches “{q}”.</div>}
          </div>
          {shown.length > 120 && <div className="faint" style={{ fontSize: 12 }}>Showing 120 of {shown.length}. Type to narrow the list.</div>}
          {sel && (
            <div className="stack" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div><b>{sel.name}</b> <span className="mono faint">{sel.id}</span></div>
                <Button size="sm" busy={trying} disabled={!data.keySet} onClick={async () => { setTrying(true); const r = await act(() => api.post<TryResult>('/integrations/openrouter/try', { model: sel.id })); setTrying(false); if (r) setResult({ ...r, model: sel.id }); }}>Try this model</Button>
              </div>
              {result && result.model === sel.id && (result.ok
                ? <div className="codeblock">“{result.text}”<div className="faint" style={{ marginTop: 6 }}>Replied in {(result.latencyMs / 1000).toFixed(1)} s{result.costInr !== null ? ` · about ₹${result.costInr} for this message` : ''}{result.inTokens ? ` · ${result.inTokens} in / ${result.outTokens} out tokens` : ''}</div></div>
                : <div className="codeblock" style={{ color: 'var(--bad)' }}>That didn’t work: {result.error}</div>)}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
