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

/** What the app knows that makes a nudge about them and not about the app. All of it is optional; every line reads well without it. */
export interface NotifContext {
  nick?: string;
  /** How they said they were the last time they did, on an earlier day (0 heaviest, 4 lightest). */
  lastMood?: number | null;
  /** The hour where they are, 0-23. */
  hour?: number;
  /** A tiny step they have for today and have not done yet. */
  stepLabel?: string;
  /** Something they said helped them the last time they felt low. */
  helped?: 'breathe' | 'walk' | 'talk' | 'journal' | 'play' | 'friend' | 'sleep' | 'out' | null;
}

const HELPED_LINE: Record<NonNullable<NotifContext['helped']>, string> = {
  breathe: 'A slow breath helped last time.', walk: 'A walk helped last time.', talk: 'Talking it through helped last time.', journal: 'Writing it down helped last time.',
  play: 'A little play helped last time.', friend: 'Calling a friend helped last time.', sleep: 'A proper rest helped last time.', out: 'Getting out helped last time.',
};

/**
 * Lock-screen copy. With previews off every message is the same generic line, and discreet mode drops the app name
 * (PRD 8.8). Event details and anything personal are only shown when previews are on. Each line is something a friend could say:
 * it names the person, mentions what they told us, and offers one thing to tap. Never a streak, never guilt.
 */
export function buildContent(kind: NotifKind, o: { previews: boolean; discreet: boolean; companionName: string; eventTitle?: string; eventTime?: string; ctx?: NotifContext }): NotifContent {
  const title = o.discreet ? 'Calm' : o.previews ? o.companionName : 'Flint';
  const base = { title, tag: kind, timeSensitive: kind === 'leave' };
  const c = o.ctx ?? {};
  const you = c.nick?.trim() ? `${c.nick.trim()}, ` : '';
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const heavy = c.lastMood !== undefined && c.lastMood !== null && c.lastMood <= 1;
  const morning = c.hour !== undefined && c.hour < 12;
  const help = heavy && c.helped ? ` ${HELPED_LINE[c.helped]}` : '';
  const checkinBody = heavy ? `${cap(you)}yesterday felt heavy. How are you today?${help}`
    : morning ? `${cap(you)}how’s your morning going? Two minutes, whenever suits.` : 'Ready for your evening check-in? Two minutes, whenever suits.';
  const checkinActions = heavy && c.helped === 'breathe'
    ? [{ action: 'breathe', title: 'Breathe' }, { action: 'talk', title: 'Talk now' }, { action: 'later', title: 'Later' }]
    : [{ action: 'talk', title: 'Talk now' }, { action: 'type', title: 'Type' }, { action: 'later', title: 'Later' }];
  const rich: Record<NotifKind, { body: string; route: string; actions: { action: string; title: string }[] }> = {
    checkin: { body: checkinBody, route: 'checkin', actions: checkinActions },
    plan: { body: c.stepLabel ? `A small one for today: “${c.stepLabel}”. Want company while you do it?` : 'The 10-minute walk you picked. Whenever you’re ready.', route: 'plan', actions: [{ action: 'walk', title: 'Walk with me' }, { action: 'done', title: 'Did it' }, { action: 'skip', title: 'Not today' }] },
    leave: { body: `${o.eventTitle ?? 'Your plan'}${o.eventTime ? ` at ${o.eventTime}` : ''}. Leave in ten minutes? I can keep you company.`, route: 'walk', actions: [{ action: 'company', title: 'Keep me company' }, { action: 'later', title: 'I’m fine' }] },
    followup: { body: `${cap(you)}thinking of you after yesterday. Want to talk, or just breathe for a minute?`, route: 'talk', actions: [{ action: 'talk', title: 'Talk' }, { action: 'breathe', title: 'Breathe' }, { action: 'later', title: 'Not now' }] },
    quietweek: { body: `${cap(you)}no pressure. Your little garden is still here, and so am I.`, route: 'today', actions: [{ action: 'open', title: 'Open Flint' }] },
    letter: { body: `${cap(you)}your Sunday letter is here. A few kind lines about your week.`, route: 'letter', actions: [{ action: 'open', title: 'Open' }] },
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
