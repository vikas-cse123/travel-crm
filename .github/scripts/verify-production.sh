#!/usr/bin/env bash
# Verify production endpoints after a deployment. Retries until success or the
# attempt budget is exhausted. Fails the deployment on persistent failure.
#
# Usage: verify-production.sh frontend|api
#
# TLS is never disabled (-k); certificates must validate.
set -Eeuo pipefail

mode="${1:?usage: verify-production.sh frontend|api}"

base="https://app.travelagencycrm.in"
attempts="${VERIFY_ATTEMPTS:-20}"
sleep_secs="${VERIFY_SLEEP_SECONDS:-12}"

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
  echo "FAIL $url -> expected $expected, last got $code" >&2
  return 1
}

check_json_field() {
  local url="$1" field="$2"
  local i body
  for ((i = 1; i <= attempts; i++)); do
    body="$(curl -sS --max-time 20 "$url" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q "$field"; then
      echo "OK   $url contains $field"
      return 0
    fi
    if (( i < attempts )); then sleep "$sleep_secs"; fi
  done
  echo "FAIL $url did not return expected payload" >&2
  return 1
}

if [[ "$mode" == "frontend" ]]; then
  check_status "$base/" 200
  check_status "$base/login" 200
  check_status "$base/queries" 200
  check_status "$base/missing-file-ci.js" 404
  # API must still be routed to the API, not served by Nginx.
  check_json_field "$base/api/health" '"status":"ok"'
elif [[ "$mode" == "api" ]]; then
  check_json_field "$base/api/health" '"status":"ok"'
  check_json_field "$base/api/health/db" '"database":"up"'
  check_status "$base/api/nonexistent-ci-check" 404
  check_status "$base/" 200
else
  echo "unknown verify mode: $mode" >&2
  exit 2
fi

echo "production verification passed ($mode)"
