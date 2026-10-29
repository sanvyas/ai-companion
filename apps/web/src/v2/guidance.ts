import { useMemo } from 'react';
import { oneThing, weekThemes, type Said, type ThemeCounts } from '@saathi/domain';
import { useStore } from '../state/store';
import { useSkyPhase } from './hooks';

/**
 * What Saathi noticed this week and the one small thing it suggests. Uses only what the person has chosen to let Saathi learn from:
 * pages they shared with it and conversation summaries, and only when "remember" is on.
 */
export function useSaid(): { remember: boolean; said: Said[] } {
  const remember = useStore(s => s.consent?.remember ?? false);
  const entries = useStore(s => s.jEntries);
  const recent = useStore(s => s.recent);
  const said = useMemo<Said[]>(() => (!remember ? [] : [
    ...entries.filter(e => e.shared).map(e => ({ at: e.createdAt, text: e.text })),
    ...recent.filter(c => c.summary).map(c => ({ at: c.startedAt, text: c.summary ?? '' })),
  ]), [remember, entries, recent]);
  return { remember, said };
}

export function useGuidance() {
  const { remember, said } = useSaid();
  const mood = useStore(s => s.mood);
  const phase = useSkyPhase();
  const themes = useMemo<ThemeCounts>(() => weekThemes(said, new Date()), [said]);

  const one = useMemo(() => oneThing({ mood, night: phase === 'night', themes, useConversations: remember }), [mood, phase, themes, remember]);
  return { themes, one, remember };
}
