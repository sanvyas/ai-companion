// The picture on Home is a view, not one fixed garden: a different place each time the app is opened, chosen to suit the hour and
// how they said they feel. Heavy days get the calmest places (rain, sea, still water, night sky); lighter days get brighter ones.

export type SceneId = 'meadow' | 'sea' | 'mountains' | 'forest' | 'backwaters' | 'rain' | 'lotus' | 'stars';

export const SCENE_NAMES: Record<SceneId, string> = {
  meadow: 'A meadow', sea: 'The sea', mountains: 'Mountain lake', forest: 'Forest light',
  backwaters: 'Kerala backwaters', rain: 'Monsoon rain', lotus: 'Lotus pond', stars: 'Starry hills',
};

const DAY: SceneId[] = ['meadow', 'sea', 'mountains', 'forest', 'backwaters', 'rain', 'lotus'];
const NIGHT: SceneId[] = ['stars', 'sea', 'mountains', 'backwaters', 'lotus'];
/** For a rough or anxious day: still, soft and slow. */
const SOOTHING = new Set<SceneId>(['rain', 'sea', 'backwaters', 'lotus', 'stars', 'mountains']);

export const isDark = (hour: number) => hour >= 19 || hour < 5;

/** The places that suit now, in a steady order. `n` is how many times the app has been opened (or the view changed), so it walks on. */
export function scenesFor(o: { hour: number; mood: number | null }): SceneId[] {
  const pool = isDark(o.hour) ? NIGHT : DAY;
  return o.mood !== null && o.mood <= 1 ? pool.filter(id => SOOTHING.has(id)) : pool;
}

export function sceneFor(o: { hour: number; mood: number | null; n: number }): SceneId {
  const pool = scenesFor(o);
  return pool[((o.n % pool.length) + pool.length) % pool.length];
}
