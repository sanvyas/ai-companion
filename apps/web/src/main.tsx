import { api } from './api';

// Three designs share one app. Which one loads: ?ui=1, ?ui=2 or ?ui=3 on this device (remembered; ?ui=auto clears it), otherwise the
// switches in the admin portal (Feature flags, ui.v3 then ui.v2). Only the chosen design's code and styles are downloaded.
const KEY = 'saathi.ui';
const LAST = 'saathi.ui.last';

function store(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } }
function read(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

type Which = '1' | '2' | '3';
const isWhich = (v: string | null): v is Which => v === '1' || v === '2' || v === '3';

function forced(): Which | null {
  const q = new URLSearchParams(location.search).get('ui');
  if (isWhich(q)) store(KEY, q);
  else if (q === 'auto') store(KEY, null);
  const v = isWhich(q) ? q : read(KEY);
  return isWhich(v) ? v : null;
}

async function pick(): Promise<Which> {
  const f = forced();
  if (f) return f;
  const ask = api.publicConfig().then(c => (c.uiV3 ? '3' : c.uiV2 ? '2' : '1') as Which);
  const last = read(LAST);
  // Repeat visits start at once on the design last used and learn the current answer in the background.
  if (isWhich(last)) { void ask.then(v => store(LAST, v)).catch(() => undefined); return last; }
  try {
    const v = await Promise.race([ask, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    store(LAST, v);
    return v;
  } catch { return '1'; }
}

const root = document.getElementById('root')!;
void pick().then(async which => {
  if (which === '3') (await import('./entry/v3')).mountV3(root);
  else if (which === '2') (await import('./entry/v2')).mountV2(root);
  else (await import('./entry/v1')).mountV1(root);
});
