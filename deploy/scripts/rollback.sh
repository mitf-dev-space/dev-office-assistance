#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
acquire_lock

PREV_TAG="${1:-${IMAGE_TAG:-}}"
if [[ -z "${PREV_TAG}" ]]; then
  echo "Usage: IMAGE_TAG=<previous-sha> ./scripts/rollback.sh" >&2
  echo "   or: ./scripts/rollback.sh <previous-sha>" >&2
  exit 1
fi

ts="$(date +%Y%m%d-%H%M%S)"
cp "${ENV_FILE}" "${DEPLOY_DIR}/.env.prod-backup-rollback-${ts}"
sed -i -E "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREV_TAG}/" "${ENV_FILE}"
if ! grep -qE '^IMAGE_TAG=' "${ENV_FILE}"; then
  echo "IMAGE_TAG=${PREV_TAG}" >> "${ENV_FILE}"
fi

echo "==> rolling back to IMAGE_TAG=${PREV_TAG}"
echo "NOTE: If a non-compatible DB migration was applied, restore DB first (see docs/rollback-runbook.md)."

compose pull api web
compose up -d --no-deps --force-recreate api web
"${SCRIPT_DIR}/verify.sh"
echo "rollback OK"
