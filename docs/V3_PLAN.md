# v3: the third design, from "Saathi Fresh"

Source: the Claude Design prototype `Saathi Fresh.dc.html` (handoff bundle). v1 and v2 stay as they are: see [RELEASES.md](RELEASES.md).

## Status: built, behind its own switch

**Try it only on your own device:** open the app with `?ui=3` on the end of the address (it remembers; `?ui=1` or `?ui=2` pick the others, `?ui=auto` forgets the choice).
**Turn it on for people:** admin portal, Feature flags, `ui.v3` (off by default). If both `ui.v3` and `ui.v2` are on, v3 wins. Off again in seconds.

## What it is

Five tabs: **Home, Relax, Talk, Journal, Month**.

- **How are you, right now?** One tap, once a day (Skip is always there), then an optional "what's it about". The answer decides what Home leads with: heavy day offers talk, anxious offers a breath, meh offers a small distraction, okay a tiny step, great a note of what went well.
- **Home**: a check-in card from Saathi, one adaptive hero, three nearby suggestions, tiny steps as paper notes, nearby events, and a small card for the month. Nudges at the top come only from real unread inbox cards.
- **Relax**: filter by how you want to feel; one-minute breathing (three cycles), meditations, sleep stories, a story written for tonight, and four quiet games (rangoli, balloon pop, fruit slice, cozy room: no timers, no scores to beat).
- **Talk**: voice, video, text; sit together; walk with me.
- **Journal**: today by part of the day, a book of earlier days, write or speak, and the same review step as v2 (what to remember, a tiny step).
- **Month**: the last four weeks, shown a different way each month you have been here: a song, letters, a future you coming into focus, then a what-works guide. Any can be tried from the tabs.

The screens for sign-up, memory, privacy, reminders, voice studio, language, paywall and the safety sheets (plan, trusted person, helplines, crisis) are the v2 ones, lazy-loaded (`v3/Legacy.tsx`). They look like v2 and are the next thing to restyle.

## Honest data

Nothing in Month is invented or scored.

- What a day held is worked out on the server from the same activity the garden uses (`actDays`), plus `activity_log` for things only the person can say: a friend called, a game played, a day they showed up, and whether a breath or story **helped**. "Helped" is only ever a tap.
- A day with only a check-in is "showed up". A quiet day is only a quiet day.
- Saathi's "did you…?" notes are questions; nothing is added without a tap.
- No step counts: the app does not have them.
- Song titles, styles and rewritten lines live only on the phone (`localStorage`, `saathi.v3.song`).

## Server

- Migration `0017_month.sql`: `activity_log` (RLS, per person) and the `ui.v3` flag.
- `GET /month` (last four weeks: days with kinds and mood, plus the latest what-helped rows), `POST /activity` (rate-limited). Contracts in `packages/contracts/src/month.ts`; rules in `packages/domain/src/month.ts` (tested).
- `activity_log` is included in the data export and removed with the account.
- `/public-config` returns `uiV3`.

## Tests

- `packages/domain/src/month.test.ts`, `apps/api/test/month.test.ts`, `apps/api/test/ui-flag.test.ts`.
- `apps/web/src/v3/css.test.ts` (the inline-style parser).
- `apps/api/test/browser.v3.e2e.test.ts`: the real build, served by the real API, in a real browser. A day (mood, Home, a step, a full breath and "it did", rangoli, journal, text chat, every Month way, help sheet, You) with the server asserted at each step; new sign-up landing on the mood screen; the `ui.v3` switch and the `?ui=1/2` overrides. Every screen is scanned with axe (no serious or critical findings).

## Known limits

- Legacy screens (above) are v2-styled inside v3.
- No guided tour in v3.
- The song is drawn, not played.
- The v3 design canvas boards for Rest, Circle and Map were not drawn; only Main, Now, Talk, Remember, Days and River were.
