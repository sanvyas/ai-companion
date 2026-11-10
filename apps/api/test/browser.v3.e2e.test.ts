/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { withSystem } from '../src/db/pool.js';
import { makeApp, newPhone, signIn, type Auth, type TestApp } from './app-helpers.js';
import { listen } from './ws-helpers.js';

// The third design, built the way production builds it, served by the real API and driven in a real browser. It checks what the unit tests
// cannot: that the screens are wired to the server (what a person does grows the garden there), that nothing errors on the way, and that
// every screen passes an accessibility scan.

let t: TestApp;
let browser: Browser | null = null;
let base = '';
let skip = false;
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

beforeAll(async () => {
  const web = mkdtempSync(join(tmpdir(), 'saathi-web3-'));
  execFileSync('npx', ['vite', 'build', '--outDir', web, '--emptyOutDir', '--logLevel', 'error'], { cwd: resolve(__dirname, '../../web'), env: { ...process.env, VITE_API_URL: '' } });
  t = await makeApp({ STATIC_WEB_DIR: web });
  base = `http://127.0.0.1:${await listen(t)}`;
  try { browser = await chromium.launch(); } catch { skip = true; }
}, 120_000);
afterAll(async () => { await browser?.close(); await t.app.close(); });

const run = (name: string, fn: () => Promise<void>) => it(name, async ctx => { if (skip) return ctx.skip(); await fn(); }, 120_000);

async function person(): Promise<Auth> {
  const a = await signIn(t);
  await t.app.inject({ method: 'PUT', url: '/me/consent', headers: a.headers, payload: { remember: true } });
  await t.app.inject({ method: 'PATCH', url: '/me', headers: a.headers, payload: { onboarded: true } });
  return a;
}
const get = async (user: Auth, url: string) => (await t.app.inject({ method: 'GET', url, headers: user.headers })).json();

async function open(user: Auth | null, query = '?ui=3', asked: number | null = null): Promise<{ page: Page; ctx: BrowserContext; errors: string[] }> {
  const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([rt, at]) => { try { if (rt) localStorage.setItem('saathi.rt', String(rt)); localStorage.setItem('saathi.v2.tour', '1'); if (at !== null) localStorage.setItem('saathi.v3.asked', String(at)); } catch { /* blocked */ } }, [user?.refreshToken ?? '', asked] as const);
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  await page.goto(base + query);
  return { page, ctx, errors };
}

/** Serious and critical problems only, with a name for where they were found. */
async function scan(page: Page, where: string): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => {
    type Node = { target: string[]; any: { data?: { contrastRatio?: number; fgColor?: string; bgColor?: string } }[] };
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: Node[] }[] }> } }).axe;
    // Let any screen that is still sliding in or fading settle first, so colours are measured as a person sees them.
    await new Promise(r => setTimeout(r, 900));
    // The little nudge banner comes and goes by itself; measure the screen, not the banner mid-fade.
    for (let i = 0; i < 60 && document.querySelector('[data-banner]'); i++) await new Promise(r => setTimeout(r, 250));
    const r = await axe.run(document, { resultTypes: ['violations'] });
    const why = (n: Node) => { const d = n.any[0]?.data; return d?.contrastRatio ? ` (${d.contrastRatio}:1 ${d.fgColor} on ${d.bgColor})` : ''; };
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ') + why(n)).join(' | ')}`);
  });
  return res.map(r => `${where} -> ${r}`);
}

describe('the third design', () => {
  run('looks after a day: mood, home, breathe, journal, play and talk all land on the server, and the month shows them', async () => {
    const user = await person();
    const { page, ctx, errors } = await open(user);
    const problems: string[] = [];
    const tab = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
    const monthToday = async () => { const m = await get(user, '/month'); return m.days.find((d: { day: string }) => d.day === m.today); };

    // The first thing is one tap on how you are, and nothing else is asked.
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you' }).waitFor();
    problems.push(...await scan(page, 'mood'));
    await page.getByRole('button', { name: /^Anxious/ }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'What’s making it feel anxious' }).waitFor();
    problems.push(...await scan(page, 'why'));
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /^Feeling anxious/ }).waitFor();
    expect((await monthToday()).mood).toBe(1);
    problems.push(...await scan(page, 'home'));

    // A tiny step, from the notes under the progress bar on Home.
    await page.getByRole('button', { name: /Add a tiny step/ }).click().catch(() => undefined);
    await page.getByRole('checkbox').first().waitFor({ timeout: 8000 });
    await page.getByRole('checkbox').first().click();
    await expect.poll(async () => (await get(user, '/plan/today')).items.some((p: { done: boolean }) => p.done)).toBe(true);

    // Relax: the list, then a full breath and "it did", which is the one thing only the person can say.
    await tab('Relax');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Relax' }).waitFor();
    problems.push(...await scan(page, 'relax'));
    await page.getByRole('button', { name: /^Breathe/ }).first().click();
    await page.getByRole('dialog', { name: 'Breathe with me' }).waitFor();
    problems.push(...await scan(page, 'breathe'));
    await page.getByText('Nicely done.').waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: 'It did' }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Relax' }).waitFor();
    const m1 = await get(user, '/month');
    expect(m1.help).toContainEqual({ feeling: 'anxious', kind: 'breathe', helped: true });
    expect((await monthToday()).kinds).toContain('breathe');

    // A game, and "I feel better".
    await page.getByRole('button', { name: /Rangoli/ }).first().click();
    await page.getByRole('main', { name: 'Rangoli' }).waitFor();
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(canvas.x + 80, canvas.y + 80); await page.mouse.down();
    for (let i = 0; i < 12; i++) await page.mouse.move(canvas.x + 80 + i * 8, canvas.y + 80 + Math.sin(i / 2) * 40);
    await page.mouse.up();
    problems.push(...await scan(page, 'rangoli'));
    await page.getByRole('button', { name: /feel better/i }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Relax' }).waitFor();
    expect((await monthToday()).kinds).toContain('play');
    // One game is the month's pick and the rest are small buttons under it; the games are reached the same way either way.
    for (const g of ['Balloon pop', 'Fruit slice', 'Cozy room']) {
      await page.getByRole('button', { name: new RegExp(g) }).first().click();
      await page.getByRole('main', { name: g }).waitFor();
      problems.push(...await scan(page, g));
      await page.getByRole('button', { name: 'Back', exact: true }).click();
    }

    // Journal: write a page, let Saathi read it, keep it.
    await tab('Journal');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Journal' }).waitFor();
    problems.push(...await scan(page, 'journal'));
    await page.getByRole('button', { name: /Write/ }).first().click();
    await page.getByRole('textbox', { name: 'Journal entry' }).fill('Today was a good walk and I felt lighter.');
    problems.push(...await scan(page, 'compose'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Remember this?').waitFor({ timeout: 15_000 });
    problems.push(...await scan(page, 'journal review'));
    await page.getByRole('button', { name: /^(Done|Keep|Save)/ }).last().click();
    expect((await get(user, '/garden')).counts.journal).toBe(1);

    // Talk by typing.
    await tab('Talk');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Talk' }).waitFor();
    problems.push(...await scan(page, 'talk'));
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('I am a little tired today.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('log', { name: 'Conversation' }).getByText('I am a little tired today.').waitFor();
    problems.push(...await scan(page, 'chat'));
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    // The month: this month's way up front, and the other ways one tap away.
    await tab('Month');
    const own = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
    problems.push(...await scan(page, `month ${own}`));
    await page.getByRole('button', { name: /See your month another way/ }).click();
    const others = (await page.getByRole('tab').allInnerTexts()).map(t => t.trim());
    expect(others).toHaveLength(3);
    for (const name of others) {
      await page.getByRole('tab', { name, exact: true }).click();
      problems.push(...await scan(page, `month ${name}`));
      await page.getByRole('button', { name: /^Back to/ }).click();
      await page.getByRole('button', { name: /See your month another way/ }).click();
    }

    // Help is always there, and You is reachable from Home.
    await tab('Home');
    await page.getByRole('button', { name: /^Help/ }).first().click();
    await page.getByRole('dialog', { name: 'You’re not alone' }).waitFor();
    problems.push(...await scan(page, 'help'));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^For you, / }).click();
    await page.getByRole('dialog', { name: 'For you' }).waitFor();
    problems.push(...await scan(page, 'for you'));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.getByRole('region', { name: 'Your companion' }).waitFor();
    problems.push(...await scan(page, 'you'));

    // Colours: pick another set and the whole app wears it at once, and it is still readable.
    await page.getByRole('button', { name: /^Colours/ }).click();
    await page.getByRole('dialog', { name: 'Colours' }).waitFor();
    await page.getByRole('radio', { name: /Forest Sage/ }).click();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.v3')!).getPropertyValue('--accent').trim())).toBe('#254B35');
    problems.push(...await scan(page, 'colours'));
    await page.keyboard.press('Escape');
    problems.push(...await scan(page, 'you in sage'));
    await page.getByRole('button', { name: /^Colours/ }).click();
    await page.getByRole('radio', { name: /Midnight Indigo/ }).click();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.v3')!).colorScheme)).toBe('dark');
    problems.push(...await scan(page, 'colours in midnight'));
    await page.getByRole('radio', { name: /Indigo Dusk/ }).click();
    await page.keyboard.press('Escape');

    await ctx.close();
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });

  run('welcomes someone new: one picture-led screen, age, language and number and code on one screen, companion, consent, then how they are', async () => {
    const { page, ctx, errors } = await open(null);
    const problems: string[] = [];
    await page.getByRole('heading', { name: 'Feel lighter, every day.', level: 1 }).waitFor();
    // What the app does is on this one screen: a real exchange (so it is plain that it is a conversation), the four things it does,
    // and the line that it is an AI companion, not a doctor.
    await page.getByText('How was your day?').waitFor();
    for (const t of ['Talk', 'Relax', 'Write', 'Grow']) await page.getByText(t, { exact: true }).waitFor();
    await page.getByText(/not a therapist or a doctor/).waitFor();
    problems.push(...await scan(page, 'welcome'));
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('heading', { name: 'Are you 18 or older?' }).waitFor();
    problems.push(...await scan(page, 'age'));
    await page.getByRole('button', { name: 'Yes, I am' }).click();
    // Language, name and number are one screen, and the code opens on the same screen.
    await page.getByRole('radio', { name: 'Hinglish' }).click();
    await page.getByLabel(/What should I call you/).fill('Meera');
    await page.getByLabel('Your mobile number').fill(`9${String(Date.now()).slice(-9)}`);
    problems.push(...await scan(page, 'set up'));
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const code = (await page.getByText(/your code is/).innerText()).match(/\d{6}/)![0];
    await page.getByLabel('6-digit code').fill(code);
    problems.push(...await scan(page, 'code'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Choose your companion' }).waitFor();
    problems.push(...await scan(page, 'companion'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'What you’re okay with' }).waitFor();
    await page.getByRole('switch', { name: /Remember things/ }).click();
    problems.push(...await scan(page, 'consent'));
    await page.getByRole('button', { name: /Say hello/ }).click();
    // The first thing in the app is how they are, by name.
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you feeling' }).waitFor({ timeout: 15_000 });
    await page.getByText(/Meera/).first().waitFor();
    problems.push(...await scan(page, 'first mood'));
    await page.getByRole('button', { name: /^Okay/ }).click();
    await page.getByRole('button', { name: /^(Continue|Skip this)$/ }).click();
    await page.getByRole('button', { name: /^Feeling okay/ }).waitFor();
    problems.push(...await scan(page, 'first home'));
    await ctx.close();
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });

  run('signs back in without being asked their age, their name or their language again', async () => {
    const user = await person();
    await withSystem(t.ctx.db, tx => tx.query('DELETE FROM otp_challenges WHERE target_hash = $1', [t.ctx.crypto.lookupHash('phone', `+91${user.phone}`)])); // the resend wait is not what this checks
    const { page, ctx, errors } = await open(null);
    const problems: string[] = [];
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    expect(await page.getByText('Are you 18 or older?').count()).toBe(0);
    expect(await page.getByLabel(/What should I call you/).count()).toBe(0);
    expect(await page.getByRole('radio', { name: 'Hinglish' }).count()).toBe(0);
    problems.push(...await scan(page, 'welcome back'));
    await page.getByLabel('Your mobile number').fill(user.phone);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const code = (await page.getByText(/your code is/).innerText()).match(/\d{6}/)![0];
    await page.getByLabel('6-digit code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you' }).waitFor();
    await ctx.close();
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });

  run('says "I already have an account" for a number with none, and sign-up takes over without making an account', async () => {
    const stranger = newPhone();
    const { page, ctx } = await open(null);
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Your mobile number').fill(stranger);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const code = (await page.getByText(/your code is/).innerText()).match(/\d{6}/)![0];
    await page.getByLabel('6-digit code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Are you 18 or older?' }).waitFor();
    const made = await withSystem(t.ctx.db, tx => tx.query('SELECT 1 FROM users WHERE phone_hash = $1', [t.ctx.crypto.lookupHash('phone', `+91${stranger}`)]));
    expect(made.rowCount).toBe(0);
    await ctx.close();
  });

  run('asks how they are when they come back after a few hours, and not when they were just here', async () => {
    // (A sign-in token is used up when it is used, so each visit is a different person.)
    const hour = 3_600_000;
    const away = await open(await person(), '?ui=3', Date.now() - 4 * hour);
    await away.page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you' }).waitFor();
    // Skipping counts as being asked: it is remembered, so it is not asked again until the next few hours away.
    await away.page.getByRole('button', { name: 'Not now' }).click();
    await away.page.getByRole('heading', { level: 1 }).filter({ hasText: 'Aarav' }).waitFor();
    const askedAt = Number(await away.page.evaluate(() => localStorage.getItem('saathi.v3.asked')));
    expect(Date.now() - askedAt).toBeLessThan(60_000);
    await away.ctx.close();
    const here = await open(await person(), '?ui=3', Date.now() - 1 * hour);
    await here.page.getByRole('heading', { level: 1 }).filter({ hasText: 'Aarav' }).waitFor();
    expect(await here.page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you' }).count()).toBe(0);
    await here.ctx.close();
  });

  // The first screen is the one everybody sees first: it has to read in every palette too.
  run('opens readable in every palette', async () => {
    for (const id of ['dusk', 'teal', 'terracotta', 'plum', 'ocean', 'sage', 'sorbet', 'sky', 'mango', 'aurora', 'midnight', 'forest', 'ember']) {
      const { page, ctx, errors } = await open(null, `?ui=3&palette=${id}`);
      await page.getByRole('heading', { name: 'Feel lighter, every day.', level: 1 }).waitFor();
      expect(await scan(page, `${id} welcome`)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    }
  });

  // Every palette, light, washed and dark, on the screens people use most: words must stay readable whatever the colours.
  for (const id of ['dusk', 'teal', 'terracotta', 'plum', 'ocean', 'sage', 'sorbet', 'sky', 'mango', 'aurora', 'midnight', 'forest', 'ember']) {
    run(`stays readable in the ${id} colours`, async () => {
      const { page, ctx, errors } = await open(await person(), `?ui=3&palette=${id}`);
      const problems: string[] = [];
      const tab = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
      await page.getByRole('heading', { level: 1 }).filter({ hasText: 'How are you' }).waitFor();
      problems.push(...await scan(page, `${id} mood`));
      await page.getByRole('button', { name: 'Not now' }).click();
      await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Aarav' }).waitFor();
      problems.push(...await scan(page, `${id} home`));
      for (const [name, heading] of [['Relax', 'Relax'], ['Talk', 'Talk'], ['Journal', 'Journal'], ['Month', 'Letters']] as const) {
        await tab(name);
        await page.getByRole('heading', { level: 1 }).filter({ hasText: heading }).waitFor();
        problems.push(...await scan(page, `${id} ${name}`));
      }
      await ctx.close();
      expect(errors).toEqual([]);
      expect(problems).toEqual([]);
    });
  }

  run('opens for everyone once its switch is on, and ?ui=1 or ?ui=2 still bring back the others', async () => {
    const user = await person();
    await t.ctx.rt.flags.upsert('ui.v3', { enabled: true, rolloutPct: 100 }, 'test');
    const on = await open(user, '');
    await on.page.locator('.v3').waitFor();
    await on.ctx.close();
    const old = await open(user, '?ui=1');
    await old.page.locator('.shell').first().waitFor();
    expect(await old.page.locator('.v3').count()).toBe(0);
    await old.ctx.close();
    const mid = await open(user, '?ui=2');
    await mid.page.locator('.v2').first().waitFor();
    expect(await mid.page.locator('.v3').count()).toBe(0);
    await mid.ctx.close();
    await t.ctx.rt.flags.upsert('ui.v3', { enabled: false }, 'test');
  });
});
