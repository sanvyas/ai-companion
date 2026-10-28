import { afterEach, describe, expect, it, vi } from 'vitest';
import { Recognizer } from './recognition';

class Fake {
  static all: Fake[] = [];
  lang = ''; continuous = false; interimResults = false;
  onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null;
  constructor() { Fake.all.push(this); }
  start() {}
  stop() {}
  say(text: string, final: boolean) { const r: any = [{ transcript: text }]; r.isFinal = final; this.onresult?.({ resultIndex: 0, results: [r] }); }
}
afterEach(() => { Fake.all = []; vi.useRealTimers(); delete (window as any).webkitSpeechRecognition; });

describe('listening during a call', () => {
  it('says what was heard even when the browser ends the session before marking it final, and listens again', () => {
    vi.useFakeTimers();
    (window as any).webkitSpeechRecognition = Fake;
    const finals: string[] = [];
    const r = new Recognizer('en-IN', { onInterim: () => undefined, onFinal: t => finals.push(t), onFatal: () => undefined });
    r.start();
    Fake.all[0].say('I have been feeling', false);
    Fake.all[0].say('I have been feeling really low lately', false);
    Fake.all[0].onend?.();
    expect(finals).toEqual(['I have been feeling really low lately']);
    vi.advanceTimersByTime(100);
    expect(Fake.all).toHaveLength(2);
    Fake.all[1].say('and tired', true);
    Fake.all[1].onend?.();
    expect(finals).toEqual(['I have been feeling really low lately', 'and tired']); // nothing said twice
    r.stop();
  });
});
