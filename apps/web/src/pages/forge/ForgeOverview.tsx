import { Link } from "react-router-dom";
import type { ForgeDashboardDto } from "@office/types";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";

type MetricProps = {
  label: string;
  value: string | number;
};

function ForgeMetric({ label, value }: MetricProps) {
  return (
    <div className="forge-metric">
      <div className="forge-metric__label">{label}</div>
      <div className="forge-metric__value">{value}</div>
    </div>
  );
}

type Props = {
  stats?: ForgeDashboardDto | null;
  loading?: boolean;
  compact?: boolean;
};

export function ForgeMetricGrid({ stats, loading, compact }: Props) {
  const labels: Array<[string, keyof ForgeDashboardDto | "placeholder"]> = [
    ["Queued", "queuedBuilds"],
    ["Running", "runningBuilds"],
    ["Waiting for macOS", "waitingForMacOs"],
    ["Runners online", "onlineRunners"],
  ];

  return (
    <div className={`forge-metric-grid${compact ? " forge-metric-grid--compact" : ""}`}>
      {labels.map(([label, key]) => (
        <ForgeMetric
          key={label}
          label={label}
          value={
            loading
              ? "…"
              : stats && key !== "placeholder"
                ? (stats[key] ?? "—")
                : "—"
          }
        />
      ))}
    </div>
  );
}

type ForgeDashboardSectionProps = {
  stats?: ForgeDashboardDto | null;
  loading?: boolean;
  error?: boolean;
};

/** Shared Forge overview block — used on /forge and main dashboard snapshot. */
export function ForgeOverviewSection({ stats, loading, error }: ForgeDashboardSectionProps) {
  return (
    <>
      {error && (
        <p className="dashboard-error" role="alert">
          Could not load Forge stats.
        </p>
      )}
      <ForgeMetricGrid stats={stats} loading={loading} />
      <div className="forge-actions" style={{ marginTop: "0.85rem" }}>
        <Link to="/forge/builds/new" className="btn btn-primary">
          Request build
        </Link>
        <Link to="/forge/builds" className="btn btn-ghost">
          View builds
        </Link>
        <Link to="/forge" className="btn btn-ghost">
          Forge dashboard
        </Link>
      </div>
    </>
  );
}

export function ForgeDashboardPageContent({
  stats,
  loading,
  error,
}: ForgeDashboardSectionProps) {
  return (
    <AppPage variant="forge">
      <PageHeader
        eyebrow="Forge"
        title="Mobile builds"
        lead="Self-service demo and mock Flutter APK builds for project management."
        actions={
          <Link to="/forge/builds/new" className="btn btn-primary">
            Request build
          </Link>
        }
      />
      {error && (
        <p className="dashboard-error" role="alert">
          Could not load Forge dashboard.
        </p>
      )}
      <section className="card" aria-label="Forge queue overview">
        <div className="card__head">
          <h2 className="card__title">Build queue</h2>
          <p className="card__sub">Live runner and queue metrics.</p>
        </div>
        <ForgeMetricGrid stats={stats} loading={loading} />
        <div className="forge-actions" style={{ marginTop: "1rem" }}>
          <Link to="/forge/builds" className="btn btn-ghost">
            View build history
          </Link>
          {stats && stats.onlineRunners === 0 && (
            <span className="muted" style={{ fontSize: "0.85rem", alignSelf: "center" }}>
              No runners online — ask an admin to start a worker.
            </span>
          )}
        </div>
      </section>
    </AppPage>
  );
}
