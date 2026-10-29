import type { ThemeKey } from '@saathi/domain';
import type { OutsideEvent } from '../api';

/** Which worries each sleep story or meditation is gentlest for. Used only to put the best fit first, with the reason. */
export const CALM_TAGS: Record<string, readonly ThemeKey[]> = {
  winddown: ['sleep', 'anxious'], monsoon: ['anxious', 'tired'], train: ['sleep', 'lonely'], garden: ['work', 'tired'],
  sos: ['anxious', 'work'], body: ['tired', 'sleep'], morning: ['work'], kind: ['lonely', 'tired', 'family'],
};

/** What kind of week a nearby event tends to help with, worked out from its category and title. */
export function eventTags(e: Pick<OutsideEvent, 'category' | 'title'>): ThemeKey[] {
  const t = `${e.category} ${e.title}`.toLowerCase();
  if (/yoga|meditat|mindful|breath|sound bath/.test(t)) return ['anxious', 'tired', 'sleep'];
  if (/walk|hike|run|cycl|park|nature|garden/.test(t)) return ['lonely', 'tired', 'family'];
  if (/pottery|art|craft|paint|music|dance|cook|book|writing/.test(t)) return ['work', 'anxious'];
  if (/open mic|circle|meetup|club|group|social|community/.test(t)) return ['lonely'];
  return [];
}
