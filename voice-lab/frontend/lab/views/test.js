import { h, mount, toast, ask, dialog, field, detectVariables, pct, slug } from '../ui.js';
import { api, getConfig } from '../api.js';
import { conversationRow, isPending } from '../components.js';
import { saved, remember, ensureVersion } from '../workspace.js';

export async function render(root, { params }) {
  const [cfg, prompts, scenarios, evalsets] = await Promise.all([getConfig(), api('/prompts'), api('/scenarios'), api('/eval-sets')]);
  const ws = saved();
  let timer = null; let gone = false;
  const st = { prompt: null, version: null, values: {}, selected: new Set(ws.moods || scenarios.map((s) => s.id)), evalId: evalsets[0]?.id };
  if (!prompts.length) { root.append(h('div', { class: 'card empty' }, h('p', {}, 'Create your first prompt to start.'), h('button', { class: 'go', style: 'width:auto', onclick: () => newPrompt() }, 'New prompt'))); return; }

  const sel = h('select', { 'aria-label': 'Prompt' }, ...prompts.map((p) => h('option', { value: p.id }, p.name)));
  const text = h('textarea', { class: 'code', spellcheck: false, 'aria-label': 'Prompt text' });
  const varsBox = h('div', { class: 'stack' });
  const moodsBox = h('div', { class: 'chips' });
  const runBtn = h('button', { class: 'go' }, 'Run test');
  const out = h('div', { class: 'stack' });
  const hint = h('div', { class: 'small muted' });

  async function loadPrompt(id) {
    st.prompt = await api(`/prompts/${id}`); st.version = st.prompt.versions[0]; sel.value = id;
    const same = ws.promptId === id && ws.text;
    text.value = same ? ws.text : st.version.content;
    st.values = { ...st.version.variable_defaults, ...(same ? ws.values : {}) };
    drawVars();
  }
  function drawVars() {
    const names = detectVariables(text.value);
    mount(varsBox, ...names.map((n) => field(n, h('input', { value: st.values[n] ?? '', oninput: (e) => { st.values[n] = e.target.value; keep(); } }))));
    hint.textContent = names.length ? 'Change these to compare versions without editing the prompt.' : 'Tip: write {{tone}} in the prompt to make a value you can change per test.';
    keep();
  }
  const keep = () => remember({ promptId: st.prompt.id, text: text.value, values: st.values, moods: [...st.selected] });
  text.addEventListener('input', drawVars);
  sel.addEventListener('change', () => { remember({ promptId: sel.value, text: '' }); ws.promptId = null; loadPrompt(sel.value); });

  function drawMoods() {
    mount(moodsBox, ...scenarios.map((s) => h('span', { class: 'chip' + (st.selected.has(s.id) ? ' on' : ''), role: 'button', tabindex: 0,
      onclick: () => { st.selected.has(s.id) ? st.selected.delete(s.id) : st.selected.add(s.id); drawMoods(); keep(); } }, s.name,
      h('button', { class: 'link', title: 'Edit mood', style: 'padding:0 2px', onclick: (e) => { e.stopPropagation(); moodDialog(s); } }, '✎'))),
      h('button', { class: 'chip', onclick: () => moodDialog(null) }, '+ Add mood'));
    runBtn.disabled = !st.selected.size;
  }

  function moodDialog(s) {
    const name = h('input', { value: s?.name || '', placeholder: 'e.g. Impatient' });
    const who = h('textarea', { rows: 3, value: s?.persona || '', placeholder: 'Who is calling, what is going on, and how do they talk?' });
    const first = h('input', { value: s?.opening_message || '', placeholder: 'What they say first' });
    const close = dialog(s ? 'Edit mood' : 'Add a mood', h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const body = { name: name.value, mood: s?.mood || slug(name.value) || 'custom', persona: who.value, behavior: s?.behavior || '', opening_message: first.value, intensity: s?.intensity ?? 3, max_turns: s?.max_turns ?? 6, scripted_turns: s?.scripted_turns || [], variables: s?.variables || {}, tags: s?.tags || [] };
        const saved1 = await api(s ? `/scenarios/${s.id}` : '/scenarios', { method: s ? 'PUT' : 'POST', body });
        if (s) Object.assign(s, saved1); else { scenarios.push(saved1); st.selected.add(saved1.id); }
        close(); drawMoods(); keep();
      } catch (err) { toast(err.message, true); }
    } }, field('Mood', name), field('The caller', who), field('First line', first),
      h('button', { class: 'go', type: 'submit' }, 'Save'),
      s ? h('button', { type: 'button', class: 'link danger', onclick: async () => { if (await ask(`Remove “${s.name}”? Past results are kept.`, { yes: 'Remove', danger: true })) { await api(`/scenarios/${s.id}`, { method: 'DELETE' }); scenarios.splice(scenarios.indexOf(s), 1); st.selected.delete(s.id); close(); drawMoods(); } } }, 'Remove this mood') : null));
  }

  function newPrompt() {
    const name = h('input', { placeholder: 'e.g. Calm coach' });
    const close = dialog('New prompt', h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      try { const p = await api('/prompts', { method: 'POST', body: { name: name.value, content: 'You are a calm, caring voice assistant. Keep replies to 2-4 short spoken sentences and ask one question at a time.' } }); remember({ promptId: p.id, text: '' }); close(); location.hash = '#/test'; location.reload(); }
      catch (err) { toast(err.message, true); }
    } }, field('Name', name), h('button', { class: 'go', type: 'submit' }, 'Create')));
  }

  runBtn.addEventListener('click', async () => {
    if (!cfg.llm_ready) { location.hash = '#/settings'; return; }
    runBtn.disabled = true; runBtn.textContent = 'Starting…';
    try {
      const v = await ensureVersion({ promptId: st.prompt.id, text: text.value, values: st.values, version: st.version });
      const run = await api('/runs', { method: 'POST', body: { name: '', prompt_version_id: v.versionId, eval_set_id: st.evalId, scenario_ids: [...st.selected], variables: v.variables } });
      remember({ text: '', promptId: st.prompt.id }); ws.text = '';
      location.hash = `#/test/${run.id}`;
    } catch (e) { toast(e.message, true); runBtn.disabled = false; runBtn.textContent = 'Run test'; }
  });

  // ---- results of a run
  const openIds = new Set();
  async function showRun(id) {
    let run;
    try { run = await api(`/runs/${id}`); } catch (e) { mount(out, h('div', { class: 'notice bad' }, e.message)); return; }
    if (gone) return;
    const c = run.counts, done = c.total - c.pending, running = run.status === 'queued' || run.status === 'running';
    const decided = c.passed + c.failed;
    const kindOf = run.pass_rate === null ? '' : run.pass_rate >= 80 ? 'pass' : 'fail';
    const order = { fail: 0, error: 1, pass: 2 };
    const rows = [...run.conversations].sort((a, b) => (isPending(a) - isPending(b)) || ((order[a.verdict] ?? 3) - (order[b.verdict] ?? 3)));
    mount(out,
      h('div', { class: 'card stack' },
        running ? h('div', { class: 'stack' }, h('strong', {}, `Testing… ${done} of ${c.total} done`), h('div', { class: 'progress' }, h('i', { style: `width:${(100 * done) / c.total}%` })))
          : h('div', { class: 'score ' + kindOf }, h('b', {}, pct(run.pass_rate)), h('span', { class: 'muted' }, `${c.passed} of ${decided || c.total} moods passed`)),
        h('div', { class: 'small muted' }, [run.prompt_label, ...Object.entries(run.config.variables || {}).slice(0, 4).map(([k, v]) => `${k}: ${v}`)].join(' · ')),
        !running ? publishRow(run) : null),
      ...rows.map((r) => conversationRow(r, { open: openIds.has(r.id), onToggle: (o) => (o ? openIds.add(r.id) : openIds.delete(r.id)) })));
    if (running) timer = setTimeout(() => showRun(id), 1500);
  }
  function publishRow(run) {
    const go = async (env, confirm = false) => {
      try {
        const g = run.config;
        await api('/deployments', { method: 'POST', body: { environment: env, prompt_version_id: run.prompt_version_id, variables: g.variables || {}, temperature: g.temperature ?? 0.7, max_tokens: g.max_tokens ?? 350, provider: g.provider || null, model: g.model || null, note: run.name, confirm } });
        toast(env === 'production' ? 'Live in your app' : 'Published to your test app');
      } catch (e) {
        if (e.status === 409 && await ask(`${e.message}\n\nPublish anyway?`, { yes: 'Publish anyway' })) return go(env, true);
        if (e.status !== 409) toast(e.message, true);
      }
    };
    return h('div', { class: 'stack', style: 'gap:6px' }, h('button', { class: 'go', onclick: () => go('production') }, 'Publish to my app'),
      h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'link', onclick: () => go('staging') }, 'Publish to test app only')));
  }

  mount(root,
    h('div', {}, h('h1', {}, 'Test a prompt'), h('div', { class: 'muted' }, 'Write it, pick the moods, and see what passes.')),
    h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, sel), h('button', { onclick: newPrompt }, '+ New')), text, varsBox, hint),
    h('div', { class: 'card stack' }, h('h2', { style: 'margin:0' }, 'Moods to test'), moodsBox), runBtn, out);
  await loadPrompt(prompts.some((p) => p.id === ws.promptId) ? ws.promptId : prompts[0].id);
  drawMoods();
  if (params[0]) await showRun(params[0]);
  return () => { gone = true; clearTimeout(timer); };
}
