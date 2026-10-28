import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SarvamTts } from '../src/providers/sarvam.js';
import { recordTtsUsage } from '../src/providers/index.js';
import { chooseNarration, paceFor, paceForStance } from '../src/services/narration.js';
import { SARVAM_VOICES } from '../src/services/voices.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';
import { adminLogin } from './admin-helpers.js';

function wav(seconds = 0.3, rate = 24_000) {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  b.writeInt16LE(8000, 44);
  return b;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('who reads, and how fast', () => {
  it('slows down for sleep and for a heavy stretch, and stays near natural on a light day', () => {
    expect(paceFor('sleep', 'heavier')).toBeLessThan(paceFor('sleep', 'in between'));
    expect(paceFor('sleep', 'in between')).toBeLessThan(paceFor('meditation', 'in between'));
    expect(paceFor('meditation', 'lighter')).toBeGreaterThan(paceFor('meditation', 'heavier'));
    for (const k of ['sleep', 'meditation'] as const) for (const m of ['heavier', 'in between', 'lighter', 'unknown'] as const) {
      const p = paceFor(k, m);
      expect(p).toBeGreaterThanOrEqual(0.65);
      expect(p).toBeLessThanOrEqual(1.1);
    }
  });

  it('chooses a different voice for a different mood, within the person’s own gender family', () => {
    const f = ['heavier', 'in between', 'lighter'].map(m => chooseNarration({ kind: 'meditation', mood: m as never, chosenVoice: 'warm' }).voice);
    expect(new Set(f).size).toBe(3);
    for (const v of f) expect(SARVAM_VOICES.find(x => x.id === v)!.gender).toBe('female');
    const male = ['heavier', 'in between', 'lighter'].map(m => chooseNarration({ kind: 'meditation', mood: m as never, chosenVoice: 'sarvam:rohan' }).pace);
    expect(male[0]).toBeLessThan(male[2]);
  });

  it('keeps the voice the person picked for their companion, and only moves the pace', () => {
    const a = chooseNarration({ kind: 'sleep', mood: 'heavier', chosenVoice: 'sarvam:pooja' });
    const b = chooseNarration({ kind: 'meditation', mood: 'lighter', chosenVoice: 'sarvam:pooja' });
    expect(a.voice).toBe('sarvam:pooja');
    expect(b.voice).toBe('sarvam:pooja');
    expect(a.pace).toBeLessThan(b.pace);
  });

  it('a sleep story never gets the brightest voice', () => {
    expect(chooseNarration({ kind: 'sleep', mood: 'lighter', chosenVoice: null }).voice).toBe(chooseNarration({ kind: 'sleep', mood: 'in between', chosenVoice: null }).voice);
  });

  it('the companion speaks slower to listen and a little livelier to lift', () => {
    expect(paceForStance('listen')).toBeLessThan(1);
    expect(paceForStance('ground')).toBeLessThan(paceForStance('listen'));
    expect(paceForStance('energise')).toBeGreaterThan(1);
    expect(paceForStance(undefined)).toBe(1);
  });
});

describe('calm narration over the API', () => {
  let t: TestApp;
  const calls: { body: any }[] = [];
  let a: Auth;
  beforeAll(async () => {
    t = await makeApp();
    t.ctx.tts = new SarvamTts(() => t.ctx.rt.secrets.get('sarvam', 'api_key'), recordTtsUsage(t.ctx.db, t.ctx.log, t.ctx.rt), (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string); calls.push({ body });
      return json({ audios: [wav(0.3).toString('base64')] });
    }) as unknown as typeof fetch);
    a = await signIn(t);
  });
  afterAll(async () => { await t.app.close(); });

  it('says plainly that the phone’s voice will read when no server voice is connected', async () => {
    const plan = (await t.app.inject({ url: '/calm/narration?kind=sleep', headers: a.headers })).json();
    expect(plan).toMatchObject({ server: false, voice: null, mood: 'unknown' });
    expect(plan.pace).toBeLessThan(0.9);
    const r = await t.app.inject({ method: 'POST', url: '/calm/narrate', headers: a.headers, payload: { text: 'Breathe in.', kind: 'sleep' } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('voice_unavailable');
  });

  it('with a key: reads a line in a voice and pace that follow the person’s mood, and reuses identical lines', async () => {
    const admin = await adminLogin(t, 'owner');
    await t.app.inject({ method: 'PUT', url: '/admin/api/integrations/sarvam/api_key', headers: admin.headers, payload: { value: 'sarvam-key-1234567890' } });
    const heavy = await signIn(t);
    await t.app.inject({ method: 'POST', url: '/mood', headers: heavy.headers, payload: { value: 0 } });
    const light = await signIn(t);
    await t.app.inject({ method: 'POST', url: '/mood', headers: light.headers, payload: { value: 4 } });

    calls.length = 0;
    const say = (who: Auth, text: string, kind = 'meditation') => t.app.inject({ method: 'POST', url: '/calm/narrate', headers: who.headers, payload: { text, kind } });
    const h = await say(heavy, 'Let your shoulders drop.');
    await say(light, 'Let your shoulders drop.');
    expect(h.statusCode).toBe(200);
    expect(Buffer.from(h.json().audio, 'base64').toString('ascii', 0, 4)).toBe('RIFF');
    expect(calls).toHaveLength(2);
    expect(calls[0].body.speaker).not.toBe(calls[1].body.speaker);
    expect(calls[0].body.pace).toBeLessThan(calls[1].body.pace);
    expect(calls[0].body.target_language_code).toBe('en-IN');
    expect(h.json().voice.label).toMatch(/^[A-Z]/);

    await say(heavy, 'Let your shoulders drop.');
    expect(calls).toHaveLength(2); // same voice, same pace, same line: from memory

    const plan = (await t.app.inject({ url: '/calm/narration?kind=meditation', headers: heavy.headers })).json();
    expect(plan).toMatchObject({ server: true, mood: 'heavier', voice: { label: expect.any(String) } });
  });

  it('refuses empty or very long text, and needs a signed-in person', async () => {
    const post = (payload: unknown, headers: Record<string, string> = a.headers) => t.app.inject({ method: 'POST', url: '/calm/narrate', headers, payload: payload as never });
    expect((await post({ text: '', kind: 'sleep' })).statusCode).toBe(400);
    expect((await post({ text: 'x'.repeat(501), kind: 'sleep' })).statusCode).toBe(400);
    expect((await post({ text: 'hello', kind: 'party' })).statusCode).toBe(400);
    expect((await post({ text: 'hello', kind: 'sleep' }, {})).statusCode).toBe(401);
  });
});
