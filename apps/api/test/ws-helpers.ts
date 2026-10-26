import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import type { ServerMsg } from '@saathi/contracts';
import type { TestApp } from './app-helpers.js';

export class Chat {
  msgs: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  closed = false;
  closeCode = 0;
  constructor(private ws: WebSocket) {
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString()) as ServerMsg;
      this.msgs.push(m);
      this.waiters = this.waiters.filter(w => (w.pred(m) ? (w.res(m), false) : true));
    });
    ws.on('close', code => { this.closed = true; this.closeCode = code; });
  }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }
  next(type: ServerMsg['type'] | ServerMsg['type'][], ms = 8000): Promise<ServerMsg> {
    const types = Array.isArray(type) ? type : [type];
    const have = this.msgs.find(m => types.includes(m.type));
    if (have) { this.msgs.splice(this.msgs.indexOf(have), 1); return Promise.resolve(have); }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout waiting for ${types.join('|')}; got ${this.msgs.map(m => m.type).join(',')}`)), ms);
      this.waiters.push({ pred: m => types.includes(m.type), res: m => { clearTimeout(t); const i = this.msgs.indexOf(m); if (i >= 0) this.msgs.splice(i, 1); res(m); } });
    });
  }
  /** Send a turn and collect everything up to `done`, `crisis`+`done`, or `error`. */
  async turn(text: string) {
    const start = this.msgs.length;
    this.send({ type: 'turn', text, clientId: 'c1' });
    const out: ServerMsg[] = [];
    for (;;) {
      const m = await new Promise<ServerMsg>((res, rej) => {
        const t = setTimeout(() => rej(new Error('turn timeout')), 10000);
        const check = () => {
          const i = this.msgs.findIndex((_, idx) => idx >= 0);
          if (i >= 0) { clearTimeout(t); res(this.msgs.shift()!); } else setTimeout(check, 5);
        };
        check();
      });
      out.push(m);
      if (m.type === 'done' || m.type === 'error' || m.type === 'minor') break;
    }
    void start;
    return out;
  }
  close() { this.ws.close(); }
}

export async function listen(t: TestApp) {
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  return (t.app.server.address() as AddressInfo).port;
}

export async function connect(port: number, conversationId: string, accessToken: string): Promise<{ chat: Chat; ready: ServerMsg }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/conversations/${conversationId}/stream`);
  const chat = new Chat(ws);
  await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
  chat.send({ type: 'auth', token: accessToken });
  const ready = await chat.next(['ready', 'error']);
  return { chat, ready };
}
