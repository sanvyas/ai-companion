import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import type { SttProvider, SttSession, TtsChunk, TtsProvider } from '../src/providers/voice.js';
import { makeApp, signIn, type TestApp } from './app-helpers.js';

// Fake vendors: prove the pipeline end to end without any real speech service.
class FakeStt implements SttProvider {
  name = 'fake';
  opened = 0;
  async open(): Promise<SttSession> {
    this.opened++;
    let frames = 0;
    let cbT: (t: { text: string; final: boolean }) => void = () => undefined;
    return {
      write: () => { frames++; if (frames === 2) cbT({ text: 'I feel lone', final: false }); if (frames === 3) cbT({ text: 'I feel lonely tonight', final: true }); },
      end: () => undefined,
      onTranscript: cb => { cbT = cb; },
      onError: () => undefined,
    };
  }
}
class FakeTts implements TtsProvider {
  name = 'fake';
  configured = true;
  spoken: string[] = [];
  fail = false;
  /** Time one sentence takes to make, before its first sound. */
  makeMs = 0;
  async synthesize(): Promise<{ wav: Buffer; pcm: Buffer; sampleRate: number }> { return { wav: Buffer.alloc(0), pcm: Buffer.alloc(0), sampleRate: 24000 }; }
  async *stream(o: { text: string; signal?: AbortSignal }): AsyncIterable<TtsChunk> {
    this.spoken.push(o.text);
    if (this.fail) throw new Error('vendor down');
    if (this.makeMs) await new Promise(r => setTimeout(r, this.makeMs));
    for (let i = 0; i < 3; i++) {
      if (o.signal?.aborted) return;
      await new Promise(r => setTimeout(r, 15));
      yield { audio: Buffer.alloc(480, i + 1), visemes: i === 0 ? [{ t: 0, v: 'aa' }] : undefined };
    }
  }
}

let t: TestApp;
let port: number;
const stt = new FakeStt();
const tts = new FakeTts();
beforeAll(async () => {
  t = await makeApp();
  t.ctx.stt = stt;
  t.ctx.tts = tts;
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  port = (t.app.server.address() as AddressInfo).port;
});
afterAll(async () => { await t.app.close(); });

async function open(mode = 'voice', pickServerVoice = true) {
  const a = await signIn(t);
  // Server speech is used only for someone who picked one of the server's voices.
  if (pickServerVoice) await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'sarvam:priya' } });
  const c = (await t.app.inject({ method: 'POST', url: '/conversations', headers: a.headers, payload: { mode } })).json();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/conversations/${c.id}/stream`);
  const events: { json?: Record<string, unknown>; bin?: Buffer }[] = [];
  ws.on('message', (raw, isBin) => events.push(isBin ? { bin: raw as Buffer } : { json: JSON.parse(raw.toString()) }));
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'auth', token: a.accessToken }));
  const until = async (pred: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + JSON.stringify(events.map(e => e.json?.type ?? 'bin'))); await new Promise(r => setTimeout(r, 10)); } };
  await until(() => events.some(e => e.json?.type === 'ready'));
  return { ws, events, until, a, id: c.id as string };
}

describe('server voice pipeline', () => {
  it('announces which voice capabilities exist', async () => {
    const { ws, events } = await open();
    const ready = events.find(e => e.json?.type === 'ready')!.json!;
    expect(ready.voice).toEqual({ serverStt: true, serverTts: true });
    ws.close();
  });

  it('audio in -> transcript -> safety + model -> sentences -> audio out', async () => {
    const { ws, events, until } = await open();
    ws.send(JSON.stringify({ type: 'voice_start', language: 'en-IN' }));
    await new Promise(r => setTimeout(r, 30));
    for (let i = 0; i < 3; i++) ws.send(Buffer.alloc(640), { binary: true });
    await until(() => events.some(e => e.json?.type === 'done'));
    const types = events.map(e => e.json?.type ?? 'bin');
    expect(types).toContain('transcript');
    expect(events.filter(e => e.json?.type === 'transcript').map(e => e.json!.final)).toEqual([false, true]);
    expect(events.find(e => e.json?.type === 'ack')!.json!.riskLevel).toBe(1); // "lonely"
    expect(types.indexOf('audio_start')).toBeGreaterThan(types.indexOf('sentence'));
    await until(() => events.filter(e => e.json?.type === 'audio_end').length >= 2);
    expect(events.filter(e => e.bin).length).toBeGreaterThanOrEqual(6);
    expect(events.find(e => e.json?.type === 'visemes')).toBeTruthy();
    expect(tts.spoken.join(' ')).toContain('That sounds like a lot to carry.');
    ws.close();
  });

  it('hands the words back to the app when the server voice fails, so the phone can say them', async () => {
    const { ws, events, until } = await open();
    tts.fail = true;
    t.llm.reply = () => 'I am right here with you.';
    try {
      ws.send(JSON.stringify({ type: 'turn', text: 'hello there' }));
      await until(() => events.some(e => e.json?.type === 'error' && e.json?.code === 'tts_failed'));
      expect(events.find(e => e.json?.code === 'tts_failed')!.json!.message).toBe('I am right here with you.');
    } finally { tts.fail = false; t.llm.reply = null; ws.close(); }
  });

  it('does not use the server voice in text chat, or for someone who chose a phone voice', async () => {
    const text = await open('text');
    expect(text.events.find(e => e.json?.type === 'ready')!.json!.voice).toEqual({ serverStt: true, serverTts: false });
    text.ws.close();
    const phone = await open('voice', false);
    expect(phone.events.find(e => e.json?.type === 'ready')!.json!.voice).toEqual({ serverStt: true, serverTts: false });
    tts.spoken.length = 0;
    phone.ws.send(JSON.stringify({ type: 'turn', text: 'hello again' }));
    await phone.until(() => phone.events.some(e => e.json?.type === 'done'));
    expect(tts.spoken).toEqual([]);
    phone.ws.close();
  });

  it('the fixed crisis script is spoken aloud, and no model sentence is generated', async () => {
    const { ws, events, until } = await open();
    tts.spoken.length = 0;
    ws.send(JSON.stringify({ type: 'turn', text: 'I have a plan for tonight', source: 'voice' }));
    await until(() => events.some(e => e.json?.type === 'crisis'));
    expect(events.some(e => e.json?.type === 'sentence')).toBe(false);
    await until(() => events.some(e => e.json?.type === 'audio_end'));
    expect(tts.spoken.join(' ')).toContain('14416');
    ws.close();
  });

  it('barge-in stops speech quickly and the next reply is spoken normally', async () => {
    const { ws, events, until } = await open();
    tts.spoken.length = 0;
    t.llm.reply = () => 'First sentence here. Second sentence here. Third sentence here.';
    ws.send(JSON.stringify({ type: 'turn', text: 'tell me something' }));
    await until(() => events.some(e => e.json?.type === 'audio_start'));
    const t0 = Date.now();
    ws.send(JSON.stringify({ type: 'interrupt' }));
    await until(() => events.filter(e => e.json?.type === 'audio_end').length >= 1);
    expect(Date.now() - t0).toBeLessThan(200);
    const before = events.filter(e => e.bin).length;
    await new Promise(r => setTimeout(r, 150));
    expect(events.filter(e => e.bin).length - before).toBeLessThanOrEqual(1);

    t.llm.reply = () => 'A fresh reply.';
    events.length = 0;
    ws.send(JSON.stringify({ type: 'turn', text: 'okay again' }));
    await until(() => events.filter(e => e.bin).length >= 3);
    expect(tts.spoken.at(-1)).toBe('A fresh reply.');
    t.llm.reply = null;
    ws.close();
  });

  it('refuses voice_start cleanly when no STT vendor is connected', async () => {
    const off = await makeApp();
    await off.app.listen({ port: 0, host: '127.0.0.1' });
    const p = (off.app.server.address() as AddressInfo).port;
    const a = await signIn(off);
    const c = (await off.app.inject({ method: 'POST', url: '/conversations', headers: a.headers, payload: { mode: 'voice' } })).json();
    const ws = new WebSocket(`ws://127.0.0.1:${p}/conversations/${c.id}/stream`);
    const got: Record<string, unknown>[] = [];
    ws.on('message', raw => got.push(JSON.parse(raw.toString())));
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: a.accessToken }));
    await new Promise(r => setTimeout(r, 200));
    expect(got.find(m => m.type === 'ready')!.voice).toEqual({ serverStt: false, serverTts: false });
    ws.send(JSON.stringify({ type: 'voice_start' }));
    await new Promise(r => setTimeout(r, 200));
    expect(got.find(m => m.type === 'error')).toMatchObject({ code: 'stt_unavailable' });
    ws.close();
    await off.app.close();
  });
});

describe('how fast a spoken reply starts', () => {
  it('makes later sentences while the earlier ones are still being sent, so a three-sentence reply is not three waits', async () => {
    const { ws, events, until } = await open();
    tts.makeMs = 300;
    t.llm.reply = () => 'I hear you. That sounds heavy. Tell me more when you are ready.';
    try {
      const t0 = Date.now();
      ws.send(JSON.stringify({ type: 'turn', text: 'hello there' }));
      await until(() => events.filter(e => e.json?.type === 'audio_end').length >= 3);
      const took = Date.now() - t0;
      // One after the other it would be 3 x 300 ms of making plus the model and the checks; in parallel it is about one.
      expect(took).toBeLessThan(900);
      const order = events.filter(e => e.json?.type === 'audio_start').map(e => e.json!.index);
      expect([...order].sort()).toEqual(order); // and still strictly in order
    } finally { tts.makeMs = 0; t.llm.reply = null; ws.close(); }
  });

  it('reports where the time went with every reply, and keeps the numbers for the portal', async () => {
    const { ws, events, until, a } = await open();
    ws.send(JSON.stringify({ type: 'turn', text: 'I had a long day' }));
    await until(() => events.some(e => e.json?.type === 'done'));
    const timing = events.find(e => e.json?.type === 'done')!.json!.timing as Record<string, number>;
    expect(timing.firstSentenceMs).toBeGreaterThanOrEqual(0);
    expect(timing.totalMs).toBeGreaterThanOrEqual(timing.firstSentenceMs);
    expect(timing.classifierMs).toBeGreaterThanOrEqual(0);
    expect(timing.contextMs).toBeGreaterThanOrEqual(0);
    // what the phone saw, sent back
    ws.send(JSON.stringify({ type: 'latency', endpointMs: 1400, replyMs: 2100 }));
    const { withSystem } = await import('../src/db/pool.js');
    for (let i = 0; i < 40; i++) {
      const r = (await withSystem(t.ctx.db, tx => tx.query(`SELECT kind, latency_ms, units FROM usage_events WHERE user_id = $1 AND kind IN ('turn','client_turn')`, [a.userId]))).rows;
      if (r.some(x => x.kind === 'turn') && r.some(x => x.kind === 'client_turn')) {
        expect(r.find(x => x.kind === 'client_turn')).toMatchObject({ latency_ms: 2100, units: 1400 });
        ws.close();
        const card = (await (await import('../src/admin/routes/overview.js')).systemCards(t.ctx)).find(c => c.name === 'Reply speed')!;
        expect(card.detail).toContain('First words after');
        expect(card.detail).toContain('the phone waited');
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('timings were not recorded');
  });
});
