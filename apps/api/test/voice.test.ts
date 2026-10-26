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
  spoken: string[] = [];
  async *stream(o: { text: string; signal?: AbortSignal }): AsyncIterable<TtsChunk> {
    this.spoken.push(o.text);
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

async function open(mode = 'voice') {
  const a = await signIn(t);
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
