// Tiny DOM helpers. All dynamic content is set via text nodes, never parsed as markup.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...nodes) {  // ignore null/false children, like h() does
  return nativeAppend.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
};

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'object') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children);
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };
export const mount = (el, ...children) => { el.replaceChildren(); el.append(...children); return el; };

export function toast(message, bad = false) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), bad ? 7000 : 3000);
}

export function dialog(title, body, { locked = false } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !locked) close(); };
  const back = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === back && !locked) close(); } },
    h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', { style: 'margin:0' }, title), body));
  document.getElementById('modal-root').append(back);
  document.addEventListener('keydown', onKey);
  back.querySelector('input, textarea, select')?.focus();
  return close;
}

export function ask(message, { yes = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = dialog('Please confirm', h('div', { class: 'stack' }, h('p', { style: 'white-space:pre-line;margin:0' }, message),
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { onclick: () => { close(); resolve(false); } }, 'Cancel'),
        h('button', { class: danger ? 'go danger' : 'go', style: 'width:auto', onclick: () => { close(); resolve(true); } }, yes))));
  });
}

export const field = (label, control, hint) => h('label', { class: 'f' }, label, control, hint ? h('small', {}, hint) : null);

export function ago(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
export const detectVariables = (text) => [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]))];
export const pct = (v) => (v === null || v === undefined ? '–' : `${Math.round(v)}%`);
export const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
