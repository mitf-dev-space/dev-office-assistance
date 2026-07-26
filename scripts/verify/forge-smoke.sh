#!/usr/bin/env bash
# Forge module API smoke — auth, role gates, banks, catalog, Android + iOS queue.
set -euo pipefail

API_BASE="${1:-http://localhost:4000}"
MOBILE_LEAD_PASSWORD="${SEED_FORGE_MOBILE_LEAD_PASSWORD:-${SEED_FORGE_ADMIN_PASSWORD:-ForgeMobileLead1!}}"

echo "Forge smoke — API ${API_BASE}"

login() {
  local email="$1" password="$2"
  curl -sS -X POST "${API_BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}"
}

api() {
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /tmp/forge-smoke-body.json -w "%{http_code}" \
      -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -o /tmp/forge-smoke-body.json -w "%{http_code}" \
      -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${token}"
  fi
}

asst_json="$(login "assistant@local.dev" "ChangeMe!Asst1")"
asst_token="$(printf '%s' "$asst_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
ml_json="$(login "forge-mobile-lead@local.dev" "$MOBILE_LEAD_PASSWORD")"
ml_token="$(printf '%s' "$ml_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"

code="$(api GET /api/forge/dashboard "$asst_token")"
[[ "$code" == "403" ]] || { echo "Expected 403 for assistant dashboard, got $code"; exit 1; }
echo "OK assistant dashboard -> 403"

code="$(api GET /api/forge/dashboard "$ml_token")"
[[ "$code" == "200" ]] || { echo "Mobile lead dashboard failed: $code"; exit 1; }
echo "OK mobile lead dashboard -> 200"

code="$(api GET /api/forge/banks "$ml_token")"
[[ "$code" == "200" ]] || { echo "Banks list failed: $code"; exit 1; }
echo "OK banks list"

BANK_CODE="TST$((RANDOM % 9999))"
code="$(api POST /api/forge/banks "$ml_token" "{\"name\":\"Smoke Test Bank\",\"code\":\"${BANK_CODE}\",\"isActive\":true}")"
[[ "$code" == "201" ]] || { echo "Create bank failed: $code $(cat /tmp/forge-smoke-body.json)"; exit 1; }
BANK_ID="$(python3 -c 'import json; print(json.load(open("/tmp/forge-smoke-body.json"))["bank"]["id"])')"
echo "OK create bank -> ${BANK_CODE}"

code="$(api POST /api/forge/applications "$ml_token" "$(python3 - <<PY
import json
print(json.dumps({
  "bankId": "${BANK_ID}",
  "name": "Smoke Mock App",
  "repositoryProvider": "github",
  "repositoryUrl": "https://github.com/example/smoke-flutter.git",
  "projectSubpath": "app",
  "defaultBranch": "main",
  "androidEnabled": True,
  "iosEnabled": True,
  "isActive": True,
}))
PY
)")"
[[ "$code" == "201" ]] || { echo "Create app failed: $code $(cat /tmp/forge-smoke-body.json)"; exit 1; }
APP_ID="$(python3 -c 'import json; print(json.load(open("/tmp/forge-smoke-body.json"))["application"]["id"])')"
echo "OK create ios-enabled application"

code="$(api POST /api/forge/build-profiles "$ml_token" "$(python3 - <<PY
import json
print(json.dumps({
  "applicationId": "${APP_ID}",
  "name": "mock-release-smoke",
  "dartEntryPoint": "lib/main_mock.dart",
  "androidArtifactType": "apk",
  "androidBuildMode": "release",
  "iosExportMethod": "ad-hoc",
  "timeoutMinutes": 90,
  "isActive": True,
}))
PY
)")"
[[ "$code" == "201" ]] || { echo "Create profile failed: $code $(cat /tmp/forge-smoke-body.json)"; exit 1; }
PROFILE_ID="$(python3 - <<'PY'
import json
d = json.load(open("/tmp/forge-smoke-body.json"))
print(d["profile"]["id"])
PY
)"
[[ -n "$PROFILE_ID" ]] || { echo "Missing profile id: $(cat /tmp/forge-smoke-body.json)"; exit 1; }
echo "OK create mock-release profile"

code="$(api POST /api/forge/build-requests "$ml_token" "$(python3 - <<PY
import json
print(json.dumps({
  "applicationId": "${APP_ID}",
  "buildProfileId": "${PROFILE_ID}",
  "gitReferenceType": "branch",
  "gitReference": "main",
  "platforms": ["Android"],
  "publishToSharedFolder": False,
}))
PY
)")"
[[ "$code" == "201" ]] || { echo "Android build submit failed: $code $(cat /tmp/forge-smoke-body.json)"; exit 1; }
echo "OK Android-only build submit"

code="$(api POST /api/forge/build-requests "$ml_token" "$(python3 - <<PY
import json
print(json.dumps({
  "applicationId": "${APP_ID}",
  "buildProfileId": "${PROFILE_ID}",
  "gitReferenceType": "branch",
  "gitReference": "main",
  "platforms": ["Android", "iOS"],
  "publishToSharedFolder": False,
}))
PY
)")"
[[ "$code" == "201" ]] || { echo "Dual build submit failed: $code $(cat /tmp/forge-smoke-body.json)"; exit 1; }
python3 - <<'PY'
import json
d = json.load(open("/tmp/forge-smoke-body.json"))
br = d["buildRequest"]
pbs = br.get("platformBuilds") or []
assert len(pbs) == 2, pbs
platforms = {p["platform"]: p["status"] for p in pbs}
assert "Android" in platforms and "iOS" in platforms
# Without a macOS runner, iOS should wait for a compatible runner.
assert platforms["iOS"] in ("Queued", "WaitingForCompatibleRunner"), platforms
print(f"OK dual-platform submit -> Android={platforms['Android']} iOS={platforms['iOS']}")
PY

code="$(api GET /api/forge/dashboard "$ml_token")"
[[ "$code" == "200" ]] || { echo "Dashboard recheck failed: $code"; exit 1; }
echo "OK dashboard after dual submit"

code="$(api GET /api/forge/runners "$ml_token")"
[[ "$code" == "200" ]] || { echo "Runners list failed: $code"; exit 1; }
echo "OK runners list"

echo "Forge smoke passed."
