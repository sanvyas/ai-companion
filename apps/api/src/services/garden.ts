import { PLANT_KINDS, ISLES, POT_SEAMS, SKIES, SLOTS_BY_STAGE, daysTo, summariseGarden, type ActKind, type DayActs } from '@saathi/domain';
import type { Creation, Garden, JarItem } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser, type Tx } from '../db/pool.js';
import { AppError, badRequest, notFound } from '../errors.js';
import { localDay } from './time.js';
import { getDek } from './users.js';

// The garden is worked out from what the person did, every time it is asked for. Only the things they chose to do in it
// (plant, pick, mend, hang, keep) are stored. See docs/V2_PLAN.md.

const ACT_SQL = `
  WITH tz AS (SELECT timezone AS z FROM users WHERE id = $1)
  SELECT day::text AS day, kind, sum(n)::int AS n FROM (
    SELECT day, 'checkin' AS kind, 1 AS n FROM mood_logs
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'journal', 1 FROM journal_entries
    UNION ALL SELECT (c.started_at AT TIME ZONE (SELECT z FROM tz))::date, 'talk', 1 FROM conversations c
      WHERE c.mode <> 'walk' AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user')
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'walk', 1 FROM wins WHERE kind = 'walk'
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'plan', 1 FROM wins WHERE kind = 'plan'
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'event', 1 FROM event_interests
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'breathe', 1 FROM breaths
    UNION ALL SELECT (s.started_at AT TIME ZONE (SELECT z FROM tz))::date, CASE WHEN ci.kind = 'sleep' THEN 'sleep' ELSE 'meditate' END, 1
      FROM calm_sessions s JOIN calm_items ci ON ci.id = s.item_id WHERE s.completed_pct >= 80
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'create', 1 FROM garden_keepsakes WHERE kind = 'boat'
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'create', 1 FROM garden_creations
    UNION ALL SELECT (created_at AT TIME ZONE (SELECT z FROM tz))::date, 'create', 1 FROM jar_items
  ) t GROUP BY 1, 2`;

export async function actDays(tx: Tx, userId: string): Promise<DayActs[]> {
  const [acts, moods] = await Promise.all([tx.query<{ day: string; kind: ActKind; n: number }>(ACT_SQL, [userId]), tx.query<{ day: string; value: number }>('SELECT day::text AS day, value FROM mood_logs')]);
  const by = new Map<string, DayActs>();
  const get = (day: string) => { let d = by.get(day); if (!d) { d = { day, mood: null, acts: {} }; by.set(day, d); } return d; };
  for (const r of acts.rows) get(r.day).acts[r.kind] = r.n;
  for (const m of moods.rows) get(m.day).mood = m.value;
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export async function gardenIn(tx: Tx, userId: string): Promise<Garden> {
  const [ds, plantRows, keeps, flowerRows, jar, picks] = await Promise.all([
    actDays(tx, userId),
    tx.query<{ id: string; kind: string; slot: number; at_days: number; picks: number }>('SELECT id, kind, slot, at_days, picks FROM garden_plants ORDER BY slot'),
    tx.query<{ kind: string; n: number }>('SELECT kind, n FROM garden_keepsakes ORDER BY created_at, id'),
    tx.query<{ mood: number }>('SELECT mood FROM (SELECT mood, created_at FROM journal_entries ORDER BY created_at DESC LIMIT 12) x ORDER BY created_at'),
    tx.query<{ n: number }>('SELECT count(*)::int AS n FROM jar_items'),
    tx.query<{ n: number }>('SELECT coalesce(sum(picks),0)::int AS n FROM garden_plants'),
  ]);
  const g = summariseGarden(ds, picks.rows[0].n);
  const today = await localDay(tx, userId);
  const t = ds.find(d => d.day === today);
  const n = (k: ActKind) => t?.acts[k] ?? 0;
  const body = (['breathe', 'meditate', 'sleep', 'walk', 'event', 'plan', 'create'] as ActKind[]).some(k => n(k) > 0);
  const flags = { checkin: n('checkin') > 0 || t?.mood != null, body, words: n('journal') + n('talk') > 0 };

  const seam = keeps.rows.filter(k => k.kind === 'seam').length;
  const flagN = keeps.rows.filter(k => k.kind === 'flag').length;
  const skies = keeps.rows.filter(k => k.kind === 'sky').map(k => k.n);
  const boats = keeps.rows.filter(k => k.kind === 'boat').length;
  const rangolis = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM garden_creations')).rows[0].n;
  const slots = SLOTS_BY_STAGE[g.stage];
  const plants = plantRows.rows.map(p => {
    const def = PLANT_KINDS.find(k => k.id === p.kind)!;
    const grown = Math.max(0, g.activeDays - p.at_days);
    return { id: p.id, kind: p.kind as Garden['plants'][number]['kind'], slot: p.slot, growth: Math.min(1, grown / def.days), ready: grown >= def.days, daysLeft: Math.max(0, def.days - grown), picks: p.picks };
  });
  const current = ISLES.reduce((acc, s, i) => (g.sunlight >= s.at ? i : acc), 0);
  return {
    sunlight: g.sunlight, stage: g.stage, stageName: g.stageName, nextAt: g.nextAt, activeDays: g.activeDays, treeLevel: g.treeLevel, counts: g.counts,
    today: { ...flags, golden: flags.checkin && flags.body && flags.words, mood: t?.mood ?? null },
    flowers: flowerRows.rows.map(r => r.mood),
    visitors: { butterflies: Math.floor(g.counts.journal / 2), bulbul: g.counts.talk > 0, squirrel: g.counts.walk > 0, kingfisher: g.goldenDays > 0 },
    seeds: { planted: g.seeds, sprouted: g.seedDays.filter(d => d < today).length },
    slots, plants,
    tokens: { gold: Math.max(0, g.goldEarned - seam), thread: Math.max(0, g.threadsEarned - flagN), sky: Math.max(0, g.skiesEarned - skies.length) },
    unlocked: { pot: g.goldEarned > 0 || seam > 0, thread: g.threadsEarned > 0 || flagN > 0, sky: g.skiesEarned > 0 || skies.length > 0 },
    keepsakes: { potSeams: seam === 0 ? 0 : ((seam - 1) % POT_SEAMS) + 1, pots: seam === 0 ? 0 : Math.floor((seam - 1) / POT_SEAMS), flags: flagN, skies },
    jarCount: jar.rows[0].n, boats, rangolis,
    road: { perActiveDay: Math.round(g.perActiveDay), current, isles: ISLES.map(i => ({ name: i.name, theme: i.theme, at: i.at, days: daysTo(i.at, g.sunlight, g.perActiveDay) })) },
  };
}

export const getGarden = (ctx: Ctx, userId: string) => withUser(ctx.db, userId, tx => gardenIn(tx, userId));

const gentle = (code: string, message: string) => new AppError(409, code, message);

export async function plantSomething(ctx: Ctx, userId: string, kind: string, slot: number): Promise<Garden> {
  return withUser(ctx.db, userId, async tx => {
    const g = await gardenIn(tx, userId);
    const def = PLANT_KINDS.find(k => k.id === kind);
    if (!def) throw badRequest('unknown_plant', 'That isn’t something that grows here.');
    if (g.sunlight < def.at) throw gentle('not_yet', `${def.name} isn’t ready to plant yet. It comes at ${def.at} sunlight.`);
    if (slot >= g.slots) throw gentle('slot_closed', 'That place isn’t open yet. More places open as your garden grows.');
    if (g.plants.some(p => p.slot === slot)) throw gentle('slot_taken', 'There is already something growing there.');
    await tx.query('INSERT INTO garden_plants (user_id, kind, slot, at_days) VALUES ($1,$2,$3,$4)', [userId, kind, slot, g.activeDays]);
    return gardenIn(tx, userId);
  });
}

export async function pickPlant(ctx: Ctx, userId: string, id: string): Promise<Garden> {
  return withUser(ctx.db, userId, async tx => {
    const g = await gardenIn(tx, userId);
    const p = g.plants.find(x => x.id === id);
    if (!p) throw notFound('That plant');
    if (!p.ready) throw gentle('not_ready', 'It isn’t ready yet. It grows a little on each day you show up.');
    await tx.query('UPDATE garden_plants SET at_days = $2, picks = picks + 1 WHERE id = $1', [id, g.activeDays]);
    return gardenIn(tx, userId);
  });
}

/** Spend something they earned: a gold seam, a flag, a sky, or leave a paper boat (free, and nothing about it is kept). */
export async function addKeepsake(ctx: Ctx, userId: string, kind: 'seam' | 'flag' | 'sky' | 'boat'): Promise<Garden> {
  return withUser(ctx.db, userId, async tx => {
    const g = await gardenIn(tx, userId);
    let n = 0;
    if (kind === 'seam') { if (g.tokens.gold < 1) throw gentle('nothing_earned', 'No gold right now. It comes on a hard day when you still show up, in any small way.'); }
    else if (kind === 'flag') { if (g.tokens.thread < 1) throw gentle('nothing_earned', 'No thread right now. One comes after a breathing session or a meditation.'); }
    else if (kind === 'sky') { if (g.tokens.sky < 1) throw gentle('nothing_earned', 'No new sky right now. One opens after each sleep story.'); n = g.keepsakes.skies.length % SKIES; }
    await tx.query('INSERT INTO garden_keepsakes (user_id, kind, n) VALUES ($1,$2,$3)', [userId, kind, n]);
    return gardenIn(tx, userId);
  });
}

export async function recordBreath(ctx: Ctx, userId: string) {
  await withUser(ctx.db, userId, tx => tx.query('INSERT INTO breaths (user_id) VALUES ($1)', [userId]));
}

export async function addCreation(ctx: Ctx, userId: string, image: string): Promise<Garden> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const n = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM garden_creations')).rows[0].n;
    if (n >= 60) await tx.query('DELETE FROM garden_creations WHERE id = (SELECT id FROM garden_creations ORDER BY created_at LIMIT 1)');
    await tx.query('INSERT INTO garden_creations (user_id, kind, image_enc) VALUES ($1,$2,$3)', [userId, 'rangoli', ctx.crypto.encrypt(dek, userId, 'creation', image)]);
    return gardenIn(tx, userId);
  });
}

export async function listCreations(ctx: Ctx, userId: string, limit = 12): Promise<Creation[]> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const { rows } = await tx.query('SELECT id, kind, image_enc, created_at FROM garden_creations ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(r => ({ id: r.id, kind: r.kind, image: ctx.crypto.decrypt(dek, userId, 'creation', r.image_enc), createdAt: r.created_at.toISOString() }));
  });
}

export async function deleteCreation(ctx: Ctx, userId: string, id: string) {
  await withUser(ctx.db, userId, async tx => { if (!(await tx.query('DELETE FROM garden_creations WHERE id = $1', [id])).rowCount) throw notFound('That'); });
}

// ------------------------------------------------------------------------------------------ the good-things jar
const jarRow = (ctx: Ctx, dek: Buffer, userId: string, r: { id: string; text_enc: Buffer; created_at: Date }): JarItem => ({ id: r.id, text: ctx.crypto.decrypt(dek, userId, 'jar', r.text_enc), createdAt: r.created_at.toISOString() });

export async function listJar(ctx: Ctx, userId: string): Promise<JarItem[]> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    return (await tx.query('SELECT id, text_enc, created_at FROM jar_items ORDER BY created_at DESC LIMIT 200')).rows.map(r => jarRow(ctx, dek, userId, r));
  });
}

export async function addJarItem(ctx: Ctx, userId: string, text: string): Promise<JarItem> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const r = await tx.query('INSERT INTO jar_items (user_id, text_enc) VALUES ($1,$2) RETURNING id, text_enc, created_at', [userId, ctx.crypto.encrypt(dek, userId, 'jar', text)]);
    return jarRow(ctx, dek, userId, r.rows[0]);
  });
}

export async function deleteJarItem(ctx: Ctx, userId: string, id: string) {
  await withUser(ctx.db, userId, async tx => { if (!(await tx.query('DELETE FROM jar_items WHERE id = $1', [id])).rowCount) throw notFound('That'); });
}
