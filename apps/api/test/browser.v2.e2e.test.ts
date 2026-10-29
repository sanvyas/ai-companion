/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';
import { listen } from './ws-helpers.js';

// The new design, built the way production builds it, served by the real API and driven in a real browser. It checks what the unit tests
// cannot: that the screens are wired to the server (what a person does grows the garden there), that nothing errors on the way, and that
// every screen passes an accessibility scan.

let t: TestApp;
let browser: Browser | null = null;
let base = '';
let skip = false;
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

beforeAll(async () => {
  const web = mkdtempSync(join(tmpdir(), 'saathi-web2-'));
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

async function open(user: Auth | null, query = '?ui=2'): Promise<{ page: Page; ctx: BrowserContext; errors: string[] }> {
  const ctx = await browser!.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(rt => { try { if (rt) localStorage.setItem('saathi.rt', rt); localStorage.setItem('saathi.v2.tour', '1'); } catch { /* blocked */ } }, user?.refreshToken ?? '');
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
    // The little banner that says what grew comes and goes by itself; measure the screen, not the banner mid-fade.
    for (let i = 0; i < 60 && document.querySelector('.ribbon'); i++) await new Promise(r => setTimeout(r, 250));
    const r = await axe.run(document, { resultTypes: ['violations'] });
    const why = (n: Node) => { const d = n.any[0]?.data; return d?.contrastRatio ? ` (${d.contrastRatio}:1 ${d.fgColor} on ${d.bgColor})` : ''; };
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ') + why(n)).join(' | ')}`);
  });
  return res.map(r => `${where} -> ${r}`);
}

describe('the new design', () => {
  run('looks after a day: check-in, plant, plan, journal, rangoli and jar all grow the garden on the server', async () => {
    const user = await person();
    const { page, ctx, errors } = await open(user);
    // A celebration can arrive a moment after something grew. It waits for a quiet moment; here it is simply dismissed.
    const calm = async () => { const b = page.getByRole('button', { name: 'Keep going' }); if (await b.isVisible().catch(() => false)) await b.click(); };
    const nav = async (k: string) => { await calm(); await page.locator(`[data-track="nav.${k}"]`).click(); };
    const problems: string[] = [];

    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Aarav' }).waitFor();
    await page.getByRole('group', { name: 'Your garden' }).waitFor();
    problems.push(...await scan(page, 'home'));

    // Check in: the server counts it, and the garden says what grew.
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await page.getByRole('dialog', { name: 'How are you feeling?' }).waitFor();
    problems.push(...await scan(page, 'check-in sheet'));
    await page.getByRole('button', { name: 'Okay' }).click();
    await page.getByText('One small thing').first().waitFor();
    await page.getByText('Your tree got its water.').first().waitFor({ timeout: 8000 });
    expect((await get(user, '/garden')).counts.checkin).toBe(1);
    await page.getByRole('button', { name: 'Maybe later' }).click();

    // Plant something in a free plot.
    await page.getByRole('button', { name: /^Plant something/ }).first().click();
    await page.getByRole('button', { name: /^Marigold/ }).click();
    await page.getByText('Planted. It grows on the days you show up.').waitFor();
    expect((await get(user, '/garden')).plants).toHaveLength(1);

    // The gentle plan: add, reword, tick, remove.
    await page.getByRole('navigation', { name: 'Places in your garden' }).getByRole('button', { name: /^Plan/ }).click();
    await page.getByRole('heading', { name: 'Gentle plan' }).waitFor().catch(() => undefined);
    await page.getByLabel('Add a step').fill('Water the tulsi');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByText('Water the tulsi', { exact: true }).waitFor();
    problems.push(...await scan(page, 'plan'));
    await page.getByRole('button', { name: 'Edit Water the tulsi' }).click();
    await page.getByLabel('Edit step').fill('Water the tulsi plant');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Water the tulsi plant', { exact: true }).waitFor();
    const labels = (await get(user, '/plan/today')).items.map((p: { label: string }) => p.label);
    expect(labels).toContain('Water the tulsi plant');
    await page.getByRole('checkbox', { name: 'Water the tulsi plant' }).click();
    await page.getByRole('button', { name: 'Remove Water the tulsi plant' }).click();
    await page.waitForFunction(() => !document.body.innerText.includes('Water the tulsi plant'));
    expect((await get(user, '/plan/today')).items.map((p: { label: string }) => p.label)).not.toContain('Water the tulsi plant');
    expect((await get(user, '/garden')).counts.plan).toBe(1); // what it earned stays earned
    await page.getByRole('button', { name: 'Back' }).click();

    // Journal: write a page, let Saathi read it, keep it.
    await nav('journal');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Your story' }).waitFor();
    problems.push(...await scan(page, 'journal'));
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.getByRole('textbox', { name: 'Journal entry' }).fill('Today was a good walk and I felt lighter.');
    problems.push(...await scan(page, 'write'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('What I noticed').waitFor();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Your story' }).waitFor();
    await page.getByText('Today was a good walk and I felt lighter.').first().waitFor();
    expect((await get(user, '/garden')).counts.journal).toBe(1);
    await page.getByRole('tab', { name: 'Progress' }).click();
    await page.getByText('How you have felt').waitFor();
    problems.push(...await scan(page, 'progress'));

    // Calm: a rangoli and a good thing for the jar.
    await nav('calm');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'A moment' }).waitFor();
    problems.push(...await scan(page, 'calm'));
    await page.getByRole('button', { name: /Draw a rangoli/ }).click();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + 90, box.y + 90); await page.mouse.down();
    for (let i = 0; i < 16; i++) await page.mouse.move(box.x + 90 + i * 9, box.y + 90 + Math.sin(i / 2) * 50);
    await page.mouse.up();
    problems.push(...await scan(page, 'rangoli'));
    await page.getByRole('button', { name: 'Add to my garden' }).click();
    await page.getByText('Your rangoli now decorates the garden gate.').waitFor();
    expect((await get(user, '/garden/creations')).items).toHaveLength(1);
    await nav('calm');
    await page.getByRole('button', { name: /Good-things jar/ }).click();
    await page.getByLabel('A good thing').fill('Chai with Mum');
    await page.getByRole('button', { name: 'Add to jar' }).click();
    await page.getByText('1 saved', { exact: true }).waitFor();
    expect((await get(user, '/jar')).items.map((j: { text: string }) => j.text)).toEqual(['Chai with Mum']);
    await page.getByRole('button', { name: 'Back' }).click();

    // Talk by typing, then the garden screen and the settings screens.
    await nav('talk');
    problems.push(...await scan(page, 'talk'));
    await page.getByRole('button', { name: /^Type to/ }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('I am a little tired today.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('log', { name: 'Conversation' }).getByText('I am a little tired today.').waitFor();
    await page.locator('.m.her').first().waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    // Check-in, plant, step, page, rangoli, jar and a talk add up to the first stage: the garden says so, once things are quiet.
    await page.getByRole('dialog', { name: /Your garden grew/ }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Keep going' }).click();
    await nav('you');
    problems.push(...await scan(page, 'you'));
    for (const [row, heading] of [['What Saathi remembers', 'Memory'], ['Privacy Center', 'Privacy Center'], ['Check-ins and reminders', 'Reminders and calls'], ['Avatar and voice', 'Your companion'], ['Language', 'Language']] as const) {
      await calm();
      await page.getByRole('button', { name: new RegExp(`^${row}`) }).click();
      await page.getByRole('main', { name: heading }).waitFor();
      problems.push(...await scan(page, heading));
      await calm();
      await page.getByRole('button', { name: 'Back' }).click();
    }
    await calm();
    await nav('today');
    await page.getByRole('button', { name: /See how your garden grows/ }).click();
    await page.getByRole('heading', { name: 'Your road, month by month' }).waitFor();
    problems.push(...await scan(page, 'garden'));

    await ctx.close();
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });

  run('welcomes someone new: age, name, phone code, companion, what they are okay with, the first seed, then a quiet Home', async () => {
    const { page, ctx, errors } = await open(null);
    const problems: string[] = [];
    await page.getByRole('heading', { name: /Hi, I.m Saathi/ }).waitFor();
    problems.push(...await scan(page, 'welcome'));
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('heading', { name: /how Saathi helps/ }).waitFor();
    problems.push(...await scan(page, 'intro'));
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Your name').fill('Meera');
    await page.getByRole('checkbox', { name: /18 or older/ }).click();
    problems.push(...await scan(page, 'about'));
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Mobile number').fill(`9${String(Date.now()).slice(-9)}`);
    problems.push(...await scan(page, 'phone'));
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const code = (await page.getByText(/your code is/).innerText()).match(/\d{6}/)![0];
    await page.getByLabel('6-digit code').fill(code);
    problems.push(...await scan(page, 'code'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Choose your companion' }).waitFor();
    problems.push(...await scan(page, 'companion'));
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('heading', { name: 'Before we begin' }).waitFor();
    await page.getByRole('checkbox', { name: /AI companion/ }).click();
    await page.getByRole('checkbox', { name: /words stay private/ }).click();
    await page.getByRole('switch', { name: /Remember things/ }).click();
    problems.push(...await scan(page, 'consent'));
    await page.getByRole('button', { name: 'I understand' }).click();
    await page.getByRole('heading', { name: 'Plant your first seed' }).waitFor();
    problems.push(...await scan(page, 'first seed'));
    await page.getByRole('button', { name: /Plant the seed/ }).click();
    await page.getByRole('heading', { name: 'Your garden has begun' }).waitFor();
    await page.getByRole('button', { name: 'Show me around' }).click();
    await page.getByRole('dialog', { name: 'Quick tour' }).waitFor();
    problems.push(...await scan(page, 'tour'));
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /^(Next|Got it)$/ }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Meera' }).waitFor();
    const me = await page.evaluate(async () => { const rt = localStorage.getItem('saathi.rt'); return rt ? 'signed in' : 'no session'; });
    expect(me).toBe('signed in');
    await ctx.close();
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });

  run('opens for everyone once the switch is on, and ?ui=1 still brings back the previous design', async () => {
    const user = await person();
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: true, rolloutPct: 100 }, 'test');
    const on = await open(user, '');
    await on.page.locator('.v2').waitFor();
    await on.ctx.close();
    const old = await open(user, '?ui=1');
    await old.page.locator('.shell').first().waitFor();
    expect(await old.page.locator('.v2').count()).toBe(0);
    await old.ctx.close();
    await t.ctx.rt.flags.upsert('ui.v2', { enabled: false }, 'test');
  });
});
