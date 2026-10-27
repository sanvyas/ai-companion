import type { Persona } from '../state/store';

// Helpers for the companion's voice id. The three on-device voices are plain words; a named server voice looks like
// sarvam:priya. The phone's own speech engine only knows the three personas, so a named voice maps to the closest one
// for the times it has to fall back to the phone.
export const LEGACY: Persona[] = ['warm', 'steady', 'bright'];
export const isLegacy = (v: string): v is Persona => (LEGACY as string[]).includes(v);
export const isServerVoice = (v: string) => !isLegacy(v) && v.includes(':');

export function voiceLabel(v: string): string {
  const name = isLegacy(v) ? v : v.split(':')[1] ?? v;
  return name ? name[0].toUpperCase() + name.slice(1) : 'Warm';
}

/** Male voices read as steady, the rest as warm. The list from the server says which is which. */
export function personaOf(v: string, genderOf?: (id: string) => 'female' | 'male' | null | undefined): Persona {
  if (isLegacy(v)) return v;
  return genderOf?.(v) === 'male' ? 'steady' : 'warm';
}
