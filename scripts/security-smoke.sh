#!/usr/bin/env bash
# Black-box security checks you can run against the live site. Safe: it only reads, plus (with --spoof) sends
# sign-in code requests for a made-up number to see whether the rate limit holds.
#   scripts/security-smoke.sh https://your-api.example.com [--spoof]
set -u
BASE="${1:-}"; [ -z "$BASE" ] && { echo "usage: $0 https://your-api.example.com [--spoof]"; exit 2; }
BASE="${BASE%/}"; SPOOF="${2:-}"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
hdr()  { curl -s -D - -o /dev/null -m 20 "$@" | tr -d '\r'; }

echo "== Doors that must be locked (no sign-in)"
for p in /me /me/export /journal /conversations /admin/api/overview /admin/api/users /admin/api/settings /admin/api/integrations /admin/api/audit; do
  c=$(code "$BASE$p"); case "$c" in 401|403) ok "GET $p -> $c";; *) bad "GET $p -> $c (expected 401 or 403)";; esac
done
c=$(code -X PATCH -H 'content-type: application/json' -d '{"subscription":"plus"}' "$BASE/me"); case "$c" in 401|403) ok "PATCH /me without sign-in -> $c";; *) bad "PATCH /me -> $c";; esac
NONE="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ."
c=$(code -H "authorization: Bearer $NONE" "$BASE/me"); [ "$c" = 401 ] && ok "unsigned token (alg none) refused" || bad "unsigned token -> $c"

echo "== Files that must never be served"
for p in /.env /.git/config /package.json /.npmrc "/assets/index.js.map" "/..%2f..%2fetc/passwd" "/%2e%2e/%2e%2e/etc/passwd" "/assets/..%2f..%2f.env"; do
  body=$(curl -s -m 20 "$BASE$p" | head -c 4000)
  if echo "$body" | grep -qE 'root:.*:0:0|DATABASE_URL|JWT_SECRET|"dependencies"|sourceMappingURL|"mappings"'; then bad "$p exposes a file"; else ok "$p serves nothing sensitive"; fi
done

echo "== Browser protection headers"
h=$(hdr "$BASE/")
echo "$h" | grep -qi '^content-security-policy:' && ok "app page has a Content-Security-Policy" || bad "no Content-Security-Policy on /"
echo "$h" | grep -qi "frame-ancestors 'none'" && ok "framing blocked (frame-ancestors none)" || bad "framing not blocked"
echo "$h" | grep -qi '^x-content-type-options: nosniff' && ok "nosniff" || bad "missing X-Content-Type-Options"
echo "$h" | grep -qi '^strict-transport-security:' && ok "HSTS" || bad "missing HSTS"
echo "$h" | grep -qi '^x-powered-by:' && bad "X-Powered-By is exposed" || ok "no X-Powered-By"
hdr "$BASE/healthz" | grep -qi "default-src 'none'" && ok "API answers carry the strict policy" || bad "API policy missing on /healthz"

echo "== CORS: strangers get no permission"
h=$(hdr -H 'Origin: https://evil.example' "$BASE/healthz"); echo "$h" | grep -qi '^access-control-allow-origin:' && bad "a stranger site is allowed by CORS" || ok "stranger origin gets no CORS permission"
h=$(hdr -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' "$BASE/me"); echo "$h" | grep -qi '^access-control-allow-origin:' && bad "preflight allowed for a stranger" || ok "preflight refused for a stranger"

echo "== Error messages leak nothing"
body=$(curl -s -m 20 -X POST -H 'content-type: application/json' -d '{ nope' "$BASE/auth/otp/start")
echo "$body" | grep -qiE 'stack|node_modules|/app/|at [a-z]+ \(' && bad "an error shows internals" || ok "errors are generic"
body=$(curl -s -m 20 "$BASE/public-config"); echo "$body" | grep -qiE 'secret|password|api_key|token' && bad "/public-config shows something secret-looking" || ok "/public-config is clean"

if [ "$SPOOF" = "--spoof" ]; then
  echo "== Rate limit cannot be dodged with fake X-Forwarded-For (sends ~20 sign-in code requests for a made-up number)"
  got429=0
  for i in $(seq 1 20); do
    c=$(code -X POST -H 'content-type: application/json' -H "X-Forwarded-For: 10.$((i%250)).$((i%200)).$i" -d '{"phone":"9000000001","ageConfirmed18":true}' "$BASE/auth/otp/start"); [ "$c" = 429 ] && got429=1
  done
  [ $got429 = 1 ] && ok "limit still applies when the address header changes" || bad "no 429 after 20 requests with changing addresses (limit may be dodgeable, or the limit is above 20)"
fi

echo; echo "Passed: $pass   Failed: $fail"; [ "$fail" -eq 0 ]
