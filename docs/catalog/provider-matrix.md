# Provider capability matrix

| Capability | GitLab self-hosted | GitHub cloud |
|------------|-------------------|--------------|
| Project path | `namespace/project` | `owner/repo` |
| Pipelines | GitLab CI pipelines | Actions workflow runs |
| Jobs | CI jobs | Workflow jobs |
| Merge requests | merge_requests | pulls |
| Protected branches | protected branches API | branch protection rules |
| Webhooks | X-Gitlab-Token | X-Hub-Signature-256 |
| File tree | repository tree API | contents API |
| CI config | `.gitlab-ci.yml` | `.github/workflows/*.yml` |

Future: Azure DevOps adapter (not implemented).
