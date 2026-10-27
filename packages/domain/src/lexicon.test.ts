import { describe, expect, it } from 'vitest';
import { describeHits, findUnsafeLanguage, isSafeLanguage } from './lexicon';
import { level3Script } from './safety';
import { SAFE_FALLBACK_LINE } from './output';

const UNSAFE: [string, string][] = [
  // suicide and self-harm
  ['I want to die.', 'death'], ['You could end your life.', 'self_harm'], ['Many people think about suicide.', 'self_harm'], ['These are suicidal thoughts.', 'self_harm'],
  ['Self-harm is more common than you think.', 'self_harm'], ['self harm', 'self_harm'], ['Please don’t hurt yourself.', 'self_harm'], ['You might kill yourself.', 'self_harm'],
  ['Do not harm yourself.', 'violence'], ['An overdose is dangerous.', 'self_harm'], ['Don’t hang yourself.', 'self_harm'], ['cutting your wrists', 'self_harm'],
  ['Don’t jump off the terrace.', 'self_harm'], ['Take your own life', 'self_harm'], ['giving up on life', 'self_harm'], ['There is no way out.', 'self_harm'],
  ['everyone is better off without me', 'self_harm'], ['You could just disappear.', 'self_harm'], ['Rest in peace.', 'self_harm'], ['Let’s end the pain.', 'self_harm'],
  ['You could end it all.', 'self_harm'], ['burn yourself', 'self_harm'], ['starve yourself', 'self_harm'], ['kms', 'self_harm'],
  // death, including idioms the companion should not use
  ['I could die of embarrassment.', 'death'], ['You’re killing it today!', 'death'], ['I’m dead tired.', 'death'], ['I’m dying to hear how it went.', 'death'], ['That is to die for.', 'death'],
  ['A fatal mistake.', 'death'], ['a lethal dose', 'death'], ['After the death of a parent.', 'death'], ['They murdered the vibe.', 'death'], ['Killing time.', 'death'],
  // violence
  ['You could hit them back.', 'violence'], ['Hurt someone', 'violence'], ['Harm to others.', 'violence'], ['That is violence.', 'violence'], ['Abuse is never okay.', 'violence'],
  ['He has a gun.', 'violence'], ['a knife', 'violence'], ['Revenge feels good.', 'violence'], ['There was no harm in trying.', 'violence'],
  // health hazards and substances
  ['It could be a heart attack.', 'health_hazard'], ['You might have had a stroke.', 'health_hazard'], ['cancer', 'health_hazard'], ['That injury sounds bad.', 'health_hazard'],
  ['You could skip meals.', 'health_hazard'], ['Skip lunch today', 'health_hazard'], ['I skipped dinner again', 'health_hazard'], ['skipping breakfast helps', 'health_hazard'], ['Skipped meals', 'health_hazard'], ['A crash diet.', 'health_hazard'], ['Have a few drinks? alcohol helps', 'substances'], ['drugs', 'substances'],
  ['smoking helps', 'substances'], ['He is addicted.', 'substances'], ['sleeping pills', 'substances'], ['Take a painkiller.', 'substances'],
  // harsh and clinical labels, despair
  ['You are worthless.', 'harsh_label'], ['I feel useless.', 'harsh_label'], ['You’re not a failure.', 'harsh_label'], ['That sounds crazy.', 'harsh_label'], ['You are stupid.', 'harsh_label'],
  ['I think it is depression.', 'harsh_label'], ['You seem bipolar.', 'harsh_label'], ['a mental illness', 'harsh_label'], ['panic disorder', 'harsh_label'], ['a nervous breakdown', 'harsh_label'],
  ['There is no point.', 'despair'], ['Nothing matters.', 'despair'], ['You can’t go on like this.', 'despair'], ['It all feels pointless.', 'despair'], ['no hope', 'despair'],
  // disguised
  ['s u i c i d e', 'self_harm'], ['su*icide', 'self_harm'], ['s.u.i.c.i.d.e', 'self_harm'], ['sui​cide', 'self_harm'], ['k1ll yourself', 'self_harm'], ['d1e', 'death'], ['SUICIDE', 'self_harm'], ['Ｓｕｉｃｉｄｅ', 'self_harm'],
  // Hinglish
  ['main marna chahta hoon', 'death'], ['khudkushi ke baare mein mat socho', 'self_harm'], ['jaan de dunga', 'self_harm'], ['zeher kha lo', 'self_harm'], ['sab khatam ho gaya', 'despair'],
  ['koi fayda nahi', 'despair'], ['tum bekar ho', 'harsh_label'], ['pagal ho kya', 'harsh_label'], ['sharaab peeke bhool jao', 'substances'], ['maut', 'death'], ['jeene ka mann nahi', 'despair'],
  // Hindi
  ['आत्महत्या', 'self_harm'], ['मैं मरना चाहता हूँ', 'death'], ['मौत से डर लगता है', 'death'], ['जहर', 'self_harm'], ['सब खत्म हो गया', 'despair'], ['तुम बेकार हो', 'harsh_label'], ['थोड़ी शराब पी लो', 'substances'], ['हिंसा', 'violence'], ['कोई फायदा नहीं', 'despair'],
];

const SAFE = [
  'I’m here with you. Want to tell me what happened?',
  'That sounds really heavy, and it makes sense that you’re tired.',
  'You’re not alone in this. I’m right here.',
  'Tele-MANAS is free on 14416, any time.',
  'Let’s take three slow breaths together.',
  'A short walk by the window could feel good.',
  'You could try cutting yourself some slack tonight.',
  'You could try cutting down on screen time.',
  'Hang in there. I’m with you.',
  'Want to hang out with a friend this weekend?',
  'Let’s end it here for tonight, and talk tomorrow.',
  'That deadline sounds stressful.',
  'It sounds like you’re hurting, and that makes sense.',
  'That sounds painful, and scary, and lonely.',
  'You sound anxious and overwhelmed. That’s a lot.',
  'Shoot me a message whenever you’re ready.',
  'Hit pause for a minute and just breathe.',
  'You nailed that. That counts.',
  'You’re allowed to struggle and still be doing your best.',
  'I’m sorry for your loss. Do you want to tell me about her?',
  'Drink a glass of water and open the window.',
  'Main yahin hoon. Aaj ka din kaisa raha?',
  'Thoda aaram karo, chai peete hain.',
  'Kya hua, batao. Main sun raha hoon.',
  'मैं यहाँ हूँ। आज का दिन कैसा रहा?',
  'थोड़ा आराम कर लें, फिर बात करते हैं।',
  'आप अकेले नहीं हैं। मैं आपके साथ हूँ।',
  'Rain on a tin roof, and a quiet lamp by the window.',
  'The tea garden is green and slow, and the evening is soft.',
  '1 slow breath in. 2 slow breaths out. 3 times is plenty.',
  'Call Tele-MANAS on 14416.',
];

describe('safe-language lexicon', () => {
  it.each(UNSAFE)('blocks %j (%s)', (text, category) => {
    const hits = findUnsafeLanguage(text);
    expect(hits.length, `expected a hit in: ${text}`).toBeGreaterThan(0);
    expect(hits.map(h => h.category), `categories for: ${text}`).toContain(category);
  });

  it.each(SAFE)('lets %j through', text => {
    expect(findUnsafeLanguage(text), text).toEqual([]);
    expect(isSafeLanguage(text)).toBe(true);
  });

  it('the fixed crisis script, its fallback line and the helpline wording are themselves clean', () => {
    expect(isSafeLanguage(level3Script(null))).toBe(true);
    expect(isSafeLanguage(level3Script('Priya'))).toBe(true);
    expect(isSafeLanguage(SAFE_FALLBACK_LINE)).toBe(true);
  });

  it('describes hits by category so logs never repeat the words', () => {
    expect(describeHits(findUnsafeLanguage('You could kill yourself. That is violence.'))).toBe('self_harm, death, violence');
    expect(describeHits([])).toBe('');
  });

  it('does not misfire on the long, ordinary text of a calm story', () => {
    const story = 'Tonight we’re going to a small town in the hills, in the middle of the monsoon. The air is cool and smells of wet earth. You find a chair by a window, and a cup of hot ginger tea is waiting. Outside, the rain is soft on the tin roof, slow and steady. There is nowhere you need to be. Let your shoulders drop a little, and let the day go quiet.';
    expect(findUnsafeLanguage(story)).toEqual([]);
  });
});

describe('the soft fallback line', () => {
  it('is itself clean', async () => {
    const { SOFT_FALLBACK_LINE, checkAiOutput } = await import('./output');
    expect(checkAiOutput(SOFT_FALLBACK_LINE)).toEqual({ ok: true });
  });
});
