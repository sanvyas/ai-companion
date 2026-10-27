import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { withSystem } from '../../db/pool.js';
import { badRequest, notFound } from '../../errors.js';
import { body, guard, record } from './util.js';

// The catalogue the app shows: helplines (safety critical, each number needs a person to verify it), events and the
// read-only calm library.

const tel = z.string().trim().regex(/^\+?[\d-]{3,18}$/, 'Digits, + and - only');
const HelplineBase = z.object({
  name: z.string().trim().min(2).max(80), description: z.string().trim().min(2).max(240), number: z.string().trim().min(2).max(40), tel,
  kind: z.enum(['crisis', 'emergency', 'youth', 'ngo']), city: z.string().trim().max(60).nullable().default(null), languages: z.array(z.string().max(8)).max(12).default([]),
  hours: z.string().trim().max(60).default('24x7'), sort: z.number().int().min(0).max(1000).default(100), active: z.boolean().default(true),
});
const Helpline = HelplineBase;
const HelplinePatch = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().min(2).max(240), number: z.string().trim().min(2).max(40), tel, kind: z.enum(['crisis', 'emergency', 'youth', 'ngo']), city: z.string().trim().max(60).nullable(), languages: z.array(z.string().max(8)).max(12), hours: z.string().trim().max(60), sort: z.number().int().min(0).max(1000), active: z.boolean() }).partial();
const Event = z.object({
  id: z.string().trim().regex(/^[\w-]{3,60}$/), city: z.string().trim().min(2).max(60), title: z.string().trim().min(3).max(120), venue: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime(), category: z.string().trim().min(2).max(30), price: z.string().trim().max(30).default('Free'), groupSize: z.string().trim().max(60).nullable().default(null),
  organiser: z.string().trim().max(80).nullable().default(null), beginnerFriendly: z.boolean().default(true),
  details: z.object({ tags: z.array(z.string().max(30)).max(6).default([]), why: z.string().max(200).default(''), like: z.string().max(400).default(''), stay: z.string().max(200).default(''), how: z.string().max(300).default('') }).default({}),
  active: z.boolean().default(true),
});

export function contentRoutes(app: FastifyInstance, ctx: Ctx) {
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => withSystem(ctx.db, tx => tx.query(sql, params)).then(r => r.rows as T[]);

  app.get('/content/helplines', guard(ctx, 'content.read'), async () => ({
    items: await q(`SELECT id, name, description, number, tel, kind, city, languages, hours, sort, active, verified_at::text AS verified_at, (verified_at IS NULL OR verified_at < current_date - 100) AS stale FROM helplines ORDER BY sort, id`),
  }));

  app.post('/content/helplines', guard(ctx, 'content.write'), async req => {
    const b = body(Helpline.extend({ id: z.string().trim().regex(/^[a-z0-9-]{3,40}$/) }), req.body);
    const r = await q(`INSERT INTO helplines (id,name,description,number,tel,kind,city,languages,hours,sort,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING id`, [b.id, b.name, b.description, b.number, b.tel, b.kind, b.city, b.languages, b.hours, b.sort, b.active]);
    if (!r.length) throw badRequest('exists', 'A helpline with that id already exists.');
    await record(ctx, req, 'helpline.created', b.id, undefined, { name: b.name, number: b.number });
    return { ok: true };
  });

  /**
   * Send only what changes. Any edit to the number or dial string clears "verified": a changed number has to be checked
   * by a person again.
   */
  app.put('/content/helplines/:id', guard(ctx, 'content.write'), async req => {
    const id = (req.params as { id: string }).id;
    const patch = body(HelplinePatch, req.body);
    const cur = (await q<{ name: string; description: string; number: string; tel: string; kind: string; city: string | null; languages: string[]; hours: string; sort: number; active: boolean }>(
      'SELECT name, description, number, tel, kind, city, languages, hours, sort, active FROM helplines WHERE id = $1', [id]))[0];
    if (!cur) throw notFound('That helpline');
    const b = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as typeof cur;
    const dialChanged = cur.number !== b.number || cur.tel !== b.tel;
    await q(`UPDATE helplines SET name=$2, description=$3, number=$4, tel=$5, kind=$6, city=$7, languages=$8, hours=$9, sort=$10, active=$11, verified_at = CASE WHEN $12 THEN NULL ELSE verified_at END WHERE id = $1`,
      [id, b.name, b.description, b.number, b.tel, b.kind, b.city, b.languages, b.hours, b.sort, b.active, dialChanged]);
    await record(ctx, req, 'helpline.updated', id, { number: cur.number, tel: cur.tel, active: cur.active }, { number: b.number, tel: b.tel, active: b.active, verificationCleared: dialChanged });
    return { ok: true, verificationCleared: dialChanged };
  });

  app.post('/content/helplines/:id/verify', guard(ctx, 'content.write'), async req => {
    const id = (req.params as { id: string }).id;
    const b = body(z.object({ note: z.string().trim().min(3).max(200) }), req.body);
    const r = await q('UPDATE helplines SET verified_at = current_date WHERE id = $1 RETURNING id', [id]);
    if (!r.length) throw notFound('That helpline');
    await record(ctx, req, 'helpline.verified', id, undefined, { note: b.note });
    return { ok: true };
  });

  app.get('/content/events', guard(ctx, 'content.read'), async () => ({
    items: await q(`SELECT id, city, title, venue, starts_at, category, price, group_size, organiser, beginner_friendly, details, active, (SELECT count(*)::int FROM event_interests i WHERE i.event_id = events.id) AS interested FROM events ORDER BY starts_at DESC LIMIT 200`),
  }));

  app.put('/content/events/:id', guard(ctx, 'content.write'), async req => {
    const id = (req.params as { id: string }).id;
    const b = body(Event, { ...(req.body as object), id });
    await q(`INSERT INTO events (id,city,title,venue,starts_at,category,price,group_size,organiser,beginner_friendly,details,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id) DO UPDATE SET city=EXCLUDED.city, title=EXCLUDED.title, venue=EXCLUDED.venue, starts_at=EXCLUDED.starts_at, category=EXCLUDED.category, price=EXCLUDED.price, group_size=EXCLUDED.group_size, organiser=EXCLUDED.organiser, beginner_friendly=EXCLUDED.beginner_friendly, details=EXCLUDED.details, active=EXCLUDED.active`,
      [b.id, b.city, b.title, b.venue, b.startsAt, b.category, b.price, b.groupSize, b.organiser, b.beginnerFriendly, JSON.stringify(b.details), b.active]);
    await record(ctx, req, 'event.saved', id, undefined, { title: b.title, city: b.city, startsAt: b.startsAt, active: b.active });
    return { ok: true };
  });

  app.delete('/content/events/:id', guard(ctx, 'content.write'), async req => {
    const id = (req.params as { id: string }).id;
    const r = await q('UPDATE events SET active = false WHERE id = $1 RETURNING id', [id]);
    if (!r.length) throw notFound('That event');
    await record(ctx, req, 'event.hidden', id);
    return { ok: true };
  });

  app.get('/content/calm', guard(ctx, 'content.read'), async () => ({
    items: await q(`SELECT id, kind, category, title, minutes, (lines IS NOT NULL) AS has_script, (SELECT count(*)::int FROM calm_sessions s WHERE s.item_id = calm_items.id) AS sessions FROM calm_items ORDER BY sort`),
  }));
}
