# v2: the new design, connected to the real backend

Source of the design: the clickable prototype (garden home, five tabs, onboarding and tour, journal timeline and progress, quiet games). v1 stays the fallback: see [RELEASES.md](RELEASES.md).

**Rule for every phase: the user and the experience come first.** Each screen must be clear to someone opening the app for the first time, gentle with someone who is struggling, and never punish a missed day. No streak loss, no timers, no scores.

## What already exists and is reused unchanged

Sign-in (phone code, Google), consent, companion choice and voices, conversations (chat, voice, video) with the safety pipeline, journal with reading and memories, mood logs, plan items, calm catalogue and stories, outside events and hobbies, insights, letters, notifications and push, safety plan and trusted contact, privacy and export, admin portal. The new UI talks to these as they are.

## What is new on the server (all additive, so v1 still runs on the same database)

| Need | How |
|---|---|
| Garden growth | **Derived**, not stored: `GET /garden` counts what the person already did (days active, journal entries by feeling, calm sessions, walks and outings, plan steps, conversations, heavy-day seeds) and returns stage, sunlight, tree level and what each place shows. Nothing to drift out of sync, nothing to lose. |
| Plants | table `garden_plants` (slot, kind, planted at, active-days counter at planting); routes to plant and pick. Growth counts days the person showed up. |
| Quiet games and keepsakes | table `garden_keepsakes` (kind: pot seam, flag, constellation) plus tokens **derived** from activity (gold on a hard day, thread after a breathing or meditation, sky after a sleep story) minus what has been spent. |
| Creations | table `creations` (rangoli image, small, private to the person). Paper boats are never stored. |
| Good-things jar | table `jar_items`, text sealed like journal entries. |
| Themes | `themes text[]` on journal entries and on a conversation summary, filled when the entry is read (the reading already exists); used by the plan engine, stories, events and notifications. |
| Editable plan | existing `plan_items`: add label edit and delete (`PATCH`, `DELETE /plan/:id`) and creating your own steps. |
| Plan from memory | `GET /plan/today` ranks the one small thing from mood, this week's themes and time of day, and returns the reason ("Because worry came up 3 times"). Same for story and event suggestions and the notification text. |
| Conversation list | `GET /conversations` already exists; add a short summary and themes so the timeline can show them. |

Every new route has: input validation, an authorisation check, a happy-path test, an unauthorised test and a validation-failure test. Every new table has row-level security and a test.

## Phases (each ends with `npm run verify` green and something you can open and use)

1. **Foundation**: design tokens (colour, type, motion), app shell with the five tabs and pushed screens, onboarding (six steps) and the guided tour, wired to the real sign-in and consent. Help button on every screen.
2. **Home and today**: the garden island as SVG driven by `GET /garden`, the three-step Today list on real check-ins, mood as weather, contextual card.
3. **Talk and journal**: voice, chat and video on the real conversation engine and safety pipeline; journal write and speak; timeline with search and themes; progress tab; conversation detail with delete.
4. **Calm and plan**: breathing, meditation and sleep stories (real narration), "picked for you" from themes; editable gentle plan; outside events ranked by what the person has been talking about.
5. **Garden depth**: plants, picking, the isles roadmap, the weekly letter card.
6. **Create and quiet games**: rangoli, paper boat, good-things jar; mend the pot, untangle the thread, constellations, unlocked by kind acts.
7. **Hardening**: accessibility pass on every screen, low-end phone performance, offline behaviour, the browser end-to-end suite updated to the new screens, copy review against the safe-language lexicon.

## How v2 ships without risk

The new screens sit behind the feature flag `ui.v2` (admin portal, Feature flags). **Off (the default): everyone sees the v1 screens, exactly as now.** On: the new design. The flag can be turned on for one person first (flag override), then for everyone, and turned off again in seconds with no deploy. The two designs share the same API, so nothing is migrated or lost either way.

## Release

v2 is developed on its own branch and is not merged to `main` (and so not live for everyone) until you have used it and said yes. The old app stays one switch away.
