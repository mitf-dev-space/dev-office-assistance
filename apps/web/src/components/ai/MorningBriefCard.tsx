import { Link } from "react-router-dom";
import { Button, Group, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../useApi";
import { AiAssistStatusBadge } from "./AiAssistStatusBadge";

type BriefSnapshot = {
  id: string;
  kind: string;
  metrics: {
    triage?: {
      openCount?: number;
      escalatedCount?: number;
      overdueCount?: number;
      blockerCount?: number;
    };
    standup?: { emptyWeek?: boolean; filledCheckInCount?: number };
    forge?: { failedRecentCount?: number };
    catalog?: { staleRepositoryCount?: number };
  };
  narrative: { headline?: string; bullets?: string[]; risks?: string[] } | null;
  llmUsed: boolean;
  createdAt: string;
};

export function MorningBriefCard() {
  const { request } = useApi();
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const qc = useQueryClient();

  const briefQuery = useQuery({
    queryKey: ["insights", "latest", "morning_brief"],
    queryFn: async () => {
      const res = await request("/api/insights/latest/morning_brief");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("brief_failed");
      return (await res.json()) as BriefSnapshot;
    },
    refetchInterval: 60_000,
  });

  const runMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/insights/run", {
        method: "POST",
        body: JSON.stringify({ kind: "insights.morning_brief" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, 2500));
      await qc.invalidateQueries({ queryKey: ["insights", "latest", "morning_brief"] });
    },
  });

  const brief = briefQuery.data;
  const t = brief?.metrics?.triage;

  return (
    <section className="card ai-assist" aria-label="Morning brief">
      <div className="card__head card__head--row">
        <div>
          <h2 className="card__title">Morning brief</h2>
          <p className="card__sub">
            What needs leadership attention today — from triage, standup, Forge, and catalog.
          </p>
        </div>
        <div className="card__head__actions">
          <AiAssistStatusBadge />
          {isLead ? (
            <Button size="compact-sm" variant="light" loading={runMut.isPending} onClick={() => runMut.mutate()}>
              Refresh brief
            </Button>
          ) : null}
        </div>
      </div>

      {briefQuery.isLoading ? <Text c="dimmed" size="sm">Loading brief…</Text> : null}
      {!briefQuery.isLoading && !brief ? (
        <Text size="sm" c="dimmed">
          No morning brief yet.{" "}
          {isLead ? "Use Refresh brief to generate one." : "Ask a lead to run insights."}
        </Text>
      ) : null}

      {brief ? (
        <>
          <div className="ai-assist__metric-grid">
            <div className="ai-assist__metric">
              <span className="ai-assist__metric-label">Open</span>
              <span className="ai-assist__metric-value">{t?.openCount ?? "—"}</span>
            </div>
            <div className="ai-assist__metric">
              <span className="ai-assist__metric-label">Escalated</span>
              <span className="ai-assist__metric-value">{t?.escalatedCount ?? "—"}</span>
            </div>
            <div className="ai-assist__metric">
              <span className="ai-assist__metric-label">Overdue</span>
              <span className="ai-assist__metric-value">{t?.overdueCount ?? "—"}</span>
            </div>
            <div className="ai-assist__metric">
              <span className="ai-assist__metric-label">Forge fails</span>
              <span className="ai-assist__metric-value">{brief.metrics.forge?.failedRecentCount ?? "—"}</span>
            </div>
          </div>

          {brief.narrative?.headline ? (
            <div className="ai-assist__result ai-assist__narrative" style={{ marginTop: "1rem" }}>
              <div className="ai-assist__result-head">
                <span className="ai-assist__result-label">{brief.narrative.headline}</span>
                <span className="ai-assist__source">
                  {brief.llmUsed ? "LLM narrative" : "Metrics"}
                </span>
              </div>
              <ul>
                {(brief.narrative.bullets ?? []).slice(0, 8).map((b) => (
                  <li key={b}>
                    <Text size="sm">{b}</Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Text size="sm" mt="sm" c="dimmed">
              {brief.metrics.standup?.emptyWeek
                ? "Standup check-ins are empty this week."
                : "Brief metrics ready — narrative pending."}
            </Text>
          )}

          <Group gap="sm" mt="md">
            <Link to="/priority?ritual=1" className="btn btn-primary">
              Start morning ritual
            </Link>
            {brief.metrics.standup?.emptyWeek ? (
              <Link to="/standup" className="btn btn-ghost">
                Fill this week’s check-in
              </Link>
            ) : null}
            <Link to="/priority" className="btn btn-ghost">
              Blockers & risk
            </Link>
            <Link to="/insights" className="btn btn-ghost">
              All insights
            </Link>
            <Link to="/apps/ai/chat" className="btn btn-ghost">
              Ask Helm
            </Link>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Captured {new Date(brief.createdAt).toLocaleString()}
          </Text>
        </>
      ) : null}
    </section>
  );
}
