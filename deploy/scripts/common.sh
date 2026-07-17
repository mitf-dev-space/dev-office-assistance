#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEPLOY_DIR}/compose.production.yml"
ENV_FILE="${DEPLOY_DIR}/.env.production"
LOCK_FILE="${DEPLOY_DIR}/.deploy.lock"
HISTORY_DIR="${DEPLOY_DIR}/deployment-history"
BACKUP_DIR="${DEPLOY_DIR}/backups"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "ERROR: missing ${ENV_FILE}" >&2
    exit 1
  fi
}

acquire_lock() {
  if [[ -f "${LOCK_FILE}" ]]; then
    echo "ERROR: deploy lock held (${LOCK_FILE}). Another deploy may be running." >&2
    exit 1
  fi
  echo "$$ $(date -Is)" > "${LOCK_FILE}"
  trap 'rm -f "${LOCK_FILE}"' EXIT
}

load_image_tag() {
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(IMAGE_TAG|REGISTRY_NAMESPACE|HELM_WEB_PORT|HELM_API_PORT)=' "${ENV_FILE}" || true)
  set +a
  IMAGE_TAG="${IMAGE_TAG:-latest}"
  REGISTRY_NAMESPACE="${REGISTRY_NAMESPACE:-anstwechy}"
  HELM_WEB_PORT="${HELM_WEB_PORT:-46810}"
  HELM_API_PORT="${HELM_API_PORT:-46811}"
}
