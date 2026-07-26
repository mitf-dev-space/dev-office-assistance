# Apple signing checklist (required for real IPA)

Forge cannot create Apple signing identities for you. Do this once on the Mac mini (or import from another Mac).

## Prerequisites

- Full **Xcode.app** installed and selected (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`)
- Active **Apple Developer Program** membership for the company team
- Bundle IDs for the mock apps registered in [developer.apple.com](https://developer.apple.com)

## Steps

1. Open Xcode → **Settings → Accounts** → add your Apple ID / team.
2. For each app: open `ios/Runner.xcworkspace` → **Signing & Capabilities** → select Team, enable automatic signing (or install manual profiles).
3. Confirm identities exist:

   ```bash
   security find-identity -v -p codesigning
   ```

   Expect at least one `Apple Development` or `Apple Distribution` identity.

4. Prefer Forge profile export method `ad-hoc` or `development` for PM demos.
5. Re-run `./scripts/forge/check-prerequisites.sh` before starting `npm run forge:worker`.

## What Helm does not store

- Certificates, private keys, or provisioning profiles (stay in Keychain / Xcode)
- Apple ID passwords or App Store Connect API keys (unless you later add a separate vault process)
