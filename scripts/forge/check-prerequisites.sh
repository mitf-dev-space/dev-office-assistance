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

check_cmd ".NET SDK" dotnet false
check_cmd "Git" git true
check_cmd "Flutter" flutter true
check_cmd "Xcode CLI" xcodebuild true
check_cmd "Java" java false
check_cmd "Android SDK (adb)" adb false

if ((${#missing_required[@]} > 0)); then
  echo "Missing: ${missing_required[*]}"
  exit 1
fi

echo "Mac worker prerequisites OK (Loop 14+)."
exit 0
