#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
load_image_tag

errors=0
check() {
  local label="$1" code="$2" expected="$3"
  echo "==> ${label}: HTTP ${code} (expect ${expected})"
  if [[ "${code}" != "${expected}" ]]; then
    errors=$((errors + 1))
  fi
}

echo "==> compose ps"
compose ps

web_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HELM_WEB_PORT}/health/live" || echo 000)"
api_live="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HELM_API_PORT}/health/live" || echo 000)"
api_ready="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HELM_API_PORT}/health/ready" || echo 000)"
api_me="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HELM_API_PORT}/api/me" || echo 000)"

check "web /health/live" "${web_code}" "200"
check "api /health/live" "${api_live}" "200"
check "api /health/ready" "${api_ready}" "200"
# unauthenticated /api/me should be 401
check "api /api/me (unauth)" "${api_me}" "401"

if compose ps | grep -qiE 'Restarting|Exit'; then
  echo "ERROR: container restarting or exited" >&2
  errors=$((errors + 1))
fi

if (( errors > 0 )); then
  echo "verify FAILED (${errors} checks)" >&2
  compose logs --tail 50 api web || true
  exit 1
fi
echo "verify OK"
