import { createContext, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

// Small, dependency-free building blocks used by every page.

export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'off';

export function Button({ variant, size, busy, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'solid-danger' | 'ghost'; size?: 'sm'; busy?: boolean }) {
  const cls = ['btn', variant === 'primary' && 'primary', variant === 'danger' && 'danger', variant === 'solid-danger' && 'danger solid', variant === 'ghost' && 'ghost', size === 'sm' && 'sm'].filter(Boolean).join(' ');
  return <button type="button" {...p} className={cls} disabled={p.disabled || busy}>{busy ? 'Working…' : children}</button>;
}

export const Badge = ({ tone, children }: { tone?: Tone; children: ReactNode }) => <span className={`badge ${tone && tone !== 'off' ? tone : ''}`}>{children}</span>;
export const Dot = ({ status }: { status: 'ok' | 'warn' | 'down' | 'off' }) => <span className={`dot ${status === 'off' ? '' : status}`} role="img" aria-label={status === 'ok' ? 'Healthy' : status === 'warn' ? 'Needs attention' : status === 'down' ? 'Down' : 'Off'} />;

export function Card({ title, sub, actions, children, flush }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && <header>{title && <div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>}{actions && <div className="actions">{actions}</div>}</header>}
      <div className={`body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export const Stat = ({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) => (
  <div className="card stat"><div className="label">{label}</div><div className="value">{value}</div>{hint && <div className="hint">{hint}</div>}{children}</div>
);

export const Banner = ({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'info'; children: ReactNode }) => <div className={`banner ${tone === 'warn' ? '' : tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty" role="status">Loading…</div>;
export const Problem = ({ message, onRetry }: { message: string; onRetry?: () => void }) => <div className="banner bad" role="alert"><span>{message}</span>{onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}</div>;

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{actions && <div className="actions">{actions}</div>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}><span>{label}</span></label>{children(id)}{hint && <small>{hint}</small>}</div>;
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="toggle" onClick={() => onChange(!on)} />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}{t.badge ? ` (${t.badge})` : ''}</button>)}</div>;
}

export interface Column<T> { head: string; cell: (row: T) => ReactNode; right?: boolean; nowrap?: boolean }
export function Table<T>({ rows, cols, onRow, empty, rowKey }: { rows: T[]; cols: Column<T>[]; onRow?: (r: T) => void; empty?: ReactNode; rowKey: (r: T) => string | number }) {
  if (!rows.length) return <Empty>{empty ?? 'Nothing here yet.'}</Empty>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{cols.map(c => <th key={c.head} className={c.right ? 'r' : ''}>{c.head}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined} tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? e => { if (e.key === 'Enter') onRow(r); } : undefined}>
              {cols.map(c => <td key={c.head} className={`${c.right ? 'r' : ''}${c.nowrap ? ' nowrap' : ''}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">✕</Button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** A confirmation step built into the page (browsers do not show confirm() inside this tool). */
export function Confirm({ title, children, confirmLabel, danger, typed, ready = true, onConfirm, onClose }: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; typed?: string; ready?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = (!typed || text === typed) && ready;
  return (
    <Dialog title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'solid-danger' : 'primary'} disabled={!ok} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      {children}
      {typed && <Field label={`Type “${typed}” to continue`}>{id => <input id={id} className="input" value={text} onChange={e => setText(e.target.value)} autoComplete="off" />}</Field>}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ toasts
interface Toast { id: number; text: string; bad?: boolean }
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = (text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems(i => [...i.slice(-3), { id, text, bad }]);
    setTimeout(() => setItems(i => i.filter(t => t.id !== id)), bad ? 7000 : 3500);
  };
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`} role={t.bad ? 'alert' : 'status'}>{t.text}</div>)}</div></ToastCtx.Provider>;
}

/** Run an action with a toast for success or the server's own error message. */
export function useAction() {
  const toast = useToast();
  return async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    try { const r = await fn(); if (ok) toast(ok); return r; }
    catch (e) { toast((e as Error).message, true); return undefined; }
  };
}

export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the text is selectable */ } }}>{done ? 'Copied' : label}</Button>;
}
