import { phrasesOf, rhythmFor, type Phrase } from '@saathi/domain';
import type { Ctx } from '../context.js';
import { wavOf, TtsFailure } from '../providers/voice.js';
import { withUser } from '../db/pool.js';
import { SARVAM_VOICES, voiceById, type Lang } from './voices.js';
import { recentMood, type MoodLabel } from './moodSummary.js';

// Who reads a calm session aloud, and how. The voice and pace follow how the person has been feeling, so a heavier week
// gets the softest, slowest reading and a lighter morning gets a brighter one. The person's own companion voice is kept
// whenever they picked a server voice, so it is the same "person" who talks with them and who reads to them; only the
// pace moves. With no server voice picked, the voice is chosen from the mood below.
//
// The table is data, not taste: it names a speaker per mood for each gender, from the Sarvam voices the app offers.
// Which speaker sounds best for which mood is a listening decision; change it here after auditioning them.

export type NarrationKind = 'sleep' | 'meditation';
export interface Narration { voice: string; label: string; pace: number; mood: MoodLabel; reason: string }

const BY_MOOD: Record<'female' | 'male', Record<MoodLabel, string>> = {
  female: { heavier: 'ritu', 'in between': 'priya', lighter: 'neha', unknown: 'priya' },
  male: { heavier: 'shubh', 'in between': 'aditya', lighter: 'rahul', unknown: 'aditya' },
};

/** Speaking speed: sleep is slowest, a heavy or restless stretch slows it further, a light day keeps it close to natural. */
export function paceFor(kind: NarrationKind, mood: MoodLabel): number {
  const base = kind === 'sleep' ? 0.78 : 0.88;
  const adj = mood === 'heavier' ? -0.05 : mood === 'lighter' ? 0.07 : 0;
  return Math.round(Math.min(1.1, Math.max(0.65, base + adj)) * 100) / 100;
}

export function chooseNarration(o: { kind: NarrationKind; mood: MoodLabel; chosenVoice: string | null }): Narration {
  const chosen = o.chosenVoice ? voiceById(o.chosenVoice) : undefined;
  const gender: 'female' | 'male' = chosen?.gender === 'male' ? 'male' : 'female';
  const keep = chosen?.provider === 'sarvam';
  // Sleep stories always use the calmest of the mood voices, whatever the mood: nobody needs brightness at bedtime.
  const speaker = keep ? chosen!.speaker! : BY_MOOD[gender][o.kind === 'sleep' && o.mood === 'lighter' ? 'in between' : o.mood];
  const v = SARVAM_VOICES.find(x => x.speaker === speaker)!;
  return {
    voice: v.id, label: v.label, pace: paceFor(o.kind, o.mood), mood: o.mood,
    reason: keep ? 'your companion’s voice, paced to how you have been feeling' : `a ${o.mood === 'unknown' ? 'steady' : o.mood === 'heavier' ? 'soft' : o.mood === 'lighter' ? 'brighter' : 'steady'} voice for how you have been feeling`,
  };
}

export async function narrationFor(ctx: Ctx, userId: string, kind: NarrationKind): Promise<{ narration: Narration; language: Lang }> {
  const { label } = await recentMood(ctx, userId);
  const u = (await withUser(ctx.db, userId, tx => tx.query<{ voice: string | null; language: Lang }>('SELECT c.voice AS voice, u.language AS language FROM users u LEFT JOIN companions c ON c.user_id = u.id WHERE u.id = $1', [userId]))).rows[0];
  return { narration: chooseNarration({ kind, mood: label, chosenVoice: u?.voice ?? null }), language: u?.language ?? 'en' };
}

/** How fast the companion speaks in a live conversation, from the stance of the turn: slower to listen or ground, a little livelier to lift or celebrate. */
export const paceForStance = (stance: string | null | undefined): number =>
  ({ listen: 0.92, ground: 0.88, energise: 1.05, celebrate: 1.05, play: 1.03, steady: 1 } as Record<string, number>)[stance ?? ''] ?? 1;


// ---------------------------------------------------------------------------------------------- reading a line aloud
// A line is read as a person would say it: in short phrases, with breaths and pauses between them (see domain/narrate.ts),
// in a steady, low-variation delivery. Each phrase is spoken separately and the pieces are joined with silence into one
// recording, so the rhythm is the same on every phone. Phrases are kept in memory (capped by size) because the same
// phrase in the same voice and pace is the same audio for everyone.

const TEMPERATURE: Record<NarrationKind, number> = { sleep: 0.35, meditation: 0.45 };
const MAX_HELD_BYTES = 64 * 1024 * 1024;
const held = new Map<string, { pcm: Buffer; rate: number }>();
let heldBytes = 0;
const keep = (k: string, v: { pcm: Buffer; rate: number }) => {
  held.set(k, v); heldBytes += v.pcm.length;
  while (heldBytes > MAX_HELD_BYTES && held.size > 1) { const first = held.keys().next().value as string; heldBytes -= held.get(first)!.pcm.length; held.delete(first); }
};

/** Short fades at each end of a phrase so the joins never click. */
function faded(pcm: Buffer, rate: number): Buffer {
  const out = Buffer.from(pcm);
  const n = out.length / 2;
  const inN = Math.min(n, Math.round(rate * 0.02)), outN = Math.min(n, Math.round(rate * 0.06));
  for (let i = 0; i < inN; i++) out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * (i / inN)), i * 2);
  for (let i = 0; i < outN; i++) { const at = (n - 1 - i) * 2; out.writeInt16LE(Math.round(out.readInt16LE(at) * (i / outN)), at); }
  return out;
}

export interface Reading { wav: Buffer; sampleRate: number; phrases: number; durationMs: number }

/** Joins phrase audio and silences into one recording. Exported for tests. */
export function stitch(parts: { pcm: Buffer; pauseMs: number }[], rate: number): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(faded(p.pcm, rate));
    if (p.pauseMs > 0) chunks.push(Buffer.alloc(Math.round(rate * p.pauseMs / 1000) * 2));
  }
  return wavOf(Buffer.concat(chunks), rate);
}

export async function readAloud(ctx: Ctx, o: { userId: string; text: string; kind: NarrationKind; language: Lang; narration: Narration }): Promise<Reading> {
  if (!ctx.tts?.configured) throw new TtsFailure('No voice is connected.');
  const plan: Phrase[] = phrasesOf(o.text, rhythmFor(o.kind, o.narration.mood === 'heavier'));
  if (!plan.length) throw new TtsFailure('There is nothing to say.');
  const temperature = TEMPERATURE[o.kind];
  const spoken = await Promise.all(plan.map(async p => {
    const pace = Math.round(Math.max(0.6, o.narration.pace - (p.slow ? 0.04 : 0)) * 100) / 100;
    const key = `${o.narration.voice}|${o.language}|${pace}|${temperature}|${p.text}`;
    let hit = held.get(key);
    if (!hit) {
      const r = await ctx.tts!.synthesize({ text: p.text, voice: o.narration.voice, language: o.language, pace, temperature, userId: o.userId });
      hit = { pcm: r.pcm, rate: r.sampleRate };
      keep(key, hit);
    }
    return { ...hit, pauseMs: p.pauseMs };
  }));
  const rate = spoken[0].rate;
  if (spoken.some(s => s.rate !== rate)) throw new TtsFailure('The voice answered at different sample rates.');
  const wav = stitch(spoken, rate);
  return { wav, sampleRate: rate, phrases: plan.length, durationMs: Math.round(((wav.length - 44) / 2 / rate) * 1000) };
}
