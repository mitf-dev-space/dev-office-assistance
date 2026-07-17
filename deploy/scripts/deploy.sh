#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
acquire_lock
load_image_tag
mkdir -p "${HISTORY_DIR}" "${BACKUP_DIR}"

ts="$(date +%Y%m%d-%H%M%S)"
echo "==> deploy IMAGE_TAG=${IMAGE_TAG} at ${ts}"

# Record currently running images
prev_api="$(docker inspect --format '{{.Config.Image}}' helm-api-1 2>/dev/null || docker inspect --format '{{.Config.Image}}' helm-api 2>/dev/null || echo none)"
prev_web="$(docker inspect --format '{{.Config.Image}}' helm-web-1 2>/dev/null || docker inspect --format '{{.Config.Image}}' helm-web 2>/dev/null || echo none)"
echo "previous_api=${prev_api}" > "${HISTORY_DIR}/pre-deploy-${ts}.txt"
echo "previous_web=${prev_web}" >> "${HISTORY_DIR}/pre-deploy-${ts}.txt"
echo "IMAGE_TAG=${IMAGE_TAG}" >> "${HISTORY_DIR}/pre-deploy-${ts}.txt"

cp "${ENV_FILE}" "${DEPLOY_DIR}/.env.prod-backup-${ts}"

if [[ -n "${REGISTRY_USERNAME:-}" && -n "${REGISTRY_PASSWORD:-}" ]]; then
  echo "==> docker login"
  echo "${REGISTRY_PASSWORD}" | docker login -u "${REGISTRY_USERNAME}" --password-stdin
fi

echo "==> pull"
compose pull api web migrate postgres

echo "==> backup (best-effort)"
"${SCRIPT_DIR}/backup.sh" || echo "WARN: backup failed; continuing carefully" >&2

echo "==> migrate + up"
compose up -d --remove-orphans postgres
compose run --rm migrate
compose up -d --remove-orphans --no-deps api web

echo "==> wait for health"
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  api_h="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$(compose ps -q api)" 2>/dev/null || echo missing)"
  if [[ "${api_h}" == "healthy" ]]; then
    echo "==> api healthy"
    break
  fi
  if [[ "${api_h}" == "unhealthy" ]]; then
    compose logs --tail 40 api
    echo "ERROR: api unhealthy" >&2
    exit 1
  fi
  sleep 8
done

"${SCRIPT_DIR}/verify.sh"

echo "IMAGE_TAG=${IMAGE_TAG}" > "${HISTORY_DIR}/deployed-${ts}.txt"
echo "deployed_at=${ts}" >> "${HISTORY_DIR}/deployed-${ts}.txt"
echo "deploy OK"
