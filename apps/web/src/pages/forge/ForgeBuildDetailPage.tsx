import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiDownload } from "../../apiClient";
import { useApi } from "../../useApi";
import type { ForgeBuildRequestDetailDto } from "../../lib/forge/types";

export function ForgeBuildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useApi();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["forge", "build-request", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await request(`/api/forge/build-requests/${id}`);
      if (!res.ok) throw new Error("detail_failed");
      return (await res.json()) as { buildRequest: ForgeBuildRequestDetailDto };
    },
    refetchInterval: (query) => {
      const status = query.state.data?.buildRequest.overallStatus;
      if (!status) return 3000;
      if (["Succeeded", "Failed", "Cancelled", "PartiallySucceeded"].includes(status)) {
        return false;
      }
      return 3000;
    },
  });

  const br = detailQuery.data?.buildRequest;

  return (
    <AppPage variant="forge">
      <PageHeader
        eyebrow="Forge"
        title={br ? br.application.name : "Build detail"}
        lead={br ? `${br.application.bankName} · ${br.gitReference}` : "Loading build…"}
        actions={
          <Link to="/forge/builds" className="btn btn-ghost">
            Back to builds
          </Link>
        }
      />

      {detailQuery.isError && (
        <p className="dashboard-error" role="alert">
          Could not load build request.
        </p>
      )}

      {br && (
        <section className="card" aria-label="Build status">
          <div className="card__head card__head--row">
            <div>
              <StatusBadge status={br.overallStatus} />
              <p className="card__sub" style={{ marginTop: "0.5rem" }}>
                Requested by {br.requestedBy}
              </p>
            </div>
          </div>

          {br.platformBuilds.map((pb) => (
            <article key={pb.id} className="card forge-platform-card">
              <div className="card__head card__head--row">
                <div>
                  <h3 className="card__title" style={{ fontSize: "1rem" }}>
                    {pb.platform}
                  </h3>
                  <StatusBadge status={pb.status} />
                </div>
                {pb.runnerName && (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Runner: {pb.runnerName}
                  </span>
                )}
              </div>
              {pb.failureSummary && (
                <p className="dashboard-error" style={{ marginTop: 0 }}>
                  {pb.failureCategory}: {pb.failureSummary}
                </p>
              )}
              {pb.artifacts.map((a) => (
                <div
                  key={a.id}
                  className="card__head card__head--row"
                  style={{ paddingTop: "0.5rem", marginBottom: 0 }}
                >
                  <span style={{ fontSize: "0.9rem" }}>
                    {a.fileName} ({Math.round(Number(a.fileSizeBytes) / 1024 / 1024)} MB)
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={downloadingId === a.id}
                    onClick={async () => {
                      setDownloadingId(a.id);
                      try {
                        await apiDownload(`/api/forge/artifacts/${a.id}/download`, a.fileName);
                      } finally {
                        setDownloadingId(null);
                      }
                    }}
                  >
                    {downloadingId === a.id ? "Downloading…" : "Download"}
                  </button>
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
    </AppPage>
  );
}
