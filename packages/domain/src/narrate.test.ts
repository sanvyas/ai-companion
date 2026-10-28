import { describe, expect, it } from 'vitest';
import { pauseTotalMs, phrasesOf, rhythmFor } from './narrate';

const med = rhythmFor('meditation');
const sleep = rhythmFor('sleep');

describe('saying a line the way a person would', () => {
  it('leaves a pause after each sentence and none after the last words', () => {
    const p = phrasesOf('Let’s settle in. Find a position that feels easy.', med);
    expect(p.map(x => x.text)).toEqual(['Let’s settle in.', 'Find a position that feels easy.']);
    expect(p[0].pauseMs).toBeGreaterThan(600);
    expect(p[1].pauseMs).toBe(0);
  });

  it('treats “…” as a breath: longer than a sentence break, and the thought carries on', () => {
    const p = phrasesOf('Breathe in for four… hold for two… and out for six.', med);
    expect(p.map(x => x.text)).toEqual(['Breathe in for four', 'hold for two', 'and out for six.']);
    expect(p[0].pauseMs).toBeGreaterThan(rhythmFor('meditation').sentence);
    expect(p[1].pauseMs).toBeGreaterThan(rhythmFor('meditation').sentence);
    expect(p[2].pauseMs).toBe(0);
  });

  it('leaves more room for sleep than for a morning session, and more still after a heavy stretch', () => {
    const line = 'You walk up a narrow lane. Rain is falling softly on the tin roofs.';
    const a = pauseTotalMs(phrasesOf(line, med)), b = pauseTotalMs(phrasesOf(line, sleep)), c = pauseTotalMs(phrasesOf(line, rhythmFor('sleep', true)));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('breaks a long sentence at its commas into pieces that are easy to say, with short pauses between', () => {
    const long = 'Inside, it’s warm, a quilt is folded on the bed, and a cup of ginger tea waits on the table beside the window that looks out over the whole quiet valley.';
    const p = phrasesOf(long, sleep);
    expect(p.length).toBeGreaterThan(1);
    for (const x of p) expect(x.text.length).toBeLessThanOrEqual(130);
    expect(p[0].pauseMs).toBeLessThan(sleep.sentence);
    expect(p.map(x => x.text).join(' ')).toContain('ginger tea');
  });

  it('holds a question a little longer', () => {
    const p = phrasesOf('How are you feeling? Take your time.', med);
    expect(p[0].pauseMs).toBeGreaterThan(p[1].pauseMs);
    expect(p[0].pauseMs).toBeGreaterThan(med.sentence * 0.8);
  });

  it('is steady: the same line always gets the same pauses, and pauses differ a little between lines', () => {
    const a = phrasesOf('The rain keeps its rhythm. You do not have to stay awake.', sleep);
    const b = phrasesOf('The rain keeps its rhythm. You do not have to stay awake.', sleep);
    expect(a).toEqual(b);
    const gaps = new Set(['One slow breath in. Another out.', 'Notice your feet. Their weight.', 'Soften your jaw. Your forehead.'].map(l => phrasesOf(l, sleep)[0].pauseMs));
    expect(gaps.size).toBeGreaterThan(1);
    for (const g of gaps) { expect(g).toBeGreaterThan(sleep.sentence * 0.8); expect(g).toBeLessThan(sleep.sentence * 1.2); }
  });

  it('trails off at the end of a line, but not for a one-word line', () => {
    expect(phrasesOf('Rest here as long as you like. Sleep well.', sleep).at(-1)!.slow).toBe(true);
    expect(phrasesOf('Sleep well.', sleep).at(-1)!.slow).toBe(false);
  });

  it('handles Hindi sentence ends, odd spacing and empty input', () => {
    expect(phrasesOf('गहरी सांस लीजिए।  और छोड़िए।', med).map(x => x.text)).toEqual(['गहरी सांस लीजिए।', 'और छोड़िए।']);
    expect(phrasesOf('   ', med)).toEqual([]);
    expect(phrasesOf('Just one.', med)).toEqual([{ text: 'Just one.', pauseMs: 0, slow: false }]);
  });
});
