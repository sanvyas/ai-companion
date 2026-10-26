# Setup and runbook

## 1. Supabase (Mumbai)

1. supabase.com > New project. **Region: South Asia (Mumbai) `ap-south-1`.** Pick a strong database password and keep it.
2. Project Settings > **Data API**: switch it **off**. Saathi never uses it. (Migration 0009 also revokes its roles from every table, as a second lock.)
3. Project Settings > Database > Connection string. Choose **Session pooler** (port 5432). It works over IPv4 and keeps `SET LOCAL` transactions intact, which row-level security depends on. Copy it as `DATABASE_URL`, with `DATABASE_SSL=true`.
4. Do not copy the `anon` or `service_role` keys anywhere. Saathi does not use them.

The connecting role (`postgres`) must be allowed to create the `saathi_app` role and `SET ROLE` to it. On Supabase it can; the first migration does it.

## 2. Secrets

```bash
npm run gen:secrets -w @saathi/api
```

Paste the four values into `apps/api/.env`. **Back up `DATA_KEK`** (a password manager, plus one offline copy). It wraps every user's data key; without it, journals, memories and phone numbers cannot be read again. Rotating `JWT_SECRET` signs everyone out (harmless). Never change `PHONE_HASH_KEY` or `OTP_PEPPER` on a live system: phone lookups would stop matching.

## 3. Anthropic

Create a key at console.anthropic.com, set `ANTHROPIC_API_KEY`. The three models are env-configurable (`MODEL_COMPANION`, `MODEL_SAFETY`, `MODEL_ANALYSIS`). Without a key the API starts, but conversations return a clear "not available" message and the app falls back to showing helplines. Set a monthly spend limit in the Anthropic console.

## 4. Migrate and run

```bash
npm run db:migrate               # forward-only, checksummed; safe to re-run
npm run dev:api
npm run dev:web
```

For a throwaway demo city's events: `npm -w @saathi/api run db:migrate -- --demo-events` (development only; never in production).

## 5. Sign-in options before an SMS vendor exists

- **Development:** `OTP_PROVIDER=console`. The code appears in the API log and on screen.
- **Production without SMS:** set `GOOGLE_CLIENT_ID` (Google Cloud Console > Credentials > OAuth client ID, type Web, authorised JavaScript origin = your web URL). Phone sign-in is refused with a clear message until an `OtpProvider` is implemented ([PROVIDERS.md](PROVIDERS.md)).

## 6. Deploying

- **Web:** `npm -w @saathi/web run build` produces `apps/web/dist` (static). Host anywhere that serves static files over HTTPS (Netlify, Cloudflare Pages, Vercel). Build with `VITE_API_URL=https://your-api`. Serve `index.html` for unknown paths.
- **API:** `npm -w @saathi/api run build && npm -w @saathi/api start` on any Node 22 host with HTTPS and WebSocket support (Fly.io, Railway, Render, a VM). Mumbai region if offered. Set every variable from `apps/api/.env.example` as host secrets, `NODE_ENV=production`, and `WEB_ORIGINS=https://your-web`. Run **one** instance with `RUN_WORKER=true` (the scheduler), more can run with it off.
- Health: `GET /healthz` (up), `GET /readyz` (database reachable), `GET /public-config` (what is configured).
- Production refuses to start with `OTP_PROVIDER=console` or `LLM_PROVIDER=mock`.

## 7. Before real users

- Have a clinician review the crisis script, the care card copy, and the system prompts (`apps/api/src/services/prompts.ts`).
- Have a person phone-verify every helpline in the `helplines` table and set `verified_at`. The app shows a "not recently checked" note on stale numbers.
- Privacy policy and consent copy reviewed (DPDP Act 2023 applies); a grievance contact; a data-breach plan.
- Decide the retention default and the under-18 route with counsel.
- Load-test conversations: one WebSocket per active chat, each turn makes two model calls (reply + classifier).
- Turn on database backups (Supabase daily; Pro for point-in-time) and test a restore.
