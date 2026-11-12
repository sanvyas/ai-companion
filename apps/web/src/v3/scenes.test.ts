import { describe, expect, it } from 'vitest';
import { SCENE_NAMES, isDark, isSceneId, partOfView, sceneFor, scenesFor, type SceneId } from './scenes';

describe('the view on Home', () => {
  it('is a different place each time, and walks through all that suit before repeating', () => {
    for (const mood of [null, 0, 2, 4]) for (const hour of [9, 14, 21]) {
      const pool = scenesFor({ hour, mood });
      const seen = Array.from({ length: pool.length }, (_, n) => sceneFor({ hour, mood, n }));
      expect(new Set(seen).size, `mood ${mood} at ${hour}`).toBe(pool.length);
      expect(sceneFor({ hour, mood, n: pool.length })).toBe(seen[0]);
    }
  });
  it('has at least five places at every time of day, so it feels new', () => {
    for (const hour of [7, 13, 18, 23]) expect(scenesFor({ hour, mood: null }).length, `at ${hour}`).toBeGreaterThanOrEqual(5);
  });
  it('keeps the sunrise and the desert dawn for the morning, and the temple for the evening', () => {
    for (const mood of [null, 0, 2, 4]) {
      for (const hour of [11, 15, 18, 22, 3]) { const p = scenesFor({ hour, mood }); expect(p).not.toContain('himalaya'); expect(p).not.toContain('desert'); }
      for (const hour of [6, 9, 12, 14, 22, 2]) expect(scenesFor({ hour, mood })).not.toContain('temple');
    }
    expect(scenesFor({ hour: 7, mood: 3 })).toEqual(expect.arrayContaining(['himalaya', 'desert']));
    expect(scenesFor({ hour: 18, mood: 3 })).toContain('temple');
  });
  it('still offers the sunrise, the dawn and the temple on a heavy day, as calm hopeful views', () => {
    expect(scenesFor({ hour: 7, mood: 0 })).toEqual(expect.arrayContaining(['himalaya', 'desert']));
    expect(scenesFor({ hour: 18, mood: 1 })).toContain('temple');
  });
  it('gives a heavy day only the calm places, and never a bright meadow or a forest at night', () => {
    for (const hour of [9, 22]) for (const mood of [0, 1]) for (const id of scenesFor({ hour, mood })) expect(['meadow', 'forest']).not.toContain(id);
    for (const mood of [null, 0, 1, 2, 3, 4]) { const night = scenesFor({ hour: 23, mood }); expect(night).not.toContain('meadow'); expect(night).not.toContain('forest'); expect(night).not.toContain('rain'); }
  });
  it('knows when it is dark, can be asked for by name, and names every place', () => {
    expect([4, 5, 18, 19, 23].map(isDark)).toEqual([true, false, false, true, true]);
    expect([4, 5, 10, 11, 16, 17, 20, 21].map(partOfView)).toEqual(['night', 'morning', 'morning', 'day', 'day', 'dusk', 'dusk', 'night']);
    expect(isSceneId('himalaya')).toBe(true);
    expect(isSceneId('nope')).toBe(false);
    for (const id of Object.keys(SCENE_NAMES) as SceneId[]) expect(SCENE_NAMES[id].length).toBeGreaterThan(3);
  });
});
