// The picture on Home is a view, not one fixed garden: a different place each time the app is opened, chosen to suit the hour and
// how they said they feel. Heavy days get the calmest places (rain, sea, still water, night sky, a quiet sunrise); lighter days get
// brighter ones. Sunrise and dawn places belong to the morning, the temple to dusk.

export type SceneId = 'meadow' | 'sea' | 'mountains' | 'forest' | 'backwaters' | 'rain' | 'lotus' | 'stars' | 'himalaya' | 'desert' | 'temple';

export const SCENE_NAMES: Record<SceneId, string> = {
  meadow: 'A meadow', sea: 'The sea', mountains: 'Mountain lake', forest: 'Forest light',
  backwaters: 'Kerala backwaters', rain: 'Monsoon rain', lotus: 'Lotus pond', stars: 'Starry hills',
  himalaya: 'Himalayan sunrise', desert: 'Desert at dawn', temple: 'Temple at dusk',
};

/** Early morning, 5 to 10. */
const MORNING: SceneId[] = ['himalaya', 'meadow', 'desert', 'sea', 'forest', 'lotus', 'backwaters', 'mountains'];
/** Daytime, 11 to 4. */
const DAY: SceneId[] = ['meadow', 'sea', 'mountains', 'forest', 'backwaters', 'rain', 'lotus'];
/** Evening, 5 to 8. */
const DUSK: SceneId[] = ['temple', 'sea', 'backwaters', 'lotus', 'rain', 'mountains'];
/** Late evening and night, 9 to 4. */
const NIGHT: SceneId[] = ['stars', 'sea', 'mountains', 'backwaters', 'lotus'];
/** For a rough or anxious day: still, soft and slow, or hopeful like a sunrise. */
const SOOTHING = new Set<SceneId>(['rain', 'sea', 'backwaters', 'lotus', 'stars', 'mountains', 'himalaya', 'desert', 'temple']);

export const isDark = (hour: number) => hour >= 19 || hour < 5;
export const partOfView = (hour: number): 'morning' | 'day' | 'dusk' | 'night' => (hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 21 ? 'dusk' : 'night');

/** The places that suit now, in a steady order. */
export function scenesFor(o: { hour: number; mood: number | null }): SceneId[] {
  const pool = { morning: MORNING, day: DAY, dusk: DUSK, night: NIGHT }[partOfView(o.hour)];
  return o.mood !== null && o.mood <= 1 ? pool.filter(id => SOOTHING.has(id)) : pool;
}

/** `n` is how many times the app has been opened (or the view changed), so it walks on. */
export function sceneFor(o: { hour: number; mood: number | null; n: number }): SceneId {
  const pool = scenesFor(o);
  return pool[((o.n % pool.length) + pool.length) % pool.length];
}

export const isSceneId = (v: unknown): v is SceneId => typeof v === 'string' && v in SCENE_NAMES;

/** What a touch does in each place: ripples on water, petals in the meadow, falling leaves in the forest, and so on. */
export type TouchKind = 'ripple' | 'petals' | 'leaves' | 'birds' | 'dust' | 'lantern' | 'shoot' | 'drizzle';
export const TOUCH: Record<SceneId, TouchKind> = {
  meadow: 'petals', sea: 'ripple', mountains: 'birds', forest: 'leaves', backwaters: 'ripple', rain: 'drizzle',
  lotus: 'ripple', stars: 'shoot', himalaya: 'birds', desert: 'dust', temple: 'lantern',
};
