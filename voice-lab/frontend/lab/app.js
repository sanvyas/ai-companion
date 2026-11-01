import { h, mount, toast } from './ui.js';
import { getConfig } from './api.js';

const TABS = [['test', 'Test'], ['talk', 'Talk'], ['results', 'Results'], ['settings', 'Settings']];
const loaders = {
  test: () => import('./views/test.js'), talk: () => import('./views/talk.js'),
  results: () => import('./views/results.js'), settings: () => import('./views/settings.js'),
};
const view = document.getElementById('view');
let cleanup = null; let token = 0;

function parse() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = 'test', ...rest] = path.split('/').filter(Boolean);
  return { name: loaders[name] ? name : 'test', params: rest, query: new URLSearchParams(query) };
}

async function route() {
  const mine = ++token;
  const { name, params, query } = parse();
  mount(document.getElementById('nav'), ...TABS.map(([id, label]) => h('a', { href: `#/${id}`, class: id === name ? 'on' : '', 'aria-current': id === name ? 'page' : null }, label)));
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  mount(view, h('div', { class: 'empty' }, 'Loading…'));
  try {
    const mod = await loaders[name]();
    if (mine !== token) return;
    const box = h('div', { class: 'stack', style: 'gap:18px' });
    mount(view, box);
    cleanup = (await mod.render(box, { params, query })) || null;
    if (mine !== token && cleanup) { cleanup(); cleanup = null; }
    window.scrollTo(0, 0);
  } catch (err) {
    if (mine === token) mount(view, h('div', { class: 'card empty' }, h('p', {}, err.message || String(err)), h('button', { onclick: route }, 'Try again')));
    if (!err.status) console.error(err);
  }
}

async function banner(force = false) {
  const el = document.getElementById('banner');
  try {
    const cfg = await getConfig(force);
    mount(el, cfg.llm_ready ? null : h('div', { class: 'notice' }, 'Connect Groq to start testing. ', h('a', { href: '#/settings' }, 'Open Settings')),
      cfg.storage === 'temporary' ? h('div', { class: 'notice bad' }, 'Temporary storage: your data is lost whenever this server restarts. Set DATABASE_URL to a Postgres database to keep it.') : null);
  } catch (err) { if (err.status !== 401) toast(err.message, true); }
}

window.addEventListener('hashchange', () => { route(); banner(true); });
window.addEventListener('lab-config', () => banner(false));
banner().then(route);
