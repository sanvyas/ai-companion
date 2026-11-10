import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from './app-helpers.js';
import { adminLogin, type AdminSession } from './admin-helpers.js';
import { vendorsOf } from '../src/services/voices.js';

// The portal side of Groq (AI and listening) and Google (voices): keys, tests, provider choice and what the app then offers.
const GROQ = 'gsk_portal_test_key_not_real_00000000';
const GOOGLE = 'AIzaPortalTestKeyNotRealPortalTest12345';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wav = (() => { const pcm = Buffer.alloc(24_000 * 2); const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24_000, 24); h.writeUInt32LE(48_000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]).toString('base64'); })();

describe('Groq and Google in the portal', () => {
  let t: TestApp; let owner: AdminSession;
  const call = (method: string, url: string, payload?: unknown) => t.app.inject({ method: method as 'GET', url: `/admin/api${url}`, headers: owner.headers, payload: payload as object });

  beforeAll(async () => {
    t = await makeApp(); owner = await adminLogin(t, 'owner');
    t.ctx.fetchImpl = (async (url: string) => {
      if (url.endsWith('/openai/v1/models')) return json({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'whisper-large-v3-turbo' }] });
      if (url.endsWith('/chat/completions')) return json({ choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }] });
      if (url.includes('texttospeech.googleapis.com')) return json({ audioContent: wav });
      return json({}, 404);
    }) as unknown as typeof fetch;
  });
  afterAll(async () => { await t.app.close(); });

  it('lists both services, takes only keys of the right shape, never echoes them, and tests them for real', async () => {
    const items = (await call('GET', '/integrations')).json().items as { id: string; status: string; testable: boolean }[];
    for (const id of ['groq', 'google_tts']) expect(items.find(i => i.id === id)).toMatchObject({ status: 'live', testable: true });
    expect((await call('PUT', '/integrations/groq/api_key', { value: 'sk-wrong' })).statusCode).toBe(400);
    expect((await call('PUT', '/integrations/google_tts/api_key', { value: 'not-a-google-key' })).statusCode).toBe(400);
    expect((await call('PUT', '/integrations/groq/api_key', { value: GROQ })).statusCode).toBe(200);
    expect((await call('PUT', '/integrations/google_tts/api_key', { value: GOOGLE })).statusCode).toBe(200);
    expect(JSON.stringify((await call('GET', '/integrations')).json())).not.toContain(GROQ);
    expect(JSON.stringify((await call('GET', '/integrations')).json())).not.toContain(GOOGLE);
    const g = (await call('POST', '/integrations/groq/test')).json();
    expect(g).toMatchObject({ ok: true });
    expect(g.note).toContain('Key accepted');
    expect((await call('POST', '/integrations/google_tts/test')).json()).toMatchObject({ ok: true });
  });

  it('turns on server listening and Google voices once their keys are saved, with nothing else changed', async () => {
    await t.ctx.rt.secrets.refresh();
    expect(t.ctx.stt!.configured).toBe(true); // "Listening" defaults to Groq and its key is now saved
    expect(t.ctx.transcriber!.configured).toBe(true);
    expect(vendorsOf(t.ctx.tts).google).toBe(true);
    expect(vendorsOf(t.ctx.tts).sarvam).toBe(false);
  });

  it('switches the whole app to Groq with the model chosen for each job, and back', async () => {
    expect((await call('PUT', '/settings/llm.provider', { value: 'groq' })).statusCode).toBe(200);
    expect((await call('PUT', '/settings/groq.models.safety', { value: 'openai/gpt-oss-120b' })).statusCode).toBe(200);
    await t.ctx.rt.settings.refresh();
    expect(t.ctx.rt.llmProvider()).toBe('groq');
    expect(t.ctx.rt.model('companion')).toBe('openai/gpt-oss-20b');
    expect(t.ctx.rt.model('safety')).toBe('openai/gpt-oss-120b');
    expect((await call('PUT', '/settings/groq.models.companion', { value: 'made-up/model' })).statusCode).toBe(400);
    expect((await call('PUT', '/settings/voice.stt_provider', { value: 'browser' })).statusCode).toBe(200);
    await t.ctx.rt.settings.refresh();
    expect(t.ctx.stt!.configured).toBe(false); // phone-only listening
    expect(t.ctx.transcriber!.configured).toBe(true); // dictation still has a key to use
    await call('PUT', '/settings/llm.provider', { value: 'anthropic' });
    await call('PUT', '/settings/voice.stt_provider', { value: 'groq' });
    await t.ctx.rt.settings.refresh();
    expect(t.ctx.rt.llmProvider()).toBe('anthropic');
  });

  it('shows what is listening and speaking on the Overview, and Groq as the language model vendor', async () => {
    await call('PUT', '/settings/llm.provider', { value: 'groq' });
    await t.ctx.rt.settings.refresh();
    const cards = (await call('GET', '/overview')).json().systems as { name: string; status: string; detail: string }[];
    expect(cards.find(c => c.name === 'Listening')).toMatchObject({ status: 'ok', detail: expect.stringContaining('Groq Whisper') });
    expect(cards.find(c => c.name === 'Voices')).toMatchObject({ status: 'ok', detail: expect.stringContaining('Google') });
    expect(cards.find(c => c.name === 'Language model')!.detail).toContain('Groq · openai/gpt-oss-20b');
    await call('PUT', '/settings/llm.provider', { value: 'anthropic' });
  });
});
