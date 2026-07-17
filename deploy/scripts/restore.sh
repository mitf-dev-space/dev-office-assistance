#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
acquire_lock

dump="${1:-}"
if [[ -z "${dump}" || ! -f "${dump}" ]]; then
  echo "Usage: ./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump" >&2
  exit 1
fi

set -a
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB)=' "${ENV_FILE}")
set +a
POSTGRES_USER="${POSTGRES_USER:-helm}"
POSTGRES_DB="${POSTGRES_DB:-office_assistance}"

echo "WARNING: This overwrites database ${POSTGRES_DB}."
pg_cid="$(compose ps -q postgres)"
[[ -n "${pg_cid}" ]] || { echo "ERROR: postgres not running" >&2; exit 1; }

compose stop api web || true
docker exec -i "${pg_cid}" pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists < "${dump}" \
  || echo "WARN: pg_restore exited non-zero (often OK with --clean warnings)"

compose up -d api web
"${SCRIPT_DIR}/verify.sh"
echo "restore OK"
