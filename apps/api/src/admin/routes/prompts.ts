import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { PROMPT_BY_KEY, validatePromptBody } from '../../runtime/promptDefs.js';
import { SUITES, gatingRun, playground, runEval, suiteFor, type SuiteName } from '../evals.js';
import { can } from '../rbac.js';
import { body, guard, record } from './util.js';

export function promptRoutes(app: FastifyInstance, ctx: Ctx) {
  const store = ctx.rt.prompts;
  const heavy = (max: number) => ({ rateLimit: { max: max * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } });

  app.get('/prompts', guard(ctx, 'prompts.read'), async () => ({
    items: (await store.list()).map(p => ({ key: p.def.key, label: p.def.label, group: p.def.group, description: p.def.description, safetyCritical: p.def.safetyCritical, vars: p.def.vars, liveVersion: p.liveVersion, drafts: p.drafts, versions: p.versions, suite: suiteFor(p.def.key) })),
  }));

  app.get('/prompts/:key', guard(ctx, 'prompts.read'), async req => {
    const key = (req.params as { key: string }).key;
    const def = PROMPT_BY_KEY.get(key);
    if (!def) throw notFound('That prompt');
    return { def: { key: def.key, label: def.label, group: def.group, description: def.description, safetyCritical: def.safetyCritical, vars: def.vars, mustContain: def.mustContain, suite: suiteFor(key) }, defaultBody: def.body, liveBody: store.get(key), liveVersion: store.liveVersion(key), versions: await store.versions(key) };
  });

  app.post('/prompts/:key/drafts', guard(ctx, 'prompts.write'), async req => {
    const key = (req.params as { key: string }).key;
    const def = PROMPT_BY_KEY.get(key);
    if (!def) throw notFound('That prompt');
    const b = body(z.object({ body: z.string().max(12_000), note: z.string().max(200).default('') }), req.body);
    const problems = validatePromptBody(def, b.body);
    if (problems.length) throw badRequest('invalid_prompt', problems.join(' '));
    const v = await store.saveDraft(key, b.body, b.note, req.admin!.email);
    await record(ctx, req, 'prompt.draft_saved', `${key}@${v.version}`, undefined, { note: b.note, chars: b.body.length });
    return v;
  });

  /** Safety-critical prompts: owner only, and the matching evaluation must have passed on this exact version in the last day. */
  app.post('/prompts/versions/:id/publish', guard(ctx, 'prompts.publish'), async req => {
    const id = Number((req.params as { id: string }).id);
    const v = await store.getVersion(id);
    if (!v) throw notFound('That version');
    const def = PROMPT_BY_KEY.get(v.key)!;
    let evalRunId: number | null = null;
    if (def.safetyCritical) {
      if (!can(req.admin!.role, 'prompts.publish_safety')) throw forbidden('forbidden', 'Only an owner can publish a safety prompt.');
      const suite = suiteFor(v.key);
      const run = suite ? await gatingRun(ctx, id, suite) : null;
      if (!run) throw badRequest('eval_required', `Run the “${suite}” evaluation on this version first. Every critical case must pass, and the run must be less than a day old.`);
      evalRunId = run.id;
    }
    const before = store.liveVersion(v.key);
    const out = await store.publish(id, req.admin!.email, evalRunId);
    await record(ctx, req, 'prompt.published', `${v.key}@${v.version}`, { liveVersion: before }, { liveVersion: v.version, evalRunId });
    return out;
  });

  app.post('/prompts/:key/revert', guard(ctx, 'prompts.publish'), async req => {
    const key = (req.params as { key: string }).key;
    const def = PROMPT_BY_KEY.get(key);
    if (!def) throw notFound('That prompt');
    if (def.safetyCritical && !can(req.admin!.role, 'prompts.publish_safety')) throw forbidden('forbidden', 'Only an owner can change a safety prompt.');
    const before = store.liveVersion(key);
    await store.revertToDefault(key);
    await record(ctx, req, 'prompt.reverted_to_default', key, { liveVersion: before }, { liveVersion: null });
    return { ok: true };
  });

  // ------------------------------------------------------------------------------------------ test bench and evals
  app.post('/prompts/playground', { ...guard(ctx, 'prompts.write'), config: heavy(20) }, async req => {
    const b = body(z.object({
      key: z.string(), body: z.string().max(12_000).optional(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(12),
      language: z.enum(['en', 'hinglish', 'hi']).optional(), mode: z.enum(['text', 'voice', 'video', 'checkin', 'sit', 'walk']).optional(), level: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    }), req.body);
    const def = PROMPT_BY_KEY.get(b.key);
    if (!def) throw notFound('That prompt');
    if (b.body !== undefined) { const p = validatePromptBody(def, b.body); if (p.length) throw badRequest('invalid_prompt', p.join(' ')); }
    if (!ctx.llm.configured) throw badRequest('llm_unavailable', 'Add the Anthropic key under Integrations first.');
    return playground(ctx, b);
  });

  app.get('/evals/suites', guard(ctx, 'prompts.read'), async () => {
    const counts = (await withSystem(ctx.db, tx => tx.query(`SELECT suite, count(*)::int AS n, count(*) FILTER (WHERE active)::int AS active FROM eval_cases GROUP BY suite`))).rows;
    const last = (await withSystem(ctx.db, tx => tx.query(`SELECT DISTINCT ON (suite) suite, id, passed, failed, total, created_at, prompt_key FROM eval_runs ORDER BY suite, id DESC`))).rows;
    return { suites: SUITES.map(s => ({ ...s, cases: counts.find(c => c.suite === s.name)?.n ?? 0, last: last.find(l => l.suite === s.name) ?? null })) };
  });

  app.get('/evals/cases', guard(ctx, 'prompts.read'), async req => {
    const suite = (req.query as { suite?: string }).suite;
    return { items: (await withSystem(ctx.db, tx => tx.query(`SELECT id, suite, label, input, expect, active FROM eval_cases ${suite ? 'WHERE suite = $1' : ''} ORDER BY suite, id`, suite ? [suite] : []))).rows };
  });

  app.post('/evals/cases', guard(ctx, 'prompts.write'), async req => {
    const b = body(z.object({ suite: z.enum(['classifier', 'reviewer', 'replies']), label: z.string().trim().min(3).max(80), input: z.string().trim().min(1).max(1000), expect: z.record(z.unknown()) }), req.body);
    const e = b.expect as Record<string, unknown>;
    const okShape = b.suite === 'classifier' ? typeof e.min === 'number' && typeof e.max === 'number' : b.suite === 'reviewer' ? typeof e.ok === 'boolean' : Array.isArray(e.require) && Array.isArray(e.forbid) && [0, 1, 2].includes(e.level as number);
    if (!okShape) throw badRequest('invalid_case', 'The expectation doesn’t match this suite.');
    const r = await withSystem(ctx.db, tx => tx.query('INSERT INTO eval_cases (suite, label, input, expect) VALUES ($1,$2,$3,$4) ON CONFLICT (suite, label) DO NOTHING RETURNING id', [b.suite, b.label, b.input, JSON.stringify({ critical: false, ...e })]));
    if (!r.rowCount) throw badRequest('exists', 'A case with that name already exists in this suite.');
    await record(ctx, req, 'eval.case_added', `${b.suite}/${b.label}`);
    return { id: r.rows[0].id };
  });

  app.patch('/evals/cases/:id', guard(ctx, 'prompts.write'), async req => {
    const id = Number((req.params as { id: string }).id);
    const b = body(z.object({ active: z.boolean() }), req.body);
    await withSystem(ctx.db, tx => tx.query('UPDATE eval_cases SET active = $2 WHERE id = $1', [id, b.active]));
    await record(ctx, req, 'eval.case_toggled', String(id), undefined, { active: b.active });
    return { ok: true };
  });

  app.post('/evals/run', { ...guard(ctx, 'prompts.write'), config: heavy(4) }, async req => {
    const b = body(z.object({ suite: z.enum(['classifier', 'reviewer', 'replies']), promptKey: z.string().optional(), versionId: z.number().int().optional(), body: z.string().max(12_000).optional() }), req.body);
    const overrides: Record<string, string> = {};
    let versionId = b.versionId;
    if (b.versionId) {
      const v = await store.getVersion(b.versionId);
      if (!v) throw notFound('That version');
      overrides[v.key] = v.body;
    } else if (b.promptKey && b.body !== undefined) {
      const def = PROMPT_BY_KEY.get(b.promptKey);
      if (!def) throw notFound('That prompt');
      const p = validatePromptBody(def, b.body);
      if (p.length) throw badRequest('invalid_prompt', p.join(' '));
      overrides[b.promptKey] = b.body;
      versionId = undefined;
    }
    try {
      const out = await runEval(ctx, { suite: b.suite as SuiteName, overrides, promptKey: b.promptKey, versionId, by: req.admin!.email });
      await record(ctx, req, 'eval.run', `${b.suite}#${out.runId}`, undefined, { passed: out.passed, failed: out.failed, criticalFailed: out.criticalFailed });
      return out;
    } catch (e) {
      const err = e as { status?: number; code?: string; message: string };
      if (err.status) throw badRequest(err.code ?? 'eval_failed', err.message);
      throw e;
    }
  });

  app.get('/evals/runs', guard(ctx, 'prompts.read'), async () => ({
    items: (await withSystem(ctx.db, tx => tx.query(`SELECT id, suite, prompt_key, prompt_version_id, model, started_by, passed, failed, total, cost_inr::float AS cost_inr, created_at FROM eval_runs ORDER BY id DESC LIMIT 30`))).rows,
  }));

  app.get('/evals/runs/:id', guard(ctx, 'prompts.read'), async req => {
    const r = (await withSystem(ctx.db, tx => tx.query('SELECT * FROM eval_runs WHERE id = $1', [Number((req.params as { id: string }).id)]))).rows[0];
    if (!r) throw notFound('That run');
    return r;
  });
}
