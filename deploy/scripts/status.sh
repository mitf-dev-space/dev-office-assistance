#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

require_env_file
load_image_tag
echo "IMAGE_TAG=${IMAGE_TAG}"
compose ps
docker ps --filter "name=helm" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
