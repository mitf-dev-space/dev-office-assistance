import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Group, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { CatalogOverviewDto } from "@office/types";
import { canWriteCatalog } from "@office/types";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { AppPage } from "../../components/ui/AppPage";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { useApi } from "../../useApi";
import { providerLabel } from "./catalogUi";

function StatCard({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number | string;
  to?: string;
  tone?: "teal" | "orange" | "dimmed";
}) {
  const inner = (
    <div className="catalog-stat">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={700} mt={4} c={tone}>{value}</Text>
    </div>
  );
  return to ? <Link to={to} className="catalog-stat-link">{inner}</Link> : inner;
}

function QuickLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to} className="catalog-quick-link">
      <Text fw={600}>{title}</Text>
      <Text size="sm" c="dimmed">{description}</Text>
    </Link>
  );
}

export function CatalogOverviewPage() {
  const { request } = useApi();
  const { user } = useAuth();
  const canWrite = user ? canWriteCatalog(user.role) : false;

  const q = useQuery({
    queryKey: ["catalog", "overview"],
    queryFn: async () => {
      const res = await request("/api/catalog/overview");
      if (!res.ok) throw new Error("overview_failed");
      return (await res.json()) as CatalogOverviewDto;
    },
    refetchInterval: 15000,
  });

  if (q.isLoading) {
    return (
      <AppPage variant="catalog">
        <Text c="dimmed">Loading catalog overview…</Text>
      </AppPage>
    );
  }
  if (q.isError || !q.data) {
    return (
      <AppPage variant="catalog">
        <Text c="red">Could not load Engineering Catalog overview.</Text>
      </AppPage>
    );
  }

  const d = q.data;
  const tokensConfigured = d.connections.filter((c) => c.hasToken).length;

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Overview"
        lead="Repository intelligence across GitLab self-hosted and GitHub cloud — connectivity, sync freshness, pipelines, and engineering gaps."
        actions={
          canWrite ? (
            <Group>
              <Button component={Link} to="/catalog/repositories/new" variant="light">
                Register repository
              </Button>
              <Button component={Link} to="/catalog/repositories">
                Browse repositories
              </Button>
            </Group>
          ) : (
            <Button component={Link} to="/catalog/repositories">
              Browse repositories
            </Button>
          )
        }
      />

      <section className="card catalog-summary-grid" aria-label="Catalog metrics">
        <StatCard label="Repositories" value={d.totalRepositories} to="/catalog/repositories" />
        <StatCard label="Reachable" value={d.reachableRepositories} tone="teal" />
        <StatCard label="Unreachable" value={d.unreachableRepositories} tone="orange" />
        <StatCard label="Never synced" value={d.neverSyncedCount} />
        <StatCard label="Stale" value={d.staleCount} />
        <StatCard label="Fresh" value={d.freshCount} tone="teal" />
        <StatCard label="With pipelines" value={d.withPipelines} />
        <StatCard label="Open MRs" value={d.openMergeRequestCount} />
        <StatCard label="Branches synced" value={d.branchCount} />
        <StatCard label="Open gaps" value={d.openGaps} to="/catalog/gaps" />
        <StatCard label="Active alerts" value={d.activeAlerts} />
        <StatCard label="Forge linked" value={d.forgeLinkedCount} />
      </section>

      <section className="card catalog-summary-grid" aria-label="Inventory structure">
        <StatCard label="Teams" value={d.teamsCount} />
        <StatCard label="Systems" value={d.systemsCount} />
        <StatCard label="Applications" value={d.applicationsCount} />
        <StatCard label="Connections" value={d.connections.length} to="/catalog/integrations" />
        <StatCard label="Tokens configured" value={`${tokensConfigured}/${d.connections.length}`} to="/catalog/integrations" />
        <StatCard label="Unknown pipeline" value={d.unknownStateCount} />
      </section>

      <div className="catalog-overview-grid">
        <section className="card" aria-label="Connections">
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">Connections</h2>
              <p className="card__sub">Provider tokens and repository coverage.</p>
            </div>
            <Button component={Link} to="/catalog/integrations" variant="light" size="xs">
              Manage
            </Button>
          </div>
          {d.connections.length === 0 ? (
            <Text c="dimmed" size="sm">No connections configured.</Text>
          ) : (
            <AppDataTable embedded>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Connection</Table.Th>
                  <Table.Th>Repos</Table.Th>
                  <Table.Th>Token</Table.Th>
                  <Table.Th>Verified</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.connections.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text fw={600} size="sm">{c.name}</Text>
                      <Text size="xs" c="dimmed">{providerLabel(String(c.providerKind), c.slug)}</Text>
                    </Table.Td>
                    <Table.Td>{c.repositoryCount}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={c.hasToken ? "teal" : "orange"}>
                        {c.hasToken ? "Configured" : "Missing"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {c.lastVerifiedAt ? new Date(c.lastVerifiedAt).toLocaleString() : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
          )}
        </section>

        <section className="card" aria-label="By team">
          <div className="card__head">
            <h2 className="card__title">By team</h2>
            <p className="card__sub">Repository ownership across catalog teams.</p>
          </div>
          {(d.byTeam ?? []).length === 0 ? (
            <Text c="dimmed" size="sm">No team assignments yet.</Text>
          ) : (
            <ul className="catalog-breakdown-list">
              {[...d.byTeam].sort((a, b) => b.count - a.count).map((row) => (
                <li key={row.teamId ?? "unassigned"}>
                  <span>{row.teamName}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="By lifecycle">
          <div className="card__head">
            <h2 className="card__title">Lifecycle</h2>
            <p className="card__sub">Active, preparing, proposed, and deprecated.</p>
          </div>
          {(d.byLifecycle ?? []).length === 0 ? (
            <Text c="dimmed" size="sm">No lifecycle data.</Text>
          ) : (
            <ul className="catalog-breakdown-list">
              {d.byLifecycle.map((row) => (
                <li key={row.lifecycleState}>
                  <span style={{ textTransform: "capitalize" }}>{row.lifecycleState.replaceAll("_", " ")}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Recent sync activity">
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">Recent syncs</h2>
              <p className="card__sub">Latest provider sync runs.</p>
            </div>
            <Button component={Link} to="/catalog/sync" variant="light" size="xs">
              All activity
            </Button>
          </div>
          {(d.recentSyncs ?? []).length === 0 ? (
            <Text c="dimmed" size="sm">No sync runs yet. Open a repository and click Sync now.</Text>
          ) : (
            <ul className="catalog-activity-list">
              {d.recentSyncs.map((r) => (
                <li key={r.id}>
                  <div>
                    <Text size="sm" fw={600}>
                      {r.repositoryName ?? "Connection sync"} · {r.kind}
                    </Text>
                    <Text size="xs" c="dimmed">{new Date(r.startedAt).toLocaleString()}</Text>
                  </div>
                  <Badge variant="light" color={r.status === "succeeded" || r.status === "completed" ? "teal" : r.status === "failed" ? "red" : "gray"}>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Recent engineering gaps">
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">Open gaps</h2>
              <p className="card__sub">Quality and ownership gaps needing attention.</p>
            </div>
            <Button component={Link} to="/catalog/gaps" variant="light" size="xs">
              View all
            </Button>
          </div>
          {(d.recentGaps ?? []).length === 0 ? (
            <Text c="dimmed" size="sm">No open engineering gaps.</Text>
          ) : (
            <ul className="catalog-activity-list">
              {d.recentGaps.map((g) => (
                <li key={g.id}>
                  <div>
                    <Text size="sm" fw={600}>{g.title}</Text>
                    <Text size="xs" c="dimmed">{g.repositoryName}</Text>
                  </div>
                  <Badge variant="light" color={g.priority === "high" ? "red" : g.priority === "low" ? "gray" : "orange"}>
                    {g.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-label="Catalog navigation">
        <Text fw={600} mb="sm">Explore the catalog</Text>
        <div className="catalog-quick-links">
          <QuickLink to="/catalog/repositories" title="Repositories" description="Browse, edit, archive, and sync projects" />
          <QuickLink to="/catalog/integrations" title="Integrations" description="GitLab and GitHub connection tokens" />
          <QuickLink to="/catalog/imports" title="Imports" description="Load Backend, Mobile, and Web inventories" />
          <QuickLink to="/catalog/sync" title="Sync activity" description="Track provider sync runs and failures" />
          <QuickLink to="/catalog/gaps" title="Engineering gaps" description="Open quality and ownership gaps" />
          <QuickLink to="/catalog/policies" title="Scorecard policies" description="Check definitions for quality scorecards" />
        </div>
      </section>
    </AppPage>
  );
}
