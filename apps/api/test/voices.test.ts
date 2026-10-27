import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SarvamTts } from '../src/providers/sarvam.js';
import { TtsFailure, TtsUnavailable, parseWav } from '../src/providers/voice.js';
import { recordTtsUsage } from '../src/providers/index.js';
import { withSystem } from '../src/db/pool.js';
import { SARVAM_VOICES, personaOf, voicesFor } from '../src/services/voices.js';
import { makeApp, signIn, type TestApp } from './app-helpers.js';
import { adminLogin } from './admin-helpers.js';

/** A real WAV file: 44-byte header, then `seconds` of 24 kHz mono silence with a click so it isn't empty. */
function wav(seconds = 0.5, rate = 24_000) {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  b.writeInt16LE(8000, 44);
  return b;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Sarvam voice adapter', () => {
  it('asks for the chosen speaker in the right language and unwraps the audio', async () => {
    const seen: { url: string; headers: Record<string, string>; body: any }[] = []; const used: any[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }); return json({ audios: [wav(0.5).toString('base64')] }); }) as unknown as typeof fetch;
    const tts = new SarvamTts(() => 'sk-test', u => used.push(u), f);
    const r = await tts.synthesize({ text: 'Hi, main yahan hoon.', voice: 'sarvam:priya', language: 'hinglish' });
    expect(seen[0].url).toBe('https://api.sarvam.ai/text-to-speech');
    expect(seen[0].headers['api-subscription-key']).toBe('sk-test');
    expect(seen[0].body).toMatchObject({ speaker: 'priya', model: 'bulbul:v3', target_language_code: 'hi-IN', text: 'Hi, main yahan hoon.' });
    expect(r.sampleRate).toBe(24_000);
    expect(r.pcm.length).toBe(12_000 * 2);
    expect(used[0]).toMatchObject({ provider: 'sarvam', kind: 'tts', chars: 20, ok: true });
    // English uses the Indian-English voice setting.
    await tts.synthesize({ text: 'Hello', voice: 'sarvam:rohan', language: 'en' });
    expect(seen[1].body.target_language_code).toBe('en-IN');
  });

  it('streams PCM in one-second pieces and stops when asked', async () => {
    const f = (async () => json({ audios: [wav(2.5).toString('base64')] })) as unknown as typeof fetch;
    const tts = new SarvamTts(() => 'k', () => undefined, f);
    const sizes: number[] = [];
    for await (const c of tts.stream({ text: 'x', voice: 'sarvam:ritu', language: 'en' })) sizes.push(c.audio.length);
    expect(sizes).toEqual([48_000, 48_000, 24_000]);
    const ac = new AbortController(); ac.abort();
    const none: number[] = [];
    for await (const c of tts.stream({ text: 'x', voice: 'sarvam:ritu', language: 'en', signal: ac.signal })) none.push(c.audio.length);
    expect(none).toEqual([]);
  });

  it('reports a bad key, a vendor error and a missing key plainly, and never calls out without a key', async () => {
    let calls = 0;
    const mk = (res: Response, key = 'k') => new SarvamTts(() => key || undefined, () => undefined, (async () => { calls++; return res; }) as unknown as typeof fetch);
    await expect(mk(json({ error: { message: 'bad' } }, 403)).synthesize({ text: 'x', voice: 'sarvam:priya', language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    await expect(mk(json({ message: 'Speaker not supported' }, 400)).synthesize({ text: 'x', voice: 'sarvam:priya', language: 'en' })).rejects.toThrow('Speaker not supported');
    await expect(mk(json({ audios: [] })).synthesize({ text: 'x', voice: 'sarvam:priya', language: 'en' })).rejects.toBeInstanceOf(TtsFailure);
    calls = 0;
    await expect(mk(json({}), '').synthesize({ text: 'x', voice: 'sarvam:priya', language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    expect(calls).toBe(0);
    await expect(mk(json({})).synthesize({ text: 'x', voice: 'warm', language: 'en' })).rejects.toThrow('server voices');
  });

  it('rejects audio that is not a WAV file', () => { expect(() => parseWav(Buffer.from('not audio at all, definitely not a wav file header...'))).toThrow(); });
});

describe('voice catalogue', () => {
  it('lists only the phone’s voices until a server voice is connected, and every language gets the same eight', () => {
    expect(voicesFor('hi', false).map(v => v.id)).toEqual(['warm', 'steady', 'bright']);
    for (const lang of ['en', 'hinglish', 'hi'] as const) expect(voicesFor(lang, true).filter(v => v.provider === 'sarvam')).toHaveLength(8);
    expect(SARVAM_VOICES.filter(v => v.gender === 'female').map(v => v.label)).toEqual(['Ritu', 'Priya', 'Neha', 'Pooja']);
    expect(personaOf('sarvam:rahul')).toBe('steady');
    expect(personaOf('sarvam:neha')).toBe('warm');
    expect(personaOf('bright')).toBe('bright');
  });
});

describe('voices in the app', () => {
  let t: TestApp;
  const calls: { body: any }[] = [];
  beforeAll(async () => {
    t = await makeApp();
    t.ctx.tts = new SarvamTts(() => t.ctx.rt.secrets.get('sarvam', 'api_key'), recordTtsUsage(t.ctx.db, t.ctx.log, t.ctx.rt), (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string); calls.push({ body });
      return body.speaker === 'rahul' ? json({ message: 'Speaker rahul is not available' }, 400) : json({ audios: [wav(0.3).toString('base64')] });
    }) as unknown as typeof fetch);
  });
  afterAll(async () => { await t.app.close(); });

  it('offers only the phone’s voices while no key is saved, and refuses a server voice', async () => {
    const a = await signIn(t);
    const list = (await t.app.inject({ url: '/voices', headers: a.headers })).json();
    expect(list.serverVoices).toBe(false);
    expect(list.items.map((v: { id: string }) => v.id)).toEqual(['warm', 'steady', 'bright']);
    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'sarvam:priya' } })).json().error.code).toBe('voice_unavailable');
    expect((await t.app.inject({ method: 'POST', url: '/voices/preview', headers: a.headers, payload: { voice: 'sarvam:priya' } })).statusCode).toBe(503);
  });

  it('after the key is added in the portal: lists the voices for the person’s language, previews them once, and saves the choice', async () => {
    const admin = await adminLogin(t, 'owner');
    expect((await t.app.inject({ method: 'PUT', url: '/admin/api/integrations/sarvam/api_key', headers: admin.headers, payload: { value: 'sarvam-key-1234567890' } })).statusCode).toBe(200);
    const a = await signIn(t);
    await t.app.inject({ method: 'PATCH', url: '/me', headers: a.headers, payload: { language: 'hi' } });

    const list = (await t.app.inject({ url: '/voices', headers: a.headers })).json();
    expect(list).toMatchObject({ language: 'hi', serverVoices: true });
    expect(list.items.filter((v: { provider: string }) => v.provider === 'sarvam')).toHaveLength(8);
    expect(list.items.find((v: { id: string }) => v.id === 'sarvam:priya')).toMatchObject({ label: 'Priya', gender: 'female' });

    calls.length = 0;
    const p1 = await t.app.inject({ method: 'POST', url: '/voices/preview', headers: a.headers, payload: { voice: 'sarvam:priya' } });
    expect(p1.statusCode).toBe(200);
    expect(p1.json()).toMatchObject({ mime: 'audio/wav', sampleRate: 24000 });
    expect(Buffer.from(p1.json().audio, 'base64').toString('ascii', 0, 4)).toBe('RIFF');
    expect(calls[0].body).toMatchObject({ speaker: 'priya', target_language_code: 'hi-IN' });
    expect(calls[0].body.text).toContain('नमस्ते');
    await t.app.inject({ method: 'POST', url: '/voices/preview', headers: a.headers, payload: { voice: 'sarvam:priya' } });
    expect(calls).toHaveLength(1); // the second preview came from memory

    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'sarvam:priya' } })).json().voice).toBe('sarvam:priya');
    expect((await t.app.inject({ url: '/me', headers: a.headers })).json().companion.voice).toBe('sarvam:priya');
    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'sarvam:nobody' } })).json().error.code).toBe('unknown_voice');
    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'warm' } })).statusCode).toBe(200);

    // Spend is recorded per character at the rate in the pricing table.
    await new Promise(r => setTimeout(r, 150));
    const row = (await withSystem(t.ctx.db, tx => tx.query(`SELECT chars, cost_inr FROM usage_events WHERE provider = 'sarvam' AND kind = 'tts' ORDER BY id DESC LIMIT 1`))).rows[0];
    expect(row.chars).toBeGreaterThan(10);
    expect(Number(row.cost_inr)).toBeGreaterThan(0);
  });

  it('turns a vendor problem into a friendly message and tests the key from the portal', async () => {
    const a = await signIn(t);
    const bad = await t.app.inject({ method: 'POST', url: '/voices/preview', headers: a.headers, payload: { voice: 'sarvam:rahul' } });
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error.message).toContain('try another');
    expect((await t.app.inject({ method: 'POST', url: '/voices/preview', headers: a.headers, payload: { voice: 'warm' } })).statusCode).toBe(400);

    const admin = await adminLogin(t, 'owner');
    const f = (async () => json({ audios: [wav(0.4).toString('base64')] })) as unknown as typeof fetch;
    t.ctx.fetchImpl = f;
    const test = (await t.app.inject({ method: 'POST', url: '/admin/api/integrations/sarvam/test', headers: admin.headers })).json();
    expect(test.ok).toBe(true);
    expect(test.note).toContain('Key accepted');
    const items = (await t.app.inject({ url: '/admin/api/integrations', headers: admin.headers })).json().items;
    expect(items.find((i: { id: string }) => i.id === 'sarvam').status).toBe('live');
  });
});
