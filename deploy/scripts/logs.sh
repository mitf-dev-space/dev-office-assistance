#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
svc="${1:-api}"
lines="${2:-100}"
compose logs --tail "${lines}" -f "${svc}"
