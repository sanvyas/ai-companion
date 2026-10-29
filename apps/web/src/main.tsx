import { api } from './api';

// Two designs share one app. Which one loads: ?ui=2 or ?ui=1 on this device (remembered; ?ui=auto clears it), otherwise the
// switch in the admin portal (Feature flags, ui.v2). Only the chosen design's code and styles are downloaded.
const KEY = 'saathi.ui';
const LAST = 'saathi.ui.last';

function store(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } }
function read(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

function forced(): '1' | '2' | null {
  const q = new URLSearchParams(location.search).get('ui');
  if (q === '1' || q === '2') store(KEY, q);
  else if (q === 'auto') store(KEY, null);
  const v = q === '1' || q === '2' ? q : read(KEY);
  return v === '1' || v === '2' ? v : null;
}

async function pick(): Promise<'1' | '2'> {
  const f = forced();
  if (f) return f;
  const ask = api.publicConfig().then(c => (c.uiV2 ? '2' : '1') as '1' | '2');
  const last = read(LAST);
  // Repeat visits start at once on the design last used and learn the current answer in the background.
  if (last === '1' || last === '2') { void ask.then(v => store(LAST, v)).catch(() => undefined); return last; }
  try {
    const v = await Promise.race([ask, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    store(LAST, v);
    return v;
  } catch { return '1'; }
}

const root = document.getElementById('root')!;
void pick().then(async which => {
  if (which === '2') (await import('./entry/v2')).mountV2(root);
  else (await import('./entry/v1')).mountV1(root);
});
