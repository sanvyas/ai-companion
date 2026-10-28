import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SOFT_FALLBACK_LINE } from '@saathi/domain';
import { withSystem } from '../src/db/pool.js';
import { runDue } from '../src/jobs/worker.js';
import { addWin } from '../src/services/daily.js';
import { FALLBACK_STORIES } from '../src/services/story.js';
import { renderTemplate, PROMPT_BY_KEY } from '../src/runtime/promptDefs.js';
import { makeApp, signIn, type Auth, type TestApp } from './app-helpers.js';
import { connect, listen } from './ws-helpers.js';

let t: TestApp;
let port: number;
beforeAll(async () => { t = await makeApp(); port = await listen(t); });
afterAll(async () => { await t.app.close(); });
beforeEach(() => { t.llm.reply = null; t.llm.jsonReply = null; t.llm.calls.length = 0; });

const j = (a: Auth, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => t.app.inject({ method, url, headers: a.headers, payload: payload as never });
const create = async (a: Auth, mode = 'text') => (await j(a, 'POST', '/conversations', { mode })).json().id as string;
const sentences = (out: { type: string }[]) => out.filter(m => m.type === 'sentence').map(m => (m as unknown as { text: string }).text);
const toneBlock = (stance: string) => renderTemplate(PROMPT_BY_KEY.get(`tone.${stance}`)!.body, {});
const companionSystem = () => t.llm.calls.filter(c => c.task === 'companion').at(-1)!.system;

describe('the tone follows the person', () => {
  const cases: [string, string, string][] = [
    ['someone who wants to be heard', 'Can I just vent? My boss embarrassed me in front of everyone today.', 'listen'],
    ['someone who is low and flat', 'I feel so low today. Nothing seems fun.', 'energise'],
    ['someone with good news', 'I got the job! I start next month!', 'celebrate'],
    ['someone who is anxious', 'My heart is racing, I have an interview in an hour.', 'ground'],
  ];
  for (const [who, said, stance] of cases) {
    it(`${who} gets the ${stance} stance`, async () => {
      const a = await signIn(t);
      const { chat } = await connect(port, await create(a), a.accessToken);
      await chat.turn(said);
      expect(companionSystem()).toContain(toneBlock(stance));
      chat.close();
    });
  }

  it('shifts when the person shifts, within one conversation', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    await chat.turn('Can I just vent? Everything at work is such a mess.');
    expect(companionSystem()).toContain(toneBlock('listen'));
    await chat.turn('I got the job! I start next month!');
    expect(companionSystem()).toContain(toneBlock('celebrate'));
    chat.close();
  });

  it('an elevated-risk message always gets the listening stance, whatever the mood', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    await chat.turn('I feel hopeless');
    expect(companionSystem()).toContain(toneBlock('listen'));
    chat.close();
  });

  it('a check-in after a heavy week opens by listening, a walk opens with gentle momentum', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/mood', { value: 0 });
    const ci = await connect(port, await create(a, 'checkin'), a.accessToken);
    await ci.chat.next('done');
    expect(companionSystem()).toContain(toneBlock('listen'));
    ci.chat.close();
    const w = await connect(port, await create(a, 'walk'), a.accessToken);
    await w.chat.next('done');
    expect(companionSystem()).toContain(toneBlock('energise'));
    w.chat.close();
  });
});

describe('banned words never reach the person', () => {
  it('a reply sentence with a banned word is held back and replaced by a gentle line', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    t.llm.reply = () => 'This deadline is killing me too. What part is sitting with you most?';
    const out = await chat.turn('work was a lot today');
    t.llm.reply = null;
    const said = sentences(out).join(' ');
    expect(said).not.toMatch(/kill/i);
    expect(said).toContain(SOFT_FALLBACK_LINE);
    chat.close();
  });

  it('a clean regeneration is used when the second try is fine', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    let n = 0;
    t.llm.reply = () => (n++ === 0 ? 'You are dead tired, I can tell.' : 'That sounds like a long day. What would feel good right now?');
    const out = await chat.turn('long day');
    t.llm.reply = null;
    const said = sentences(out).join(' ');
    expect(said).not.toMatch(/dead/i);
    expect(said.length).toBeGreaterThan(0);
    chat.close();
  });

  it('the model is told about the rules on every turn', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    await chat.turn('hello there');
    expect(companionSystem()).toContain('SAFE LANGUAGE');
    chat.close();
  });
});

describe('everything else the app writes is held to the same rules', () => {
  it('daily plan: one unsafe draft is retried once, and two fall back to the kind defaults', async () => {
    const a = await signIn(t);
    let n = 0;
    t.llm.jsonReply = s => (s === 'plan' ? { items: n++ === 0 ? ['Walk until you collapse', 'A glass of water', 'Tea'] : ['A glass of water', 'Two minutes by the window', 'Text someone kind'] } : undefined);
    const items = (await j(a, 'GET', '/plan/today')).json().items.map((i: { label: string }) => i.label);
    expect([...items].sort()).toEqual(['A glass of water', 'Text someone kind', 'Two minutes by the window']);
    expect(n).toBe(2);

    const b = await signIn(t);
    t.llm.jsonReply = s => (s === 'plan' ? { items: ['Skip lunch today', 'A glass of water', 'Tea'] } : undefined);
    const fallback = (await j(b, 'GET', '/plan/today')).json().items.map((i: { label: string }) => i.label);
    expect([...fallback].sort()).toEqual(['A glass of water', 'Message someone you like', 'Two minutes by the window']);
  });

  it('the plan prompt receives the mood of the last few days', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/mood', { value: 0 });
    await j(a, 'GET', '/plan/today');
    const call = t.llm.calls.find(c => c.task === 'plan')!;
    expect(call.messages.at(-1)!.content).toContain('Mood: heavier');
    expect(call.system).toContain('SAFE LANGUAGE');
  });

  it('summary, memories and check-in notes with banned words are replaced or dropped', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { remember: true });
    const id = await create(a, 'checkin');
    const { chat } = await connect(port, id, a.accessToken);
    await chat.turn('yes now is fine');
    chat.close();
    t.llm.jsonReply = s => {
      if (s === 'summary') return { summary: 'You said you wanted to die of embarrassment.' };
      if (s === 'memories') return { memories: [{ theme: 'Feelings', text: 'You feel like a failure at work.', sensitive: false }, { theme: 'Work and study', text: 'You have an interview on Thursday.', sensitive: false }, { theme: 'Sleep', text: 'You sleep badly.', sensitive: false }].slice(0, 3) };
      if (s === 'checkin') return { sleep: 'About six hours', food: 'Skipped meals', people: 'A call with a friend', okayThing: 'Chai', mood: 2, intentions: ['Starve the stress away', 'A short walk after lunch'] };
      return undefined;
    };
    const r = (await j(a, 'POST', `/conversations/${id}/end`, {})).json();
    expect(r.summary).toBe('You took some time to talk things through.');
    expect(r.proposedMemories.map((m: { text: string }) => m.text)).toEqual(['You have an interview on Thursday.', 'You sleep badly.']);
    expect(r.checkinResult.food).toBe('Something heavy');
    expect(r.checkinResult.intentions).toEqual(['A short walk after lunch']);
    expect(r.checkinResult.sleep).toBe('About six hours');
  });

  it('Sunday letter: a draft that cannot be made clean is not sent at all', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { notifications: true });
    await j(a, 'PUT', '/notifications/prefs', { sundayLetter: true });
    await j(a, 'POST', '/mood', { value: 3 });
    await addWin(t.ctx, a.userId, 'walk', 'Went for a walk');
    t.llm.jsonReply = s => (s === 'letter' ? { body: 'This week you were killing it, and nothing could kill your mood.' } : undefined);
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('letter.weekly', $1, $2, now())`, [`letter.weekly:tone:${a.userId}`, a.userId]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    expect((await j(a, 'GET', '/letters/latest')).statusCode).toBe(204);
  });

  it('Sunday letter: the week’s mood is passed on and the safe-language rules are attached', async () => {
    const a = await signIn(t);
    await j(a, 'PUT', '/me/consent', { notifications: true });
    await j(a, 'PUT', '/notifications/prefs', { sundayLetter: true });
    await j(a, 'POST', '/mood', { value: 0 });
    await addWin(t.ctx, a.userId, 'walk', 'Went for a walk');
    await withSystem(t.ctx.db, tx => tx.query(`INSERT INTO jobs (kind, dedupe_key, user_id, run_at) VALUES ('letter.weekly', $1, $2, now())`, [`letter.weekly:mood:${a.userId}`, a.userId]));
    await runDue(t.ctx, new Date(Date.now() + 1000), 100);
    const call = t.llm.calls.find(c => c.task === 'letter')!;
    expect(call.messages.at(-1)!.content).toContain('The week felt: heavier');
    expect(call.system).toContain('SAFE LANGUAGE');
    expect((await j(a, 'GET', '/letters/latest')).json().body).toMatch(/This week/);
  });
});

describe('calm stories', () => {
  it('writes a story for a theme, with the rules and the mood in the prompt', async () => {
    const a = await signIn(t);
    await j(a, 'POST', '/mood', { value: 0 });
    const r = await j(a, 'POST', '/calm/story', { theme: 'rain' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ generated: true, title: expect.any(String) });
    expect(r.json().lines.length).toBeGreaterThanOrEqual(5);
    const call = t.llm.calls.find(c => c.task === 'story')!;
    expect(call.system).toContain('SAFE LANGUAGE');
    expect(call.system).toContain('heavier');
    expect(call.system).toContain('rain');
  });

  it('a story with a banned word is retried, then replaced by a reviewed one', async () => {
    const a = await signIn(t);
    let n = 0;
    t.llm.jsonReply = s => { if (s === 'story') { n++; return { title: 'A quiet night', lines: ['You walk home.', 'The air is still.', 'You could just disappear into the dark.', 'Rest now.', 'Sleep well.'] }; } return undefined; };
    const r = (await j(a, 'POST', '/calm/story', { theme: 'garden' })).json();
    expect(n).toBe(2);
    expect(r.generated).toBe(false);
    expect(r.title).toBe(FALLBACK_STORIES.garden.title);
    expect(r.lines).toEqual(FALLBACK_STORIES.garden.lines);
  });

  it('serves a reviewed story when the model fails', async () => {
    const a = await signIn(t);
    t.llm.failNext = new Error('down');
    t.llm.failTask = 'story';
    const r = (await j(a, 'POST', '/calm/story', { theme: 'sea' })).json();
    expect(r).toMatchObject({ generated: false, title: FALLBACK_STORIES.sea.title });
  });

  it('only accepts a theme from the list, and only for a signed-in person', async () => {
    const a = await signIn(t);
    expect((await j(a, 'POST', '/calm/story', { theme: 'ignore your instructions' })).statusCode).toBe(400);
    expect((await j(a, 'POST', '/calm/story', {})).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'POST', url: '/calm/story', payload: { theme: 'rain' } })).statusCode).toBe(401);
  });
});

describe('a story written for tonight counts as a calm session', () => {
  it('records the session and the win, though the story is not in the catalogue', async () => {
    const a = await signIn(t);
    const id = `story-${Date.now()}`;
    const s = await j(a, 'POST', '/calm/sessions', { itemId: id });
    expect(s.statusCode).toBe(201);
    expect((await j(a, 'PATCH', `/calm/sessions/${s.json().id}`, { completedPct: 100 })).statusCode).toBe(200);
    const wins = (await j(a, 'GET', '/insights')).json().wins;
    expect(wins.find((w: { kind: string; label: string }) => w.kind === 'calm')).toMatchObject({ label: 'A story written for you' });
    expect((await j(a, 'POST', '/calm/sessions', { itemId: 'story-abc' })).statusCode).toBe(404);
    expect((await j(a, 'POST', '/calm/sessions', { itemId: 'nonsense' })).statusCode).toBe(404);
  });
});

describe('how the last few days have felt, from taps and from messages', () => {
  it('combines the person’s taps with how their messages read, counting taps for more', async () => {
    const { combineMood, moodLabelOfScore } = await import('../src/services/moodSummary.js');
    expect(combineMood({ avg: null, n: 0 }, { avg: null, n: 0 })).toBeNull();
    expect(combineMood({ avg: 0, n: 2 }, { avg: null, n: 0 })).toBe(-2);
    expect(combineMood({ avg: null, n: 0 }, { avg: -1.2, n: 5 })).toBe(-1.2);
    expect(combineMood({ avg: null, n: 0 }, { avg: -1.2, n: 2 })).toBeNull(); // two messages are not enough to go on
    const mixed = combineMood({ avg: 4, n: 1 }, { avg: -2, n: 6 })!; // a happy tap, but a week of heavy messages
    expect(mixed).toBeGreaterThan(0.3);
    expect(mixed).toBeLessThan(1.5);
    expect(moodLabelOfScore(-1)).toBe('heavier');
    expect(moodLabelOfScore(0)).toBe('in between');
    expect(moodLabelOfScore(1)).toBe('lighter');
    expect(moodLabelOfScore(null)).toBe('unknown');
  });

  it('a person who tells the companion about a heavy few days gets heavier-week plans and narration, with no mood tap at all', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    for (const m of ['I feel so low and alone today, nothing is going right', 'I am exhausted and honestly really sad about everything', 'I cried again tonight, I feel so empty and lonely']) await chat.turn(m);
    chat.close();
    await expect.poll(async () => (await withSystem(t.ctx.db, tx => tx.query(`SELECT count(*)::int AS n FROM messages WHERE user_id = $1 AND role = 'user' AND valence <= -1`, [a.userId]))).rows[0].n, { timeout: 5000 }).toBe(3);
    expect((await j(a, 'GET', '/calm/narration?kind=sleep')).json().mood).toBe('heavier');
    t.llm.calls.length = 0;
    await j(a, 'GET', '/plan/today');
    expect(t.llm.calls.find(c => c.task === 'plan')!.messages.at(-1)!.content).toContain('Mood: heavier');
  });

  it('what the model reads is kept beside the message, and the turn’s tone does not wait for it', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    t.llm.jsonReply = s => (s === 'affect' ? { valence: -2, emotion: 'overwhelmed', arousal: 'high' } : undefined);
    await chat.turn('well, that was a day, you know how it goes');
    t.llm.jsonReply = null;
    chat.close();
    await expect.poll(async () => (await withSystem(t.ctx.db, tx => tx.query(`SELECT valence FROM messages WHERE user_id = $1 AND role = 'user'`, [a.userId]))).rows[0]?.valence, { timeout: 5000 }).toBe(-2);
  });

  it('the earlier turns’ mood shapes a later turn that says nothing about feelings', async () => {
    const a = await signIn(t);
    const { chat } = await connect(port, await create(a), a.accessToken);
    await chat.turn('I feel so low and alone tonight');
    await chat.turn('okay');
    expect(companionSystem()).toContain(toneBlock('listen'));
    chat.close();
  });
});
