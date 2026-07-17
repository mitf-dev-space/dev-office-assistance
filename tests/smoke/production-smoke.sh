#!/usr/bin/env bash
# Production-safe smoke checks (no destructive writes).
# Usage:
#   HELM_WEB_BASE=http://10.100.235.21:46810 \
#   HELM_API_BASE=http://10.100.235.21:46811 \
#   ./tests/smoke/production-smoke.sh
set -euo pipefail

WEB_BASE="${HELM_WEB_BASE:-http://127.0.0.1:46810}"
API_BASE="${HELM_API_BASE:-http://127.0.0.1:46811}"
# Optional authenticated check (never hardcode prod passwords in repo)
SMOKE_EMAIL="${HELM_SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${HELM_SMOKE_PASSWORD:-}"

errors=0
check() {
  local label="$1" url="$2" expect="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "${url}" || echo 000)"
  echo "{\"check\":\"${label}\",\"url\":\"${url}\",\"status\":${code},\"expected\":${expect}}"
  if [[ "${code}" != "${expect}" ]]; then
    errors=$((errors + 1))
  fi
}

check "web_live" "${WEB_BASE}/health/live" "200"
check "api_live" "${API_BASE}/health/live" "200"
check "api_ready" "${API_BASE}/health/ready" "200"
check "api_unauth" "${API_BASE}/api/me" "401"

if [[ -n "${SMOKE_EMAIL}" && -n "${SMOKE_PASSWORD}" ]]; then
  body="$(curl -s -X POST "${API_BASE}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${SMOKE_EMAIL}\",\"password\":\"${SMOKE_PASSWORD}\"}" || true)"
  if echo "${body}" | grep -qE '"token"|accessToken|mustChangePassword'; then
    echo '{"check":"api_login","status":"ok"}'
  else
    echo '{"check":"api_login","status":"fail"}'
    errors=$((errors + 1))
  fi
fi

if (( errors > 0 )); then
  echo "{\"result\":\"fail\",\"errors\":${errors}}"
  exit 1
fi
echo '{"result":"pass","errors":0}'
