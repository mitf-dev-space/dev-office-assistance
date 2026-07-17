# Forge — macOS worker setup (deferred)

Real iOS IPA builds require a company **Mac mini** with Xcode, Flutter, signing certificates, and provisioning profiles.

**Loop 15** (PRD) covers Mac mini acceptance. Until hardware is available:

1. Run `scripts/forge/check-prerequisites.sh` on the Mac
2. Prepare `~/.forge/agent.env` with `RUNNER_TOKEN` and `API_URL` pointing at Helm API
3. Register runner via `/api/forge/runners/register` (Loop 8+)

Do not commit signing secrets. Worker communicates with Helm API only — no direct database access.
