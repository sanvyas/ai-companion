// The garden grows from what a person actually did. Nothing here is stored as a score: it is worked out from their activity
// each time, so it cannot drift, and nothing can be lost by being away. A day with nothing is simply a quiet day.

export type ActKind = 'checkin' | 'journal' | 'talk' | 'breathe' | 'meditate' | 'sleep' | 'walk' | 'event' | 'plan' | 'create';

/** Sunlight for each kind of small thing. */
export const POINTS: Record<ActKind, number> = { checkin: 5, journal: 15, talk: 15, breathe: 10, meditate: 12, sleep: 10, walk: 15, event: 10, plan: 5, create: 10 };
/** After this much on one day, more still counts, at half. A big day cannot rush the garden. */
export const DAILY_FULL = 60;
/** The bonus for tending all three parts of a day: a check-in, one small thing, and putting it into words. */
export const GOLDEN_BONUS = 10;
/** Picking something you grew. */
export const PICK_BONUS = 10;

export const STAGES = [
  { name: 'Seedling', at: 0 }, { name: 'Sprout', at: 60 }, { name: 'Small garden', at: 250 }, { name: 'Large garden', at: 700 }, { name: 'Grove', at: 1500 },
] as const;

/** Six isles to reach over about six months at a steady pace. */
export const ISLES = [
  { name: 'Home isle', at: 0, theme: 'Meadow and bench' },
  { name: 'Orchard isle', at: 700, theme: 'Mango and guava trees, a swing' },
  { name: 'Lotus lake', at: 1300, theme: 'A wide lake, stepping stones, lanterns' },
  { name: 'Night hill', at: 2000, theme: 'Stars, a telescope, a quiet fire' },
  { name: 'Monsoon terrace', at: 3000, theme: 'Rain, tulsi gardens, a tea stall' },
  { name: 'Sky garden', at: 4200, theme: 'Above the clouds, everything you grew' },
] as const;

/** Things to plant. Growth counts days the person showed up, never calendar days. */
export const PLANT_KINDS = [
  { id: 'marigold', name: 'Marigold', days: 3, at: 0, kind: 'flower' },
  { id: 'sunflower', name: 'Sunflower', days: 5, at: 60, kind: 'flower' },
  { id: 'jasmine', name: 'Jasmine', days: 7, at: 150, kind: 'flower' },
  { id: 'mango', name: 'Mango tree', days: 30, at: 350, kind: 'tree' },
  { id: 'banyan', name: 'Banyan', days: 90, at: 800, kind: 'tree' },
] as const;
export type PlantKind = (typeof PLANT_KINDS)[number]['id'];

/** Places to plant that are open at each stage. */
export const SLOTS_BY_STAGE = [2, 3, 4, 5, 6] as const;
export const POT_SEAMS = 6;
export const SKIES = 6;

export const stageOf = (sunlight: number) => STAGES.reduce((acc, s, i) => (sunlight >= s.at ? i : acc), 0);
export const treeLevelFor = (activeDays: number) => (activeDays < 1 ? 0 : activeDays < 3 ? 1 : activeDays < 6 ? 2 : activeDays < 12 ? 3 : 4);

export interface DayActs { day: string; /** The day's mood on the 0 (heaviest) to 4 (lightest) scale, if they said. */ mood: number | null; acts: Partial<Record<ActKind, number>> }

export interface GardenSummary {
  sunlight: number;
  stage: number;
  stageName: string;
  /** Sunlight at which the next stage begins, or null at the top. */
  nextAt: number | null;
  activeDays: number;
  treeLevel: number;
  counts: Record<ActKind, number>;
  goldenDays: number;
  /** Days a heavy or wired mood was followed by some small act of looking after themselves. One gold thread each. */
  goldEarned: number;
  /** One tangled thread per breathing session or meditation. */
  threadsEarned: number;
  /** One new sky per sleep story. */
  skiesEarned: number;
  /** Days of a heavy mood with a small act: each plants a seed in the greenhouse. */
  seeds: number;
  /** The days those seeds were planted on. */
  seedDays: string[];
  /** Average sunlight on a day they showed up, to estimate how long the road is. */
  perActiveDay: number;
}

const BODY: ActKind[] = ['breathe', 'meditate', 'sleep', 'walk', 'event', 'plan', 'create'];
const sum = (a: Partial<Record<ActKind, number>>, ks: ActKind[]) => ks.reduce((n, k) => n + (a[k] ?? 0), 0);

export function summariseGarden(days: DayActs[], picks = 0): GardenSummary {
  const counts = Object.fromEntries((Object.keys(POINTS) as ActKind[]).map(k => [k, 0])) as Record<ActKind, number>;
  let sunlight = 0, active = 0, golden = 0, gold = 0;
  const seedDays: string[] = [];
  for (const d of days) {
    const n = (Object.keys(POINTS) as ActKind[]).reduce((t, k) => t + (d.acts[k] ?? 0), 0);
    if (n > 0 || d.mood !== null) active++;
    let pts = 0;
    for (const k of Object.keys(POINTS) as ActKind[]) {
      const c = d.acts[k] ?? 0;
      counts[k] += c;
      for (let i = 0; i < c; i++) { pts += POINTS[k] * (pts >= DAILY_FULL ? 0.5 : 1); }
    }
    const isGolden = (d.acts.checkin ?? 0) > 0 && sum(d.acts, BODY) > 0 && sum(d.acts, ['journal', 'talk']) > 0;
    if (isGolden) { golden++; pts += GOLDEN_BONUS; }
    const other = n - (d.acts.checkin ?? 0);
    if (d.mood !== null && d.mood <= 1 && other > 0) gold++;
    if (d.mood === 0 && other > 0) seedDays.push(d.day);
    sunlight += Math.round(pts);
  }
  sunlight += picks * PICK_BONUS;
  const stage = stageOf(sunlight);
  return {
    sunlight, stage, stageName: STAGES[stage].name, nextAt: STAGES[stage + 1]?.at ?? null,
    activeDays: active, treeLevel: treeLevelFor(active), counts, goldenDays: golden, goldEarned: gold,
    threadsEarned: counts.breathe + counts.meditate, skiesEarned: counts.sleep, seeds: seedDays.length, seedDays,
    perActiveDay: active ? sunlight / active : 25,
  };
}

/** Whole days they would need to show up to reach a sunlight total, at their own pace (never less than a gentle 12 a day). */
export const daysTo = (target: number, sunlight: number, perDay: number) => Math.max(0, Math.ceil((target - sunlight) / Math.max(12, perDay)));
