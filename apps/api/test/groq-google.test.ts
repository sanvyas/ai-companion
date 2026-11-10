import { describe, expect, it } from 'vitest';
import { GroqLlm, LlmFailure, LlmUnavailable, createLlm, type LlmUsage } from '../src/providers/llm.js';
import { GroqLiveStt, GroqStt, UtteranceSegmenter, isPhantom, testGroq } from '../src/providers/groq.js';
import { GoogleTts, googleLangOf, testGoogleTts } from '../src/providers/google.js';
import { TranscriberRouter, TtsRouter } from '../src/providers/router.js';
import { TtsFailure, TtsUnavailable, wavOf, type Transcriber, type TtsProvider, type TtsUsage } from '../src/providers/voice.js';
import { GOOGLE_VOICES, SARVAM_VOICES, canSpeak, isServerVoice, vendorsOf, voicesFor } from '../src/services/voices.js';
import { Voice } from '@saathi/contracts';
import { chooseNarration } from '../src/services/narration.js';

// Every vendor call here goes to a fake `fetch`; nothing leaves the machine and no real key is used.
const KEY = 'gsk_test_key_not_real_0000000000';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (frames: unknown[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const f of frames) c.enqueue(e.encode(`data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const base = { task: 'companion' as const, model: 'openai/gpt-oss-20b', system: { stable: 'Be kind.', dynamic: 'Name: Asha' }, messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 50 };

describe('Groq chat adapter', () => {
  it('sends an OpenAI-style request with thinking kept short, and records tokens under groq:model', async () => {
    const used: LlmUsage[] = []; const seen: { url: string; body: any; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> }); return json({ choices: [{ message: { content: 'Hello there.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5 } }); }) as unknown as typeof fetch;
    expect(await new GroqLlm(KEY, u => used.push(u), f).text(base)).toBe('Hello there.');
    expect(seen[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(seen[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0].body.messages[0]).toEqual({ role: 'system', content: 'Be kind.\n\nName: Asha' });
    expect(seen[0].body.reasoning_effort).toBe('low');
    expect(seen[0].body.max_completion_tokens).toBeGreaterThan(base.maxTokens); // headroom for the thinking step
    expect(used[0]).toMatchObject({ provider: 'groq:openai/gpt-oss-20b', inTokens: 20, outTokens: 5, ok: true });
  });

  it('does not send thinking settings to a model that has no thinking step', async () => {
    const seen: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { seen.push(JSON.parse(init.body as string)); return json({ choices: [{ message: { content: 'Hi.' }, finish_reason: 'stop' }] }); }) as unknown as typeof fetch;
    await new GroqLlm(KEY, () => undefined, f).text({ ...base, model: 'llama-3.3-70b-versatile' });
    expect(seen[0].reasoning_effort).toBeUndefined();
    expect(seen[0].include_reasoning).toBeUndefined();
  });

  it('repeats without the thinking settings when Groq refuses them', async () => {
    const calls: any[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string); calls.push(b);
      if (b.reasoning_effort) return json({ error: { message: 'reasoning_effort is not supported with this model' } }, 400);
      return json({ choices: [{ message: { content: 'Fine.' }, finish_reason: 'stop' }] });
    }) as unknown as typeof fetch;
    expect(await new GroqLlm(KEY, () => undefined, f).text(base)).toBe('Fine.');
    expect(calls).toHaveLength(2);
    expect(calls[1].reasoning_effort).toBeUndefined();
  });

  it('streams text as it arrives and reads the token counts from the last frame', async () => {
    const used: LlmUsage[] = [];
    const f = (async () => sse([{ choices: [{ delta: { content: 'I am ' } }] }, { choices: [{ delta: { content: 'here.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], x_groq: { usage: { prompt_tokens: 9, completion_tokens: 4 } } }, '[DONE]'])) as unknown as typeof fetch;
    const out: string[] = [];
    for await (const t of new GroqLlm(KEY, u => used.push(u), f).stream(base)) out.push(t);
    expect(out.join('')).toBe('I am here.');
    expect(used.at(-1)).toMatchObject({ ok: true });
  });

  it('treats a reply that is all thinking and no words as a failure, not as silence', async () => {
    const f = (async () => json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })) as unknown as typeof fetch;
    await expect(new GroqLlm(KEY, () => undefined, f).text(base)).rejects.toBeInstanceOf(LlmFailure);
  });

  it('asks for structured output and falls back to JSON in words when it is refused', async () => {
    const calls: any[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string); calls.push(b);
      if (b.response_format) return json({ error: { message: 'response_format json_schema is not supported' } }, 400);
      return json({ choices: [{ message: { content: 'Sure! ```json\n{"level": 2}\n```' }, finish_reason: 'stop' }] });
    }) as unknown as typeof fetch;
    const out = await new GroqLlm(KEY, () => undefined, f).json({ ...base, schemaName: 'risk', jsonSchema: { type: 'object' }, parse: v => v as { level: number } });
    expect(out).toEqual({ level: 2 });
    expect(calls[0].response_format.type).toBe('json_schema');
    expect(calls.at(-1).messages[0].content).toContain('JSON schema');
  });

  it('turns a rejected key into the error the app already understands', async () => {
    const f = (async () => json({ error: { message: 'Invalid API Key' } }, 401)) as unknown as typeof fetch;
    await expect(new GroqLlm(KEY, () => undefined, f).text(base)).rejects.toBeInstanceOf(LlmUnavailable);
  });

  it('is chosen by the portal setting, with a clear message when it has no key', async () => {
    const llm = createLlm({ llmProvider: 'none' }, { provider: () => 'groq', key: () => undefined }, () => undefined);
    await expect(llm.text(base)).rejects.toBeInstanceOf(LlmUnavailable);
  });
});

describe('Groq listening', () => {
  const wav = wavOf(Buffer.alloc(16_000 * 2), 16_000); // one second of silence

  it('sends the recording as a multipart file with the chosen model and language', async () => {
    const used: any[] = []; let form!: FormData; let auth = '';
    const f = (async (url: string, init: RequestInit) => { expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions'); form = init.body as FormData; auth = (init.headers as Record<string, string>).Authorization; return json({ text: ' Main theek hoon. ' }); }) as unknown as typeof fetch;
    const stt = new GroqStt(() => KEY, u => used.push(u), () => 'whisper-large-v3-turbo', f);
    const r = await stt.transcribe({ wav, language: 'hinglish' });
    expect(r.text).toBe('Main theek hoon.');
    expect(auth).toBe(`Bearer ${KEY}`);
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('hi');
    expect(String(form.get('prompt'))).toMatch(/theek/); // a Roman-Hindi sample, so Whisper answers in English letters
    expect(used[0]).toMatchObject({ provider: 'groq', kind: 'stt', ok: true });
    expect(used[0].seconds).toBeCloseTo(1, 1);
  });

  it('drops the phrases Whisper invents out of silence', async () => {
    expect(isPhantom('Thank you.')).toBe(true);
    expect(isPhantom('  ')).toBe(true);
    expect(isPhantom('Thank you for being here')).toBe(false);
    const f = (async () => json({ text: 'Thank you.' })) as unknown as typeof fetch;
    expect((await new GroqStt(() => KEY, () => undefined, undefined, f).transcribe({ wav, language: 'en' })).text).toBe('');
  });

  it('does not charge for a failed call, and says so when the key is rejected', async () => {
    const used: any[] = [];
    const f = (async () => json({ error: { message: 'Invalid API Key' } }, 401)) as unknown as typeof fetch;
    await expect(new GroqStt(() => KEY, u => used.push(u), undefined, f).transcribe({ wav, language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    expect(used[0]).toMatchObject({ ok: false, seconds: 0 });
  });

  it('is offered for calls only while the key is saved and the portal says Groq', () => {
    let on = true; let key: string | undefined = KEY;
    const live = new GroqLiveStt(new GroqStt(() => key, () => undefined), () => on);
    expect(live.configured).toBe(true);
    on = false; expect(live.configured).toBe(false);
    on = true; key = undefined; expect(live.configured).toBe(false);
  });
});

describe('cutting a call into sentences', () => {
  const RATE = 16_000;
  const tone = (ms: number, amp: number) => { const n = Math.round((RATE * ms) / 1000); const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 6) * amp), i * 2); return b; };
  const feed = (seg: UtteranceSegmenter, pcm: Buffer) => { const ev: ReturnType<UtteranceSegmenter['push']> = []; for (let i = 0; i < pcm.length; i += 640) ev.push(...seg.push(pcm.subarray(i, i + 640))); return ev; };

  it('says speech started, then hands over the sentence after a pause', () => {
    const seg = new UtteranceSegmenter();
    const ev = feed(seg, Buffer.concat([tone(1000, 80), tone(900, 6000), tone(1200, 80)]));
    expect(ev.map(e => e.type)).toEqual(['start', 'end']);
    const end = ev.find(e => e.type === 'end') as { type: 'end'; pcm: Buffer; speechMs: number };
    expect(end.speechMs).toBeGreaterThan(700);
  });

  it('ignores a click or cough too short to be words', () => {
    const seg = new UtteranceSegmenter();
    const ev = feed(seg, Buffer.concat([tone(1000, 80), tone(200, 6000), tone(1200, 80)]));
    expect(ev.some(e => e.type === 'end')).toBe(false);
  });

  it('hands over what was said when the call ends mid-sentence', () => {
    const seg = new UtteranceSegmenter();
    const ev = [...feed(seg, Buffer.concat([tone(1000, 80), tone(900, 6000)])), ...seg.flush()];
    expect(ev.map(e => e.type)).toEqual(['start', 'end']);
  });
});

describe('Google voices', () => {
  const wavB64 = wavOf(Buffer.alloc(24_000 * 2), 24_000).toString('base64');
  const voice = 'google:en-in-wavenet-a';

  it('asks for 24 kHz PCM, puts the key in a header and never in the URL, and records characters', async () => {
    const used: TtsUsage[] = []; let seen: { url: string; headers: Record<string, string>; body: any } | undefined;
    const f = (async (url: string, init: RequestInit) => { seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }; return json({ audioContent: wavB64 }); }) as unknown as typeof fetch;
    const r = await new GoogleTts(() => 'AIzaFakeKeyFakeKeyFakeKeyFakeKey123', u => used.push(u), f).synthesize({ text: 'Hello there.', voice, language: 'en', pace: 0.9 });
    expect(seen!.url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(seen!.url).not.toContain('AIza');
    expect(seen!.headers['X-Goog-Api-Key']).toMatch(/^AIza/);
    expect(seen!.body.voice).toEqual({ languageCode: 'en-IN', name: 'en-IN-Wavenet-A' });
    expect(seen!.body.audioConfig).toMatchObject({ audioEncoding: 'LINEAR16', sampleRateHertz: 24_000, speakingRate: 0.9 });
    expect(r.sampleRate).toBe(24_000);
    expect(r.pcm.length).toBe(48_000);
    expect(used[0]).toEqual(expect.objectContaining({ provider: 'google', kind: 'tts', chars: 12, ok: true }));
  });

  it('keeps long Hindi text under Google’s byte limit', async () => {
    let body: any;
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(init.body as string); return json({ audioContent: wavB64 }); }) as unknown as typeof fetch;
    await new GoogleTts(() => 'k', () => undefined, f).synthesize({ text: 'नमस्ते '.repeat(900), voice: 'google:hi-in-wavenet-a', language: 'hi' });
    expect(Buffer.byteLength(body.input.text)).toBeLessThanOrEqual(4800);
  });

  it('explains a key whose project has not turned the API on, and a plainly wrong key', async () => {
    const off = (async () => json({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Cloud Text-to-Speech API has not been used in project 123 before or it is disabled.' } }, 403)) as unknown as typeof fetch;
    await expect(new GoogleTts(() => 'k', () => undefined, off).synthesize({ text: 'Hi', voice, language: 'en' })).rejects.toThrow(/isn’t enabled/);
    const bad = (async () => json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 400)) as unknown as typeof fetch;
    await expect(new GoogleTts(() => 'k', () => undefined, bad).synthesize({ text: 'Hi', voice, language: 'en' })).rejects.toThrow(/rejected the API key/);
  });

  it('refuses voices that are not Google’s, and speaks nothing without a key', async () => {
    await expect(new GoogleTts(() => 'k', () => undefined).synthesize({ text: 'Hi', voice: 'sarvam:priya', language: 'en' })).rejects.toBeInstanceOf(TtsFailure);
    await expect(new GoogleTts(() => undefined, () => undefined).synthesize({ text: 'Hi', voice, language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
  });

  it('takes the language code from the voice name', () => {
    expect(googleLangOf('hi-IN-Wavenet-B')).toBe('hi-IN');
    expect(googleLangOf('en-GB-Wavenet-A')).toBe('en-GB');
  });

  it('reports a real test synthesis for the portal', async () => {
    const ok = (async () => json({ audioContent: wavB64 })) as unknown as typeof fetch;
    expect(await testGoogleTts({ api_key: 'k' }, ok)).toMatchObject({ ok: true });
    const no = (async () => json({ error: { message: 'API key not valid.' } }, 400)) as unknown as typeof fetch;
    expect(await testGoogleTts({ api_key: 'k' }, no)).toMatchObject({ ok: false });
  });
});

describe('Groq connection test for the portal', () => {
  it('reports a rejected key, a model the key does not have, and a working setup', async () => {
    const rejected = (async () => json({ error: { message: 'Invalid API Key' } }, 401)) as unknown as typeof fetch;
    expect(await testGroq({ api_key: KEY }, rejected)).toMatchObject({ ok: false, note: expect.stringMatching(/rejected/) });
    const noModel = (async () => json({ data: [{ id: 'llama-3.3-70b-versatile' }] })) as unknown as typeof fetch;
    expect(await testGroq({ api_key: KEY }, noModel, { groqModel: 'openai/gpt-oss-20b' })).toMatchObject({ ok: false, note: expect.stringMatching(/isn’t on this key/) });
    const good = (async (url: string) => String(url).endsWith('/models') ? json({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'whisper-large-v3-turbo' }] }) : json({ choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }] })) as unknown as typeof fetch;
    expect(await testGroq({ api_key: KEY }, good, { groqModel: 'openai/gpt-oss-20b' })).toMatchObject({ ok: true });
  });
});

describe('choosing between voice vendors', () => {
  const fake = (name: string, configured: boolean): TtsProvider => ({ name, configured, synthesize: async () => ({ wav: Buffer.alloc(0), pcm: Buffer.alloc(0), sampleRate: 24_000 }), stream: async function* () { yield { audio: Buffer.from(name) }; } });

  it('sends each voice to the vendor that owns it, and says which vendors are connected', async () => {
    const r = new TtsRouter({ sarvam: fake('sarvam', true), google: fake('google', false) });
    expect(r.configured).toBe(true);
    expect(r.has('sarvam')).toBe(true);
    expect(r.has('google')).toBe(false);
    expect(vendorsOf(r)).toEqual({ sarvam: true, google: false });
    expect(canSpeak(r, 'sarvam:priya')).toBe(true);
    expect(canSpeak(r, 'google:en-in-wavenet-a')).toBe(false);
    expect(canSpeak(r, 'warm')).toBe(false); // the phone's own voices are never server voices
    await expect(r.synthesize({ text: 'Hi', voice: 'google:en-in-wavenet-a', language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
    const chunks: string[] = []; for await (const c of new TtsRouter({ sarvam: fake('sarvam', true), google: fake('google', true) }).stream({ text: 'Hi', voice: 'google:hi-in-wavenet-a', language: 'hi' })) chunks.push(c.audio.toString());
    expect(chunks).toEqual(['google']);
  });

  it('treats a single-vendor provider as Sarvam, as before', () => {
    expect(vendorsOf({ configured: true })).toEqual({ sarvam: true, google: false });
    expect(vendorsOf(null)).toEqual({ sarvam: false, google: false });
  });

  it('lists only the voices of connected vendors, by language, and always the phone’s own', () => {
    expect(voicesFor('en', { google: false, sarvam: false }).map(v => v.id)).toEqual(['warm', 'steady', 'bright']);
    const en = voicesFor('en', { google: true, sarvam: false });
    expect(en.filter(v => v.provider === 'google').length).toBeGreaterThanOrEqual(6);
    expect(en.some(v => v.provider === 'sarvam')).toBe(false);
    // Hindi voices speak Hindi only; English voices read Hinglish, which is written in English letters.
    expect(voicesFor('hi', { google: true }).filter(v => v.provider === 'google').every(v => v.speaker!.startsWith('hi-IN'))).toBe(true);
    expect(voicesFor('hinglish', { google: true }).filter(v => v.provider === 'google').every(v => v.speaker!.startsWith('en-IN'))).toBe(true);
  });

  it('gives every Google voice a unique id, a gender and a vendor name', () => {
    expect(new Set(GOOGLE_VOICES.map(v => v.id)).size).toBe(GOOGLE_VOICES.length);
    for (const v of GOOGLE_VOICES) { expect(v.id).toBe(`google:${v.speaker!.toLowerCase()}`); expect(v.gender).not.toBeNull(); expect(isServerVoice(v.id)).toBe(true); }
  });

  it('gives every server voice an id the database and the API contract accept', () => {
    for (const v of [...GOOGLE_VOICES, ...SARVAM_VOICES]) expect(Voice.safeParse(v.id).success, v.id).toBe(true);
  });

  it('keeps a Google voice the person chose when reading a story, instead of swapping to a Sarvam one', () => {
    const n = chooseNarration({ kind: 'sleep', mood: 'heavier', chosenVoice: 'google:en-in-wavenet-d' });
    expect(n.voice).toBe('google:en-in-wavenet-d');
  });

  it('dictation uses the first engine that has a key, so a missing key never leaves it silent', async () => {
    const mk = (name: string, configured: boolean): Transcriber => ({ name, configured, transcribe: async () => ({ text: name }) });
    const wav = wavOf(Buffer.alloc(320), 16_000);
    expect(await new TranscriberRouter(() => [mk('groq', true), mk('sarvam', true)]).transcribe({ wav, language: 'en' })).toEqual({ text: 'groq' });
    expect(await new TranscriberRouter(() => [mk('groq', false), mk('sarvam', true)]).transcribe({ wav, language: 'en' })).toEqual({ text: 'sarvam' });
    const none = new TranscriberRouter(() => [mk('groq', false), mk('sarvam', false)]);
    expect(none.configured).toBe(false);
    await expect(none.transcribe({ wav, language: 'en' })).rejects.toBeInstanceOf(TtsUnavailable);
  });
});
