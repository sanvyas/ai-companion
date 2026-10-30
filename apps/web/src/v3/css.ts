import type { CSSProperties } from 'react';

// The third design was drawn as inline styles. This turns a style string into the object React wants, so a screen can be written
// the way it was drawn and still be checked, typed and cached. Custom properties (--x) and vendor prefixes are handled.
const cache = new Map<string, CSSProperties>();

function split(css: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of css) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const camel = (p: string) => (p.startsWith('--') ? p : p.replace(/^-(webkit|moz|ms)-/, (_, v: string) => v[0].toUpperCase() + v.slice(1) + '-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

/** s('display:flex;gap:8px') -> { display: 'flex', gap: '8px' } */
export function s(css: string): CSSProperties {
  const hit = cache.get(css);
  if (hit) return hit;
  const o: Record<string, string> = {};
  for (const decl of split(css)) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
    if (k) o[camel(k)] = v;
  }
  cache.set(css, o as CSSProperties);
  return o as CSSProperties;
}
