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

## The final pass (what changed after trying it)

The third design now borrows what worked from the first two: the first design's room and type (24 px gutters, 17 px text, 34 to 38 px serif titles, 56 px buttons, soft white cards), the third design's colour and grouping, and a touch of the second design's garden, without its progress.

- **Colour follows the day.** `v3/theme.ts` sets the colour at the top of every screen from the hour (morning peach, afternoon sky, evening apricot, night soft lavender) and leans it warmer and brighter on a heavy or flat day, to lift rather than match. It never goes dark and never strays far from the base paper colour.
- **Sign-up is the first design's flow in the third design's colours.** One picture-led welcome screen says what Saathi does. Language, name, number and code share one screen (the code box opens in place). Anyone who taps "I already have an account" is not asked their age, name or language: the server takes `returning` on `/auth/otp/start`, `/auth/otp/verify` and `/auth/google`, never creates an account on that path, and answers `no_account` so the app can hand them to sign-up (where age is asked). The under-18 path is unchanged.
- **How are you, again and again, but not nagging.** After three or more hours away (`GAP_MS` in `v3/ui.ts`), opening the app asks first, by name, with a face and a word for each of five feelings, and mentions what they said last time. Answering and skipping count the same. It only appears on a tab, never over a call or a breath. Kept on the phone (`saathi.v3.asked`, `saathi.v3.last`).
- **Home**: greeting, how you are, a small living garden (sky of the hour, swaying flowers, a butterfly; touch it and petals lift; nothing is counted), Saathi checking on you, one thing for right now with a few lighter options, tiny steps with a progress bar, nearby events, This month.
- **Relax** is laid out like a meditation app: one pick for how you are and the hour, quick resets, meditations, sleep stories, tales made for tonight, and last of all a little play with one game picked for the month (`pickFor` in `v3/Relax.tsx`; the month's game is `GAMES[month % 4]`).
- **Month** shows only this month's way up front (song, letters, future you, what works, by months since joining); the other ways are one tap away. Tiny steps are a checklist.
- **For you** (the bell on Home) replaces guessing what needs attention: your check-in, a heavy-day nudge that offers what has helped you before, your next tiny step, something near you, a Sunday letter, an empty month. Each is a button that does the thing. Built only from what is true today.
- **Notifications** say more about you and do more: with previews on, a push uses your name, how yesterday was, a step you set and what has helped you before (never when previews are off or discreet mode is on), and its buttons go straight to Breathe, Talk, Walk and so on (`buildContent` in `packages/domain/src/notifications.ts`, `personalContext` in `apps/api/src/services/notifier.ts`).

## Type, colour and pictures (after the first look)

- **Type**: Fraunces (soft) for headlines and Plus Jakarta Sans for everything else. Both are bundled, so nothing is fetched at run time. Headlines use `font-size-adjust` so Hindi and English lines stay the same size.
- **Colour**: six palettes (`v3/palette.ts`: Indigo Dusk, Garden Teal, Sunrise Terracotta, Rose and Plum, Ocean Mist, Forest Sage). Each sets the main colour, a lighter one, a highlight, the paper, field and tile colours, the Talk card, and the top-of-screen colour for each part of the day. Moods, warnings and words never change. Pick under You, then Colours; it is kept on the phone, and `?palette=<id>` sets it for a link. All are light, and the contrast of each is tested (`palette.test.ts`).
- **Month** opens on letters, always (`FEATURED_MODE` in the domain package). Each stamp is a small drawing of what the day held. Song, future you and what works are one tap away.
- **Pictures**: Talk and Journal are drawn, not iconed (`v3/art.tsx`): Saathi with a glow and a few quiet words, a bench under a tree, a path through hills, a notebook with a pen, and a small picture for morning, afternoon and evening. How you felt is shown with the same five faces everywhere.

## Known limits

- Legacy screens (memory, privacy, reminders in detail, voice studio, language, safety sheets) are v2-styled inside v3. Sign-up is no longer one of them.
- No guided tour in v3.
- The song is drawn, not played.
- The v3 design canvas boards for Rest, Circle and Map were not drawn; only Main, Now, Talk, Remember, Days and River were.
