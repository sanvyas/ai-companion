import type { MemoryItem, Theme } from '@saathi/contracts';
import type { Ctx } from '../context.js';
import { withUser, type Tx } from '../db/pool.js';
import { notFound } from '../errors.js';
import { audit } from './audit.js';
import { getDek } from './users.js';

interface Row { id: string; theme: Theme; text_enc: Buffer; sensitive: boolean; hidden: boolean; source: MemoryItem['source']; created_at: Date; last_used_at: Date | null }

const toItem = (ctx: Ctx, dek: Buffer, userId: string, r: Row): MemoryItem => ({
  id: r.id, theme: r.theme, text: ctx.crypto.decrypt(dek, userId, 'memory', r.text_enc), sensitive: r.sensitive, hidden: r.hidden, source: r.source, createdAt: r.created_at.toISOString(),
});

export async function listMemories(ctx: Ctx, userId: string): Promise<MemoryItem[]> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const { rows } = await tx.query<Row>('SELECT * FROM memories ORDER BY created_at DESC LIMIT 500');
    return rows.map(r => toItem(ctx, dek, userId, r));
  });
}

export async function addMemories(ctx: Ctx, userId: string, items: { theme: Theme; text: string; sensitive: boolean }[], source: 'chat' | 'call' | 'journal', sourceId?: string, tx?: Tx): Promise<MemoryItem[]> {
  const run = async (t: Tx) => {
    // Memories are written only with consent (PRD 5.2). Checked here so no caller can forget.
    const ok = (await t.query('SELECT remember FROM consents WHERE user_id = $1', [userId])).rows[0]?.remember;
    if (!ok) return [];
    const dek = await getDek(ctx, userId, t);
    const out: MemoryItem[] = [];
    for (const m of items) {
      const { rows } = await t.query<Row>(
        'INSERT INTO memories (user_id, theme, text_enc, sensitive, source, source_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [userId, m.theme, ctx.crypto.encrypt(dek, userId, 'memory', m.text.slice(0, 120)), m.sensitive, source, sourceId ?? null]);
      out.push(toItem(ctx, dek, userId, rows[0]));
    }
    return out;
  };
  return tx ? run(tx) : withUser(ctx.db, userId, run);
}

export async function patchMemory(ctx: Ctx, userId: string, id: string, b: { text?: string; hidden?: boolean }): Promise<MemoryItem> {
  return withUser(ctx.db, userId, async tx => {
    const dek = await getDek(ctx, userId, tx);
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.text !== undefined) { vals.push(ctx.crypto.encrypt(dek, userId, 'memory', b.text)); sets.push(`text_enc = $${vals.length}`); }
    if (b.hidden !== undefined) { vals.push(b.hidden); sets.push(`hidden = $${vals.length}`); }
    if (!sets.length) {
      const r = (await tx.query<Row>('SELECT * FROM memories WHERE id = $1', [id])).rows[0];
      if (!r) throw notFound('That memory');
      return toItem(ctx, dek, userId, r);
    }
    vals.push(id);
    const r = (await tx.query<Row>(`UPDATE memories SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals)).rows[0];
    if (!r) throw notFound('That memory');
    await audit(tx, userId, 'memory.update', { id, hidden: b.hidden === undefined ? undefined : !b.hidden }, { id, hidden: b.hidden, edited: b.text !== undefined });
    return toItem(ctx, dek, userId, r);
  });
}

/** Hard delete (PRD 5.2). Backups rotate out within 30 days. */
export async function deleteMemory(ctx: Ctx, userId: string, id: string): Promise<void> {
  await withUser(ctx.db, userId, async tx => {
    const r = await tx.query('DELETE FROM memories WHERE id = $1', [id]);
    if (!r.rowCount) throw notFound('That memory');
    await audit(tx, userId, 'memory.delete', { id }, null);
  });
}

export async function forgetEverything(ctx: Ctx, userId: string): Promise<number> {
  return withUser(ctx.db, userId, async tx => {
    const r = await tx.query('DELETE FROM memories');
    await audit(tx, userId, 'memory.forget_all', { count: r.rowCount }, null);
    return r.rowCount ?? 0;
  });
}

const tokens = (s: string) => new Set(s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2));

/**
 * Top-k (k <= 5) memories relevant to this turn (PRD 5.2). Visible memories only; hidden ones are never injected.
 * Memory text is encrypted so ranking happens here: word overlap with the conversation, plus recency, plus a small
 * boost for "What helps". An embedding adapter can replace the scorer later without changing callers.
 */
export async function retrieveMemories(ctx: Ctx, userId: string, query: string, k = 5): Promise<string[]> {
  return withUser(ctx.db, userId, async tx => {
    const consent = (await tx.query('SELECT remember FROM consents WHERE user_id = $1', [userId])).rows[0]?.remember;
    if (!consent) return [];
    const dek = await getDek(ctx, userId, tx);
    const { rows } = await tx.query<Row>('SELECT * FROM memories WHERE NOT hidden ORDER BY created_at DESC LIMIT 200');
    if (!rows.length) return [];
    const q = tokens(query);
    const now = Date.now();
    const scored = rows.map((r, i) => {
      const text = ctx.crypto.decrypt(dek, userId, 'memory', r.text_enc);
      const t = tokens(text);
      let overlap = 0;
      for (const w of t) if (q.has(w)) overlap++;
      const ageDays = (now - r.created_at.getTime()) / 86_400_000;
      const score = overlap * 3 + (r.theme === 'What helps' ? 0.4 : 0) + Math.max(0, 1 - ageDays / 90) + (i < 3 ? 0.3 : 0);
      return { r, text, score, overlap };
    });
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.filter(s => s.overlap > 0).slice(0, k);
    // Nothing matched: still give the two freshest so the companion can ask how things are going.
    const final = picked.length ? picked : scored.slice(0, 2);
    await tx.query('UPDATE memories SET last_used_at = now() WHERE id = ANY($1::uuid[])', [final.map(s => s.r.id)]);
    return final.map(s => s.text);
  });
}
