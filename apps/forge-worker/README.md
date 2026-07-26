# Forge host worker (Node)

Host OS worker that claims Forge platform builds from the Helm API and runs Flutter Android / iOS builds.

## Why separate from Helm API

Flutter, Android SDK, Java, Gradle, Xcode, and macOS Keychain require host access — same pattern as OmniTest workstation agents.

## Integration

- Authenticate with `Authorization: Bearer <runner_token>` — never Helm user JWT
- Routes: heartbeat, claim, progress, complete, fail
- Contract: [docs/forge/CONTRACT.md](../../docs/forge/CONTRACT.md)

## Local config

```text
%USERPROFILE%\.forge\agent.env   # Windows
~/.forge/agent.env               # macOS
```

Variables:

```text
FORGE_API_URL=http://localhost:4000
FORGE_RUNNER_ID=<uuid>
FORGE_RUNNER_TOKEN=<64-char hex>
FORGE_WORKSPACES_ROOT=<path>
FLUTTER_BIN=flutter          # optional
DART_BIN=dart                # optional
GITLAB_PACKAGES_USER=...     # optional private package rewrite
GITLAB_PACKAGES_TOKEN=...
```

## Start

```bash
# macOS
./scripts/forge/register-local-runner.sh
set -a && source ~/.forge/agent.env && set +a
npm run forge:worker

# Windows
pwsh ./scripts/forge/register-local-runner.ps1
# load agent.env into the session, then:
npm run forge:worker
```

## Build recipes

| Platform | Steps |
|----------|--------|
| Android | `pub get` → optional `build_runner` → `flutter build apk` (debug/release/profile) → upload APK (`app-mock-release.apk` when release + `main_mock.dart`) |
| iOS (macOS only) | `pub get` → optional `build_runner` → `flutter build ipa --export-method …` → upload `.ipa` |

See [macos-worker-setup.md](../../docs/forge/deployment/macos-worker-setup.md).
