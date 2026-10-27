import { useCallback, useEffect, useRef, useState } from 'react';

// The portal talks to /admin/api with its own session cookie (httpOnly, set by the server) and a CSRF header on writes.
const ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8787';
const BASE = `${ORIGIN}/admin/api`;

let csrf = '';
export const setCsrf = (v: string) => { csrf = v; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Listener = () => void;
const signedOutListeners = new Set<Listener>();
export const onSignedOut = (fn: Listener) => { signedOutListeners.add(fn); return () => { signedOutListeners.delete(fn); }; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
  let res: Response;
  try { res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, 'network', 'Can’t reach the server. Check that the API is running and the address is right.'); }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: { error?: { code?: string; message?: string } } | undefined;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) signedOutListeners.forEach(f => f());
    throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `The server answered ${res.status}.`);
  }
  return json as T;
}

export const api = {
  get: <T = unknown>(p: string) => req<T>('GET', p),
  post: <T = unknown>(p: string, b?: unknown) => req<T>('POST', p, b ?? {}),
  put: <T = unknown>(p: string, b?: unknown) => req<T>('PUT', p, b ?? {}),
  patch: <T = unknown>(p: string, b?: unknown) => req<T>('PATCH', p, b ?? {}),
  del: <T = unknown>(p: string) => req<T>('DELETE', p),
};

/** Load a path and keep it fresh. `path = null` waits. Reload after a write with `reload()`. */
export function useLoad<T>(path: string | null, opts: { every?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const live = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    const n = ++live.current;
    if (!quiet) setLoading(true);
    try { const d = await api.get<T>(path); if (n === live.current) { setData(d); setError(null); } }
    catch (e) { if (n === live.current) setError((e as Error).message); }
    finally { if (n === live.current) setLoading(false); }
  }, [path]);
  useEffect(() => { setData(null); void load(); }, [load]);
  useEffect(() => {
    if (!opts.every || !path) return;
    const id = setInterval(() => void load(true), opts.every);
    return () => clearInterval(id);
  }, [opts.every, path, load]);
  return { data, error, loading, reload: () => load(true) };
}
