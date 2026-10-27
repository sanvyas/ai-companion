#!/usr/bin/env bash
# Builds the two front ends against a live API and stages each as a ready-to-publish folder and zip under .deploy/.
#   deploy/stage.sh https://saathi-api.onrender.com
# Drag each zip onto its Netlify site (Deploys > drag and drop), see docs/DEPLOY.md.
set -euo pipefail
API="${1:?usage: deploy/stage.sh <api-url>}"; API="${API%/}"
cd "$(dirname "$0")/.."
rm -rf .deploy && mkdir -p .deploy/app .deploy/admin

# Citizen app: talks to the API directly (bearer tokens, CORS), so the build needs its address.
VITE_API_URL="$API" npm run build -w @saathi/web
cp -R apps/web/dist/. .deploy/app/
cp deploy/netlify/app/_headers deploy/netlify/app/_redirects .deploy/app/

# Admin portal: its session cookie is SameSite=Strict, so the browser must see the API on the portal's own origin.
# Netlify proxies /admin/api/* to the API; the production build calls a relative address.
npm run build -w @saathi/admin
cp -R apps/admin/dist/. .deploy/admin/
cp deploy/netlify/admin/_headers .deploy/admin/
sed "s|__API__|$API|g" deploy/netlify/admin/_redirects > .deploy/admin/_redirects

(cd .deploy/app && zip -qr ../saathi-app.zip .)
(cd .deploy/admin && zip -qr ../saathi-admin.zip .)
echo "Staged .deploy/saathi-app.zip and .deploy/saathi-admin.zip for API $API"
