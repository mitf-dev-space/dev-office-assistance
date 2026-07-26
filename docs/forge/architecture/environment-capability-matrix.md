# Forge — environment capability matrix

| Capability | Windows dev | macOS worker (Mac mini) |
|------------|-------------|-------------------------|
| Helm API + Web | Yes | N/A (points at Helm API) |
| PostgreSQL queue | Yes (Docker) | N/A |
| Real Android APK/AAB | Yes (host worker) | Yes (host worker) |
| Mock Android (`main_mock` + `build_runner`) | Yes | Yes |
| Real iOS IPA | **No** | Yes (Xcode + signing) |
| iOS simulation | Dev/test only | N/A |
| Mailpit (notifications) | Optional `docker compose --profile forge-dev` | N/A |

Run `scripts/forge/check-prerequisites.ps1` on Windows or `scripts/forge/check-prerequisites.sh` on macOS before worker setup. Register with `register-local-runner.ps1` / `register-local-runner.sh`.

**Rule:** Never mark simulated iOS as production success. Never produce `.ipa` on Windows.
