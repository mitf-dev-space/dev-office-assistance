import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistStatusBadge } from "../components/ai/AiAssistStatusBadge";

type InsightSnapshotDto = {
  id: string;
  kind: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, unknown>;
  narrative: { headline?: string; bullets?: string[]; risks?: string[] } | null;
  llmUsed: boolean;
  status: string;
  error: string | null;
  createdAt: string;
};

const KIND_OPTIONS = [
  { value: "insights.morning_brief", label: "Morning brief" },
  { value: "insights.blocker_radar", label: "Blocker radar" },
  { value: "insights.weekly_ops", label: "Weekly ops" },
  { value: "insights.catalog_health", label: "Catalog health" },
  { value: "insights.forge_builds", label: "Forge builds" },
];

function metricCards(metrics: Record<string, unknown>) {
  const flat: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    if (value == null) return;
    if (typeof value === "object") return;
    flat.push({ label, value: String(value) });
  };

  const triage = metrics.triage as Record<string, unknown> | undefined;
  if (triage) {
    push("Open triage", triage.openCount);
    push("Escalated", triage.escalatedCount);
    push("Overdue", triage.overdueCount);
    push("Blockers", triage.blockerCount);
  }
  push("Signals", metrics.signalCount);
  push("Open gaps", metrics.openGapCount);
  push("Repos", metrics.repositoryCount);
  push("Stale repos", metrics.staleRepositoryCount);
  push("Failed pipelines (7d)", metrics.failedPipelines7d);
  push("Scorecard avg", metrics.scorecardAverage);
  push("Forge builds", metrics.totalBuilds);
  push("Success rate", metrics.successRate);
  push("Queue depth", metrics.queueDepthApprox);

  return flat.slice(0, 8);
}

function kindLabel(kind: string) {
  return kind.replace(/_/g, " ");
}

export function InsightsPage() {
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const { request } = useApi();
  const qc = useQueryClient();
  const [runKind, setRunKind] = useState("insights.weekly_ops");

  const listQuery = useQuery({
    queryKey: ["insights"],
    queryFn: async () => {
      const res = await request("/api/insights?limit=20");
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { items: InsightSnapshotDto[] };
    },
    refetchInterval: 5000,
  });

  const runMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/insights/run", {
        method: "POST",
        body: JSON.stringify({ kind: runKind }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "run_failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const items = listQuery.data?.items ?? [];
  const latest = items[0];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Ops"
        title="Insights"
        lead="Background metrics from triage, catalog, and Forge — with optional LLM narrative when workspace AI is on."
        actions={<AiAssistStatusBadge />}
      />

      {isLead ? (
        <section className="card ai-assist" aria-label="Run insight job">
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">Run insight job</h2>
              <p className="card__sub">
                Queue a snapshot now. The worker refreshes this page when the job finishes.
              </p>
            </div>
          </div>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Job kind"
              data={KIND_OPTIONS}
              value={runKind}
              onChange={(v) => v && setRunKind(v)}
              w={240}
            />
            <Button loading={runMut.isPending} onClick={() => runMut.mutate()}>
              Run now
            </Button>
          </Group>
          {runMut.isError ? (
            <div className="ai-assist__error" role="alert" style={{ marginTop: "0.9rem" }}>
              <strong>Run failed</strong>
              <p>{runMut.error instanceof Error ? runMut.error.message : "Run failed"}</p>
            </div>
          ) : null}
          {runMut.isSuccess ? (
            <Alert color="gray" mt="sm" variant="light">
              Job queued. Snapshots refresh automatically.
            </Alert>
          ) : null}
        </section>
      ) : null}

      {listQuery.isLoading ? <Text c="dimmed">Loading snapshots…</Text> : null}
      {!listQuery.isLoading && items.length === 0 ? (
        <section className="card">
          <p className="card__sub" style={{ margin: 0 }}>
            No insight snapshots yet. A lead can use Run now above.
          </p>
        </section>
      ) : null}

      {latest ? (
        <section className="card" aria-label="Latest insight snapshot" style={{ marginBottom: "1.25rem" }}>
          <div className="card__head card__head--row">
            <div>
              <h2 className="card__title">{kindLabel(latest.kind)}</h2>
              <p className="card__sub">
                {new Date(latest.periodStart).toLocaleString()} →{" "}
                {new Date(latest.periodEnd).toLocaleString()} · captured{" "}
                {new Date(latest.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="card__head__actions">
              <Badge variant="light">{latest.status}</Badge>
              {latest.llmUsed ? (
                <Badge color="teal" variant="light">
                  LLM narrative
                </Badge>
              ) : (
                <Badge color="gray" variant="light">
                  Metrics only
                </Badge>
              )}
            </div>
          </div>

          <div className="ai-assist__metric-grid">
            {metricCards(latest.metrics).map((m) => (
              <div key={m.label} className="ai-assist__metric">
                <span className="ai-assist__metric-label">{m.label}</span>
                <span className="ai-assist__metric-value">{m.value}</span>
              </div>
            ))}
          </div>

          {latest.narrative?.headline ? (
            <div className="ai-assist__result ai-assist__narrative" style={{ marginTop: "1rem" }}>
              <div className="ai-assist__result-head">
                <span className="ai-assist__result-label">{latest.narrative.headline}</span>
                <span className="ai-assist__source">Narrative</span>
              </div>
              <ul>
                {(latest.narrative.bullets ?? []).map((b) => (
                  <li key={b}>
                    <Text size="sm">{b}</Text>
                  </li>
                ))}
              </ul>
              {(latest.narrative.risks ?? []).length > 0 ? (
                <>
                  <Text fw={600} mt="sm" size="sm">
                    Risks
                  </Text>
                  <ul>
                    {(latest.narrative.risks ?? []).map((r) => (
                      <li key={r}>
                        <Text size="sm">{r}</Text>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          <details style={{ marginTop: "1rem" }}>
            <summary className="muted">Raw metrics JSON</summary>
            <Code block mt="sm">
              {JSON.stringify(latest.metrics, null, 2)}
            </Code>
          </details>
        </section>
      ) : null}

      {items.length > 1 ? (
        <Stack gap="xs">
          <Title order={4}>History</Title>
          {items.slice(1).map((item) => (
            <section key={item.id} className="card" style={{ padding: "0.85rem 1rem" }}>
              <Group justify="space-between">
                <Text size="sm">
                  {kindLabel(item.kind)} · {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Badge size="sm" variant="light">
                  {item.status}
                </Badge>
              </Group>
            </section>
          ))}
        </Stack>
      ) : null}
    </div>
  );
}
