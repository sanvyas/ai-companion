import { feelingOf, type MonthKind } from '@saathi/domain';
import { api } from '../api';
import { errMsg } from '../state/session';
import { getState, set } from '../state/store';
import { toast } from '../state/actions';
import { getV3, skipMood } from './ui';

/** Say how they are. Tapping the same mood again keeps it (unlike the older designs, which let it be cleared). */
export async function setMood(i: number) {
  const was = getState().mood;
  set({ mood: i });
  try { await api.logMood(i, 'tap'); } catch (e) { set({ mood: was }); toast(errMsg(e)); }
}

/** They chose not to say today. Nothing is asked again until tomorrow. */
export const skipCheckin = () => skipMood();

/** Tell Month about something only they can tell us (a friend they called, a game they played). Quiet if it fails. */
export function logActivity(kind: MonthKind, helped?: boolean) {
  const mood = getState().mood;
  const feeling = helped === undefined ? undefined : feelingOf(mood, getV3().why);
  void api.logActivity({ kind, ...(feeling ? { feeling } : {}), ...(helped === undefined ? {} : { helped }) }).catch(() => undefined);
}
