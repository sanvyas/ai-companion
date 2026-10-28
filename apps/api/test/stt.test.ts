import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SarvamStt } from '../src/providers/sarvam.js';
import { TtsFailure, TtsUnavailable } from '../src/providers/voice.js';
import { recordSttUsage } from '../src/providers/index.js';
import { withSystem } from '../src/db/pool.js';
import { makeApp, signIn, type TestApp } from './app-helpers.js';
import { adminLogin } from './admin-helpers.js';

function wav(seconds = 1, rate = 16_000) {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 50) b.writeInt16LE(3000, 44 + i * 2);
  return b;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Seen = { url: string; key: string; fields: Record<string, string>; fileBytes: number };
async function read(url: string, init: RequestInit): Promise<Seen> {
  const form = init.body as FormData;
  const fields: Record<string, string> = {};
  let fileBytes = 0;
  for (const [k, v] of (form as unknown as { entries(): Iterable<[string, string | Blob]> }).entries()) { if (typeof v === 'string') fields[k] = v; else fileBytes = v.size; }
  return { url, key: (init.headers as Record<string, string>)['api-subscription-key'], fields, fileBytes };
}

describe('Sarvam speech-to-text adapter', () => {
  it('sends the recording and a language, and asks Hinglish to be written in Latin script', async () => {
    const seen: Seen[] = []; const used: any[] = [];
    const f = (async (u: string, i: RequestInit) => { seen.push(await read(u, i)); return json({ transcript: ' aaj kaam bahut tha ' }); }) as unknown as typeof fetch;
    const stt = new SarvamStt(() => 'sk-test', u => used.push(u), f);
    expect(await stt.transcribe({ wav: wav(2), language: 'hinglish' })).toEqual({ text: 'aaj kaam bahut tha' });
    expect(seen[0]).toMatchObject({ url: 'https://api.sarvam.ai/speech-to-text', key: 'sk-test', fields: { model: 'saaras:v3', language_code: 'hi-IN', mode: 'translit' } });
    expect(seen[0].fileBytes).toBeGreaterThan(60_000);
    await stt.transcribe({ wav: wav(1), language: 'en' });
    expect(seen[1].fields).toMatchObject({ language_code: 'en-IN', mode: 'transcribe' });
    await stt.transcribe({ wav: wav(1), language: 'hi' });
    expect(seen[2].fields).toMatchObject({ language_code: 'hi-IN', mode: 'transcribe' });
    expect(used[0]).toMatchObject({ provider: 'sarvam', kind: 'stt', ok: true });
    expect(used[0].seconds).toBeCloseTo(2, 1);
  });

  it('repeats the request in the older form if the vendor rejects the newer parameters, rather than failing', async () => {
    const seen: Seen[] = [];
    const f = (async (u: string, i: RequestInit) => { const s = await read(u, i); seen.push(s); return s.fields.mode ? json({ message: 'Unknown mode' }, 400) : json({ transcript: 'hello there' }); }) as unknown as typeof fetch;
    expect(await new SarvamStt(() => 'k', () => undefined, f).transcribe({ wav: wav(), language: 'en' })).toEqual({ text: 'hello there' });
    expect(seen.map(s => s.fields.model)).toEqual(['saaras:v3', 'saarika:v2.5']);
    expect(seen[1].fields.mode).toBeUndefined();
  });

  it('reports a bad key, a vendor error and a missing key plainly, and does not call out without a key', async () => {
    let calls = 0;
    const mk = (res: Response, key = 'k') => new SarvamStt(() => key || undefined, () => undefined, (async () => { calls++; return res; }) as unknown as typeof fetch);
    await expect(mk(json({ error: { message: 'bad' } }, 403)).transcribe({ wav: wav(), language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    await expect(mk(json({ message: 'Audio too long' }, 413)).transcribe({ wav: wav(), language: 'en' })).rejects.toThrow('Audio too long');
    calls = 0;
    await expect(mk(json({}), '').transcribe({ wav: wav(), language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    expect(calls).toBe(0);
    await expect(mk(json({}, 500)).transcribe({ wav: wav(), language: 'en' })).rejects.toBeInstanceOf(TtsFailure);
  });
});

describe('dictation endpoint', () => {
  let t: TestApp;
  const seen: Seen[] = [];
  let reply: () => Response = () => json({ transcript: 'Work was a lot today.' });
  beforeAll(async () => {
    t = await makeApp();
    t.ctx.transcriber = new SarvamStt(() => t.ctx.rt.secrets.get('sarvam', 'api_key'), recordSttUsage(t.ctx.db, t.ctx.log, t.ctx.rt), (async (u: string, i: RequestInit) => { seen.push(await read(u, i)); return reply(); }) as unknown as typeof fetch);
  });
  afterAll(async () => { await t.app.close(); });
  const post = (headers: Record<string, string>, body: Buffer | string, query = '') => t.app.inject({ method: 'POST', url: `/stt/transcribe${query}`, headers: { ...headers, 'content-type': 'audio/wav' }, payload: body as never });

  it('says the browser will be used while no key is saved', async () => {
    const a = await signIn(t);
    const r = await post(a.headers, wav());
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('stt_unavailable');
    expect((await t.app.inject({ url: '/public-config' })).json().dictation).toBe(false);
  });

  it('with a key: turns a recording into text in the person’s language, and records the usage', async () => {
    const admin = await adminLogin(t, 'owner');
    await t.app.inject({ method: 'PUT', url: '/admin/api/integrations/sarvam/api_key', headers: admin.headers, payload: { value: 'sarvam-key-1234567890' } });
    expect((await t.app.inject({ url: '/public-config' })).json().dictation).toBe(true);
    const a = await signIn(t);
    await t.app.inject({ method: 'PATCH', url: '/me', headers: a.headers, payload: { language: 'hinglish' } });
    seen.length = 0;
    const r = await post(a.headers, wav(3));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ text: 'Work was a lot today.' });
    expect(seen[0].fields).toMatchObject({ language_code: 'hi-IN', mode: 'translit' });
    // the person can say which language they are speaking, whatever their profile says
    await post(a.headers, wav(1), '?language=en');
    expect(seen[1].fields).toMatchObject({ language_code: 'en-IN' });
    await new Promise(r => setTimeout(r, 150));
    const row = (await withSystem(t.ctx.db, tx => tx.query(`SELECT seconds, units FROM usage_events WHERE kind = 'stt' ORDER BY id DESC LIMIT 2`))).rows;
    expect(row).toHaveLength(2);
    expect(Number(row.find(x => x.units === 3)?.seconds)).toBeCloseTo(3, 1);
  });

  it('refuses empty, unreadable and over-long recordings, and anyone not signed in', async () => {
    const a = await signIn(t);
    expect((await post(a.headers, Buffer.alloc(10))).statusCode).toBe(400);
    expect((await post(a.headers, Buffer.from('this is not a wav file, not even close to one'.repeat(40)))).json().error.code).toBe('bad_audio');
    expect((await post(a.headers, wav(40))).json().error.code).toBe('audio_too_long');
    expect((await post({}, wav())).statusCode).toBe(401);
  });

  it('turns a vendor problem into a friendly message', async () => {
    const a = await signIn(t);
    reply = () => json({ message: 'boom' }, 500);
    const r = await post(a.headers, wav());
    reply = () => json({ transcript: 'ok' });
    expect(r.statusCode).toBe(502);
    expect(r.json().error.message).toContain('couldn’t turn that into words');
  });
});
