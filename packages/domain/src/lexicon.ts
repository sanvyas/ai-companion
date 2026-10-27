// Words the companion must never write. This is the reviewed, deterministic last line of defence behind the prompt:
// whatever the model is told, nothing containing these terms reaches a person, in any of the three languages the app
// speaks (English, Hinglish in Latin script, Hindi in Devanagari).
//
// Why a word list at all: people in a fragile moment can be set back by language that names suicide, self-harm,
// violence, dangerous health events or harsh labels, even when it is meant kindly or is only repeating their own words.
// The companion talks about the feeling underneath ("this feels like too much right now") and never repeats the words.
//
// What it does NOT block: ordinary feeling words (sad, tired, heavy, scared, lonely, anxious, overwhelmed, hurting,
// painful). The companion could not be kind without them. "hurt" and "hit" are blocked only when aimed at a person.
//
// This applies to text the model WRITES. It is not run on what people write, on the fixed crisis script, or on the
// helpline directory (those are reviewed content, and tests check they pass anyway).

export type UnsafeCategory = 'self_harm' | 'death' | 'violence' | 'health_hazard' | 'substances' | 'harsh_label' | 'despair';

export interface UnsafeHit { category: UnsafeCategory; match: string }

interface Rule { category: UnsafeCategory; re: RegExp }

const W = (s: string) => new RegExp(s, 'iu');

// `\b` does not work next to Devanagari, so Devanagari rules use explicit boundaries.
const DEV_B = '(?:^|[^\\u0900-\\u097F])'; // no lookbehind: older iOS browsers reject it
const DEV_E = '(?![\\u0900-\\u097F])';

const SELF_OBJECT = '(?:yourself|myself|himself|herself|themselves|oneself|ourselves)';
const PERSON_OBJECT = `(?:${SELF_OBJECT}|someone|somebody|anyone|anybody|everyone|others|people|him|her|them|your (?:mom|mum|dad|mother|father|wife|husband|boss|friend|brother|sister|partner)s?)`;

const RULES: Rule[] = [
  // ---------------------------------------------------------------------------------------- suicide and self-harm
  { category: 'self_harm', re: W('\\bsuicid\\w*') },
  { category: 'self_harm', re: W('\\bself[\\s-]?(?:harm|injur|mutilat|destruct|poison|abus)\\w*') },
  { category: 'self_harm', re: W('\\bkms\\b') },
  { category: 'self_harm', re: W('\\b(?:end|ending|ended|take|taking|took|throw|throwing|give|giving|gave)\\s+(?:away\\s+)?(?:my|your|his|her|their|our|one\'s|one’s|a)\\s+(?:own\\s+)?life\\b') },
  { category: 'self_harm', re: W('\\b(?:give|giving|gave)\\s+up\\s+on\\s+(?:life|living|everything|yourself)\\b') },
  { category: 'self_harm', re: W('\\b(?:overdos|poison|noose|gallows|razor|slit|slash)\\w*') },
  { category: 'self_harm', re: W(`\\b(?:cut|cutting|burn|burning|starve|starving|hang|hanging|hung|drown|drowning|choke|choking|strangle|strangling|suffocate|suffocating|stab|stabbing|shoot|shooting|harm|harming|hurt|hurting|punish|punishing|injure|injuring|abuse|abusing|kill|killing)\\s+${SELF_OBJECT}\\b(?!\\s+(?:some|a\\s|more|off|loose|free|short|up|out)\\b)`) },
  { category: 'self_harm', re: W('\\b(?:jump|jumping|jumped|leap|leaping)\\s+(?:off|from|in front)\\b') },
  { category: 'self_harm', re: W('\\b(?:cut|cutting|slit|slash|carve)\\w*\\s+(?:your|my|his|her|their)?\\s*(?:wrists?|arms?|skin|throat|veins?|thighs?|legs?)\\b') },
  { category: 'self_harm', re: W('\\b(?:end|ending)\\s+(?:it\\s+all|it\\s+(?:tonight|now|today)|the\\s+pain|everything)\\b') },
  { category: 'self_harm', re: W('\\b(?:no\\s+way\\s+out|better\\s+off\\s+(?:without|dead|gone)|cease\\s+to\\s+exist|not\\s+(?:wake|waking)\\s+up|never\\s+(?:wake|waking)\\s+up|sleep\\s+forever|rest\\s+in\\s+peace|disappear\\w*|vanish\\w*|escape\\s+(?:it\\s+all|from\\s+life)|goodbye\\s+forever)\\b') },

  // ---------------------------------------------------------------------------------------- death
  { category: 'death', re: W('\\b(?:die|dies|died|dying|dead|death|deaths|deadly|deathly|fatal|fatally|lethal|mortal|mortally|corpse|funeral|grave|suffer\\w*\\s+to\\s+death)\\b') },
  { category: 'death', re: W('\\b(?:kill|kills|killed|killing|killer|murder\\w*|slaughter\\w*|massacre\\w*|execut\\w*|behead\\w*)\\b') },

  // ---------------------------------------------------------------------------------------- violence and harm to others
  { category: 'violence', re: W('\\bharm\\w*\\b') },
  { category: 'violence', re: W(`\\b(?:hurt|hurts|hurting|attack|attacking|assault\\w*|beat|beating|hit|hitting|punch\\w*|slap\\w*|kick\\w*|stab\\w*|shoot\\w*|strangl\\w*|torture\\w*|threaten\\w*|bully|bullying|abus\\w*)\\s+${PERSON_OBJECT}\\b(?!\\s+(?:some|a\\s|more|off|loose|free|short)\\b)`) },
  { category: 'violence', re: W('\\b(?:violen\\w*|abus(?:e|ed|er|ers|ive)|rap(?:e|ed|ist)|molest\\w*|assault\\w*|revenge|vengeance|weapon\\w*|guns?|firearms?|pistols?|rifles?|knife|knives|bomb\\w*|explosi\\w*|terror\\w*|hostage\\w*|kidnap\\w*)\\b') },

  // ---------------------------------------------------------------------------------------- health hazards
  { category: 'health_hazard', re: W('\\b(?:heart\\s+attack|cardiac|stroke|seizures?|cancer\\w*|tumou?rs?|bleed\\w*|wounds?|wounded|injur\\w*|fractur\\w*|unconscious\\w*|coma|paralys\\w*|paralyz\\w*|choking|suffocat\\w*|asphyxi\\w*|collapse[ds]?|faint(?:ed|ing)?|poisoning|infection|toxic|toxin\\w*)\\b') },
  { category: 'health_hazard', re: W('\\b(?:crash\\s+diet\\w*|fasting\\s+to\\s+lose|skip(?:s|ped|ping)?\\s+(?:a\\s+|the\\s+|your\\s+|my\\s+|every\\s+|all\\s+)?(?:meals?|food|lunch|dinner|breakfast|eating)|starv\\w*|anorex\\w*|bulimi\\w*|purg(?:e|ing)|binge\\w*|laxatives?|diet\\s+pills?|self[\\s-]?medicat\\w*)\\b') },

  // ---------------------------------------------------------------------------------------- substances
  { category: 'substances', re: W('\\b(?:drugs?|narcotics?|cocaine|heroin|opioids?|opium|weed|marijuana|cannabis|ganja|charas|bhang|meth|ecstasy|lsd|alcohol\\w*|liquor|whisk(?:e)?y|vodka|beer|drunk|drinking\\s+(?:to|away)|intoxicat\\w*|hungover|tobacco|cigarettes?|smok(?:e|es|ed|ing|er|ers)|vap(?:e|es|ing)|addict\\w*|overdos\\w*|sleeping\\s+pills?|painkillers?)\\b') },

  // ---------------------------------------------------------------------------------------- harsh labels and clinical labels
  { category: 'harsh_label', re: W('\\b(?:worthless|useless|hopeless|pathetic|stupid|idiot\\w*|loser|failure|burdens?|crazy|insane|psycho\\w*|lunatic|madness|nuts|retard\\w*|dumb|ugly|disgusting|shameful|ashamed\\s+of\\s+yourself)\\b') },
  { category: 'harsh_label', re: W('\\b(?:mental\\s+(?:illness|disorder|patient|breakdown|institution|hospital|asylum)|nervous\\s+breakdown|breakdown|depress(?:ed|ion|ive)|bipolar|schizo\\w*|psychosis|psychotic|ptsd|ocd|adhd|borderline|trauma(?:tized|tised)?\\s+disorder|(?:anxiety|panic|eating|personality|mood|conduct)\\s+disorders?)\\b') },

  // ---------------------------------------------------------------------------------------- despair
  { category: 'despair', re: W('\\b(?:no\\s+(?:point|hope|reason\\s+to\\s+live|future)|nothing\\s+matters|can\'t\\s+go\\s+on|can’t\\s+go\\s+on|cannot\\s+go\\s+on|give\\s+up\\s+hope|lost\\s+cause|pointless|meaningless|worthwhile\\s+to\\s+live)\\b') },

  // ---------------------------------------------------------------------------------------- Hinglish (Latin script)
  { category: 'self_harm', re: W('\\b(?:khudkushi|khud\\s*kushi|aatmahatya|atmahatya|aatm\\s*hatya|suicide|jaan\\s+(?:de|dena|dungi|dunga|le|lena|lungi|lunga)|jaan\\s+se\\s+mar\\w*|khud\\s+ko\\s+(?:khatam|nuksaan|chot|maar)\\w*|apni\\s+jaan|zeher|zehar|phaansi|faansi|phansi|fansi|nas\\s+kaat\\w*|haath\\s+kaat\\w*|so\\s+jao\\s+hamesha|kabhi\\s+na\\s+uth\\w*)\\b') },
  { category: 'death', re: W('\\b(?:maut|marna|marne|mar\\s+jaa\\w*|mar\\s+jau\\w*|mar\\s+gay\\w*|mara\\s+hua|murda|laash|lash|kabristan|shamshan|hatya|hatyara|maar\\s+(?:dal|dun|dung|do)\\w*|maarna|maarne|qatl|khoon)\\b') },
  { category: 'harsh_label', re: W('\\b(?:bekar|bekaar|nikamma|nikamme|pagal|paagal|bewakoof|gadha|nalayak|kamzor\\s+insaan|bojh|bojhh)\\b') },
  { category: 'despair', re: W('\\b(?:jeene\\s+ka\\s+(?:mann|man)\\s+nahi|koi\\s+fayda\\s+nahi|sab\\s+khatam|sab\\s+kuch\\s+khatam|kuch\\s+bacha\\s+nahi|umeed\\s+nahi|koi\\s+ummeed\\s+nahi)\\b') },
  { category: 'substances', re: W('\\b(?:sharaab|daaru|sharab|nasha|nashe|cigarette|beedi|gutkha|bhang|charas)\\b') },

  // ---------------------------------------------------------------------------------------- Hindi (Devanagari)
  { category: 'self_harm', re: new RegExp(`${DEV_B}(?:आत्महत्या|आत्म-हत्या|खुदकुशी|खुद\\s*कुशी|ज़हर|जहर|फाँसी|फांसी|खुद\\s+को\\s+(?:खत्म|नुकसान|चोट|मार)|अपनी\\s+जान|जान\\s+(?:दे|ले)|नस\\s+काट|हाथ\\s+काट|अपने\\s+आप\\s+को\\s+(?:खत्म|नुकसान|चोट))\\S*`, 'u') },
  { category: 'death', re: new RegExp(`${DEV_B}(?:मौत|मरना|मरने|मर\\s+जा|मर\\s+गय|मर\\s+जाऊ|मरा\\s+हुआ|लाश|कब्र|श्मशान|हत्या|मार\\s+डाल|मार\\s+दूँ|मार\\s+दूं|मारना|क़त्ल|कत्ल|खून|ख़ून)\\S*`, 'u') },
  { category: 'harsh_label', re: new RegExp(`${DEV_B}(?:बेकार|निकम्मा|निकम्मी|पागल|बेवकूफ|नालायक|बोझ|नाकाम|मूर्ख)${DEV_E}`, 'u') },
  { category: 'despair', re: new RegExp(`${DEV_B}(?:जीने\\s+का\\s+मन\\s+नहीं|कोई\\s+फायदा\\s+नहीं|सब\\s+(?:कुछ\\s+)?खत्म|उम्मीद\\s+नहीं|कोई\\s+उम्मीद\\s+नहीं|कोई\\s+मतलब\\s+नहीं)`, 'u') },
  { category: 'substances', re: new RegExp(`${DEV_B}(?:शराब|दारू|नशा|नशे|सिगरेट|बीड़ी|गुटखा|भांग|चरस|गांजा|तंबाकू|ड्रग)\\S*`, 'u') },
  { category: 'violence', re: new RegExp(`${DEV_B}(?:हिंसा|हिंसक|बलात्कार|हथियार|बंदूक|चाकू|बम|धमाका|आतंक)\\S*`, 'u') },
  { category: 'health_hazard', re: new RegExp(`${DEV_B}(?:हार्ट\\s+अटैक|दिल\\s+का\\s+दौरा|स्ट्रोक|दौरा\\s+पड़|कैंसर|ट्यूमर|खून\\s+बह|ज़ख्म|जख्म|चोट\\s+लग|बेहोश|लकवा|दम\\s+घुट)\\S*`, 'u') },
];

/** Plain letters only, so “su*icide” or “s u i c i d e” cannot slip past by decoration. */
const squash = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '');
const SQUASHED_STEMS = ['suicid', 'selfharm', 'killyourself', 'killmyself', 'endmylife', 'endyourlife', 'takemylife', 'takeyourlife', 'overdose', 'hangyourself', 'hangmyself', 'cutyourself', 'cutmyself', 'khudkushi', 'aatmahatya'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const deleet = (s: string) => s.replace(/[013457@$!]/g, c => LEET[c] ?? c);

export function normaliseForCheck(text: string): string {
  return text
    .normalize('NFKC')
    // zero-width characters and soft hyphens are invisible to a reader but break matching
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[’‘`]/g, '\'')
    .replace(/\s+/g, ' ');
}

/** Every unsafe term found, with its category. An empty list means the text is clean. */
export function findUnsafeLanguage(text: string): UnsafeHit[] {
  const t = normaliseForCheck(text);
  const hits: UnsafeHit[] = [];
  const seen = new Set<string>();
  const add = (category: UnsafeCategory, match: string) => { const k = `${category}:${match.toLowerCase()}`; if (!seen.has(k)) { seen.add(k); hits.push({ category, match }); } };
  for (const variant of new Set([t, deleet(t)])) {
    for (const r of RULES) { const m = r.re.exec(variant); if (m) add(r.category, m[0].trim()); }
  }
  const sq = squash(t).toLowerCase();
  const sqd = squash(deleet(t)).toLowerCase();
  for (const stem of SQUASHED_STEMS) if (sq.includes(stem) || sqd.includes(stem)) add('self_harm', stem);
  return hits;
}

export const isSafeLanguage = (text: string) => findUnsafeLanguage(text).length === 0;

/** What to say when a string has to be rejected: the categories, never the words, so logs and portals don't repeat them. */
export const describeHits = (hits: UnsafeHit[]) => [...new Set(hits.map(h => h.category))].join(', ');
