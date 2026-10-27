// How the companion should sound in this moment. A small, deterministic read of the user's message, the few turns
// before it and how today has felt, so the same words always get the same stance and every rule can be tested.
//
// Six stances, each with its own editable prompt (tone.<stance>) in the admin portal:
//   listen    : they want to express. Reflect, validate, ask one open question. No fixing. Like a good listener.
//   energise  : low or flat, not pouring out. Warm, upbeat, "we've got this" support-group energy, tiny steps.
//   ground    : anxious or racing. Slow, short, steady. Offer breathing or looking around.
//   celebrate : good news. Match their joy.
//   steady    : weighing a choice or asking what to do. Clear, calm, one small next step.
//   play      : light chat. Warm and a little playful.
//
// Safety always wins: at elevated risk the stance is "listen" and the safety instructions lead.

export type Stance = 'listen' | 'energise' | 'ground' | 'celebrate' | 'steady' | 'play';
export const STANCES: Stance[] = ['listen', 'energise', 'ground', 'celebrate', 'steady', 'play'];

export interface ToneInput {
  text: string;
  /** The person's previous messages in this conversation, oldest first. */
  recentUser?: string[];
  /** Today's mood tap, 0 (a heavy day) to 4 (a lighter day), if they gave one. */
  moodToday?: number | null;
  moodTrend?: 'heavier' | 'between' | 'lighter' | 'unknown';
  riskLevel?: 0 | 1 | 2 | 3;
  previous?: Stance | null;
}
export interface Tone { stance: Stance; reason: string }

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[’‘`]/g, '\'').replace(/\s+/g, ' ').trim();
const words = (s: string) => (s.match(/[\p{L}\p{N}']+/gu) ?? []).length;
const has = (t: string, re: RegExp) => re.test(t);

// Devanagari has no word boundaries for \b, so those patterns are written without them.
const LISTEN_ASK = /\b(just vent|can i vent|to vent|venting|vent\b|rant|off my chest|need someone to listen|someone to listen|just listen|only listen|need to vent|want to vent|let me vent|let me talk|just want to talk|need to talk|can i tell you|can i talk about|can i share|don'?t (give|need) (me )?advice|no advice|not looking for advice|sun lo|bas sun|sunna hai|sun sakte|kuch kehna hai|kuch batana hai|batana hai|baat karni hai|dil ki baat|mann halka|man halka)\b|बस सुन|सुन लो|कुछ कहना है|कुछ बताना है|बात करनी है|दिल की बात|मन हल्का/;
const ENERGISE_ASK = /\b(motivate me|cheer me up|pump me up|hype me|encourage me|need motivation|need some motivation|give me (some )?(energy|motivation|a push)|lift my mood|josh (do|chahiye)|himmat do|himmat chahiye|motivation chahiye|energy chahiye|hausla do)\b|हौसला दो|हिम्मत दो|जोश|मोटिवेशन चाहिए/;
const ANXIOUS = /\b(panic\w*|anxious|anxiety|overthink\w*|over-think\w*|racing (heart|thoughts|mind)|heart is racing|my mind is racing|spiral\w*|can'?t stop thinking|overwhelmed|on edge|freaking out|nervous|ghabra\w*|ghabrahat|tension (ho|mein)|bechain|bechaini|dar lag raha|dar lagta)\b|घबराहट|घबरा|बेचैन|डर लग|चिंता|तनाव में/;
const GOOD_NEWS = /\b(got the job|got a job|got selected|got in\b|i passed|i cleared|cleared (the|my)|promotion|promoted|good news|great news|so excited|i'?m excited|so happy|i'?m happy|i did it|finally (did|done|finished|got)|best day|result (aa|came)|select ho|selected ho|pass ho|clear ho|khush|bahut khushi|mazaa aaya|maza aaya|celebrat\w*|birthday|engaged|new job|offer letter)\b|बहुत खुश|खुशखबरी|अच्छी खबर|सेलेक्ट|पास हो|रिज़ल्ट आ|प्रमोशन|नौकरी मिल|मज़ा आया/;
const ADVICE = /\b(should i|what should i do|what do you think|which (one|should)|can'?t decide|not sure (whether|if|what)|i don'?t know (what|whether|if) to|what would you do|any (advice|suggestions?)|kya karun|kya karna chahiye|kya karu|decide nahi|samajh nahi aa raha ki kya)\b|क्या करूँ|क्या करूं|क्या करना चाहिए|सलाह|समझ नहीं आ रहा कि क्या/;
const DISTRESS = /\b(embarrass\w*|humiliat\w*|insult\w*|disrespect\w*|belittl\w*|rejected|ignored|let down|disappointed|sad|lonely|alone|crying|cried|cry|upset|hurt|hurting|heartbroken|miss(ing)? (him|her|them|my|home)|empty|scared|afraid|worried|stressed|exhausted|drained|guilty|ashamed|angry|furious|frustrated|irritated|annoyed|bad day|rough day|terrible day|awful day|hard day|tough day|bura din|bura lag|udaas|akela|akeli|rona|ro raha|ro rahi|thak gaya|thak gayi|pareshan|dukhi|gussa|takleef|dard)\b|उदास|अकेला|अकेली|रो |रोना|परेशान|दुखी|गुस्सा|दर्द|तकलीफ|बुरा दिन|थक गया|थक गई/;
const NARRATIVE = /\b(because|and then|he said|she said|they said|yesterday|last night|this morning|my (boss|manager|mom|dad|mother|father|wife|husband|friend|partner|brother|sister)|told me|shouted|scolded|fought|argument|breakup|broke up|kal raat|usne kaha|usne bola|mere (boss|papa|mummy|dost))\b|उसने कहा|मेरे (बॉस|पापा|मम्मी|दोस्त)/;
const LOW_FLAT = /\b(feel(ing)? (so |very |really |a bit |kind of |pretty )?(low|down|flat|off|blah)|nothing (seems|feels|is) (fun|interesting|exciting|enjoyable)|nothing excites me|nothing interests me|no energy|not feeling (it|great|good|myself)|bored|boring|meh|nothing to do|unmotivated|no motivation|lazy|stuck|procrastinat\w*|can'?t be bothered|don'?t feel like (doing|anything)|feeling low|low energy|feel flat|blah|aalas|aalsi|bore ho|bored ho|kuch karne ka (mann|man)|mann nahi lag|man nahi lag|kuch accha nahi lag)\b|सुस्त|आलस|बोर|मन नहीं लग|कुछ करने का मन नहीं/;
const PLAYFUL = /\b(haha+|hehe+|lol|lmao|joke|funny|random question|tell me something|fun fact|favourite|favorite|good name for|movie|song|playlist|chai|biryani|cricket|meme)\b|😂|😄|😅|🤣|हा हा|मज़ेदार|चुटकुला/;
const ACK = /^(yeah|yes|yep|hmm+|hm+|ok(ay)?|okay|right|true|i guess|maybe|haan|han|hmm|achha|accha|theek|thik|ji)\b[\s.!…]*$|^(हाँ|हां|हम्म|ठीक है|जी|अच्छा)[\s.!…]*$/;

/** Reads the message and context and returns the stance, with the reason in plain words (for logs and tests). */
export function assessTone(i: ToneInput): Tone {
  const t = norm(i.text);
  const n = words(t);
  const risk = i.riskLevel ?? 0;
  if (risk >= 2) return { stance: 'listen', reason: 'elevated risk: safety instructions lead, gentle listening' };

  if (has(t, LISTEN_ASK)) return { stance: 'listen', reason: 'they asked to be listened to' };
  if (has(t, ENERGISE_ASK)) return { stance: 'energise', reason: 'they asked to be encouraged' };
  if (has(t, ANXIOUS) && !has(t, GOOD_NEWS)) return { stance: 'ground', reason: 'anxious or overwhelmed' };
  if (has(t, GOOD_NEWS) && !has(t, DISTRESS)) return { stance: 'celebrate', reason: 'good news' };
  if (has(t, ADVICE) && !has(t, DISTRESS)) return { stance: 'steady', reason: 'weighing a choice or asking what to do' };

  const distress = has(t, DISTRESS);
  const narrative = has(t, NARRATIVE);
  if (distress || (n >= 40 && narrative) || (n >= 60 && risk >= 1)) return { stance: 'listen', reason: distress ? 'expressing something hard' : 'telling a longer story' };

  // A short "hmm" or "yeah" after a stretch of listening is not a request to start cheering.
  if (i.previous === 'listen' && ACK.test(t)) return { stance: 'listen', reason: 'a short acknowledgement while listening' };

  if (has(t, LOW_FLAT)) return { stance: 'energise', reason: 'low or flat, not pouring out' };
  if (has(t, PLAYFUL)) return { stance: 'play', reason: 'light chat' };

  // Nothing in the words decides it: let the day so far lean the tone gently.
  const low = (i.moodToday !== null && i.moodToday !== undefined && i.moodToday <= 1) || (i.moodTrend === 'heavier' && (i.moodToday ?? 2) <= 2);
  const high = i.moodToday !== null && i.moodToday !== undefined && i.moodToday >= 3;
  if (risk === 0 && low) return { stance: 'energise', reason: 'a heavy day on the mood tap, nothing said to the contrary' };
  if (risk >= 1) return { stance: 'listen', reason: 'some distress is in the air, so listen first' };
  if (high) return { stance: 'play', reason: 'a lighter day' };
  return { stance: 'steady', reason: 'no strong signal' };
}

/** The tone for the companion's own first words (a check-in or a walk opening), where there is no message yet. */
export function openingTone(moodToday: number | null | undefined, trend: ToneInput['moodTrend'], mode: 'checkin' | 'walk' | 'first' | 'other'): Tone {
  if (mode === 'first') return { stance: 'steady', reason: 'first meeting: warm and clear' };
  const low = (moodToday !== null && moodToday !== undefined && moodToday <= 1) || trend === 'heavier';
  if (mode === 'walk') return low ? { stance: 'energise', reason: 'a walk on a heavy day: gentle momentum' } : { stance: 'play', reason: 'a walk: light company' };
  if (mode === 'checkin') return low ? { stance: 'listen', reason: 'a check-in after a heavy stretch: listen first' } : { stance: 'steady', reason: 'a check-in: calm and curious' };
  return { stance: 'steady', reason: 'default' };
}
