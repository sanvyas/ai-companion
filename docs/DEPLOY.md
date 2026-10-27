# Deploying Saathi (closed beta)

Three pieces, three places:

| Piece | Where | Address |
|---|---|---|
| Database | Supabase, Mumbai | project `bajnpbdjvbyasrovotsc` |
| API (and scheduler) | Render, from `render.yaml` | `https://saathi-api.onrender.com` (or whatever Render assigns) |
| Citizen app | Netlify `saathi-app-tno6` | https://saathi-app-tno6.netlify.app |
| Admin portal | Netlify `saathi-admin-2ehw` | https://saathi-admin-2ehw.netlify.app |

## 1. Database string
Supabase > Connect > **Session pooler** (port 5432), copy the URI and put your database password in it. Use the session pooler, not the transaction pooler: the migrator takes a session-level lock. Reset the password under Project Settings > Database if you do not have it.

## 2. API on Render
1. Render dashboard > New > Blueprint > connect this GitHub repository, choose the branch that has `render.yaml`.
2. Fill the prompts: `DATABASE_URL` (step 1), `ADMIN_BOOTSTRAP_EMAIL` (your email) and `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters, not reused anywhere).
3. Apply. The first start applies all migrations, loads helplines and the calm catalogue, and creates your owner login.
4. Open `https://<service>.onrender.com/healthz`: it should say `{"ok":true}`.
5. Service > Environment: copy `DATA_KEK` somewhere safe (a password manager). Then **delete** `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`.

If Render gives the service a different address than `saathi-api.onrender.com`, re-run step 3 below with the real one.

## 3. Front ends on Netlify
```bash
deploy/stage.sh https://<your-render-address>      # builds both and writes .deploy/saathi-app.zip and .deploy/saathi-admin.zip
```
Netlify dashboard > the site > **Deploys** > drag the zip onto the "drag and drop" area (app zip to `saathi-app-tno6`, admin zip to `saathi-admin-2ehw`). Re-run the script and re-upload whenever the front end changes or the API address changes.

The portal build calls a relative `/admin/api` and Netlify proxies it to the API (`_redirects`), so the portal's `SameSite=Strict` cookie stays first-party. The app calls the API directly.

## 4. First sign-in to the portal
Open the admin address, sign in with the bootstrap email and password, scan the QR code with an authenticator app, and enter the code. Then open **Integrations and keys** and add the Anthropic key. Chat works from the next message.

## Things that will block real users
- **Sign-in.** In production, phone codes are refused until an SMS vendor adapter exists (`docs/PROVIDERS.md`). Until then people can only sign in with Google: add the Google OAuth client id on the Integrations page (and add the app address as an authorised JavaScript origin in Google Cloud).
- **Free Render plan** sleeps when idle and stops the scheduler. Keep `starter` for the beta.
- The Netlify sites are public. That is fine for the app; keep the portal address private. It is protected by password plus authenticator code, `noindex`, and `X-Frame-Options: DENY`.
