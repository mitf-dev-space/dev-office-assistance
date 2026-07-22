import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  CatalogOverviewDto,
  DashboardOverviewDto,
  ForgeDashboardDto,
  PageMeta,
  TriageItemDto,
  TriageSummaryDto,
} from "@office/types";
import { DEV_TEAMS, canAccessCatalog } from "@office/types";
import { DEV_TEAM_LABELS } from "../constants/teams";
import { useAuth } from "../auth/AuthContext";
import { canAccessForge } from "../lib/forge/roles";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AssigneeWorkloadBlock } from "../components/dashboard/AssigneeWorkloadBlock";
import { MorningBriefCard } from "../components/ai/MorningBriefCard";
import { ForgeMetricGrid } from "../pages/forge/ForgeOverview";
import {
  MetricStripSkeleton,
  ProfileLineSkeleton,
  SnapshotGridSkeleton,
} from "../components/skeletons/AppSkeletons";

function formatMoney(amountStr: string, currency: string) {
  const n = Number(amountStr);
  if (Number.isNaN(n)) return amountStr;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

type Me = { id: string; email: string | null; displayName: string | null };

function userInitials(u: Me) {
  const s = (u.displayName ?? u.email ?? "U").trim();
  const p = s.split(/\s+/);
  if (p.length >= 2) {
    return (p[0]![0]! + p[1]![0]!).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}

export function DashboardPage() {
  const { request } = useApi();
  const { user } = useAuth();
  const showForge = user ? canAccessForge(user.role) : false;
  const showCatalog = user ? canAccessCatalog(user.role) : false;

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await request("/api/me");
      if (!res.ok) throw new Error("me_failed");
      return (await res.json()) as Me;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["triage-summary"],
    queryFn: async () => {
      const res = await request("/api/triage-items/summary");
      if (!res.ok) throw new Error("summary_failed");
      return (await res.json()) as TriageSummaryDto;
    },
  });

  const overviewQuery = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const res = await request("/api/dashboard-overview");
      if (!res.ok) throw new Error("overview_failed");
      return (await res.json()) as DashboardOverviewDto;
    },
  });

  const forgeDashboardQuery = useQuery({
    queryKey: ["forge", "dashboard"],
    enabled: showForge,
    queryFn: async () => {
      const res = await request("/api/forge/dashboard");
      if (!res.ok) throw new Error("forge_dashboard_failed");
      return (await res.json()) as ForgeDashboardDto;
    },
    refetchInterval: 8000,
  });

  const catalogOverviewQuery = useQuery({
    queryKey: ["catalog", "overview"],
    enabled: showCatalog,
    queryFn: async () => {
      const res = await request("/api/catalog/overview");
      if (!res.ok) throw new Error("catalog_overview_failed");
      return (await res.json()) as CatalogOverviewDto;
    },
    refetchInterval: 20000,
  });

  const recentTriageQuery = useQuery({
    queryKey: ["triage-items", "dashboard-preview"],
    queryFn: async () => {
      const res = await request("/api/triage-items?page=1&limit=5");
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { items: TriageItemDto[] } & PageMeta;
    },
  });

  const sum = summaryQuery.data;
  const recentItems = recentTriageQuery.data?.items ?? [];

  return (
    <div className="app-page app-page--dashboard">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        lead="Start with the morning ritual (blockers → check-in), then drill into Triage, Catalog, or Forge when you need details."
        actions={
          <div className="dashboard-header-actions">
            <nav className="dashboard-quick-nav" aria-label="Work areas">
              <Link to="/priority?ritual=1" className="btn btn-primary">
                Morning ritual
              </Link>
              <Link to="/triage" className="btn btn-ghost">
                Triage
              </Link>
              <Link to="/priority" className="btn btn-ghost">
                Priority
              </Link>
              <Link to="/standup" className="btn btn-ghost">
                Check-in
              </Link>
              <Link to="/planning" className="btn btn-ghost">
                Planning
              </Link>
              {showCatalog && (
                <Link to="/catalog" className="btn btn-ghost">
                  Catalog
                </Link>
              )}
              {showForge && (
                <Link to="/forge" className="btn btn-ghost">
                  Forge
                </Link>
              )}
            </nav>
            <Link to="/triage/new" className="btn btn-primary">
              New item
            </Link>
          </div>
        }
      />

      <MorningBriefCard />

      <section className="card dashboard-kpi-card" aria-label="Primary metrics">
        <div className="card__head card__head--row">
          <div>
            <h2 className="card__title">At a glance</h2>
            <p className="card__sub">
              The numbers that decide what to work next. Open Triage for the full queue.
            </p>
          </div>
          {meQuery.data && (
            <div className="dashboard-identity dashboard-identity--compact">
              {meQuery.isLoading ? (
                <ProfileLineSkeleton />
              ) : (
                <>
                  <span className="dashboard-identity__ava" aria-hidden="true">
                    {userInitials(meQuery.data)}
                  </span>
                  <div className="dashboard-identity__meta">
                    <span className="dashboard-identity__label">Signed in</span>
                    <span className="dashboard-identity__name">
                      {meQuery.data.displayName ?? meQuery.data.email ?? meQuery.data.id}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {summaryQuery.isLoading && <MetricStripSkeleton count={6} />}
        {sum && (
          <div className="dashboard-kpi-grid" aria-label="Triage queue">
            <Link
              to="/triage?overdue=true"
              className="dashboard-kpi"
              data-metric-priority={sum.overdueCount > 0 ? "high" : undefined}
            >
              <span className="dashboard-kpi__value">{sum.overdueCount}</span>
              <span className="dashboard-kpi__label">Overdue</span>
            </Link>
            <Link to="/triage" className="dashboard-kpi">
              <span className="dashboard-kpi__value">{sum.dueThisWeekCount}</span>
              <span className="dashboard-kpi__label">Due this week</span>
            </Link>
            <Link to="/triage" className="dashboard-kpi">
              <span className="dashboard-kpi__value">{sum.byStatus.inbox}</span>
              <span className="dashboard-kpi__label">Inbox</span>
            </Link>
            <Link to="/triage" className="dashboard-kpi">
              <span className="dashboard-kpi__value">{sum.byStatus.in_progress}</span>
              <span className="dashboard-kpi__label">In progress</span>
            </Link>
            <Link
              to="/priority"
              className="dashboard-kpi"
              data-metric-priority={
                (overviewQuery.data?.ops.openBlockerRisk ?? 0) > 0 ? "high" : undefined
              }
            >
              <span className="dashboard-kpi__value">
                {overviewQuery.data?.ops.openBlockerRisk ?? "—"}
              </span>
              <span className="dashboard-kpi__label">Blockers & risk</span>
            </Link>
            <Link to="/triage" className="dashboard-kpi">
              <span className="dashboard-kpi__value">{sum.byStatus.snoozed}</span>
              <span className="dashboard-kpi__label">Snoozed</span>
            </Link>
          </div>
        )}
      </section>

      <div className="dashboard-home-grid">
        <section className="card dashboard-panel" aria-label="Triage preview">
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">
                <Link to="/triage">Triage queue</Link>
              </h2>
              <p className="card__sub">Latest items — open the full list to filter and paginate.</p>
            </div>
            <Link to="/triage" className="btn btn-ghost">
              Open triage
            </Link>
          </div>
          {recentTriageQuery.isLoading && <MetricStripSkeleton count={3} />}
          {recentTriageQuery.isError && (
            <p className="dashboard-error" role="alert">Could not load recent triage items.</p>
          )}
          {recentItems.length === 0 && !recentTriageQuery.isLoading && !recentTriageQuery.isError && (
            <p className="muted">Queue is clear. Create an item when something lands.</p>
          )}
          {recentItems.length > 0 && (
            <ul className="dashboard-preview-list">
              {recentItems.map((it) => (
                <li key={it.id}>
                  <Link to={`/triage/${it.id}`} className="dashboard-preview-list__title">
                    {it.title}
                  </Link>
                  <div className="dashboard-preview-list__meta">
                    <span className="pill pill--status" data-status={it.status}>{it.status}</span>
                    <span className="pill pill--cat" data-category={it.category}>{it.category}</span>
                    <span className="muted">{it.dueAt ? it.dueAt.slice(0, 10) : "No due date"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card dashboard-panel" aria-label="Programs snapshot">
          <div className="card__head">
            <h2 className="card__title">Programs</h2>
            <p className="card__sub">
              Expenses use <strong>{overviewQuery.data?.periodLabel ?? "this month"}</strong>.
            </p>
          </div>
          {overviewQuery.isLoading && <SnapshotGridSkeleton />}
          {overviewQuery.isError && (
            <p className="dashboard-error" role="alert">Could not load program stats.</p>
          )}
          {overviewQuery.data && (
            <div className="dashboard-program-stack">
              <div className="snapshot-block snapshot-block--dashboard">
                <h3 className="snapshot-block__title">
                  <Link to="/expenses">Expenses</Link>
                </h3>
                <div className="metric-strip metric-strip--dashboard">
                  {overviewQuery.data.expenses.byCurrency.length === 0 ? (
                    <div className="metric metric--compact">
                      <span className="metric-value">{formatMoney("0", "USD")}</span>
                      <span className="metric-label">Logged (USD)</span>
                    </div>
                  ) : (
                    overviewQuery.data.expenses.byCurrency.map((row) => (
                      <div className="metric metric--compact" key={row.currency}>
                        <span className="metric-value">{formatMoney(row.total, row.currency)}</span>
                        <span className="metric-label">Total {row.currency}</span>
                      </div>
                    ))
                  )}
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.expenses.monthEntryCount}</span>
                    <span className="metric-label">Entries</span>
                  </div>
                </div>
              </div>
              <div className="snapshot-block snapshot-block--dashboard">
                <h3 className="snapshot-block__title">
                  <Link to="/planning">Planning</Link>
                </h3>
                <div className="metric-strip metric-strip--dashboard">
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.planning.active}</span>
                    <span className="metric-label">Active</span>
                  </div>
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.planning.draft}</span>
                    <span className="metric-label">Draft</span>
                  </div>
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.planning.byStatus.done}</span>
                    <span className="metric-label">Done</span>
                  </div>
                </div>
              </div>
              <div className="snapshot-block snapshot-block--dashboard">
                <h3 className="snapshot-block__title">
                  <Link to="/team-management">Team roster</Link>
                </h3>
                <div className="metric-strip metric-strip--dashboard">
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.teams.uniqueDevelopers}</span>
                    <span className="metric-label">People</span>
                  </div>
                  <div className="metric metric--compact">
                    <span className="metric-value">{overviewQuery.data.teams.totalMemberships}</span>
                    <span className="metric-label">Assignments</span>
                  </div>
                </div>
                <ul className="team-snapshot-list team-snapshot-list--inline">
                  {DEV_TEAMS.map((t) => (
                    <li key={t}>
                      <span className="team-snapshot-list__name">{DEV_TEAM_LABELS[t]}</span>
                      <span className="team-snapshot-list__n">{overviewQuery.data.teams.byTeam[t]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {showCatalog && (
          <section className="card dashboard-panel" aria-label="Engineering Catalog">
            <div className="card__head card__head--row">
              <div>
                <h2 className="card__title">
                  <Link to="/catalog">Engineering Catalog</Link>
                </h2>
                <p className="card__sub">Repository coverage, sync freshness, and gaps.</p>
              </div>
              <Link to="/catalog/repositories" className="btn btn-ghost">
                Repositories
              </Link>
            </div>
            {catalogOverviewQuery.isError && (
              <p className="dashboard-error" role="alert">Could not load catalog stats.</p>
            )}
            {catalogOverviewQuery.isLoading && <MetricStripSkeleton count={6} />}
            {catalogOverviewQuery.data && (
              <div className="metric-strip metric-strip--dashboard">
                <div className="metric metric--compact">
                  <span className="metric-value">{catalogOverviewQuery.data.totalRepositories}</span>
                  <span className="metric-label">Repos</span>
                </div>
                <div className="metric metric--compact">
                  <span className="metric-value">{catalogOverviewQuery.data.reachableRepositories}</span>
                  <span className="metric-label">Reachable</span>
                </div>
                <div
                  className="metric metric--compact"
                  data-metric-priority={
                    catalogOverviewQuery.data.neverSyncedCount > 0 ? "high" : undefined
                  }
                >
                  <span className="metric-value">{catalogOverviewQuery.data.neverSyncedCount}</span>
                  <span className="metric-label">Never synced</span>
                </div>
                <div className="metric metric--compact">
                  <span className="metric-value">{catalogOverviewQuery.data.withPipelines}</span>
                  <span className="metric-label">Pipelines</span>
                </div>
                <div className="metric metric--compact">
                  <span className="metric-value">{catalogOverviewQuery.data.openMergeRequestCount}</span>
                  <span className="metric-label">Open MRs</span>
                </div>
                <div
                  className="metric metric--compact"
                  data-metric-priority={catalogOverviewQuery.data.openGaps > 0 ? "high" : undefined}
                >
                  <span className="metric-value">{catalogOverviewQuery.data.openGaps}</span>
                  <span className="metric-label">Gaps</span>
                </div>
              </div>
            )}
            <p className="preview-line" style={{ margin: "0.65rem 0 0" }}>
              <Link to="/catalog/integrations" className="link-out">Integrations</Link>
              {" · "}
              <Link to="/catalog/sync" className="link-out">Sync activity</Link>
            </p>
          </section>
        )}

        {showForge && (
          <section className="card dashboard-panel" aria-label="Forge">
            <div className="card__head card__head--row">
              <div>
                <h2 className="card__title">
                  <Link to="/forge">Forge · mobile builds</Link>
                </h2>
                <p className="card__sub">Demo APK queue and runner health.</p>
              </div>
              <Link to="/forge/builds/new" className="btn btn-ghost">
                Request build
              </Link>
            </div>
            {forgeDashboardQuery.isError && (
              <p className="dashboard-error" role="alert">Could not load Forge stats.</p>
            )}
            {!forgeDashboardQuery.isError && (
              <ForgeMetricGrid
                stats={forgeDashboardQuery.data}
                loading={forgeDashboardQuery.isLoading}
                compact
              />
            )}
            <p className="preview-line" style={{ margin: "0.65rem 0 0" }}>
              <Link to="/forge/builds" className="link-out">Build history</Link>
            </p>
          </section>
        )}

        {overviewQuery.data && (
          <section className="card dashboard-panel dashboard-panel--wide" aria-label="Assignee load">
            <div className="card__head card__head--row">
              <div>
                <h2 className="card__title">
                  <Link to="/developers">Assignee load</Link>
                </h2>
                <p className="card__sub">Open and in-progress work across the roster.</p>
              </div>
              <Link to="/triage" className="btn btn-ghost">
                Work the queue
              </Link>
            </div>
            <AssigneeWorkloadBlock rows={overviewQuery.data.workload.rows} />
          </section>
        )}
      </div>
    </div>
  );
}
