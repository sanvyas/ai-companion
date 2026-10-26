import type { Helpline } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withSystem } from '../db/pool.js';

const STALE_DAYS = 100; // PRD 6.4: verified quarterly

export async function listHelplines(ctx: Ctx, f: { lang?: string; city?: string; kind?: string }): Promise<Helpline[]> {
  const { rows } = await withSystem(ctx.db, tx =>
    tx.query(`SELECT *, (verified_at IS NULL OR verified_at < current_date - $1::int) AS stale FROM helplines
               WHERE active AND ($2::text IS NULL OR $2 = ANY(languages)) AND (city IS NULL OR $3::text IS NOT NULL AND lower(city) = lower($3))
                 AND ($4::text IS NULL OR kind = $4)
               ORDER BY sort, name`, [STALE_DAYS, f.lang ?? null, f.city ?? null, f.kind ?? null]));
  return rows.map(r => ({ id: r.id, name: r.name, description: r.description, number: r.number, tel: r.tel, kind: r.kind, hours: r.hours, languages: r.languages, city: r.city, stale: r.stale }));
}
