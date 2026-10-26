import { describe, expect, it } from 'vitest';
import { buildContent, decide, dailyCap, ignoredStreak, inQuietHours, type SendFacts } from './notifications';

const base: SendFacts = {
  kind: 'checkin', channel: 'push', localMinutes: 21 * 60, quiet: { start: '22:00', end: '08:00' },
  sentToday: { push: 0, call: 0 }, ignoredStreak: 0, daysSinceOpen: 1, quietWeekAlreadySent: false,
  prefs: { push: true, calls: true, sundayLetter: true, checkinTime: 'evening', followUpAfterHardDay: true },
  consent: { notifications: true, calls: true },
};
const f = (o: Partial<Omit<SendFacts, 'prefs' | 'consent'>> & { prefs?: Partial<SendFacts['prefs']>; consent?: Partial<SendFacts['consent']> } = {}): SendFacts => ({ ...base, ...o, prefs: { ...base.prefs, ...o.prefs }, consent: { ...base.consent, ...o.consent } });

describe('quiet hours', () => {
  it.each([[22 * 60, true], [23 * 60 + 59, true], [0, true], [7 * 60 + 59, true], [8 * 60, false], [12 * 60, false], [21 * 60 + 59, false]])('%i -> %s', (m, q) => expect(inQuietHours(m, '22:00', '08:00')).toBe(q));
  it('supports same-day windows', () => { expect(inQuietHours(13 * 60, '13:00', '15:00')).toBe(true); expect(inQuietHours(15 * 60, '13:00', '15:00')).toBe(false); });
});

describe('decide', () => {
  it('sends an ordinary evening check-in', () => expect(decide(f())).toEqual({ send: true }));
  it('needs consent and the matching preference', () => {
    expect(decide(f({ consent: { notifications: false } }))).toEqual({ send: false, reason: 'no_consent' });
    expect(decide(f({ prefs: { push: false } }))).toEqual({ send: false, reason: 'pref_off' });
    expect(decide(f({ prefs: { checkinTime: 'off' } }))).toEqual({ send: false, reason: 'pref_off' });
    expect(decide(f({ channel: 'call', prefs: { calls: false } }))).toEqual({ send: false, reason: 'pref_off' });
    expect(decide(f({ channel: 'call', consent: { calls: false } }))).toEqual({ send: false, reason: 'pref_off' });
  });
  it('holds everything but the opted-in follow-up during quiet hours', () => {
    expect(decide(f({ localMinutes: 23 * 60 }))).toEqual({ send: false, reason: 'quiet_hours' });
    expect(decide(f({ kind: 'leave', localMinutes: 6 * 60 }))).toEqual({ send: false, reason: 'quiet_hours' });
    expect(decide(f({ kind: 'followup', localMinutes: 23 * 60 }))).toEqual({ send: true });
    expect(decide(f({ kind: 'followup', localMinutes: 23 * 60, prefs: { followUpAfterHardDay: false } }))).toEqual({ send: false, reason: 'pref_off' });
  });
  it('caps at 2 push and 1 call a day', () => {
    expect(decide(f({ sentToday: { push: 1, call: 0 } }))).toEqual({ send: true });
    expect(decide(f({ sentToday: { push: 2, call: 0 } }))).toEqual({ send: false, reason: 'daily_cap' });
    expect(decide(f({ channel: 'call', sentToday: { push: 0, call: 1 } }))).toEqual({ send: false, reason: 'daily_cap' });
  });
  it('halves frequency after three ignored', () => {
    expect(dailyCap('push', 2)).toBe(2);
    expect(dailyCap('push', 3)).toBe(1);
    expect(dailyCap('call', 5)).toBe(1);
    expect(decide(f({ ignoredStreak: 3, sentToday: { push: 1, call: 0 } }))).toEqual({ send: false, reason: 'daily_cap' });
  });
  it('after seven quiet days sends one message, then stays silent until they return', () => {
    expect(decide(f({ daysSinceOpen: 7 }))).toEqual({ send: false, reason: 'paused_after_quiet_week' });
    expect(decide(f({ kind: 'quietweek', daysSinceOpen: 7 }))).toEqual({ send: true });
    expect(decide(f({ kind: 'quietweek', daysSinceOpen: 9, quietWeekAlreadySent: true }))).toEqual({ send: false, reason: 'paused_after_quiet_week' });
    expect(decide(f({ kind: 'quietweek', daysSinceOpen: 2 }))).toEqual({ send: false, reason: 'paused_after_quiet_week' });
  });
});

describe('buildContent', () => {
  it('shows nothing personal on the lock screen when previews are off', () => {
    const c = buildContent('followup', { previews: false, discreet: false, companionName: 'Asha' });
    expect(c.body).toBe('A quiet moment for you?');
    expect(c.title).toBe('Saathi');
    expect(c.actions).toEqual([]);
  });
  it('discreet mode renames the app', () => expect(buildContent('checkin', { previews: false, discreet: true, companionName: 'Asha' }).title).toBe('Calm'));
  it('with previews on, uses the approved copy and marks events time sensitive', () => {
    const c = buildContent('leave', { previews: true, discreet: false, companionName: 'Asha', eventTitle: 'Cubbon Park walk', eventTime: '7:30' });
    expect(c.body).toBe('Cubbon Park walk at 7:30. Leave in ten minutes? I can keep you company.');
    expect(c.timeSensitive).toBe(true);
    expect(c.title).toBe('Asha');
  });
  it('never uses streak or guilt language', () => {
    for (const k of ['checkin', 'plan', 'leave', 'followup', 'quietweek', 'letter'] as const) {
      expect(buildContent(k, { previews: true, discreet: false, companionName: 'Saathi' }).body).not.toMatch(/streak|haven.t talked|missed|days in a row/i);
    }
  });
});

describe('ignoredStreak', () => {
  it('counts back to the last open', () => {
    expect(ignoredStreak(['sent', 'sent', 'opened', 'sent'])).toBe(2);
    expect(ignoredStreak(['opened', 'sent'])).toBe(0);
    expect(ignoredStreak([])).toBe(0);
  });
});
