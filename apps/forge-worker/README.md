# Forge host worker (.NET)

Planned **.NET Worker Service** that runs on the **host OS** (not inside Docker) to execute Flutter Android builds and (on macOS) iOS builds.

## Why separate from Helm API

Flutter, Android SDK, Java, Gradle, Xcode, and macOS Keychain require host access — same pattern as OmniTest workstation agents.

## Integration

- Registers with Helm API at `/api/forge/runners/*`
- Authenticates with `Authorization: Bearer <runner_token>` — never Helm user JWT
- Contract: [docs/forge/CONTRACT.md](../../docs/forge/CONTRACT.md)

## Status

**Bootstrap only** — implementation in PRD Loop 10+. Prerequisites: [docs/forge/deployment/windows-dev-setup.md](../../docs/forge/deployment/windows-dev-setup.md)

## Local config (future)

```text
%USERPROFILE%\.forge\agent.env   # Windows
~/.forge/agent.env               # macOS
```

Variables: `RUNNER_TOKEN`, `API_URL`, `FORGE_WORKER_HEALTH_PORT=9474`
