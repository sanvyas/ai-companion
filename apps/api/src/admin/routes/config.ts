import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { AppError, badRequest, forbidden, notFound } from '../../errors.js';
import { INTEGRATIONS, INTEGRATION_BY_ID } from '../../runtime/integrations.js';
import { listModels, tryModel } from '../../runtime/openrouter.js';
import { RATE_UNITS } from '../../runtime/pricing.js';
import { body, guard, params, payload, record, show } from './util.js';

export function configRoutes(app: FastifyInstance, ctx: Ctx) {
  const rt = ctx.rt;
  const f = () => ctx.fetchImpl ?? fetch;

  // ------------------------------------------------------------------------------------------ settings
  app.get('/settings', guard(ctx, 'flags.read'), async () => ({ items: rt.settings.list() }));

  app.put('/settings/:key', guard(ctx, 'settings.write', req => `Change setting “${rt.settings.def(params(req).key)?.label ?? params(req).key}” to ${show(payload(req).value)}`), async req => {
    const key = (req.params as { key: string }).key;
    const def = rt.settings.def(key);
    if (!def) throw notFound('That setting');
    if (def.ownerOnly && req.admin!.role !== 'owner') throw forbidden('forbidden', 'Only an owner can change this one.');
    const b = body(z.object({ value: z.unknown() }), req.body);
    const parsed = def.schema.safeParse(b.value);
    if (!parsed.success) throw badRequest('invalid_value', parsed.error.issues.map(i => i.message).join('; '));
    // An OpenRouter model has to be one OpenRouter actually offers. If the list can't be reached, don't block on it.
    if (key.startsWith('openrouter.models.')) {
      const list = await listModels(f(), rt.secrets.get('openrouter', 'api_key')).catch(() => null);
      if (list && !list.some(m => m.id === parsed.data)) throw badRequest('unknown_model', 'OpenRouter doesn’t offer that model. Choose one from the list.');
    }
    const r = await rt.settings.set(key, parsed.data, req.admin!.email);
    await record(ctx, req, 'setting.changed', key, r.before, r.after);
    return { ok: true };
  });

  app.delete('/settings/:key', guard(ctx, 'settings.write', req => `Reset setting “${rt.settings.def(params(req).key)?.label ?? params(req).key}” to its default`), async req => {
    const key = (req.params as { key: string }).key;
    const def = rt.settings.def(key);
    if (!def) throw notFound('That setting');
    if (def.ownerOnly && req.admin!.role !== 'owner') throw forbidden('forbidden', 'Only an owner can change this one.');
    const before = await rt.settings.reset(key);
    await record(ctx, req, 'setting.reset', key, before, rt.settings.get(key));
    return { ok: true };
  });

  // ------------------------------------------------------------------------------------------ feature flags
  app.get('/flags', guard(ctx, 'flags.read'), async () => ({ items: rt.flags.list() }));

  app.put('/flags/:key', guard(ctx, 'flags.write', req => { const b = payload(req); return `Flag “${params(req).key}”: ${[b.enabled !== undefined ? (b.enabled ? 'turn on' : 'turn off') : '', b.rolloutPct !== undefined ? `roll out to ${b.rolloutPct}%` : '', b.description !== undefined ? 'edit description' : ''].filter(Boolean).join(', ') || 'update'}`; }), async req => {
    const key = (req.params as { key: string }).key;
    const b = body(z.object({ description: z.string().max(200).optional(), enabled: z.boolean().optional(), rolloutPct: z.number().int().min(0).max(100).optional() }), req.body);
    try {
      const r = await rt.flags.upsert(key, b, req.admin!.email);
      await record(ctx, req, r.before ? 'flag.changed' : 'flag.created', key, r.before ?? undefined, r.after);
    } catch (e) { throw badRequest('invalid_flag', (e as Error).message); }
    return { ok: true };
  });

  app.delete('/flags/:key', guard(ctx, 'flags.write', req => `Delete flag “${params(req).key}”`), async req => {
    const key = (req.params as { key: string }).key;
    await rt.flags.remove(key);
    await record(ctx, req, 'flag.deleted', key);
    return { ok: true };
  });

  // ------------------------------------------------------------------------------------------ integrations and keys
  app.get('/integrations', guard(ctx, 'integrations.read'), async () => {
    const st = new Map(rt.secrets.status().map(s => [s.id, s.fields]));
    return {
      items: INTEGRATIONS.map(i => ({ id: i.id, label: i.label, category: i.category, purpose: i.purpose, status: i.status, statusNote: i.statusNote, docsUrl: i.docsUrl, hosts: i.hosts, testable: !!i.test, fields: st.get(i.id) })),
    };
  });

  app.put('/integrations/:id/:field', guard(ctx, 'integrations.write'), async req => {
    const { id, field } = req.params as { id: string; field: string };
    const def = INTEGRATION_BY_ID.get(id);
    const f = def?.fields.find(x => x.name === field);
    if (!def || !f) throw notFound('That credential');
    const b = body(z.object({ value: z.string().min(1).max(2000) }), req.body);
    try { await rt.secrets.set(id, field, b.value, req.admin!.email); } catch (e) { throw badRequest('invalid_credential', (e as Error).message); }
    // The audit trail records that it changed and the last four characters, never the value.
    await record(ctx, req, 'integration.credential_set', `${id}.${field}`, undefined, { last4: f.secret ? b.value.trim().slice(-4) : b.value.trim() });
    return { ok: true };
  });

  app.delete('/integrations/:id/:field', guard(ctx, 'integrations.write'), async req => {
    const { id, field } = req.params as { id: string; field: string };
    if (!INTEGRATION_BY_ID.get(id)?.fields.some(x => x.name === field)) throw notFound('That credential');
    await rt.secrets.remove(id, field);
    await record(ctx, req, 'integration.credential_removed', `${id}.${field}`);
    return { ok: true };
  });

  // OpenRouter: the models its key can use, and a one-message try-out of any of them.
  app.get('/integrations/openrouter/models', guard(ctx, 'integrations.read'), async req => {
    const fresh = (req.query as { refresh?: string }).refresh === '1';
    try { return { items: await listModels(f(), rt.secrets.get('openrouter', 'api_key'), fresh), keySet: !!rt.secrets.get('openrouter', 'api_key') }; }
    catch (e) { if (e instanceof AppError) throw e; throw badRequest('openrouter_unreachable', (e as Error).message); }
  });

  app.post('/integrations/openrouter/try', { ...guard(ctx, 'integrations.write'), config: { rateLimit: { max: 20 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async req => {
    const b = body(z.object({ model: z.string().trim().regex(/^[\w.-]+\/[\w.:+-]+$/).max(100) }), req.body);
    const key = rt.secrets.get('openrouter', 'api_key');
    if (!key) throw badRequest('no_key', 'Add the OpenRouter API key first.');
    const r = await tryModel(f(), key, b.model);
    await record(ctx, req, 'openrouter.tried_model', b.model, undefined, { ok: r.ok, latencyMs: r.latencyMs });
    return { ...r, costInr: r.costUsd !== undefined ? Math.round(r.costUsd * rt.settings.num('cost.usd_inr') * 10_000) / 10_000 : null };
  });

  app.post('/integrations/:id/test', { ...guard(ctx, 'integrations.write'), config: { rateLimit: { max: 10 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async req => {
    const id = (req.params as { id: string }).id;
    const def = INTEGRATION_BY_ID.get(id);
    if (!def) throw notFound('That integration');
    if (!def.test) return { ok: null, note: 'There is no test for this one yet.' };
    const values = rt.secrets.values(id);
    const missing = def.fields.filter(f => !values[f.name]);
    if (missing.length) return { ok: false, note: `Add ${missing.map(m => m.label).join(', ')} first.` };
    const r = await def.test(values, f(), { companionModel: rt.settings.str('openrouter.models.companion'), anthropicModel: rt.settings.str('models.companion') });
    await rt.secrets.recordTest(id, r.ok, r.note);
    await record(ctx, req, 'integration.tested', id, undefined, { ok: r.ok });
    return r;
  });

  // ------------------------------------------------------------------------------------------ prices
  app.get('/pricing', guard(ctx, 'cost.read'), async () => ({ items: rt.pricing.list(), units: RATE_UNITS, usdInr: rt.settings.num('cost.usd_inr') }));

  app.put('/pricing', guard(ctx, 'cost.write', req => { const b = payload(req); return `Set price for ${b.provider}/${b.unit} to ${b.rate} ${b.currency}`; }), async req => {
    const b = body(z.object({ provider: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/), unit: z.enum(RATE_UNITS as [string, ...string[]]), rate: z.number().min(0).max(1e9), currency: z.enum(['INR', 'USD']), sourceNote: z.string().max(200).default(''), verified: z.boolean().default(false) }), req.body);
    await rt.pricing.upsert(b as Parameters<typeof rt.pricing.upsert>[0], req.admin!.email);
    await record(ctx, req, 'pricing.set', `${b.provider}/${b.unit}`, undefined, { rate: b.rate, currency: b.currency, verified: b.verified });
    return { ok: true };
  });

  app.delete('/pricing/:id', guard(ctx, 'cost.write', () => 'Delete a price rate'), async req => {
    const id = Number((req.params as { id: string }).id);
    await rt.pricing.remove(id);
    await record(ctx, req, 'pricing.deleted', String(id));
    return { ok: true };
  });

  app.post('/pricing/recost', guard(ctx, 'cost.write', () => 'Re-price past usage with the current rates'), async req => {
    const n = await rt.pricing.recost();
    await record(ctx, req, 'pricing.recost', undefined, undefined, { updated: n });
    return { updated: n };
  });
}
