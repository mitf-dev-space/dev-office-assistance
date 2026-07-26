#!/usr/bin/env bash
# Forge module — macOS worker prerequisite audit
set -euo pipefail

echo "Forge — macOS prerequisite check"
echo "OS: $(sw_vers -productName) $(sw_vers -productVersion)"
echo

missing_required=()

check_cmd() {
  local label="$1"
  local cmd="$2"
  local required="${3:-true}"

  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[OK] $label"
  else
    if [[ "$required" == "true" ]]; then
      echo "[MISSING (required)] $label"
      missing_required+=("$label")
    else
      echo "[MISSING (optional)] $label"
    fi
  fi
}

check_cmd "Git" git true
check_cmd "Flutter" flutter true
check_cmd "Node.js" node true
check_cmd "Xcode CLI (xcodebuild)" xcodebuild true
check_cmd "CocoaPods" pod false
check_cmd "Java" java false
check_cmd "Android SDK (adb)" adb false

if [[ "$(xcode-select -p 2>/dev/null || true)" == *"CommandLineTools"* ]]; then
  echo "[MISSING (required)] Full Xcode.app (xcode-select currently points at Command Line Tools)"
  missing_required+=("Full Xcode.app")
fi

identities="$(security find-identity -v -p codesigning 2>/dev/null | grep -c 'Apple' || true)"
if [[ "${identities}" -ge 1 ]]; then
  echo "[OK] Code signing identities (${identities})"
else
  echo "[MISSING (optional for Android-only)] Code signing identities — required for real IPA"
fi

if ((${#missing_required[@]} > 0)); then
  echo "Missing: ${missing_required[*]}"
  exit 1
fi

echo "Mac worker prerequisites OK."
exit 0
