#!/usr/bin/env bash
# Create a local macOS Forge runner (Android + iOS) and write ~/.forge/agent.env
set -euo pipefail

API_BASE="${1:-${FORGE_API_URL:-http://localhost:4000}}"
RUNNER_NAME="${2:-local-macos-mobile}"

MOBILE_LEAD_PASSWORD="${SEED_FORGE_MOBILE_LEAD_PASSWORD:-${SEED_FORGE_ADMIN_PASSWORD:-ForgeMobileLead1!}}"

echo "Registering Forge runner at ${API_BASE}"

login_json="$(curl -sS -X POST "${API_BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"forge-mobile-lead@local.dev\",\"password\":\"${MOBILE_LEAD_PASSWORD}\"}")"

token="$(printf '%s' "$login_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')"
if [[ -z "$token" ]]; then
  echo "Login failed: ${login_json}"
  exit 1
fi

create_body="$(cat <<EOF
{
  "name": "${RUNNER_NAME}",
  "operatingSystem": "macOS",
  "architecture": "x64",
  "supportedPlatforms": ["Android", "iOS"],
  "maximumConcurrentJobs": 1
}
EOF
)"

http_code="$(curl -sS -o /tmp/forge-runner-create.json -w "%{http_code}" \
  -X POST "${API_BASE}/api/forge/runners" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d "${create_body}")"

if [[ "$http_code" == "409" ]]; then
  echo "Runner '${RUNNER_NAME}' already exists. Choose a new name or delete the old runner in Forge admin."
  exit 1
fi
if [[ "$http_code" != "201" ]]; then
  echo "Create runner failed (${http_code}): $(cat /tmp/forge-runner-create.json)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKSPACES_ROOT="${REPO_ROOT}/data/forge-workspaces"
AGENT_ENV="${HOME}/.forge/agent.env"
mkdir -p "${WORKSPACES_ROOT}"
mkdir -p "${HOME}/.forge"

python3 -c "
import json
data = json.load(open('/tmp/forge-runner-create.json'))
runner = data['runner']
token = data['token']
content = '\\n'.join([
    'FORGE_API_URL=${API_BASE}',
    f\"FORGE_RUNNER_ID={runner['id']}\",
    f'FORGE_RUNNER_TOKEN={token}',
    'FORGE_WORKSPACES_ROOT=${WORKSPACES_ROOT}',
    '',
])
open('${AGENT_ENV}', 'w', encoding='utf-8').write(content)
print(f\"Runner registered: {runner['name']} ({runner['id']})\")
print(f\"Token hint: {runner.get('tokenHint', '')}\")
print('Agent env written to: ${AGENT_ENV}')
"

echo ""
echo "Start worker:"
echo "  set -a && source ~/.forge/agent.env && set +a"
echo "  npm run forge:worker"
