# v2: the new design, connected to the real backend

Source of the design: the clickable prototype (garden home, five tabs, onboarding and tour, journal timeline and progress, quiet games). v1 stays the fallback: see [RELEASES.md](RELEASES.md).

## Status: built, behind the switch, waiting for you to try it

All seven phases are done and `npm run verify` is green. The new design is **off for everyone** until the `ui.v2` flag is switched on.

**Try it now, only on your own device:** open the app with `?ui=2` on the end of the address (it remembers; `?ui=1` brings the old design back, `?ui=auto` forgets the choice).
**Turn it on for people:** admin portal, Feature flags, `ui.v2`. Start with one person (override), then a percentage, then everyone. Off again in seconds.

What each phase delivered, and where it lives (`apps/web/src/v2`):

| Phase | Delivered |
|---|---|
| 1 Foundation | Two designs share one app: `main.tsx` picks one and loads only its code and styles. Shell, five tabs, six-step sign-up (age and name, phone or Google, companion, consent) with the first marigold really planted, guided tour, help sheet on every screen, safety screens (crisis, safety plan, trusted person, helplines) |
| 2 Home | Garden island drawn from `GET /garden` (`island.ts`), weather-glyph check-in, three-step Today, one small thing with "Why this?", contextual card, bird and ribbon that say what just grew |
| 3 Talk and journal | Voice, video, text and "just sit" calls; journal timeline with search and themes, progress view, write and talk-it-out, the review step; past conversations |
| 4 Calm, You, Outside | Breathing, meditation and sleep stories (no background sounds), picks for the week, a story written for tonight; walks and nearby events; editable gentle plan; memory, privacy, reminders, avatar and voice, language |
| 5 Garden depth | Plants that grow on days you show up, picking, the six-isle road, the garden screen |
| 6 Create and games | Rangoli, paper boat (nothing kept), good-things jar; mend the pot, untangle the thread, constellations |
| 7 Hardening | Browser tests of the new design against the real API, with an accessibility scan of every screen (no serious or critical findings), reduced-motion support, contrast fixes |

### Where the build differs from the plan below, and why

- **Themes are worked out on the phone, not stored.** The plan said `themes` columns on the server. Instead the app finds themes in the words it has already decrypted for the person (pages they chose to share, conversation summaries) and never stores or sends them. Same behaviour, less to protect. The engine is `packages/domain/src/guidance.ts` (tested).
- **The garden has no stored score.** `GET /garden` derives everything from activity every time; only chosen things (plants, keepsakes, rangolis, jar, breaths) are saved. Removing a plan step or a journal page never takes back sunlight.
- **Paper boats store only that a boat was let go.** What was written never leaves the phone.
- **Past conversations cannot be deleted one by one yet.** They clear on the retention schedule in You, Privacy. (Follow-up.)
- **No sounds.** The rain, ocean and wind sounds are gone from the new design by request; the old design still has them.
- **The preview screens for lock screen and incoming call** existed for the demo only and are not part of the new design.

### Follow-ups (not blocking)

- Recorded narration and real audio for the calm catalogue (the catalogue still ships with the app).
- Delete a single past conversation.
- The other five isles (the road shows them; only the Home isle is tended).
- Native app wrappers.

**Rule for every phase: the user and the experience come first.** Each screen must be clear to someone opening the app for the first time, gentle with someone who is struggling, and never punish a missed day. No streak loss, no timers, no scores.

## What already exists and is reused unchanged

Sign-in (phone code, Google), consent, companion choice and voices, conversations (chat, voice, video) with the safety pipeline, journal with reading and memories, mood logs, plan items, calm catalogue and stories, outside events and hobbies, insights, letters, notifications and push, safety plan and trusted contact, privacy and export, admin portal. The new UI talks to these as they are.

## What is new on the server (all additive, so v1 still runs on the same database)

| Need | How |
|---|---|
| Garden growth | **Derived**, not stored: `GET /garden` counts what the person already did (days active, journal entries by feeling, calm sessions, walks and outings, plan steps, conversations, heavy-day seeds) and returns stage, sunlight, tree level and what each place shows. Nothing to drift out of sync, nothing to lose. |
| Plants | table `garden_plants` (slot, kind, planted at, active-days counter at planting); routes to plant and pick. Growth counts days the person showed up. |
| Quiet games and keepsakes | table `garden_keepsakes` (kind: pot seam, flag, constellation) plus tokens **derived** from activity (gold on a hard day, thread after a breathing or meditation, sky after a sleep story) minus what has been spent. |
| Creations | table `garden_creations` (rangoli image, small, sealed). Paper boats are never stored. |
| Good-things jar | table `jar_items`, text sealed like journal entries. |
| Themes | **Done on the phone instead** (see Status): found in what the person chose to share, never stored. |
| Editable plan | existing `plan_items`: add label edit and delete (`PATCH`, `DELETE /plan/:id`) and creating your own steps. |
| Plan from memory | Done in `packages/domain/src/guidance.ts`: the one small thing from mood, this week's themes and time of day, with the reason ("Because worry came up 3 times"). Same for stories, events and what the next messages will say. |
| Conversation list | `GET /conversations` already existed and carries the summary the timeline shows. |

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
