#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
mkdir -p "${BACKUP_DIR}"
ts="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1090
set -a
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB)=' "${ENV_FILE}")
set +a
POSTGRES_USER="${POSTGRES_USER:-helm}"
POSTGRES_DB="${POSTGRES_DB:-office_assistance}"

pg_cid="$(compose ps -q postgres)"
if [[ -z "${pg_cid}" ]]; then
  echo "ERROR: postgres not running" >&2
  exit 1
fi

dump="${BACKUP_DIR}/db-${ts}.dump"
echo "==> pg_dump → ${dump}"
docker exec "${pg_cid}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${dump}"

uploads_vol="$(docker volume ls -q | grep -E 'helm_uploads$' | head -1 || true)"
if [[ -n "${uploads_vol}" ]]; then
  tar_path="${BACKUP_DIR}/uploads-${ts}.tar.gz"
  echo "==> uploads → ${tar_path}"
  docker run --rm -v "${uploads_vol}:/data:ro" -v "${BACKUP_DIR}:/out" alpine \
    tar czf "/out/uploads-${ts}.tar.gz" -C /data .
fi

echo "backup OK: ${dump}"
