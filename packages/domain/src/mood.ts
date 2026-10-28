// Reading the mood from what a person says (English, Hinglish, Hindi). It is deliberately plain: a word list with
// negation, intensity, "but" and emoji, so the result is predictable, testable and costs nothing per message. It feeds
// the tone of the reply (tone.ts) and, summed over a few days, the plan, stories and calm narration. It reads feelings,
// never facts, and it is a guess: how sure it is travels with it as `confidence`.

export type Emotion = 'sad' | 'lonely' | 'anxious' | 'angry' | 'overwhelmed' | 'tired' | 'numb' | 'ashamed' | 'happy' | 'excited' | 'grateful' | 'calm' | 'hopeful';
export type Arousal = 'low' | 'steady' | 'high';
export interface MoodReading { /** -2 heavy ... 0 neither ... +2 light */ valence: -2 | -1 | 0 | 1 | 2; /** The same, before rounding. */ score: number; arousal: Arousal; emotions: Emotion[]; /** 0 to 1: how much feeling was actually expressed. */ confidence: number }

interface Entry { re: RegExp; emotion: Emotion; v: number; a?: Arousal }

const w = (src: string) => new RegExp(`(?:^|[^\\p{L}])(?:${src})(?![\\p{L}])`, 'giu');
// Devanagari words have no useful word boundary for \b, and are matched as they stand.
const d = (src: string) => new RegExp(`(?:${src})`, 'giu');

const LEXICON: Entry[] = [
  // sad
  { re: w("sad|sadness|unhappy|down|low|blue|gloomy|miserable|heartbroken|broken|crying|cried|cry|tears|upset|grief|grieving|hurt|hurting|depressed|devastated|crushed|gutted|grey|gray|heavy|terrible|awful|horrible|worst|rough|bad day|not a good day|mood is off|mood off"), emotion: 'sad', v: -1 },
  { re: w("heartbroken|devastated|miserable|crushed|gutted|unbearable|in pieces|my heart is broken"), emotion: 'sad', v: -1 },
  { re: w("udaas|udas|dukhi|dukh|bura lag\\w*|kharab|ro raha|ro rahi|ro padi|ro pada|rona|aansu|bhaari|bhari|tut gaya|tut gayi|dil toot\\w*|mood off|mood kharab"), emotion: 'sad', v: -1 },
  { re: d("उदास|दुखी|दुख|रो रहा|रो रही|रो पड़ा|रो पड़ी|रोना|आंसू|आँसू|बुरा लग|टूट गया|टूट गई|भारी"), emotion: 'sad', v: -1 },
  // lonely
  { re: w("lonely|alone|isolated|left out|no one (?:cares|understands|calls|talks|listens)|nobody (?:cares|understands|calls|talks|listens|really understands)|miss(?:ing)? (?:my|him|her|them|home|you)|missing out"), emotion: 'lonely', v: -1 },
  { re: w("akela|akeli|tanha|tanhai|koi nahi (?:hai|samajhta)|koi nahi samajhta|yaad aa\\w*"), emotion: 'lonely', v: -1 },
  { re: d("अकेला|अकेली|अकेलापन|तन्हा|तन्हाई|याद आ"), emotion: 'lonely', v: -1 },
  // anxious
  { re: w("anxious|anxiety|worried|worry|worrying|nervous|panic|panicking|panicky|scared|afraid|frightened|stress|stressed|stressful|tense|tension|on edge|overthink\\w*|restless|uneasy|freaking out|racing|jittery"), emotion: 'anxious', v: -1, a: 'high' },
  { re: w("ghabra\\w*|ghabrahat|dar lag\\w*|darr|tension|chinta|bechain\\w*|bechaini|pareshan|pareshaan|fikar"), emotion: 'anxious', v: -1, a: 'high' },
  { re: d("घबराहट|घबरा|डर लग|डर|चिंता|तनाव|बेचैन|परेशान|फिक्र"), emotion: 'anxious', v: -1, a: 'high' },
  // angry
  { re: w("angry|anger|furious|irritated|irritates|irritating|annoyed|annoying|frustrated|frustrating|fed up|pissed|mad at|rage|hate|hated|resent\\w*|livid|sick of"), emotion: 'angry', v: -1, a: 'high' },
  { re: w("gussa|gusse|chidh\\w*|naraz|naaraz|irritate|jal raha|bhadak"), emotion: 'angry', v: -1, a: 'high' },
  { re: d("गुस्सा|गुस्से|चिढ़|नाराज़|नाराज|खीज"), emotion: 'angry', v: -1, a: 'high' },
  // overwhelmed
  { re: w("overwhelmed|too much|can'?t cope|can not cope|cannot cope|swamped|buried|drowning|breaking down|falling apart|can'?t handle|can not handle|cannot handle|at my limit|stretched thin"), emotion: 'overwhelmed', v: -2 },
  { re: w("zyada ho gaya|bahut zyada|sambhal nahi|sambhal nahin|handle nahi|bardasht nahi|bardaasht nahi|thak gaya hoon sab se"), emotion: 'overwhelmed', v: -2 },
  { re: d("ज़्यादा हो गया|ज्यादा हो गया|बहुत ज़्यादा|बहुत ज्यादा|संभल नहीं|बर्दाश्त नहीं"), emotion: 'overwhelmed', v: -2 },
  // tired
  { re: w("tired|exhausted|drained|burnt out|burned out|burnout|sleepy|no energy|worn out|fatigued|wiped|knackered|sleep deprived|can'?t keep my eyes open|exhausting"), emotion: 'tired', v: -1, a: 'low' },
  { re: w("thak|thaka|thaki|thak gaya|thak gayi|thakan|neend aa rahi|neend nahi|energy nahi"), emotion: 'tired', v: -1, a: 'low' },
  { re: d("थक|थका|थकी|थकान|नींद नहीं|ऊर्जा नहीं"), emotion: 'tired', v: -1, a: 'low' },
  // numb / flat / bored
  { re: w("empty|numb|hollow|flat|blank|apathetic|bored|boring|meh|nothing is fun|nothing feels (?:good|fun|real)|dull|lifeless|going through the motions|don'?t (?:feel|care) (?:anything|about anything)|do not feel anything|don'?t feel anything|nothing excites me|no motivation|unmotivated"), emotion: 'numb', v: -1, a: 'low' },
  { re: w("khali|sunn|bore|bored|kuch nahi lagta|kuch accha nahi|mann nahi|man nahi|mann nahin|kuch karne ka mann nahi"), emotion: 'numb', v: -1, a: 'low' },
  { re: d("खाली|सुन्न|बोर|कुछ करने का मन नहीं|मन नहीं लग"), emotion: 'numb', v: -1, a: 'low' },
  // shame
  { re: w("ashamed|shame|guilty|guilt|embarrassed|embarrassing|humiliated|regret|regrets|stupid|idiot|failure|useless|worthless|pathetic|disappointed in myself|let (?:everyone|them|him|her) down|my fault"), emotion: 'ashamed', v: -2 },
  { re: w("sharminda|sharm|sharam|galti meri|nalayak|bekaar"), emotion: 'ashamed', v: -2 },
  { re: d("शर्मिंदा|शर्म|मेरी गलती|नालायक|बेकार"), emotion: 'ashamed', v: -2 },
  // mild or negated phrases that need their own entry
  { re: w("not bad|not too bad|not so bad|could be worse"), emotion: 'calm', v: 0.4 },
  { re: w("achha nahi|accha nahi|acha nahi|theek nahi|thik nahi|sahi nahi|achha nahin|accha nahin|theek nahin|thik nahin|mood theek nahi"), emotion: 'sad', v: -1 },
  { re: d("अच्छा नहीं|ठीक नहीं|सही नहीं|अच्छा नही|ठीक नही"), emotion: 'sad', v: -1 },
  // more everyday ways of saying a day went badly or well
  { re: w("dread\\w*|disappoint\\w*|struggl\\w*|difficult|painful|hard time|failing|failed|fail|mess|messed up|pointless|stuck|lost|give up|giving up|can'?t stop thinking|cannot stop thinking|can not stop thinking|nothing (?:i do|works|helps|is enough|seems to work)|not enough|don'?t know what to do|do not know what to do|no idea what to do|going wrong|went wrong|fell apart|let down|rejected|ignored|insulted|bullied|snapped at|yelled at|shouted at|scolded"), emotion: 'sad', v: -1 },
  { re: w("helped|helps|helping|went well|goes well|smile|smiled|laughed|laughing|comfortable|supported|understood|cared for|cared about|success|successful|achieved|accomplished|won|passed|improving|improved|progress|enjoy|pleasant|safe|rewarding|made my day"), emotion: 'happy', v: 1 },
  { re: w("bura din|bura hua|bekaar din|din kharab|bura raha|kharab raha|bekaar raha|nikamma|haar gaya|haar gayi|fail ho|reject ho|daant|daanta|daanti|chillaya|chillayi|dhokha"), emotion: 'sad', v: -1 },
  { re: w("accha raha|achha raha|acha raha|badhiya raha|mazedaar|maja aaya|maza aaya|madad mili|aaram se|sab theek ho gaya|jeet gaya|jeet gayi|pass ho gaya|pass ho gayi"), emotion: 'happy', v: 1 },
  { re: d("बुरा दिन|बेकार दिन|हार गया|हार गई|डाँट|डांट|फेल"), emotion: 'sad', v: -1 },
  { re: d("अच्छा रहा|अच्छी रही|बढ़िया रहा|मदद मिली|जीत गया|जीत गई"), emotion: 'happy', v: 1 },
  // withdrawing, struggling with the body, and feeling unseen
  { re: w("brutal|harsh|draining|toxic|invisible|unseen|unwanted|unloved|trapped|worthless|same mistakes|keep (?:failing|messing)|don'?t want to (?:see|talk|meet|get up|go|do|speak|eat|move)|do not want to (?:see|talk|meet|get up|go|do|speak|eat|move)|can'?t (?:eat|sleep|focus|breathe|concentrate|relax|stop crying)|cannot (?:eat|sleep|focus|breathe|concentrate|relax|stop crying)|not wake up|dizzy|sick to my stomach|headache|head hurts|hurts"), emotion: 'sad', v: -1 },
  { re: w("praised|praise|appreciated|refreshed|rested|love|loving|affection|warm|cozy|cosy|connected|belonging|achievement|well done|congratulations|celebrate|celebrating|celebration|treat|holiday|vacation|weekend|reunion"), emotion: 'happy', v: 1 },
  // happy
  { re: w("happy|happier|glad|joy|joyful|cheerful|delighted|pleased|content|wonderful|amazing|awesome|fantastic|great|lovely|loved|love it|enjoyed|enjoying|fun|good|nice|better|best|proud|relieved|relief|energetic|energised|energized|motivated|lighter|looking up|laughing|smiling"), emotion: 'happy', v: 1 },
  { re: w("khush|khushi|mast|badhiya|badiya|maza|mazaa|accha lag\\w*|achha lag\\w*|acha lag\\w*|garv|proud feel|sahi hai|zabardast|shandar|select ho|pass ho|clear ho"), emotion: 'happy', v: 1 },
  { re: d("खुश|खुशी|मस्त|बढ़िया|मज़ा|मजा|अच्छा लग|अच्छा लगा|गर्व|ज़बरदस्त|शानदार|सेलेक्ट|पास हो"), emotion: 'happy', v: 1 },
  // excited
  { re: w("excited|thrilled|pumped|can'?t wait|ecstatic|over the moon|elated|stoked|buzzing|so excited"), emotion: 'excited', v: 2, a: 'high' },
  { re: w("utsahit|josh|bahut excited|ekdum excited"), emotion: 'excited', v: 2, a: 'high' },
  { re: d("उत्साहित|जोश"), emotion: 'excited', v: 2, a: 'high' },
  // grateful
  { re: w("grateful|thankful|blessed|appreciate|appreciated|thank you|thanks"), emotion: 'grateful', v: 1 },
  { re: w("shukriya|dhanyavaad|dhanyavad|aabhaari|abhari|shukr"), emotion: 'grateful', v: 1 },
  { re: d("शुक्रिया|धन्यवाद|आभारी|शुक्र"), emotion: 'grateful', v: 1 },
  // calm
  { re: w("calm|peaceful|peace|relaxed|relaxing|at ease|serene|settled|content|quiet and|soothed|rested|at peace"), emotion: 'calm', v: 1, a: 'low' },
  { re: w("sukoon|sukun|shaanti|shanti|aaram|chain|relax"), emotion: 'calm', v: 1, a: 'low' },
  { re: d("सुकून|शांति|आराम|चैन|राहत"), emotion: 'calm', v: 1, a: 'low' },
  // hopeful
  { re: w("hopeful|hope|optimistic|looking forward|things will get better|brighter|positive|encouraged|confident"), emotion: 'hopeful', v: 1 },
  { re: w("umeed|ummeed|asha|bharosa|himmat"), emotion: 'hopeful', v: 1 },
  { re: d("उम्मीद|आशा|भरोसा|हिम्मत"), emotion: 'hopeful', v: 1 },
];

const EMOJI: [RegExp, Emotion, number, Arousal?][] = [
  [/[😢😭😞😔☹🙁😥😓💔🥺]/u, 'sad', -1],
  [/[😟😰😨😱😬]/u, 'anxious', -1, 'high'],
  [/[😡😠🤬😤]/u, 'angry', -1, 'high'],
  [/[😴🥱😩😫]/u, 'tired', -1, 'low'],
  [/[😊😀😄😁🥰😍🤗🙏🎉✨😃]/u, 'happy', 1],
  [/[😌☺🌿]/u, 'calm', 1, 'low'],
];

const NEGATOR = /(?:^|[^\p{L}])(?:not|no|never|isn'?t|aren'?t|wasn'?t|don'?t|doesn'?t|didn'?t|can'?t|cannot|won'?t|nahi|nahin|nhi|mat|na|without)(?![\p{L}])|नहीं|ना\s*$/iu;
const MORE = /(?:^|[^\p{L}])(?:very|so|really|extremely|totally|completely|absolutely|utterly|incredibly|too|bahut|bohot|bohut|kaafi|behad|ekdum|itna|zyada)(?![\p{L}])|बहुत|बेहद|काफ़ी|काफी|इतना|एकदम/iu;
const LESS = /(?:^|[^\p{L}])(?:a bit|a little|slightly|kind of|sort of|somewhat|bit|little|thoda|thodi|zara|halka)(?![\p{L}])|थोड़ा|थोड़ी|ज़रा|जरा|हल्का/iu;
const BUT = /(?:^|[^\p{L}])(?:but|however|though|although|yet|lekin|par|magar|parantu|phir bhi)(?![\p{L}])|लेकिन|मगर|पर\s|परंतु|फिर भी/iu;

const clampV = (n: number): -2 | -1 | 0 | 1 | 2 => (n <= -2 ? -2 : n >= 2 ? 2 : (Math.round(n) as -1 | 0 | 1));

export function detectMood(input: string): MoodReading {
  const text = input.toLowerCase().normalize('NFKC').replace(/[’‘`]/g, '\'').replace(/\s+/g, ' ').trim();
  if (!text) return { valence: 0, score: 0, arousal: 'steady', emotions: [], confidence: 0 };

  // Split into clauses at "but": what comes after usually carries the feeling, so it counts a little more.
  const parts = text.split(new RegExp(BUT.source, 'giu'));
  // Clause boundaries are also sentence ends, so "I was upset. Now I feel lighter." leans on the later one.
  const clauses: { t: string; weight: number }[] = [];
  parts.forEach((p, pi) => {
    const sentences = p.split(/[.!?;\n]+/).map(s => s.trim()).filter(Boolean);
    sentences.forEach((s, si) => clauses.push({ t: s, weight: (pi > 0 ? 1.8 : 1) * (1 + 0.1 * si) }));
  });

  let sum = 0, hits = 0, high = 0, low = 0;
  const strength = new Map<Emotion, number>();

  for (const c of clauses) {
    for (const e of LEXICON) {
      e.re.lastIndex = 0;
      const seen = new Set<number>();
      for (let m = e.re.exec(c.t); m; m = e.re.exec(c.t)) {
        if (seen.has(m.index)) { e.re.lastIndex++; continue; }
        seen.add(m.index);
        const before = c.t.slice(Math.max(0, m.index - 26), m.index + (m[0].startsWith(' ') ? 1 : 0));
        let v = e.v;
        if (MORE.test(before.slice(-14))) v *= 1.6; else if (LESS.test(before.slice(-14))) v *= 0.5;
        // A negator just before flips the feeling: "not happy" is heavy; "not sad" is only slightly light.
        const near = before.trim().split(' ').slice(-2).join(' ');
        const negated = NEGATOR.test(` ${near}`);
        if (negated) v = e.v > 0 ? -0.8 * Math.abs(v) : 0.4 * Math.abs(v);
        const dv = v * c.weight;
        sum += dv; hits++;
        const em: Emotion = negated ? (e.v > 0 ? 'sad' : 'calm') : e.emotion;
        strength.set(em, (strength.get(em) ?? 0) + Math.abs(dv));
        if (!negated) { if (e.a === 'high') high += Math.abs(dv); if (e.a === 'low') low += Math.abs(dv); }
      }
    }
  }

  for (const [re, emotion, v, a] of EMOJI) {
    const n = (text.match(new RegExp(re.source, 'gu')) ?? []).length;
    if (!n) continue;
    sum += v * Math.min(n, 2); hits += 1;
    strength.set(emotion, (strength.get(emotion) ?? 0) + Math.min(n, 2));
    if (a === 'high') high += 1; if (a === 'low') low += 1;
  }

  // Excited punctuation raises the energy of what was said; it never changes whether it was heavy or light.
  if (/!{2,}/.test(text)) high += 0.5;

  const total = Math.abs(sum);
  // A phrase with both heavy and light feelings nets out; several matches in the same direction strengthen it.
  const score = hits === 0 ? 0 : Math.max(-2, Math.min(2, sum / (1 + 0.25 * Math.max(0, hits - 1))));
  const valence = clampV(score);
  const emotions = [...strength.entries()].filter(([, s]) => s >= 0.6).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const words = (text.match(/[\p{L}\p{N}']+/gu) ?? []).length;
  const confidence = hits === 0 ? 0 : Math.min(1, 0.35 + 0.2 * hits + (total >= 2 ? 0.2 : 0) - (words > 40 ? 0.15 : 0));
  const arousal: Arousal = high > low + 0.4 ? 'high' : low > high + 0.4 ? 'low' : 'steady';
  return { valence, score: Math.round(score * 100) / 100, arousal, emotions, confidence: Math.round(confidence * 100) / 100 };
}

/**
 * The mood across several recent readings, oldest first. Later readings count more, and readings that expressed no
 * feeling are left out rather than pulling the result toward neutral.
 */
export function blendMood(readings: MoodReading[]): MoodReading {
  const felt = readings.filter(r => r.confidence >= 0.3);
  if (!felt.length) return { valence: 0, score: 0, arousal: 'steady', emotions: [], confidence: 0 };
  let num = 0, den = 0, hi = 0, lo = 0;
  const em = new Map<Emotion, number>();
  felt.forEach((r, i) => {
    const wgt = Math.pow(1.6, i) * r.confidence;
    num += r.score * wgt; den += wgt;
    if (r.arousal === 'high') hi += wgt; if (r.arousal === 'low') lo += wgt;
    for (const e of r.emotions) em.set(e, (em.get(e) ?? 0) + wgt);
  });
  const avg = num / den;
  return {
    valence: clampV(avg >= 0 ? Math.floor(avg + 0.5) : -Math.floor(-avg + 0.5)), score: Math.round(avg * 100) / 100,
    arousal: hi > lo + 0.3 * den ? 'high' : lo > hi + 0.3 * den ? 'low' : 'steady',
    emotions: [...em.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3),
    confidence: Math.min(1, den / felt.length),
  };
}

/** The same scale as the mood tap: 0 heavy to 4 light. */
export const valenceToTap = (v: number): number => Math.max(0, Math.min(4, Math.round(v + 2)));
