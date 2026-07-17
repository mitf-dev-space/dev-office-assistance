# Forge — solution structure (Helm)

Forge is a **module** inside the Helm monorepo — not a separate product.

```text
dev-office-assistance/
├── apps/
│   ├── api/src/
│   │   ├── forge/authz.ts           # requireForgeAccess, requireForgeAdmin
│   │   └── routes/forge/            # user + worker route registration
│   ├── web/src/
│   │   ├── pages/forge/             # Dashboard, builds, admin
│   │   └── lib/forge/roles.ts       # Role helpers
│   └── forge-worker/                # .NET host worker (Loop 10+)
├── packages/types/src/forge.ts      # Shared DTOs + role helpers
├── apps/api/prisma/schema.prisma    # Forge* models
└── docs/forge/                      # Module documentation
```

**Data flow:** Web → Fastify `/api/forge/*` → Prisma → PostgreSQL. Worker → `/api/forge/runners/*` (no direct DB).

Domain logic will live under `apps/api/src/forge/` as services grow (PRD Loops 2–11).
