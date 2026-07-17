#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
load_image_tag

echo "==> preflight: Helm deploy"
echo "    deploy dir: ${DEPLOY_DIR}"
echo "    image tag:  ${IMAGE_TAG}"

if ! command -v docker >/dev/null; then
  echo "ERROR: docker not installed" >&2
  exit 1
fi
docker --version
docker compose version

# Disk: need at least ~2GB free
avail_kb="$(df -Pk "${DEPLOY_DIR}" | awk 'NR==2{print $4}')"
if [[ "${avail_kb}" -lt 2000000 ]]; then
  echo "ERROR: less than ~2GB free disk under ${DEPLOY_DIR}" >&2
  exit 1
fi
echo "==> disk ok (${avail_kb} KB available)"

# Memory hint
if [[ -r /proc/meminfo ]]; then
  mem_kb="$(awk '/MemAvailable/{print $2}' /proc/meminfo)"
  echo "==> MemAvailable: ${mem_kb} KB"
fi

for port in "${HELM_WEB_PORT}" "${HELM_API_PORT}"; do
  if ss -tln 2>/dev/null | grep -qE ":${port}\\b"; then
    echo "==> port ${port} already listening (ok if Helm already deployed)"
  else
    echo "==> port ${port} free"
  fi
done

if ! getent hosts 10.100.235.21 >/dev/null 2>&1; then
  echo "==> note: host 10.100.235.21 not in DNS (expected if this IS that host)"
fi

compose config --quiet
echo "==> compose config valid"
echo "preflight OK"
