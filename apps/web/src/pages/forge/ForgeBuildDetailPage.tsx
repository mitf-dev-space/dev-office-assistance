import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Text } from "@mantine/core";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { apiDownload } from "../../apiClient";
import { useApi } from "../../useApi";
import type { ForgeBuildRequestDetailDto } from "../../lib/forge/types";
import { AiAssistPanel } from "../../components/ai/AiAssistPanel";

export function ForgeBuildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useApi();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [explainByBuild, setExplainByBuild] = useState<
    Record<string, { summary: string; likelyCause: string; suggestedFix: string; source: string }>
  >({});
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainTargetId, setExplainTargetId] = useState<string | null>(null);

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

  const explainMut = useMutation({
    mutationFn: async (platformBuildId: string) => {
      setExplainError(null);
      setExplainTargetId(platformBuildId);
      const res = await request("/api/assist/forge-explain-failure", {
        method: "POST",
        body: JSON.stringify({ platformBuildId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return {
        platformBuildId,
        result: data as {
          summary: string;
          likelyCause: string;
          suggestedFix: string;
          source: string;
        },
      };
    },
    onSuccess: ({ platformBuildId, result }) => {
      setExplainByBuild((prev) => ({ ...prev, [platformBuildId]: result }));
    },
    onError: (err) => setExplainError(err instanceof Error ? err.message : "assist_failed"),
  });

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

          {br.publishToSharedFolder ? (
            <div style={{ marginBottom: "1rem" }}>
              <Text size="sm" fw={600}>
                Shared folder delivery
              </Text>
              <Text size="sm" c="dimmed">
                Status: {br.sharedDeliveryStatus ?? "pending"}
                {br.notifyEmail ? ` · PM: ${br.notifyEmail}` : ""}
              </Text>
              {br.sharedDeliveryPath ? (
                <Text size="sm" ff="monospace">
                  {br.sharedDeliveryPath}
                </Text>
              ) : null}
              {br.sharedDeliveryError ? (
                <Text size="sm" c="red">
                  {br.sharedDeliveryError}
                </Text>
              ) : null}
            </div>
          ) : null}

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
              {(pb.status === "Failed" || pb.status === "TimedOut" || pb.status === "Cancelled") && (
                <AiAssistPanel
                  lead="Interpret the failure category and suggest a concrete fix path for this platform build."
                  label="Explain failure"
                  loading={explainMut.isPending && explainTargetId === pb.id}
                  error={explainTargetId === pb.id ? explainError : null}
                  onSuggest={() => explainMut.mutate(pb.id)}
                  source={explainByBuild[pb.id]?.source}
                  suggestion={
                    explainByBuild[pb.id] ? (
                      <>
                        <Text size="sm">{explainByBuild[pb.id].summary}</Text>
                        <Text size="sm">
                          <strong>Likely cause:</strong> {explainByBuild[pb.id].likelyCause}
                        </Text>
                        <Text size="sm">
                          <strong>Suggested fix:</strong> {explainByBuild[pb.id].suggestedFix}
                        </Text>
                      </>
                    ) : null
                  }
                />
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
