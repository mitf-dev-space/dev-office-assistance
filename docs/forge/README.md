# Forge — documentation index

**Forge** is the Flutter mobile build portal module inside Helm (`dev-office-assistance`). The mobile team lead requests demo/mock APK builds and manages banks, applications, profiles, and runners. PMs receive builds via a shared folder (no Helm login) when publish is selected.

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
| `forge_mobile_lead` | Forge only (request builds + admin: banks/apps/profiles/runners + shared delivery paths) |

Legacy roles `forge_admin` / `forge_pm` are migrated to `forge_mobile_lead` on seed/migration.

Seed user: `forge-mobile-lead@local.dev` — see root README.

## Shared folder PM delivery

1. Set **shared delivery path** on a bank (default) and optionally override per application (Forge settings).
2. On Request Build, check **Publish to shared folder** and enter the **PM notify email**.
3. On successful Android artifact upload, Forge copies the APK into that folder and emails mobile leads + the PM with the full path (SMTP required).

## Related

- Host worker placeholder: [apps/forge-worker/README.md](../../apps/forge-worker/README.md)
- API routes: [docs/API_OVERVIEW.md](../API_OVERVIEW.md#forge-module)
