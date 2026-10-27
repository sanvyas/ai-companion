# Saathi

An AI companion for adults in India who feel lonely, stressed or low: talk by voice, video or text, journal privately, calm down, and take small steps outside. **A wellness companion, not a therapist, doctor or crisis service.**

Product spec: [`docs/PRD.md`](docs/PRD.md). Design source: `design/`.

This is a real application: phone sign-in, an encrypted Postgres database, an API server, Claude for conversations, a safety pipeline on every turn, a scheduler for check-ins and letters, web push, and a React PWA. Three things are deliberately **not connected yet** because the vendor is yours to choose: the SMS/WhatsApp provider for sign-in codes, server-side speech (STT/TTS), and outbound phone calls. Each is one interface to implement ([`docs/PROVIDERS.md`](docs/PROVIDERS.md)). Until then the app uses the browser's own speech engines for voice, and Google sign-in can stand in for phone codes.

## What you need to give it

| Key | Where from | Needed for |
|---|---|---|
| `DATABASE_URL` | Supabase project in **Mumbai (ap-south-1)**: Settings > Database > Session pooler | everything |
| `ANTHROPIC_API_KEY` | console.anthropic.com | conversations, safety classifier, journal reading, summaries, letters |
| `JWT_SECRET`, `DATA_KEK`, `PHONE_HASH_KEY`, `OTP_PEPPER` | `npm run gen:secrets -w @saathi/api` (you generate them; back up `DATA_KEK`) | auth, encryption |
| `GOOGLE_CLIENT_ID` | Google Cloud Console, OAuth Web client (optional) | "Continue with Google" |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (optional) | push notifications |

Step by step: [`docs/SETUP.md`](docs/SETUP.md).

## Run it locally

```bash
npm install
cp apps/api/.env.example apps/api/.env      # fill in DATABASE_URL, ANTHROPIC_API_KEY, secrets
npm run db:migrate                          # applies migrations, loads helplines + calm catalogue
npm run dev:api                             # http://localhost:8787
npm run dev:web                             # http://localhost:5173
npm run verify                              # typecheck + all tests + production build
```

In development the sign-in code is printed in the API log and shown on screen (`OTP_PROVIDER=console`). Production refuses that.

`http://localhost:5173/?demo` runs the UI against an in-memory stand-in with seeded data and a scripted companion, for design review. It talks to nothing.

## How it fits together

```
apps/web         React + Vite PWA (service worker for push + offline shell)
apps/api         Fastify API + WebSocket conversations + scheduler (same process, RUN_WORKER)
packages/contracts   Zod schemas shared by API and web
packages/domain  Pure, tested rules: safety classifier, output check, journal analysis, notification rules
```

- **Data.** Postgres with row-level security on every table, keyed on the signed-in user. The API connects as the owner and, per request, drops to a no-`BYPASSRLS` role (`saathi_app`) and sets the user id. Journal text, memories, summaries and phone numbers are encrypted with a per-user key wrapped by `DATA_KEK` (AES-256-GCM). Phones are looked up by a keyed hash, and masked in responses.
- **Auth.** Phone code (hashed, 5 attempts, 30 s resend, 5/hour) or Google ID token. 15-minute access token + rotating refresh token with reuse detection. 18+ gate; an under-18 disclosure in conversation pauses the account.
- **Conversations.** WebSocket per conversation. Every user turn goes through a keyword pre-filter (English, Hinglish, Hindi) and a Claude Haiku classifier concurrently with reply generation; the classifier result gates what is shown or spoken. **Level 3 never reaches the model**: a fixed, reviewed script and the crisis screen are shown instead. Level 2 buffers the reply, checks each sentence, and shows the care card. Replies are checked sentence by sentence for diagnoses, medication advice, claims to be human, and so on.
- **Memory.** Consent-gated, top-k retrieval, hidden items never injected, journal analysis writes nothing until you press Done, sensitive items start unticked.
- **Scheduler.** Check-ins (9 a.m. / 9 p.m. local), Sunday letter, quiet-week message, retention and account-purge jobs. Idempotent jobs table with deterministic keys. At most 2 push + 1 call a day, quiet hours 10 p.m. to 8 a.m., back-off when ignored, silence after a quiet week, generic lock-screen text unless previews are on.
- **Voice.** Server STT/TTS slots exist (PCM over the same WebSocket, barge-in under 200 ms, amplitude-driven lip-sync). With none configured the web app uses the browser's `SpeechRecognition` and `speechSynthesis` through the same pipeline.

## Admin portal and developer platform

`apps/admin` is the founders' control room: people, cost in rupees, every AI prompt (edit, test, evaluate, publish, roll back), safety review, settings and kill switches, API keys that the app picks up without a restart, usage analytics (opt-in only), infrastructure health, GitHub commits/CI/deploys, and an append-only audit log. Sign-in is password plus authenticator code.

```bash
npm run admin:create -w @saathi/api -- --email you@example.com --name "You"
npm run dev:admin        # http://localhost:5174
```

Full guide, including what is live versus key-stored-only: [`docs/ADMIN.md`](docs/ADMIN.md).

## Safety behaviour (PRD 6.4, 8.10)

- Level 2 shows the care card; level 3 takes over with the crisis screen and the fixed script, recorded server-side as a safety event.
- No Escape or back-gesture dismissal on the crisis screen. "I'm safe right now" needs a second confirmation. Helpline buttons are real `tel:` links; Tele-MANAS 14416 and 112 are built into the app so they work offline.
- Risk decays only after 3 calm turns; level 3 never auto-decays.
- "Need help?" is on every primary screen. The paywall is never shown after any distress signal in the session. Safety features are never gated.
- Helplines in the database carry a `verified_at` column that is empty. **Have a person verify each number and set it before launch.**

## Privacy behaviour (PRD 5)

- Nothing is pre-ticked at consent. Voice recordings are never stored. Transcript retention is the user's choice (0 = not kept).
- Only display preferences (reduce motion, captions, language) live in the browser. Journal, memories, chat and mood are never persisted client-side.
- Export (JSON download) and delete (30-day grace, then purge) are in the app.
- Supabase's own Data API is not used; migration 0009 locks its roles out of every table. Switch the Data API off anyway (see SETUP).

## Known limitations

- No SMS/WhatsApp vendor, STT/TTS vendor or telephony vendor yet (by choice). Outbound check-in *calls* therefore don't happen; in-app cards and web push do.
- No billing. "Try Plus" says it isn't available. Plus-gated features are not enforced beyond the voice-minutes limit setting.
- Web push only. iOS needs the PWA installed to the home screen. No native app, app lock or screenshot blocking.
- Memory retrieval is lexical (no embeddings yet). Refresh token is in `localStorage` (a native app or cookie flow would be stronger).
- UI copy is English only (the language setting changes how the companion speaks, not the UI labels).
- Helpline list and Calm content are starter data; real recorded audio for Calm does not exist (narration uses the browser voice).
- Events are only the development demo listings until a partner feed or ops tooling exists.

## Tests

`npm test`: 109 API tests (RLS isolation, encryption, auth and token rotation, the safety pipeline end to end over WebSocket, voice bridge, scheduler and notification rules, data routes), 87 domain tests (classifier, output check, journal analysis, rhythms, notification rules), and 21 web tests (onboarding, help on every tab, level 2 and 3, crisis cannot be dismissed, paywall guard, journal review writes nothing until Done, preferences-only persistence, delete everything). API tests need a Postgres: set `TEST_DATABASE_ADMIN_URL` (a superuser URL; a throwaway database is created per run).
