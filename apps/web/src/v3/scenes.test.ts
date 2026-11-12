import { describe, expect, it } from 'vitest';
import { SCENE_NAMES, isDark, sceneFor, scenesFor, type SceneId } from './scenes';

describe('the view on Home', () => {
  it('is a different place each time, and walks through all that suit before repeating', () => {
    for (const mood of [null, 0, 2, 4]) for (const hour of [9, 14, 21]) {
      const pool = scenesFor({ hour, mood });
      const seen = Array.from({ length: pool.length }, (_, n) => sceneFor({ hour, mood, n }));
      expect(new Set(seen).size, `mood ${mood} at ${hour}`).toBe(pool.length);
      expect(sceneFor({ hour, mood, n: pool.length })).toBe(seen[0]);
    }
  });
  it('has at least five places by day and four at night, so it feels new', () => {
    expect(scenesFor({ hour: 11, mood: null }).length).toBeGreaterThanOrEqual(5);
    expect(scenesFor({ hour: 22, mood: null }).length).toBeGreaterThanOrEqual(4);
  });
  it('gives a heavy day only the calm places, and never a bright meadow or a forest at night', () => {
    for (const hour of [9, 22]) for (const mood of [0, 1]) for (const id of scenesFor({ hour, mood })) expect(['meadow', 'forest']).not.toContain(id);
    for (const mood of [null, 0, 1, 2, 3, 4]) { const night = scenesFor({ hour: 23, mood }); expect(night).not.toContain('meadow'); expect(night).not.toContain('forest'); expect(night).not.toContain('rain'); }
  });
  it('knows when it is dark, and names every place', () => {
    expect([4, 5, 18, 19, 23].map(isDark)).toEqual([true, false, false, true, true]);
    for (const id of Object.keys(SCENE_NAMES) as SceneId[]) expect(SCENE_NAMES[id].length).toBeGreaterThan(3);
  });
});
