import { describe, expect, it } from 'vitest';
import { Chunker, RATE, wavOf } from './chunker';

const frame = (level: number, ms = 20) => { const n = RATE * ms / 1000; const a = new Int16Array(n); for (let i = 0; i < n; i++) a[i] = (i % 2 ? 1 : -1) * Math.round(level * 32767); return a; };
const feed = (c: Chunker, level: number, seconds: number) => { for (let i = 0; i < seconds * 50; i++) c.push(frame(level)); };

describe('cutting a recording into pieces', () => {
  it('waits for a pause between phrases, and cuts there', () => {
    const out: number[] = [];
    const c = new Chunker((_p, s) => out.push(Math.round(s * 10) / 10));
    feed(c, 0.2, 3);   // speaking
    expect(out).toEqual([]);
    feed(c, 0, 0.8);   // a pause
    expect(out).toHaveLength(1);
    expect(out[0]).toBeGreaterThanOrEqual(3.6);
    expect(out[0]).toBeLessThanOrEqual(3.8);
  });

  it('does not cut a short phrase early: it keeps listening until there is enough', () => {
    const out: number[] = [];
    const c = new Chunker((_p, s) => out.push(s));
    feed(c, 0.2, 0.8); feed(c, 0, 0.8); // a brief "yes" then quiet
    expect(out).toEqual([]);
    feed(c, 0.2, 1);
    c.flush();
    expect(out).toHaveLength(1); // all of it, in one piece
    expect(out[0]).toBeGreaterThan(2.5);
  });

  it('cuts at the maximum length even if the person never pauses, and loses no audio', () => {
    const total: number[] = [];
    const c = new Chunker((_p, s) => total.push(s));
    feed(c, 0.2, 60);
    c.flush();
    expect(total.length).toBe(3);
    expect(Math.max(...total)).toBeLessThanOrEqual(25.1);
    expect(total.reduce((a, b) => a + b, 0)).toBeCloseTo(60, 0);
  });

  it('cuts sooner at a shorter pause once a long stretch has been heard', () => {
    const out: number[] = [];
    const c = new Chunker((_p, s) => out.push(s));
    feed(c, 0.2, 9); feed(c, 0, 0.4);
    expect(out).toHaveLength(1);
  });

  it('drops a stretch of pure silence instead of sending it', () => {
    const out: number[] = [];
    const c = new Chunker((_p, s) => out.push(s));
    feed(c, 0, 10);
    c.flush();
    expect(out).toEqual([]);
  });

  it('keeps quiet speech that is above the floor, and drops a piece too short to be a word', () => {
    const out: number[] = [];
    const c = new Chunker((_p, s) => out.push(s));
    feed(c, 0.05, 3); c.flush();
    expect(out).toHaveLength(1);
    feed(c, 0.5, 0.1); c.flush();
    expect(out).toHaveLength(1);
  });

  it('writes a readable 16 kHz mono WAV', () => {
    const w = new DataView(wavOf(new Int16Array([1, -1, 2, -2])));
    expect(String.fromCharCode(w.getUint8(0), w.getUint8(1), w.getUint8(2), w.getUint8(3))).toBe('RIFF');
    expect(w.getUint32(24, true)).toBe(16000);
    expect(w.getUint16(22, true)).toBe(1);
    expect(w.getUint32(40, true)).toBe(8);
    expect(w.getInt16(44, true)).toBe(1);
    expect(w.getInt16(50, true)).toBe(-2);
  });
});
