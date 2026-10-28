# Admin portal and developer platform

One place for the founders to see and control Saathi: people, cost, AI prompts, safety, settings, API keys, infrastructure and code. It is a separate web app (`apps/admin`) that talks to the API under `/admin/api`. It has its own sign-in and its own sessions, and shares nothing with the citizen app's login.

## Start it

```bash
npm run dev:api                                   # http://localhost:8787
npm run admin:create -w @saathi/api -- --email you@example.com --name "Your Name"   # first admin = owner
npm run dev:admin                                 # http://localhost:5174
```

`admin:create` prints a one-time password. First sign-in asks you to scan a QR code with an authenticator app (Google Authenticator, 1Password, Authy) and then always asks for a six-digit code. Change the password from the top bar after signing in.

In production, serve the admin build (`npm run build -w @saathi/admin`, output `apps/admin/dist`) from its own origin, build it with `VITE_API_URL=https://your-api`, and put that origin in the API's `ADMIN_ORIGINS`. Keep it on a different hostname from the citizen app. Restrict it by IP or put it behind your VPN if you can.

## What each page does

| Page | Use it to |
|---|---|
| Overview | See health of backend, AI, product and infrastructure at a glance; spend; safety events; things that need attention. |
| People | Add people (owner) and give them a sign-in code. Search people (never phone numbers), see plan, activity, consents; change plan, suspend or restore, request account deletion, set per-person flag overrides. No journal or conversation content is shown anywhere. |
| Cost and pricing | Spend by day, feature, vendor and model, in rupees; budget warning; edit price rates; re-price older usage. Usage with no rate is shown as unpriced, never as ₹0. |
| Prompts | Every instruction the AI follows. Edit as a draft, test in the playground, run the evaluations, publish, roll back. Each publish keeps the old version. |
| Evaluations | Safety and quality test cases per prompt. A safety-critical prompt can only be published by an owner after a passing run on that exact version. |
| Safety review | The queue of risky replies flagged for human review. |
| Settings and flags | Models (chosen from a list), limits, maintenance mode, kill switches, sign-up gate, per-person flag overrides. Changes apply within seconds, no restart. |
| Content | Helplines (with last-verified dates) and local events. |
| Usage analytics | Screens, steps and clicks from people who opted in. Anonymous id only. |
| Integrations and keys | Paste a vendor key; it is encrypted, never shown again, and used by the app on the next request. |
| Infrastructure | Database, job queue, errors, versions, migrations. |
| Developer | Commits, pull requests, CI runs and deploy buttons for each environment (GitHub). |
| Approvals | Changes waiting for someone more senior to approve, with approve, reject and withdraw. |
| Audit log | Every admin action with before and after values. Append-only. |
| Admins | Add people, change roles, end sessions. |

## Roles

- **owner**: everything: API keys, price rates, audit log, admin accounts, production deploys, and publishing safety-critical prompts.
- **engineer**: settings, flags, prompt drafts and publishing (not safety-critical ones), content, deploys to non-production environments, infrastructure actions.
- **support**: people (plan, suspend, deletion requests), safety review, content.
- **viewer**: read only (no audit log, no key values).

## What is live and what is only stored

Saving a key makes the app use it immediately only where the code exists.

| Integration | State |
|---|---|
| OpenRouter | **Used by the app when “AI provider” is set to OpenRouter.** One key, many vendors' models. |
| Anthropic | **Used by the app.** Conversations, safety, journal reading, summaries, letters. Add the key and chat works. |
| Google sign-in client id | Used by the app. |
| Web push (VAPID) | Used by the app. |
| GitHub token | Used by the Developer page. |
| Sarvam | **Used by the app (voices).** Add the key and people can pick a natural Indian voice in the app; Test connection speaks one test word. Listening (speech-to-text) is not built yet. |
| Soniox, ElevenLabs, AssemblyAI, MSG91 | **Key stored only.** The adapters are not built yet; they follow the vendor test (`docs/PROVIDERS.md`). Saving a key changes nothing for users yet. |

The starter price rates (migration `0011`) for those vendors are unverified placeholders. Check them against each vendor's price page before relying on the cost numbers. Anthropic rates are deliberately not pre-filled: enter them on Cost and pricing, otherwise Claude spend shows as unpriced.

## Security design

- Password (scrypt) plus TOTP with replay protection. Five failures in 15 minutes lock the account.
- Session cookie is httpOnly, SameSite=Strict, path `/admin`, Secure in production. 8-hour session, 60-minute idle limit. Every write also needs the `X-CSRF-Token` header.
- CORS: admin origins may send cookies; app origins may not reach `/admin`.
- API keys are encrypted with a key derived from `DATA_KEK` (changing `DATA_KEK` makes stored keys unreadable, so back it up). Keys are write-only in the UI. An environment variable of the same name takes precedence and is shown as "from the server's environment".
- `admin_audit` rejects updates and deletes at the database level.
- Admin tables have row security on with no policy for the app role, so a bug in the citizen API cannot read them.
- Maintenance mode and kill switches never block helplines, health checks, public config or the admin portal.

## Privacy guarantees

Admins see counts, ids and metadata only. Conversation and journal text is never shown, exported or used for analytics. Product analytics records only an allow-listed set of events from people who opted in (screen name, step name, `data-track` ids), keyed by a keyed hash, never the user id. Opting out stops collection; erasure deletes the person's events.

## Runtime settings and environment

| Variable | Where | Meaning |
|---|---|---|
| `ADMIN_ORIGINS` | API | Comma-separated origins of the admin app. Default `http://localhost:5174`. |
| `ADMIN_SESSION_HOURS` | API | Session lifetime. Default 8. |
| `AUTO_MIGRATE=1` | API | Apply migrations at start in production (otherwise run `npm run db:migrate` as a release step). |
| `APP_VERSION`, `GIT_SHA`, `BUILD_TIME` | API | Shown on Infrastructure and Developer. The Dockerfile and deploy workflow set them. |
| `GITHUB_TOKEN` | API or Integrations page | Developer page. Fine-grained token: Contents read, Pull requests read, Actions read and write, Metadata read. |
| `VITE_API_URL` | Admin build | Public URL of the API. |

Set the repository (`owner/name`) and the list of environments (name and API base URL) under Settings and flags, Developer group.

## Deploy from the portal

`.github/workflows/ci.yml` runs typecheck, tests and builds on every push and pull request. `.github/workflows/deploy.yml` is started from the Developer page (or the Actions tab). It builds the chosen ref, publishes the API image to GHCR and calls your host's deploy hook.

One-time setup per GitHub Environment (`staging`, `production`): secret `DEPLOY_HOOK_URL` (a URL your host gives you to pull and restart the image), variable `WEB_API_URL` (that environment's API URL). Turn on required reviewers for `production`.

These workflows and `apps/api/Dockerfile` have not been run on real GitHub runners or a Docker daemon yet. Expect to fix small things on the first run.

## Known limits

- The Developer page shows and triggers; it does not edit code or merge.
- Voice, SMS and call cost lines stay empty until those adapters exist.
- The evaluation suites use seeded synthetic cases. With the mock model one critical case fails by design; re-run against the real model before inviting anyone.

## Approvals: who can change the live app

Changes by anyone **below owner** do not reach the app straight away. They wait on the **Approvals** page for someone strictly more senior who is also allowed to make that change (support → engineer or owner; engineer → owner). Approving runs the very same request again, as the approver, so every validation, audit entry and live reload applies exactly as if the approver had made it. You can't approve your own change. A rejection needs a reason, and the person who asked can withdraw a change that is still waiting.

Covered: settings, feature flags (and per-person overrides), price rates and re-pricing, publishing or reverting a prompt, helplines and events, a person's plan, and deploys. Not covered, on purpose: drafting prompts, the test bench, evaluations, reviewing safety events, and pausing or removing a person (those need to be quick, and are still audited).

Owners apply their own changes directly, because there is no one above them. The owner-only switch “Changes need approval” turns the whole mechanism off. The safety rules still hold when an owner approves: a safety prompt still needs its passing evaluation at that moment.

## Inviting people (sign-in codes)

While no SMS vendor is connected, phone sign-in works only for people an owner has added under **People → Add a person**. Give each person their six-digit code (shown once; “New code” makes another, “Remove” stops it). Five wrong codes lock that person for 15 minutes. Only keyed hashes of the phone and code are stored. Once an SMS vendor exists, invited codes keep working until you remove them.

`BETA_LOGINS_BOOTSTRAP="9876543210:123456"` (comma-separated `phone:code` pairs) adds invites at startup if they don't exist yet. It never overwrites. Remove the variable once real people are added in the portal.

## Choosing models

Model settings are dropdowns, validated against the list in `apps/api/src/runtime/models.ts`. Add a line there when a new model is released.

## Using OpenRouter instead of (or alongside) Anthropic

1. **Integrations and keys → OpenRouter → Set**: paste a key from openrouter.ai/settings/keys (starts with `sk-or-`). **Test connection** shows whether it is accepted and how much credit is left.
2. Under the key, **Choose model** for each job (companion replies, safety checks, analysis). The picker lists the text models OpenRouter offers for your key, with prices per million tokens, context size and whether the model follows structured (JSON) output reliably. **Try this model** sends one small real message and shows the reply, the speed and the cost in rupees. A model that OpenRouter doesn't offer is refused when you save.
3. **Use OpenRouter for the app** switches who serves every call (replies, safety classifier, journal reading, summaries, letters). It applies to the next message, with no restart. **Switch back to Anthropic** reverses it. The same switch is the “AI provider” setting.
4. **Then run the Evaluations.** A different model can judge risky messages differently, and the safety suites are how you check that it still catches the ones that matter before you invite people.

OpenRouter reports the exact cost of each call, which the Cost page records as-is (converted at the rate under Settings → Cost). The default OpenRouter model ids are starting points: choose the ones you actually want from the live list. Prompt caching is not used through OpenRouter, so long conversations can cost more per message than through Anthropic directly.

## Voices and avatars

People choose their companion's **avatar** (Orb, Asha, Dev, Noor, Kabir) and **voice** in the app: during setup, and later under You → Avatar and voice. Both save immediately and are used everywhere (calls, walks, Today).

Voices come from Sarvam's `bulbul:v3` model once its key is added under Integrations. The list the app shows depends on the person's language (English, Hinglish, Hindi) and is the same eight voices for now: Ritu, Priya, Neha, Pooja (women's voices) and Shubh, Aditya, Rahul, Rohan (men's voices), as labelled on Sarvam's voices page. Each has a Preview button that plays a short sample; samples are generated once per voice and language and kept in memory, so previewing costs almost nothing. The three on-device voices (Warm, Steady, Bright) are always offered as the fallback.

During a call, a replies' sentences are spoken by Sarvam for anyone who chose a Sarvam voice (never in plain text chat). If Sarvam fails for a sentence, the app says that sentence with the phone's own voice instead. Spend is recorded per character (provider `sarvam`, rate on Cost and pricing) so it shows up on the Cost page.

To add voices, add a line to `apps/api/src/services/voices.ts` (speaker name and gender, from Sarvam's list). Only voices listed there can be chosen. The pricing seed for Sarvam (₹3 per 1,000 characters) is unverified: check it on their price page.

## Tone, safe language and stories

**One companion, six ways of being with someone.** For every turn the app picks a stance in code (`packages/domain/src/tone.ts`) from what the person just said, their mood taps and the stance of the turn before, then adds that stance's prompt (`tone.listen`, `tone.energise`, `tone.ground`, `tone.celebrate`, `tone.steady`, `tone.play`) to the turn. Listening wins whenever someone wants to be heard or the risk is elevated; a low, flat message gets a gentle lift like a good support group; anxiety gets grounding; good news gets celebrated. The choice is deterministic so it can be tested, and the model may still adapt when the conversation clearly says otherwise. Check-in and walk openings pick their tone from the recent mood.

**Words that are never written.** `packages/domain/src/lexicon.ts` holds a word list (English, Hinglish and Hindi) of words about suicide, death, harming oneself or anyone, violence, dangerous health events, harsh labels and despair, including idioms ("killing it", "dead tired", "skip lunch"). It tolerates look-alike spelling, zero-width characters and spacing tricks. Feeling words (heavy, tired, lonely, hurting) are deliberately allowed. The list is applied in four places:

1. the `style.safe_language` rules are appended **in code** to every prompt that writes words a person will read, so editing a prompt in the portal cannot remove them;
2. replies are checked sentence by sentence before being shown; a sentence with a banned word is held back and the reply is rewritten once, or replaced by a fixed gentle line;
3. plans, letters, summaries, memories, check-in notes and stories are checked the same way (`services/guard.ts`): one strict retry, then a reviewed fixed text, or, for the Sunday letter, nothing is sent;
4. built-in content (calm sessions, events, small steps) is checked by tests.

A held-back draft is recorded in the error log by **category only** (`unsafe_language`), never the words, so the Errors page shows how often it happens.

**Calm stories.** Sleep tab → “A story made for tonight”: the person picks a place from a fixed list (never free text), and `POST /calm/story` writes a short story in their language, shaped by their recent mood, through the same check, falling back to a reviewed story. The story is not stored. Narration is still the phone’s own voice.

**Evaluations.** The *Companion replies* suite now includes tone cases (venting, low, good news, anxious, idioms, skipped meals, anger) and a new *Plans, stories, letters, openings* suite makes the model write each of those and fails any that contain a banned word or are the wrong shape. Run both with the real key after changing any prompt; the unit tests cannot judge what a real model writes.

**Known limits.** The word list will miss things a person can say in ways no list anticipates and will occasionally hold back a harmless sentence (that costs a gentle fallback line, never safety). Level 2 no longer asks about ending a life in direct words, because the same words would be blocked in the reply; it asks whether the person is safe and offers Tele-MANAS. Have a clinician review `safety.level2` and the crisis screens before launch. Fallback stories are English only.

## Calm voices, dictation and the browser tests

**Who reads a calm session.** With a Sarvam key connected, calm sessions and written-for-tonight stories are read by a natural server voice (`POST /calm/narrate`), not the phone's speech engine. The voice and pace follow the person's recent mood taps (`services/narration.ts`): a heavier stretch gets the softest voice at the slowest pace, a lighter day a brighter voice closer to natural speed, and sleep stories never get the brightest voice. If the person has picked a Sarvam voice for their companion, that voice is kept and only the pace changes. The mood-to-speaker table in that file is data; which speaker suits which mood is a listening decision, so audition the voices and adjust it. Lines are cached in memory (48 MB cap) and fetched a few ahead so reading does not stall. Without a key the phone's own voice reads, at the same pace and a natural pitch. In live calls the companion also speaks slower when listening and a little livelier when lifting someone's mood.

**Journal “Talk it out”.** Browsers stop listening on their own after a pause. Dictation now restarts whenever the browser ends a listening session while the microphone is on, rebuilds the text from every result each time (so a final result is never dropped), keeps words still being recognised when the person taps stop, and offers an English / हिन्दी switch (Hinglish follows Hindi, which hears English words in Hindi speech well). Browser recognition is still the engine; a server speech-to-text vendor would be more accurate for Hinglish but is not connected.

**Origins.** The WebSocket for calls and chat accepts the configured `WEB_ORIGINS` and the API's own address. Before this, an app served by the API itself (the single-service Render deploy) was refused when `WEB_ORIGINS` named only the Netlify site, which showed as “Not connected” on every call and chat.

**Browser tests.** `apps/api/test/browser.e2e.test.ts` builds the web app as production does, serves it from the real API in a real Chromium, and drives it: voice call (with the production origin setting), text chat, every tab, video and sit calls, check-in from its card, walk, journal write and read-back, dictation with browser restarts, calm narration with a fake Sarvam, stories, and the avatar and voice pickers, failing on any page error or failed request. `npm test` runs them; they skip themselves if no Chromium is installed. The speech recogniser and the voice vendor are the only stand-ins.
