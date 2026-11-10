// The voices people can give their companion. The three on-device voices always work (the phone's own speech engine).
// Named voices come from Sarvam's text-to-speech, which speaks Indian English, Hindi and Hinglish well. The speaker names
// are Sarvam's `bulbul:v3` voices and their genders are as published on Sarvam's voices page; add more here as you
// confirm them.

export type Lang = 'en' | 'hinglish' | 'hi';
export type Persona = 'warm' | 'steady' | 'bright';

export interface VoiceInfo {
  id: string;
  label: string;
  gender: 'female' | 'male' | null;
  provider: 'device' | 'sarvam' | 'google';
  /** The vendor's own name for the voice (Sarvam's speaker, or Google's voice name such as en-IN-Wavenet-A). */
  speaker?: string;
  languages: Lang[];
}

const ALL: Lang[] = ['en', 'hinglish', 'hi'];

export const SARVAM_MODEL = 'bulbul:v3';
/** Hinglish is Hindi written for English speakers, and Sarvam reads it as Hindi. */
export const SARVAM_LANG: Record<Lang, string> = { en: 'en-IN', hinglish: 'hi-IN', hi: 'hi-IN' };

const sarvam = (speaker: string, gender: 'female' | 'male'): VoiceInfo => ({ id: `sarvam:${speaker}`, label: speaker[0].toUpperCase() + speaker.slice(1), gender, provider: 'sarvam', speaker, languages: ALL });

/** Google Cloud WaveNet voices. English voices read Hinglish too, since it is written in English letters. */
export const GOOGLE_MODEL = 'Wavenet';
const google = (name: string, label: string, gender: 'female' | 'male', languages: Lang[]): VoiceInfo => ({ id: `google:${name.toLowerCase()}`, label, gender, provider: 'google', speaker: name, languages });
const EN_HING: Lang[] = ['en', 'hinglish'];

export const DEVICE_VOICES: VoiceInfo[] = [
  { id: 'warm', label: 'Warm', gender: null, provider: 'device', languages: ALL },
  { id: 'steady', label: 'Steady', gender: null, provider: 'device', languages: ALL },
  { id: 'bright', label: 'Bright', gender: null, provider: 'device', languages: ALL },
];

export const SARVAM_VOICES: VoiceInfo[] = [
  sarvam('ritu', 'female'), sarvam('priya', 'female'), sarvam('neha', 'female'), sarvam('pooja', 'female'),
  sarvam('shubh', 'male'), sarvam('aditya', 'male'), sarvam('rahul', 'male'), sarvam('rohan', 'male'),
];

export const GOOGLE_VOICES: VoiceInfo[] = [
  google('en-IN-Wavenet-A', 'Indian English, woman (A)', 'female', EN_HING), google('en-IN-Wavenet-D', 'Indian English, woman (B)', 'female', EN_HING),
  google('en-IN-Wavenet-B', 'Indian English, man (A)', 'male', EN_HING), google('en-IN-Wavenet-C', 'Indian English, man (B)', 'male', EN_HING),
  google('hi-IN-Wavenet-A', 'Hindi, woman (A)', 'female', ['hi']), google('hi-IN-Wavenet-D', 'Hindi, woman (B)', 'female', ['hi']),
  google('hi-IN-Wavenet-B', 'Hindi, man (A)', 'male', ['hi']), google('hi-IN-Wavenet-C', 'Hindi, man (B)', 'male', ['hi']),
  google('en-US-Wavenet-F', 'American English, woman', 'female', ['en']), google('en-US-Wavenet-D', 'American English, man', 'male', ['en']),
  google('en-GB-Wavenet-A', 'British English, woman', 'female', ['en']), google('en-GB-Wavenet-B', 'British English, man', 'male', ['en']),
];

const BY_ID = new Map([...DEVICE_VOICES, ...SARVAM_VOICES, ...GOOGLE_VOICES].map(v => [v.id, v]));
export const voiceById = (id: string) => BY_ID.get(id);
export const speakerOf = (voiceId: string) => BY_ID.get(voiceId)?.speaker;
export const isServerVoice = (voiceId: string) => { const p = BY_ID.get(voiceId)?.provider; return p === 'sarvam' || p === 'google'; };
export const vendorOf = (voiceId: string): 'sarvam' | 'google' | null => { const p = BY_ID.get(voiceId)?.provider; return p === 'sarvam' || p === 'google' ? p : null; };

/** Which kinds of server voice are connected. `true` means Sarvam alone, as before; the phone's own voices always work. */
export type VoiceVendors = boolean | { sarvam?: boolean; google?: boolean };
const has = (v: VoiceVendors, vendor: 'sarvam' | 'google') => typeof v === 'boolean' ? v && vendor === 'sarvam' : !!v[vendor];

type TtsLike = { configured: boolean; has?(vendor: string): boolean } | null | undefined;
/** Which server voices are connected right now. A provider that cannot say is taken to be the one vendor (Sarvam). */
export const vendorsOf = (tts: TtsLike): { sarvam: boolean; google: boolean } =>
  ({ sarvam: !!tts?.configured && (tts.has ? tts.has('sarvam') : true), google: !!tts?.configured && !!tts.has?.('google') });
/** True when this voice is a server voice whose vendor is connected. */
export const canSpeak = (tts: TtsLike, voiceId: string): boolean => { const v = vendorOf(voiceId); return !!v && vendorsOf(tts)[v]; };

/** The voices that can speak this language. */
export const voicesFor = (lang: Lang, vendors: VoiceVendors): VoiceInfo[] =>
  [...(has(vendors, 'sarvam') ? SARVAM_VOICES : []), ...(has(vendors, 'google') ? GOOGLE_VOICES : []), ...DEVICE_VOICES].filter(v => v.languages.includes(lang));

/** How a voice sounds in words, for the model's prompt and the on-device fallback: women's voices warm, men's steady. */
export const personaOf = (voiceId: string): Persona => {
  const v = BY_ID.get(voiceId);
  if (!v) return 'warm';
  if (v.provider === 'device') return v.id as Persona;
  return v.gender === 'male' ? 'steady' : 'warm';
};

/** A short, friendly sample of each language for the preview button. It carries no personal data, so it can be cached. */
export const SAMPLE: Record<Lang, string> = {
  en: 'Hi. I’m here whenever you want to talk. There’s no hurry.',
  hinglish: 'Hi, main yahan hoon, jab bhi aap baat karna chahein. Koi jaldi nahi hai.',
  hi: 'नमस्ते। मैं यहाँ हूँ, जब भी आप बात करना चाहें। कोई जल्दी नहीं है।',
};
