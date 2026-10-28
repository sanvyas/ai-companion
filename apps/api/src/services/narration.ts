import type { Ctx } from '../context.js';
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
