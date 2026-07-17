# Spreadsheet import column mapping

Reusable importer supports column mapping per file. Default mappings:

## Backend

| Spreadsheet column | Catalog field |
|--------------------|---------------|
| Repository name | `componentName` / match key |
| URL | `repositoryUrl` → connection auto-detect |
| Unit tests | `reportedUnitTestState` (NO → `declared` absent, blank → `unknown`) |
| Static analysis | `reportedStaticAnalysisState` |
| Main branch | `reportedMainBranch` |
| Development branch | `reportedDevelopmentBranch` |
| Pipeline | `reportedPipelineState` (blank → `unknown`) |
| Notes (AR/EN) | `rawPayload.notes` |

## Mobile

| Spreadsheet column | Catalog field |
|--------------------|---------------|
| Application name | `applicationName` |
| Repository URL | `repositoryUrl` |
| Shared core reference | `sharedCoreSourceName` → `SharedCoreRelationship` |
| Unit tests / coverage | `reportedUnitTestState`, `reportedCoveragePercent` |

## Web

Same as backend; `Main` branch value reconciled against detected default branch on sync.
