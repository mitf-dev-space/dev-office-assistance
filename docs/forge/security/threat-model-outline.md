# Forge — threat model outline (PRD §23)

| Threat | Mitigation |
|--------|------------|
| Malicious repo content | Isolated workspaces; command allowlisting |
| Command injection | Typed Flutter args; no user shell text |
| Path traversal | Central artifact paths; API download auth |
| Secret leakage | Log sanitization; secret refs not raw values |
| Unauthorized artifact access | JWT on download; object-level checks |
| Compromised worker | Runner token rotation; least privilege |
| PM arbitrary repos | Admin-registered applications only |

Forge shares Helm's auth surface — strict RBAC (`forge_pm`, `forge_admin`, `lead`) limits exposure.

Full hardening: PRD Loop 17.
