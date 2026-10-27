import { describe, expect, it } from 'vitest';
import { STANCES, describeHits, findUnsafeLanguage, isSafeLanguage, level3Script, SAFE_FALLBACK_LINE, SOFT_FALLBACK_LINE } from '@saathi/domain';
import { PROMPT_BY_KEY, PROMPT_DEFS, renderTemplate, validatePromptBody } from '../src/runtime/promptDefs.js';
import { EVAL_SEEDS } from '../src/runtime/evalSeeds.js';
import { FALLBACK_STORIES } from '../src/services/story.js';
import { dynamicSystem, stableSystem, withSafeLanguage, type PromptGetter } from '../src/services/prompts.js';

// The built-in wording, read straight from the definitions (no database, no portal overrides).
const get: PromptGetter = (key, vars = {}) => renderTemplate(PROMPT_BY_KEY.get(key)!.body, vars);

describe('prompt definitions', () => {
  it('every built-in prompt is valid as written: variables, required phrases, length', () => {
    for (const d of PROMPT_DEFS) expect(validatePromptBody(d, d.body), d.key).toEqual([]);
  });

  it('no prompt tells the model to write a banned word (only the rules and the classifier may name them)', () => {
    const problems = PROMPT_DEFS.filter(x => !x.lexiconExempt).flatMap(d => {
      const hits = findUnsafeLanguage(renderTemplate(d.body, Object.fromEntries(d.vars.map(v => [v, 'x']))));
      return hits.length ? [`${d.key}: ${describeHits(hits)} (${hits.map(h => h.match).join(', ')})`] : [];
    });
    expect(problems).toEqual([]);
  });

  it('only the rules, the classifier and the reviewer may name banned words', () => {
    expect(PROMPT_DEFS.filter(d => d.lexiconExempt).map(d => d.key).sort()).toEqual(['classifier', 'output_check', 'style.safe_language']);
  });

  it('has a tone prompt for every stance, each safe to read and short enough to share the context window', () => {
    for (const s of STANCES) {
      const d = PROMPT_BY_KEY.get(`tone.${s}`);
      expect(d, s).toBeDefined();
      expect(isSafeLanguage(d!.body), s).toBe(true);
      expect(d!.body.length).toBeLessThan(900);
    }
  });

  it('puts the chosen tone into the turn, and only that one', () => {
    for (const s of STANCES) {
      const text = dynamicSystem({ mode: 'text', localTime: 'Tuesday 9 pm', planItems: [], moodTrend: 'unknown', memories: [], hasSafetyPlan: false, trustedFirstName: null, riskLevel: 0, priorSummary: null, openingHookSpoken: null, tone: { stance: s, reason: 'test' } }, get);
      expect(text).toContain('TONE FOR THIS TURN (test)');
      expect(text).toContain(get(`tone.${s}`));
      for (const other of STANCES.filter(o => o !== s)) expect(text).not.toContain(get(`tone.${other}`));
      expect(isSafeLanguage(text), s).toBe(true);
    }
  });

  it('leaves the tone block out when no tone is given', () => {
    const text = dynamicSystem({ mode: 'text', localTime: 'x', planItems: [], moodTrend: 'unknown', memories: [], hasSafetyPlan: false, trustedFirstName: null, riskLevel: 0, priorSummary: null, openingHookSpoken: null }, get);
    expect(text).not.toContain('TONE FOR THIS TURN');
  });

  it('the companion prompt carries the six-way playbook and the safe-language rules', () => {
    const stable = stableSystem({ companionName: 'Saathi', nickname: 'Asha', language: 'en', voice: 'warm' }, get);
    expect(stable).toContain('SAFE LANGUAGE');
    expect(stable).toContain('Asha');
    for (const s of ['listen', 'energise', 'ground', 'celebrate', 'steady', 'play']) expect(stable.toLowerCase(), s).toContain(s);
  });

  it('the safe-language rules are appended in code to anything the app writes, whatever the portal changed', () => {
    const edited: PromptGetter = (key, vars) => (key === 'style.safe_language' ? 'SAFE LANGUAGE (edited)' : get(key, vars));
    expect(withSafeLanguage('Write a plan.', edited)).toBe('Write a plan.\n\nSAFE LANGUAGE (edited)');
    for (const key of ['plan', 'summary', 'memories', 'checkin_extract', 'letter', 'journal.analysis', 'story']) {
      expect(PROMPT_BY_KEY.get(key), key).toBeDefined();
    }
  });

  it('the level 2 prompt still names the helpline and no longer asks in words that could echo', () => {
    const l2 = get('safety.level2');
    expect(l2).toMatch(/Tele-MANAS/);
    expect(l2).toMatch(/14416/);
    expect(l2).toMatch(/safe right now/);
  });
});

describe('fixed text the app can fall back to', () => {
  it('the safe fallbacks and the crisis script are themselves free of banned words', () => {
    expect(isSafeLanguage(SAFE_FALLBACK_LINE)).toBe(true);
    expect(isSafeLanguage(SOFT_FALLBACK_LINE)).toBe(true);
    expect(findUnsafeLanguage(level3Script('Asha'))).toEqual([]);
  });

  it('every reviewed fallback story is clean, calm and long enough to listen to', () => {
    for (const [theme, st] of Object.entries(FALLBACK_STORIES)) {
      expect(isSafeLanguage(st.title), theme).toBe(true);
      expect(st.lines.length, theme).toBeGreaterThanOrEqual(8);
      for (const line of st.lines) expect(findUnsafeLanguage(line).map(h => h.match), `${theme}: ${line}`).toEqual([]);
    }
  });
});

describe('evaluation seeds', () => {
  it('cover every suite and every writing kind, with distinct labels', () => {
    const labels = new Set(EVAL_SEEDS.map(s => `${s.suite}/${s.label}`));
    expect(labels.size).toBe(EVAL_SEEDS.length);
    for (const suite of ['classifier', 'reviewer', 'replies', 'writing']) expect(EVAL_SEEDS.some(s => s.suite === suite), suite).toBe(true);
    const kinds = new Set(EVAL_SEEDS.filter(s => s.suite === 'writing').map(s => (s.expect as { kind: string }).kind));
    expect([...kinds].sort()).toEqual(['checkin', 'letter', 'plan', 'story', 'walk']);
  });

  it('reply cases all use valid patterns', () => {
    for (const s of EVAL_SEEDS.filter(x => x.suite === 'replies')) {
      const e = s.expect as { require: string[]; forbid: string[] };
      for (const p of [...e.require, ...e.forbid]) expect(() => new RegExp(p, 'i'), `${s.label}: ${p}`).not.toThrow();
    }
  });
});
