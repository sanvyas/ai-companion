#!/usr/bin/env bash
# Builds the two front ends against a live API and stages each as a ready-to-publish folder under .deploy/.
#   deploy/stage.sh https://saathi-api.onrender.com
# Then publish each folder to its Netlify site (see docs/DEPLOY.md).
set -euo pipefail
API="${1:?usage: deploy/stage.sh <api-url>}"; API="${API%/}"
cd "$(dirname "$0")/.."
rm -rf .deploy && mkdir -p .deploy/app .deploy/admin

# Citizen app: talks to the API directly (bearer tokens, CORS), so the build needs its address.
VITE_API_URL="$API" npm run build -w @saathi/web
cp -R apps/web/dist/. .deploy/app/
sed "s|__API__|$API|g" deploy/netlify/app.toml > .deploy/app/netlify.toml

# Admin portal: its session cookie is SameSite=Strict, so the browser must see the API on the portal's own origin.
# Netlify proxies /admin/api/* to the API, and the build uses a relative address.
VITE_API_URL="" npm run build -w @saathi/admin
cp -R apps/admin/dist/. .deploy/admin/
sed "s|__API__|$API|g" deploy/netlify/admin.toml > .deploy/admin/netlify.toml
echo "Staged .deploy/app and .deploy/admin for API $API"
