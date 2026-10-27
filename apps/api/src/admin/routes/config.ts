import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { INTEGRATIONS, INTEGRATION_BY_ID } from '../../runtime/integrations.js';
import { RATE_UNITS } from '../../runtime/pricing.js';
import { body, guard, record } from './util.js';

export function configRoutes(app: FastifyInstance, ctx: Ctx) {
  const rt = ctx.rt;

  // ------------------------------------------------------------------------------------------ settings
  app.get('/settings', guard(ctx, 'flags.read'), async () => ({ items: rt.settings.list() }));

  app.put('/settings/:key', guard(ctx, 'settings.write'), async req => {
    const key = (req.params as { key: string }).key;
    const def = rt.settings.def(key);
    if (!def) throw notFound('That setting');
    if (def.ownerOnly && req.admin!.role !== 'owner') throw forbidden('forbidden', 'Only an owner can change this one.');
    const b = body(z.object({ value: z.unknown() }), req.body);
    const parsed = def.schema.safeParse(b.value);
    if (!parsed.success) throw badRequest('invalid_value', parsed.error.issues.map(i => i.message).join('; '));
    const r = await rt.settings.set(key, parsed.data, req.admin!.email);
    await record(ctx, req, 'setting.changed', key, r.before, r.after);
    return { ok: true };
  });

  app.delete('/settings/:key', guard(ctx, 'settings.write'), async req => {
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

  app.put('/flags/:key', guard(ctx, 'flags.write'), async req => {
    const key = (req.params as { key: string }).key;
    const b = body(z.object({ description: z.string().max(200).optional(), enabled: z.boolean().optional(), rolloutPct: z.number().int().min(0).max(100).optional() }), req.body);
    try {
      const r = await rt.flags.upsert(key, b, req.admin!.email);
      await record(ctx, req, r.before ? 'flag.changed' : 'flag.created', key, r.before ?? undefined, r.after);
    } catch (e) { throw badRequest('invalid_flag', (e as Error).message); }
    return { ok: true };
  });

  app.delete('/flags/:key', guard(ctx, 'flags.write'), async req => {
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

  app.post('/integrations/:id/test', { ...guard(ctx, 'integrations.write'), config: { rateLimit: { max: 10 * ctx.cfg.RATE_LIMIT_SCALE, timeWindow: '1 minute' } } }, async req => {
    const id = (req.params as { id: string }).id;
    const def = INTEGRATION_BY_ID.get(id);
    if (!def) throw notFound('That integration');
    if (!def.test) return { ok: null, note: 'There is no test for this one yet.' };
    const values = rt.secrets.values(id);
    const missing = def.fields.filter(f => !values[f.name]);
    if (missing.length) return { ok: false, note: `Add ${missing.map(m => m.label).join(', ')} first.` };
    const r = await def.test(values, fetch);
    await rt.secrets.recordTest(id, r.ok, r.note);
    await record(ctx, req, 'integration.tested', id, undefined, { ok: r.ok });
    return r;
  });

  // ------------------------------------------------------------------------------------------ prices
  app.get('/pricing', guard(ctx, 'cost.read'), async () => ({ items: rt.pricing.list(), units: RATE_UNITS, usdInr: rt.settings.num('cost.usd_inr') }));

  app.put('/pricing', guard(ctx, 'cost.write'), async req => {
    const b = body(z.object({ provider: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/), unit: z.enum(RATE_UNITS as [string, ...string[]]), rate: z.number().min(0).max(1e9), currency: z.enum(['INR', 'USD']), sourceNote: z.string().max(200).default(''), verified: z.boolean().default(false) }), req.body);
    await rt.pricing.upsert(b as Parameters<typeof rt.pricing.upsert>[0], req.admin!.email);
    await record(ctx, req, 'pricing.set', `${b.provider}/${b.unit}`, undefined, { rate: b.rate, currency: b.currency, verified: b.verified });
    return { ok: true };
  });

  app.delete('/pricing/:id', guard(ctx, 'cost.write'), async req => {
    const id = Number((req.params as { id: string }).id);
    await rt.pricing.remove(id);
    await record(ctx, req, 'pricing.deleted', String(id));
    return { ok: true };
  });

  app.post('/pricing/recost', guard(ctx, 'cost.write'), async req => {
    const n = await rt.pricing.recost();
    await record(ctx, req, 'pricing.recost', undefined, undefined, { updated: n });
    return { updated: n };
  });
}
