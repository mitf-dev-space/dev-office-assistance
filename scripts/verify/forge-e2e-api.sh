#!/usr/bin/env bash
# Deep Forge API e2e using fixture artifacts (no Flutter required).
# Proves queue → claim → progress → complete for Android mock + iOS IPA filenames.
set -euo pipefail

API_BASE="${1:-http://localhost:4000}"
OUT_DIR="${2:-data/forge-e2e/$(date +%Y%m%d-%H%M%S)}"
MOBILE_LEAD_PASSWORD="${SEED_FORGE_MOBILE_LEAD_PASSWORD:-${SEED_FORGE_ADMIN_PASSWORD:-ForgeMobileLead1!}}"
RUNNER_NAME="e2e-macos-${RANDOM}"

mkdir -p "${OUT_DIR}"
echo "Forge API e2e — ${API_BASE} → ${OUT_DIR}"

login() {
  curl -sS -X POST "${API_BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

ml_token="$(login "forge-mobile-lead@local.dev" "$MOBILE_LEAD_PASSWORD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"

# Register macOS runner
create_runner="$(curl -sS -X POST "${API_BASE}/api/forge/runners" \
  -H "Authorization: Bearer ${ml_token}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${RUNNER_NAME}\",\"operatingSystem\":\"macOS\",\"architecture\":\"arm64\",\"supportedPlatforms\":[\"Android\",\"iOS\"],\"maximumConcurrentJobs\":1}")"
echo "$create_runner" > "${OUT_DIR}/runner.json"
RUNNER_ID="$(python3 -c 'import json; print(json.load(open("'"${OUT_DIR}/runner.json"'"))["runner"]["id"])')"
RUNNER_TOKEN="$(python3 -c 'import json; print(json.load(open("'"${OUT_DIR}/runner.json"'"))["token"])')"

curl -sS -X POST "${API_BASE}/api/forge/runners/${RUNNER_ID}/heartbeat" \
  -H "Authorization: Bearer ${RUNNER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' >/dev/null
echo "OK runner heartbeat ${RUNNER_ID}"

# Ensure bank/app/profile
BANK_CODE="E2E$((RANDOM % 9999))"
bank_json="$(curl -sS -X POST "${API_BASE}/api/forge/banks" \
  -H "Authorization: Bearer ${ml_token}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E Bank\",\"code\":\"${BANK_CODE}\",\"isActive\":true}")"
BANK_ID="$(printf '%s' "$bank_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["bank"]["id"])')"

app_json="$(curl -sS -X POST "${API_BASE}/api/forge/applications" \
  -H "Authorization: Bearer ${ml_token}" \
  -H "Content-Type: application/json" \
  -d "{\"bankId\":\"${BANK_ID}\",\"name\":\"E2E Mock App\",\"repositoryProvider\":\"github\",\"repositoryUrl\":\"https://github.com/example/e2e.git\",\"defaultBranch\":\"main\",\"androidEnabled\":true,\"iosEnabled\":true,\"isActive\":true}")"
APP_ID="$(printf '%s' "$app_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["application"]["id"])')"

prof_json="$(curl -sS -X POST "${API_BASE}/api/forge/build-profiles" \
  -H "Authorization: Bearer ${ml_token}" \
  -H "Content-Type: application/json" \
  -d "{\"applicationId\":\"${APP_ID}\",\"name\":\"mock-release\",\"dartEntryPoint\":\"lib/main_mock.dart\",\"androidArtifactType\":\"apk\",\"androidBuildMode\":\"release\",\"iosExportMethod\":\"ad-hoc\",\"timeoutMinutes\":90,\"isActive\":true}")"
PROFILE_ID="$(printf '%s' "$prof_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["profile"]["id"])')"

complete_platform() {
  local platform="$1" file_name="$2" content_type="$3"
  local br_json pb_id claim_json

  br_json="$(curl -sS -X POST "${API_BASE}/api/forge/build-requests" \
    -H "Authorization: Bearer ${ml_token}" \
    -H "Content-Type: application/json" \
    -d "{\"applicationId\":\"${APP_ID}\",\"buildProfileId\":\"${PROFILE_ID}\",\"gitReferenceType\":\"branch\",\"gitReference\":\"main\",\"platforms\":[\"${platform}\"],\"publishToSharedFolder\":false}")"
  echo "$br_json" > "${OUT_DIR}/build-${platform}.json"
  pb_id="$(printf '%s' "$br_json" | python3 -c 'import json,sys; d=json.load(sys.stdin)["buildRequest"]; print(d["platformBuilds"][0]["id"])')"

  # Drain any older queued jobs left by smoke tests until we claim this build.
  for _ in $(seq 1 40); do
    claim_json="$(curl -sS -X POST "${API_BASE}/api/forge/runners/${RUNNER_ID}/claim" \
      -H "Authorization: Bearer ${RUNNER_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{}')"
    echo "$claim_json" > "${OUT_DIR}/claim-${platform}.json"
    claimed_id="$(python3 -c 'import json; j=json.load(open("'"${OUT_DIR}/claim-${platform}.json"'")).get("job"); print(j["platformBuildId"] if j else "")')"
    if [[ -z "$claimed_id" ]]; then
      sleep 0.5
      continue
    fi
    if [[ "$claimed_id" == "$pb_id" ]]; then
      break
    fi
    # Fail unrelated queued leftover so the runner slot frees.
    curl -sS -X POST "${API_BASE}/api/forge/platform-builds/${claimed_id}/fail" \
      -H "Authorization: Bearer ${RUNNER_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"failureCategory":"BuildCancelled","failureSummary":"e2e drain of leftover queue job"}' >/dev/null
  done

  python3 - <<PY
import json
job = json.load(open("${OUT_DIR}/claim-${platform}.json")).get("job")
assert job, "expected claimed job"
assert job["platform"] == "${platform}", job
assert job.get("iosExportMethod") == "ad-hoc"
assert job["dartEntryPoint"] == "lib/main_mock.dart"
assert job["platformBuildId"] == "${pb_id}", (job["platformBuildId"], "${pb_id}")
print("OK claim ${platform} includes entrypoint/export fields")
PY

  for status in PreparingWorkspace CloningRepository Building CollectingArtifact; do
    curl -sS -X POST "${API_BASE}/api/forge/platform-builds/${pb_id}/progress" \
      -H "Authorization: Bearer ${RUNNER_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"${status}\"}" >/dev/null
  done

  printf 'fixture-%s' "$platform" > "${OUT_DIR}/${file_name}"
  curl -sS -o "${OUT_DIR}/complete-${platform}.json" -w "%{http_code}" -X POST \
    "${API_BASE}/api/forge/platform-builds/${pb_id}/complete" \
    -H "Authorization: Bearer ${RUNNER_TOKEN}" \
    -F "artifact=@${OUT_DIR}/${file_name};type=${content_type};filename=${file_name}" \
    > "${OUT_DIR}/complete-${platform}.http"
  [[ "$(cat "${OUT_DIR}/complete-${platform}.http")" == "200" ]] || {
    echo "complete ${platform} failed: $(cat "${OUT_DIR}/complete-${platform}.json")"
    exit 1
  }

  detail="$(curl -sS "${API_BASE}/api/forge/build-requests/$(python3 -c 'import json; print(json.load(open("'"${OUT_DIR}/build-${platform}.json"'"))["buildRequest"]["id"])')" \
    -H "Authorization: Bearer ${ml_token}")"
  echo "$detail" > "${OUT_DIR}/detail-${platform}.json"
  python3 - <<PY
import json
d = json.load(open("${OUT_DIR}/detail-${platform}.json"))["buildRequest"]
pb = d["platformBuilds"][0]
assert pb["status"] == "Succeeded", pb
arts = pb["artifacts"]
assert arts and arts[0]["fileName"] == "${file_name}", arts
print("OK ${platform} Succeeded with artifact ${file_name}")
PY
}

complete_platform "Android" "app-mock-release.apk" "application/vnd.android.package-archive"
complete_platform "iOS" "DemoMock.ipa" "application/octet-stream"

echo "Forge API e2e passed. Artifacts under ${OUT_DIR}"
