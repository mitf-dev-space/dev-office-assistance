# Forge — environment capability matrix

| Capability | Windows dev | macOS worker (later) |
|------------|-------------|----------------------|
| Helm API + Web | Yes | N/A |
| PostgreSQL queue | Yes (Docker) | N/A |
| Real Android APK/AAB | Yes (host worker) | Yes |
| Real iOS IPA | **No** | Yes (Mac mini) |
| iOS simulation | Dev/test only | N/A |
| Mailpit (notifications) | Optional `docker compose --profile forge-dev` | N/A |

Run `scripts/forge/check-prerequisites.ps1` on Windows before worker setup.

**Rule:** Never mark simulated iOS as production success. Never produce `.ipa` on Windows.
