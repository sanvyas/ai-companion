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
  provider: 'device' | 'sarvam';
  speaker?: string;
  languages: Lang[];
}

const ALL: Lang[] = ['en', 'hinglish', 'hi'];

export const SARVAM_MODEL = 'bulbul:v3';
/** Hinglish is Hindi written for English speakers, and Sarvam reads it as Hindi. */
export const SARVAM_LANG: Record<Lang, string> = { en: 'en-IN', hinglish: 'hi-IN', hi: 'hi-IN' };

const sarvam = (speaker: string, gender: 'female' | 'male'): VoiceInfo => ({ id: `sarvam:${speaker}`, label: speaker[0].toUpperCase() + speaker.slice(1), gender, provider: 'sarvam', speaker, languages: ALL });

export const DEVICE_VOICES: VoiceInfo[] = [
  { id: 'warm', label: 'Warm', gender: null, provider: 'device', languages: ALL },
  { id: 'steady', label: 'Steady', gender: null, provider: 'device', languages: ALL },
  { id: 'bright', label: 'Bright', gender: null, provider: 'device', languages: ALL },
];

export const SARVAM_VOICES: VoiceInfo[] = [
  sarvam('ritu', 'female'), sarvam('priya', 'female'), sarvam('neha', 'female'), sarvam('pooja', 'female'),
  sarvam('shubh', 'male'), sarvam('aditya', 'male'), sarvam('rahul', 'male'), sarvam('rohan', 'male'),
];

const BY_ID = new Map([...DEVICE_VOICES, ...SARVAM_VOICES].map(v => [v.id, v]));
export const voiceById = (id: string) => BY_ID.get(id);
export const speakerOf = (voiceId: string) => BY_ID.get(voiceId)?.speaker;
export const isServerVoice = (voiceId: string) => BY_ID.get(voiceId)?.provider === 'sarvam';

/** The voices that can speak this language. */
export const voicesFor = (lang: Lang, serverVoices: boolean): VoiceInfo[] =>
  [...(serverVoices ? SARVAM_VOICES : []), ...DEVICE_VOICES].filter(v => v.languages.includes(lang));

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
