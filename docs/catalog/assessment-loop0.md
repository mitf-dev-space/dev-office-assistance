# Loop 0 — Assessment report

Generated as part of Engineering Catalog implementation.

## Inventory status

| Dataset | Expected rows | Fixture file | XLSX on disk |
|---------|---------------|--------------|--------------|
| Backend | ~42 | `backend.fixture.json` | Pending user upload |
| Mobile | ~20 | `mobile.fixture.json` | Pending user upload |
| Web | 4 | `web.fixture.json` | Pending user upload |

## Normalization rules (verified)

- Blank pipeline / test / static-analysis cells → `unknown`
- Arabic work notes preserved in `RepositoryImportRow.rawPayload`
- Branch names not normalized destructively (`main` vs `master`, `develop` vs `development`)
- Shared mobile core references modeled via `SharedCoreRelationship`

## Provider topology

- **GitLab self-hosted** — env `GITLAB_*`, internal host configurable
- **GitHub cloud** — env `GITHUB_*`, `api.github.com`

## Compatibility

- Existing `ForgeApplication` rows preserved; optional FK to catalog added
- Existing `DevTeam` / `TeamMembership` (developer roster) unchanged
- `CatalogTeam` seeded from `DevTeam` enum values

## GitLab connectivity

Run `npm run catalog:probe` from repo root when on corporate network. Probe uses `GITLAB_API_URL` without requiring a token for version endpoint.
