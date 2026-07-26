# Forge — macOS worker setup (Mac mini)

Real iOS IPA builds and Android mock APKs on a company **Mac mini** use the Node forge-worker on the host OS (not Docker).

## Prerequisites

1. Install **Xcode** from the App Store (full app, not only Command Line Tools).
2. Point the active developer directory at Xcode and accept the license:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```

3. Install **Flutter** (stable) and put it on `PATH`. Optionally set `FLUTTER_BIN`.
4. Install **CocoaPods** (`brew install cocoapods` or `sudo gem install cocoapods`).
5. For Android mock builds on the same Mac: install a **JDK** and the **Android SDK** (`ANDROID_HOME`), with `adb` on `PATH`.
6. For real IPA export: install Apple **signing certificates** and **provisioning profiles** for the target app bundle IDs (Keychain + Xcode). Prefer `ad-hoc` or `development` export for PM demos.
7. If mobile repos pull private GitLab packages at `10.10.20.51`, export:

   ```bash
   export GITLAB_PACKAGES_USER=...
   export GITLAB_PACKAGES_TOKEN=...
   ```

## Audit

```bash
./scripts/forge/check-prerequisites.sh
security find-identity -v -p codesigning   # expect ≥1 identity for IPA success
```

## Register the runner

With Helm API running and seeded (`forge-mobile-lead@local.dev`):

```bash
./scripts/forge/register-local-runner.sh http://localhost:4000 local-macos-mobile
```

This creates a macOS runner with platforms `Android` + `iOS` and writes `~/.forge/agent.env`:

```text
FORGE_API_URL=http://localhost:4000
FORGE_RUNNER_ID=...
FORGE_RUNNER_TOKEN=...
FORGE_WORKSPACES_ROOT=<repo>/data/forge-workspaces
```

Do not commit tokens or signing secrets.

## Start the worker

From the repo root:

```bash
set -a && source ~/.forge/agent.env && set +a
npm run forge:worker
```

The worker:

1. Heartbeats and claims queued platform builds
2. Clones the app repo / subpath
3. Runs `flutter pub get`, optional `build_runner`, then:
   - Android mock/release: `flutter build apk --release --target <dartEntryPoint>` (uploads `app-mock-release.apk` for `main_mock` + release)
   - iOS: `flutter build ipa --release --export-method <profile>` and uploads the `.ipa` from `build/ios/ipa/`

## Helm UI

In Forge → Runners, register a macOS runner (or use the script). In Applications, enable **iOS**. Create/use a **mock-release** profile (`lib/main_mock.dart`, Android release, iOS export method). Request builds with Android and/or iOS checked.

## Contract reminders

- Real iOS IPA: macOS runners only
- Never produce `.ipa` on Windows
- Never mark simulated/unsigned iOS as production success — signing failures map to `IosSigningConfigurationMissing` / related categories

## Related

- [environment-capability-matrix.md](../architecture/environment-capability-matrix.md)
- [CONTRACT.md](../CONTRACT.md)
- [apps/forge-worker/README.md](../../../apps/forge-worker/README.md)
