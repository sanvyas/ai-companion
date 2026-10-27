import { describe, expect, it } from 'vitest';
import { findUnsafeLanguage } from '@saathi/domain';
import { CALM_ITEMS, STORY_THEMES } from './calm';
import { EVENTS, HOBBIES, SMALL_STEPS } from './outside';

// Everything the app says by itself, without a model, goes through the same word check as the model's replies.
// Helplines and the crisis screens are fixed, clinically reviewed wording and are left to their own review.

const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const dirty = (label: string, v: unknown) => strings(v).filter(s => findUnsafeLanguage(s).length).map(s => `${label}: ${s}`);

describe('built-in content', () => {
  it('calm sessions, stories and wind-downs are free of banned words', () => {
    expect(CALM_ITEMS.flatMap(i => dirty(i.id, [i.title, i.desc, i.lines ?? []]))).toEqual([]);
  });

  it('events, small steps and hobbies are free of banned words', () => {
    expect([...dirty('events', EVENTS), ...dirty('steps', SMALL_STEPS), ...dirty('hobbies', HOBBIES)]).toEqual([]);
  });

  it('story places are labelled plainly', () => {
    expect(dirty('themes', STORY_THEMES)).toEqual([]);
    expect(STORY_THEMES.map(t => t.id)).toEqual(['rain', 'garden', 'train', 'sea', 'village', 'courtyard']);
  });
});
