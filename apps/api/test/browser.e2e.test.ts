/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { SarvamStt, SarvamTts } from '../src/providers/sarvam.js';
import { recordSttUsage, recordTtsUsage } from '../src/providers/index.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';
import { adminLogin } from './admin-helpers.js';
import { listen } from './ws-helpers.js';
import { addInboxCard } from '../src/services/notifier.js';
import { LlmUnavailable } from '../src/providers/llm.js';
import { withSystem } from '../src/db/pool.js';

// The real app, built the way production builds it, served by the real API, driven in a real browser. These catch what
// unit tests cannot: the wiring between the screens, the socket, the origin rules, the audio and the speech engines.
// The browser's speech recognition and the voice vendor are the only stand-ins (a scripted recogniser; a fake Sarvam).

let t: TestApp;
let browser: Browser | null = null;
let base = '';
const calls: { speaker: string; pace: number; text: string; lang: string }[] = [];
const heard: { bytes: number; fields: Record<string, string> }[] = [];
let sttReply: () => Response = () => new Response(JSON.stringify({ transcript: 'Work was a lot today and I did not say anything.' }), { headers: { 'content-type': 'application/json' } });

function wav(seconds = 0.25, rate = 24_000) {
  const n = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  b.writeInt16LE(8000, 44);
  return b;
}

// A scripted stand-in for the browser's speech recognition that behaves like Chrome's: results accumulate within a
// listening session, a session can end on its own after a pause, and stop() delivers what is still in flight.
const FAKE_SPEECH = () => {
  const w = window as any;
  w.__active = null;
  class FakeSR {
    results: any[] = []; pending: string | null = null; onresult: any; onend: any; onerror: any;
    start() { w.__active = this; }
    stop() { if (this.pending) { this.emit(this.pending, true); this.pending = null; } setTimeout(() => { this.onend?.(); if (w.__active === this) w.__active = null; }, 30); }
    abort() { this.stop(); }
    emit(text: string, final: boolean) {
      const r: any = [{ transcript: text }]; r.isFinal = final;
      if (final) this.results.push(r);
      const list: any = final ? this.results.slice() : this.results.concat([r]);
      list.item = (i: number) => list[i];
      this.onresult?.({ resultIndex: 0, results: list });
    }
  }
  w.SpeechRecognition = FakeSR; w.webkitSpeechRecognition = FakeSR;
  w.__phrase = (text: string, final = true) => { const a = w.__active; if (!a) return false; a.emit(text, false); a.pending = text; if (final) { a.emit(text, true); a.pending = null; } return true; };
  w.__lang = () => w.__active?.lang;
  w.__browserEnds = () => { const a = w.__active; if (!a) return false; w.__active = null; a.onend?.(); return true; };
  // Record what the phone's own voice is asked to say, and how.
  w.__spoken = [];
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { w.__spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch }); setTimeout(() => (u.onend as any)?.(new Event('end')), 50); void speak; };
};

async function visit(user: Auth, o: { speech?: boolean } = {}): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser!.newContext({ viewport: { width: 420, height: 880 }, permissions: ['microphone'] });
  await ctx.addInitScript(rt => { try { localStorage.setItem('saathi.rt', rt); } catch { /* storage blocked */ } }, user.refreshToken);
  if (o.speech !== false) await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.locator('[data-track="nav.talk"]').click();
  await page.getByText('Voice call').first().waitFor();
  return { page, close: () => ctx.close() };
}

async function person(over: { mood?: number } = {}) {
  const a = await signIn(t);
  await t.app.inject({ method: 'PUT', url: '/me/consent', headers: a.headers, payload: { remember: true } });
  await t.app.inject({ method: 'PATCH', url: '/me', headers: a.headers, payload: { onboarded: true } });
  if (over.mood !== undefined) await t.app.inject({ method: 'POST', url: '/mood', headers: a.headers, payload: { value: over.mood } });
  return a;
}

let connected = false;
/** Adds the speech vendor's key through the portal, once. Tests that need natural voices or server dictation call this first. */
async function connectSarvam() {
  if (connected) return;
  const admin = await adminLogin(t, 'owner');
  expect((await t.app.inject({ method: 'PUT', url: '/admin/api/integrations/sarvam/api_key', headers: admin.headers, payload: { value: 'sarvam-key-1234567890' } })).statusCode).toBe(200);
  connected = true;
}

let skip = false;
beforeAll(async () => {
  const web = mkdtempSync(join(tmpdir(), 'saathi-web-'));
  execFileSync('npx', ['vite', 'build', '--outDir', web, '--emptyOutDir', '--logLevel', 'error'], { cwd: resolve(__dirname, '../../web'), env: { ...process.env, VITE_API_URL: '' } });
  // The production setting: the app is served by the API itself, while WEB_ORIGINS names a different (Netlify) site.
  t = await makeApp({ STATIC_WEB_DIR: web, WEB_ORIGINS: 'https://saathi-app.example.netlify.app' });
  const port = await listen(t);
  base = `http://127.0.0.1:${port}`;
  t.ctx.tts = new SarvamTts(() => t.ctx.rt.secrets.get('sarvam', 'api_key'), recordTtsUsage(t.ctx.db, t.ctx.log, t.ctx.rt), (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(init.body as string);
    calls.push({ speaker: b.speaker, pace: b.pace, text: b.text, lang: b.target_language_code });
    return new Response(JSON.stringify({ audios: [wav().toString('base64')] }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch);
  t.ctx.transcriber = new SarvamStt(() => t.ctx.rt.secrets.get('sarvam', 'api_key'), recordSttUsage(t.ctx.db, t.ctx.log, t.ctx.rt), (async (_u: string, init: RequestInit) => {
    const form = init.body as FormData; const fields: Record<string, string> = {}; let bytes = 0;
    for (const [k, v] of (form as unknown as { entries(): Iterable<[string, string | Blob]> }).entries()) { if (typeof v === 'string') fields[k] = v; else bytes = v.size; }
    heard.push({ bytes, fields });
    return sttReply();
  }) as unknown as typeof fetch);
  try { browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }); } catch { skip = true; }
}, 120_000);
afterAll(async () => { await browser?.close(); await t.app.close(); });

const run = (name: string, fn: () => Promise<void>) => it(name, async ctx => { if (skip) return ctx.skip(); await fn(); }, 60_000);

describe('voice call', () => {
  run('connects from the app served by the API even when WEB_ORIGINS names another site, and holds a turn', async () => {
    const { page, close } = await visit(await person());
    await page.getByText('Voice call').first().click();
    await page.getByRole('button', { name: /Allow|Use microphone|Yes/i }).first().click();
    await page.getByText('Listening', { exact: true }).waitFor({ timeout: 10_000 });
    expect(await page.getByText('Not connected').count()).toBe(0);
    // The person speaks; the companion answers with captions.
    await page.waitForFunction(() => (window as any).__active);
    await page.evaluate(() => (window as any).__phrase('I am a bit tired today'));
    await page.getByText(/What part is sitting with you most/).first().waitFor({ timeout: 10_000 }); // captions show the latest sentence
    await close();
  });

  run('text chat works over the same socket', async () => {
    const { page, close } = await visit(await person());
    await page.getByText('Text', { exact: true }).first().click();
    const box = page.getByRole('textbox').first();
    await box.fill('work was heavy today');
    await box.press('Enter');
    await page.getByText(/That sounds like a lot to carry/).first().waitFor({ timeout: 10_000 });
    await close();
  });
});

describe('when the model is down', () => {
  run('the call says so out loud instead of going silent, and the portal’s error log records the vendor’s reason', async () => {
    const { page, close } = await visit(await person());
    await page.getByText('Voice call').first().click();
    await page.getByRole('button', { name: /Allow|Use microphone|Yes/i }).first().click();
    await page.getByText('Listening', { exact: true }).waitFor();
    t.llm.reply = () => { throw new LlmUnavailable('OpenRouter says this key can’t pay for that model (Insufficient credits).'); };
    await page.waitForFunction(() => (window as any).__active);
    await page.evaluate(() => (window as any).__phrase('hello, can you hear me'));
    await page.getByText(/Something on my side isn.t connected/).first().waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => (window as any).__spoken.some((x: any) => /isn.t connected/.test(x.text)), null, { timeout: 10_000 });
    t.llm.reply = null;
    await expect.poll(async () => (await withSystem(t.ctx.db, tx => tx.query(`SELECT message FROM error_log WHERE code = 'llm_unavailable' AND route = 'llm/companion'`))).rows[0]?.message ?? '', { timeout: 5000 }).toContain('Insufficient credits');
    await close();
  });
});

describe('journal: talk it out', () => {
  run('keeps every word across pauses, restarts and a stop in the middle of a phrase', async () => {
    const { page, close } = await visit(await person());
    await page.getByText('Talk it out').first().click();
    await page.getByRole('button', { name: /Tap to start talking/ }).click();
    const say = async (text: string, final = true) => { await page.waitForFunction(() => (window as any).__active); expect(await page.evaluate(([x, f]) => (window as any).__phrase(x, f), [text, final] as const)).toBe(true); await page.waitForTimeout(40); };
    await say('Work was a lot today');
    await say('my manager moved the deadline again');
    expect(await page.evaluate(() => (window as any).__browserEnds())).toBe(true); // the browser stops listening on its own
    await page.waitForTimeout(400);
    await say('and I did not say anything');
    await say('I keep thinking', false); // still being recognised when the person taps stop
    await page.getByRole('button', { name: /Listening/ }).click();
    await page.waitForTimeout(400);
    const text = await page.getByRole('textbox', { name: 'Journal entry' }).inputValue();
    expect(text.trim()).toBe('Work was a lot today my manager moved the deadline again and I did not say anything I keep thinking');
    await close();
  });
});

describe('journal: language', () => {
  run('listens for English by default, and for Hindi when the person says they are speaking Hindi', async () => {
    const { page, close } = await visit(await person());
    await page.getByText('Talk it out').first().click();
    await page.getByRole('button', { name: /Tap to start talking/ }).click();
    await page.waitForFunction(() => (window as any).__active);
    expect(await page.evaluate(() => (window as any).__lang())).toBe('en-IN');
    await page.getByRole('button', { name: /Listening/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole('group', { name: 'Language you’re speaking' }).getByRole('button', { name: 'हिन्दी' }).click();
    await page.getByRole('button', { name: /Tap to start talking/ }).click();
    await page.waitForFunction(() => (window as any).__active);
    expect(await page.evaluate(() => (window as any).__lang())).toBe('hi-IN');
    await close();
  });
});

describe('calm narration', () => {
  run('without a server voice, the phone’s own voice reads at the pace worked out for the mood, in a natural pitch', async () => {
    const { page, close } = await visit(await person({ mood: 0 }));
    await page.getByText('Meditate and sleep').first().click();
    await page.getByText('Sleep', { exact: true }).first().click();
    await page.getByText('Monsoon on the hills').first().click();
    await page.waitForFunction(() => (window as any).__spoken.length > 0, null, { timeout: 10_000 });
    const first = await page.evaluate(() => (window as any).__spoken[0]);
    expect(first.text).toMatch(/small town in the hills/);
    expect(first.pitch).toBe(1);
    expect(first.rate).toBeGreaterThanOrEqual(0.65);
    expect(first.rate).toBeLessThanOrEqual(0.8); // a heavy week, at bedtime: the slowest reading
    expect(await page.getByRole('dialog').getByText(/Narrated by Saathi/).count()).toBe(1);
    await close();
  });

  it('connects the voice service for the next tests', async () => { await connectSarvam(); });

  run('reads a session in a natural server voice, and the voice and pace follow the person’s mood', async () => {
    const heavy = await visit(await person({ mood: 0 }));
    calls.length = 0;
    await heavy.page.getByText('Meditate and sleep').first().click();
    await heavy.page.getByText('Kindness for yourself').first().click();
    await heavy.page.getByRole('dialog').getByText(/Narrated by [A-Z][a-z]+$/).waitFor({ timeout: 10_000 });
    await heavy.page.waitForFunction(() => document.querySelector('[aria-live="polite"]')?.textContent?.includes('kind to you'), null, { timeout: 10_000 });
    await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const h = calls[0];
    expect(h.lang).toBe('en-IN');
    expect(h.pace).toBeLessThan(0.88);
    expect(calls.slice(0, 3).every(c => c.speaker === h.speaker)).toBe(true);
    // The phone's own voice was not used while a natural voice was available.
    expect(await heavy.page.evaluate(() => (window as any).__spoken.length)).toBe(0);
    await heavy.close();

    const light = await visit(await person({ mood: 4 }));
    calls.length = 0;
    await light.page.getByText('Meditate and sleep').first().click();
    await light.page.getByText('Kindness for yourself').first().click();
    await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(calls[0].speaker).not.toBe(h.speaker);
    expect(calls[0].pace).toBeGreaterThan(h.pace);
    await light.close();
  });

  run('a story written for tonight is read aloud the same way', async () => {
    const { page, close } = await visit(await person({ mood: 1 }));
    calls.length = 0;
    await page.getByText('Meditate and sleep').first().click();
    await page.getByText('Sleep', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Rain', exact: true }).click();
    await page.getByRole('dialog').waitFor({ timeout: 10_000 });
    await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(calls[0].pace).toBeLessThan(0.8);
    await close();
  });
});

describe('journal dictation through the speech service', () => {
  it('connects the speech service', async () => { await connectSarvam(); });

  run('records without gaps and writes down what the speech service hears, including the last piece after tapping stop', async () => {
    const { page, close } = await visit(await person());
    heard.length = 0;
    await page.getByText('Talk it out').first().click();
    await page.getByRole('button', { name: /Tap to start talking/ }).click();
    await page.getByRole('button', { name: /Listening/ }).waitFor();
    await page.waitForTimeout(3500);                  // the fake microphone plays a tone
    await page.getByRole('button', { name: /Listening/ }).click(); // stop: the piece in progress is still sent
    await expect.poll(async () => page.getByRole('textbox', { name: 'Journal entry' }).inputValue(), { timeout: 10_000 }).toContain('Work was a lot today and I did not say anything.');
    expect(heard.length).toBeGreaterThanOrEqual(1);
    expect(heard[0].bytes).toBeGreaterThan(80_000);   // about three seconds of 16 kHz audio
    expect(heard[0].fields).toMatchObject({ language_code: 'en-IN' });
    expect(await page.evaluate(() => (window as any).__active)).toBeNull(); // the browser recogniser was not used
    await close();
  });

  run('saving right after stop waits for the last words', async () => {
    const me = await person();
    const { page, close } = await visit(me);
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const was = t.ctx.transcriber!;
    t.ctx.transcriber = { name: 'slow', configured: true, transcribe: async o => { await gate; return was.transcribe(o); } };
    try {
      await page.getByText('Talk it out').first().click();
      await page.getByRole('button', { name: /Tap to start talking/ }).click();
      await page.getByRole('button', { name: /Listening/ }).waitFor();
      await page.waitForTimeout(3000);
      await page.getByRole('button', { name: /Listening/ }).click();
      await page.getByText('Writing down the last bit…').waitFor();
      const save = page.getByRole('button', { name: /Save|Done|Keep/ }).first().click();
      await page.waitForTimeout(300);
      release();
      await save;
      await expect.poll(async () => (await t.app.inject({ method: 'GET', url: '/journal', headers: me.headers })).json().items[0]?.text ?? '', { timeout: 10_000 }).toContain('Work was a lot today and I did not say anything.');
    } finally { t.ctx.transcriber = was; release(); }
    await close();
  });

  run('if the speech service refuses, the browser’s recogniser takes over and the person is told', async () => {
    const was = sttReply;
    sttReply = () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 403, headers: { 'content-type': 'application/json' } });
    const { page, close } = await visit(await person());
    try {
      await page.getByText('Talk it out').first().click();
      await page.getByRole('button', { name: /Tap to start talking/ }).click();
      await page.getByText(/Switched to your browser.s dictation/).first().waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => (window as any).__active, null, { timeout: 5000 });
      await page.evaluate(() => (window as any).__phrase('and then I kept talking'));
      await expect.poll(async () => page.getByRole('textbox', { name: 'Journal entry' }).inputValue(), { timeout: 5000 }).toContain('and then I kept talking');
    } finally { sttReply = was; }
    await close();
  });
});

describe('voice call with a natural voice', () => {
  run('the companion’s sentences are spoken by the server voice and arrive as audio', async () => {
    const a = await person();
    expect((await t.app.inject({ method: 'PUT', url: '/me/companion', headers: a.headers, payload: { voice: 'sarvam:priya' } })).statusCode).toBe(200);
    const { page, close } = await visit(a);
    let audioFrames = 0;
    page.on('websocket', ws => ws.on('framereceived', f => { if (typeof f.payload !== 'string') audioFrames++; }));
    calls.length = 0;
    await page.locator('[data-track="nav.talk"]').click();
    await page.getByText('Voice call').first().click();
    const allow = page.getByRole('button', { name: /Allow|Use microphone|Yes/i }).first();
    if (await allow.isVisible().catch(() => false)) await allow.click();
    await page.getByText('Listening', { exact: true }).waitFor();
    await page.waitForFunction(() => (window as any).__active);
    await page.evaluate(() => (window as any).__phrase('I am a bit tired today'));
    await expect.poll(() => calls.map(c => c.text).join(' '), { timeout: 10_000 }).toContain('That sounds like a lot to carry');
    expect(calls.every(c => c.speaker === 'priya')).toBe(true);
    expect(calls[0].pace).toBeGreaterThan(0.5);
    await expect.poll(() => audioFrames, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).__spoken.length)).toBe(0); // the phone's voice stayed quiet
    await close();
  });
});

describe('every screen and flow, with no errors on the way', () => {
  run('tabs, calls, sit, breathe, check-in, walk, journal, calm, voices', async () => {
    const user = await person();
    expect(await addInboxCard(t.ctx, user.userId, 'checkin', new Date())).toBe(true);
    const { page, close } = await visit(user);
    page.setDefaultTimeout(8000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
    const nav = (k: string) => page.locator(`[data-track="nav.${k}"]`).click();
    const dismiss = async () => { for (const n of ['Skip', 'Back to Today', 'Done']) { const b = page.getByRole('button', { name: n, exact: true }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } } };
    const allow = async () => { const b = page.getByRole('button', { name: /Allow|Use microphone|Yes/i }).first(); if (await b.isVisible().catch(() => false)) await b.click(); };

    await nav('outside'); await page.getByText('Walk with me').first().waitFor();
    await nav('journal'); await page.getByText('Recent entries').waitFor();
    await nav('you'); await page.getByText('What Saathi remembers').waitFor();

    // Video call
    await nav('talk'); await page.getByText('Video call').first().click(); await allow();
    await page.getByText('Listening', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'End' }).first().click(); await dismiss();

    // Just sit with me
    await nav('talk'); await page.getByText('Just sit with me').first().click();
    await page.getByText('Here with you. No need to talk.').waitFor();
    await page.getByRole('button', { name: 'End' }).first().click(); await dismiss();

    // Breathe
    await nav('talk'); await page.getByText('Breathe', { exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Breathe with me' }).waitFor();
    await page.getByRole('button', { name: /I.m done/ }).click();

    // Check-in from the card, which the companion opens
    await nav('today'); await page.getByRole('button', { name: 'Check in', exact: true }).click(); await allow();
    await page.getByText('Listening', { exact: true }).waitFor();
    await page.waitForFunction(() => document.body.innerText.includes('What part is sitting with you most'));
    await page.getByRole('button', { name: 'End' }).first().click(); await dismiss();

    // Walk with me
    await nav('outside'); await page.getByText('Walk with me').first().click();
    await page.getByRole('button', { name: 'End walk' }).waitFor();
    await page.getByRole('button', { name: 'End walk' }).click(); await page.waitForTimeout(500); await dismiss();

    // Journal: write, let Saathi read it, save
    await nav('journal'); await page.getByText('Write', { exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Journal entry' }).fill('Today was a good walk and I felt lighter.');
    await page.getByRole('button', { name: /Save|Done|Keep/ }).first().click();
    await page.getByText('What I noticed').waitFor();
    await page.getByRole('button', { name: 'Close' }).click();

    // Calm: sounds and a story
    await nav('talk'); await page.getByText('Meditate and sleep').first().click();
    await page.getByText('Sounds', { exact: true }).first().click();
    await page.getByText('Rain on a tin roof').first().click();
    await page.getByText('Playing · tap to stop').waitFor();
    await page.getByText('Sleep', { exact: true }).first().click();
    await page.getByRole('group', { name: 'Story place' }).getByRole('button', { name: 'Garden' }).click();
    await page.getByRole('dialog').waitFor();

    // Avatar and voice
    await page.getByRole('button', { name: 'Close player' }).click();
    await nav('you'); await page.getByText('Avatar and voice').first().click();
    await page.getByRole('radiogroup', { name: 'Voice' }).waitFor();
    await close();
    expect(errors).toEqual([]);
  });
});
