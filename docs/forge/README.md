# Forge — documentation index

**Forge** is the Flutter mobile build portal module inside Helm (`dev-office-assistance`). Project managers request demo/mock APK builds; administrators manage banks, applications, profiles, and runners.

Start with the Helm [README.md](../../README.md), then read **[CONTRACT.md](./CONTRACT.md)** for worker integration rules.

## Official guides

| Document | Audience | Contents |
|----------|----------|----------|
| [CONTRACT.md](./CONTRACT.md) | Devs, workers | Runner tokens, routing, API endpoints |
| [architecture/system-context.md](./architecture/system-context.md) | Stakeholders | PM / admin / worker flow |
| [architecture/solution-structure.md](./architecture/solution-structure.md) | Developers | Helm folder map |
| [architecture/environment-capability-matrix.md](./architecture/environment-capability-matrix.md) | DevOps | Windows vs macOS |
| [architecture/build-lifecycle.md](./architecture/build-lifecycle.md) | Developers | Build state machine |
| [deployment/windows-dev-setup.md](./deployment/windows-dev-setup.md) | Developers | Windows prerequisites |
| [deployment/macos-worker-setup.md](./deployment/macos-worker-setup.md) | DevOps | Mac mini (deferred) |
| [security/threat-model-outline.md](./security/threat-model-outline.md) | Security | PRD threat summary |

## Roles

| Role | Access |
|------|--------|
| `lead` | Full Helm + full Forge |
| `forge_admin` | Forge only (catalog + runners) |
| `forge_pm` | Forge PM pages (request builds) |

Seed users: `forge-admin@local.dev`, `pm@local.dev` — see root README.

## Related

- Host worker placeholder: [apps/forge-worker/README.md](../../apps/forge-worker/README.md)
- API routes: [docs/API_OVERVIEW.md](../API_OVERVIEW.md#forge-module)
