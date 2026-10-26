// Notification rules (PRD 8.8). Pure, so every rule is unit tested and the scheduler only supplies facts.
//   - at most 2 push and 1 call a day
//   - quiet hours (default 22:00-08:00), with one exception: the follow-up the user opted into after a hard day
//   - three ignored in a row halves the frequency
//   - seven days without opening: one "No pressure" message, then nothing until the user is back
//   - no streaks, no guilt copy, and lock-screen text is generic unless previews are on

export type NotifKind = 'checkin' | 'plan' | 'leave' | 'followup' | 'quietweek' | 'letter';
export type Channel = 'push' | 'call';

export interface SendFacts {
  kind: NotifKind;
  channel: Channel;
  /** Minutes since local midnight. */
  localMinutes: number;
  quiet: { start: string; end: string };
  sentToday: { push: number; call: number };
  /** Consecutive notifications with no open since. */
  ignoredStreak: number;
  daysSinceOpen: number;
  quietWeekAlreadySent: boolean;
  prefs: { push: boolean; calls: boolean; sundayLetter: boolean; checkinTime: 'morning' | 'evening' | 'off'; followUpAfterHardDay: boolean };
  consent: { notifications: boolean; calls: boolean };
}

export type Decision = { send: true } | { send: false; reason: 'no_consent' | 'pref_off' | 'quiet_hours' | 'daily_cap' | 'paused_after_quiet_week' };

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Handles windows that cross midnight (22:00 to 08:00). */
export function inQuietHours(localMinutes: number, start: string, end: string): boolean {
  const s = toMinutes(start), e = toMinutes(end);
  if (s === e) return false;
  return s < e ? localMinutes >= s && localMinutes < e : localMinutes >= s || localMinutes < e;
}

export const dailyCap = (channel: Channel, ignoredStreak: number): number => {
  const base = channel === 'push' ? 2 : 1;
  return ignoredStreak >= 3 ? Math.max(1, Math.floor(base / 2)) : base;
};

export function decide(f: SendFacts): Decision {
  if (!f.consent.notifications) return { send: false, reason: 'no_consent' };
  if (f.channel === 'call' && (!f.consent.calls || !f.prefs.calls)) return { send: false, reason: 'pref_off' };
  if (f.channel === 'push' && !f.prefs.push) return { send: false, reason: 'pref_off' };
  if (f.kind === 'checkin' && f.prefs.checkinTime === 'off') return { send: false, reason: 'pref_off' };
  if (f.kind === 'letter' && !f.prefs.sundayLetter) return { send: false, reason: 'pref_off' };
  if (f.kind === 'followup' && !f.prefs.followUpAfterHardDay) return { send: false, reason: 'pref_off' };

  // A quiet week: exactly one gentle message, then silence until the person comes back.
  if (f.daysSinceOpen >= 7) {
    if (f.kind === 'quietweek' && !f.quietWeekAlreadySent) { /* allowed, subject to quiet hours below */ }
    else return { send: false, reason: 'paused_after_quiet_week' };
  } else if (f.kind === 'quietweek') {
    return { send: false, reason: 'paused_after_quiet_week' };
  }

  const exemptFromQuiet = f.kind === 'followup';
  if (!exemptFromQuiet && inQuietHours(f.localMinutes, f.quiet.start, f.quiet.end)) return { send: false, reason: 'quiet_hours' };

  const sent = f.channel === 'push' ? f.sentToday.push : f.sentToday.call;
  if (sent >= dailyCap(f.channel, f.ignoredStreak)) return { send: false, reason: 'daily_cap' };
  return { send: true };
}

export interface NotifContent { title: string; body: string; route: string; tag: string; timeSensitive: boolean; actions: { action: string; title: string }[] }

const GENERIC = 'A quiet moment for you?';

/**
 * Lock-screen copy. With previews off every message is the same generic line, and discreet mode drops the app name
 * (PRD 8.8). Event details are only shown when previews are on.
 */
export function buildContent(kind: NotifKind, o: { previews: boolean; discreet: boolean; companionName: string; eventTitle?: string; eventTime?: string }): NotifContent {
  const title = o.discreet ? 'Calm' : o.previews ? o.companionName : 'Saathi';
  const base = { title, tag: kind, timeSensitive: kind === 'leave' };
  const rich: Record<NotifKind, { body: string; route: string; actions: { action: string; title: string }[] }> = {
    checkin: { body: 'Ready for your evening check-in? Two minutes, whenever suits.', route: 'checkin', actions: [{ action: 'talk', title: 'Talk now' }, { action: 'type', title: 'Type' }, { action: 'later', title: 'Later' }] },
    plan: { body: 'The 10-minute walk you picked. Whenever you’re ready.', route: 'plan', actions: [{ action: 'walk', title: 'Walk with me' }, { action: 'done', title: 'Did it' }, { action: 'skip', title: 'Not today' }] },
    leave: { body: `${o.eventTitle ?? 'Your plan'}${o.eventTime ? ` at ${o.eventTime}` : ''}. Leave in ten minutes? I can keep you company.`, route: 'walk', actions: [{ action: 'company', title: 'Keep me company' }, { action: 'onway', title: 'On my way' }, { action: 'skip', title: 'Skip it' }] },
    followup: { body: 'Thinking of you after yesterday. Want to talk?', route: 'talk', actions: [{ action: 'talk', title: 'Talk' }, { action: 'later', title: 'Not now' }] },
    quietweek: { body: 'No pressure. I’m here when you want.', route: 'today', actions: [{ action: 'open', title: 'Open Saathi' }] },
    letter: { body: 'Your Sunday letter is here.', route: 'letter', actions: [{ action: 'open', title: 'Open' }] },
  };
  const r = rich[kind];
  return { ...base, body: o.previews ? r.body : GENERIC, route: r.route, actions: o.previews ? r.actions : [] };
}

/** Consecutive unopened notifications, newest first. 'opened' ends the streak. */
export function ignoredStreak(outcomesNewestFirst: ('sent' | 'opened')[]): number {
  let n = 0;
  for (const o of outcomesNewestFirst) { if (o === 'opened') break; n++; }
  return n;
}
