#!/usr/bin/env bash
# Verify the marketing website and the untouched CRM/API endpoints after a
# marketing deployment. Retries until success or the attempt budget is
# exhausted. Fails the deployment on persistent failure.
#
# Usage: verify-marketing.sh
#
# TLS is never disabled (-k); certificates must validate.
set -Eeuo pipefail

root="https://travelagencycrm.in"
www="https://www.travelagencycrm.in"
app="https://app.travelagencycrm.in"

attempts="${VERIFY_ATTEMPTS:-20}"
sleep_secs="${VERIFY_SLEEP_SECONDS:-12}"

fail() {
  echo "FAIL $*" >&2
}

check_status() {
  local url="$1" expected="$2"
  local i code
  for ((i = 1; i <= attempts; i++)); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || echo 000)"
    if [[ "$code" == "$expected" ]]; then
      echo "OK   $url -> $code"
      return 0
    fi
    if (( i < attempts )); then sleep "$sleep_secs"; fi
  done
  fail "$url -> expected $expected, last got $code"
  return 1
}

check_contains() {
  local url="$1" needle="$2" label="${3:-$needle}"
  local i body
  for ((i = 1; i <= attempts; i++)); do
    body="$(curl -sS --max-time 20 "$url" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -qF "$needle"; then
      echo "OK   $url contains $label"
      return 0
    fi
    if (( i < attempts )); then sleep "$sleep_secs"; fi
  done
  fail "$url does not contain $label"
  return 1
}

check_redirect() {
  local url="$1" expected_path="$2"
  local i loc code dest
  for ((i = 1; i <= attempts; i++)); do
    loc="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$url" 2>/dev/null || echo '000')"
    code="${loc%% *}"
    dest="${loc#* }"
    # ALB always emits the default port in the Location header; normalize it.
    dest_norm="${dest/https:\/\/travelagencycrm.in:443/https:\/\/travelagencycrm.in}"
    if [[ "$code" == "301" && "$dest_norm" == "https://travelagencycrm.in$expected_path" ]]; then
      echo "OK   $url -> 301 -> $dest_norm"
      return 0
    fi
    if (( i < attempts )); then sleep "$sleep_secs"; fi
  done
  fail "$url -> expected 301 -> https://travelagencycrm.in$expected_path, last got $loc"
  return 1
}

failed=0

# --- Marketing website ------------------------------------------------------
check_status "$root/" 200 || failed=1
check_status "$root/privacy" 200 || failed=1
check_status "$root/terms" 200 || failed=1
check_status "$root/robots.txt" 200 || failed=1
check_status "$root/sitemap.xml" 200 || failed=1
check_status "$root/healthz" 200 || failed=1
check_status "$root/missing-file-ci.js" 404 || failed=1
check_contains "$root/" "<title>Interscale Travel CRM" "page title" || failed=1
check_contains "$root/" "Run your agency's complete workflow" "primary headline" || failed=1
check_contains "$root/" "href=\"https://app.travelagencycrm.in/login\"" "Go to App link" || failed=1

# --- www -> root permanent redirect (path and query preserved) --------------
check_redirect "$www/test?x=1" "/test?x=1" || failed=1

# --- Existing app must be untouched ----------------------------------------
check_status "$app/" 200 || failed=1
check_status "$app/login" 200 || failed=1
check_contains "$app/api/health" '"status":"ok"' "API health" || failed=1
check_contains "$app/api/health/db" '"database":"up"' "API DB health" || failed=1

if (( failed )); then
  echo "marketing verification FAILED" >&2
  exit 1
fi

echo "marketing verification passed"
