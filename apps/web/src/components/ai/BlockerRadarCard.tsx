import { Link } from "react-router-dom";
import { Button, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../useApi";
import { AiAssistStatusBadge } from "./AiAssistStatusBadge";

type RadarSignal = {
  id: string;
  source: string;
  severity: "critical" | "high" | "medium";
  title: string;
  whyHot: string;
  suggestedNextAction: string;
  href: string;
  triageItemId?: string;
};

type RadarSnapshot = {
  id: string;
  metrics: {
    signalCount?: number;
    bySource?: Record<string, number>;
    signals?: RadarSignal[];
  };
  narrative: { headline?: string; bullets?: string[]; risks?: string[] } | null;
  llmUsed: boolean;
  createdAt: string;
};

export function BlockerRadarCard() {
  const { request } = useApi();
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const qc = useQueryClient();

  const radarQuery = useQuery({
    queryKey: ["insights", "latest", "blocker_radar"],
    queryFn: async () => {
      const res = await request("/api/insights/latest/blocker_radar");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("radar_failed");
      return (await res.json()) as RadarSnapshot;
    },
    refetchInterval: 60_000,
  });

  const runMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/insights/run", {
        method: "POST",
        body: JSON.stringify({ kind: "insights.blocker_radar" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      await new Promise((r) => setTimeout(r, 2500));
      await qc.invalidateQueries({ queryKey: ["insights", "latest", "blocker_radar"] });
    },
  });

  const acceptMut = useMutation({
    mutationFn: async (signal: RadarSignal) => {
      if (!signal.triageItemId) throw new Error("no_triage");
      const res = await request(`/api/triage-items/${signal.triageItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ nextAction: signal.suggestedNextAction }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["triage-priority"] });
      await qc.invalidateQueries({ queryKey: ["triage-items"] });
    },
  });

  const radar = radarQuery.data;
  const signals = radar?.metrics?.signals ?? [];

  return (
    <section className="card ai-assist" aria-label="Blocker radar">
      <div className="card__head card__head--row">
        <div>
          <h2 className="card__title">Blocker radar</h2>
          <p className="card__sub">
            Why items are hot across triage, Forge, and catalog — with a suggested next action.
          </p>
        </div>
        <div className="card__head__actions">
          <AiAssistStatusBadge />
          {isLead ? (
            <Button size="compact-sm" variant="light" loading={runMut.isPending} onClick={() => runMut.mutate()}>
              Refresh radar
            </Button>
          ) : null}
        </div>
      </div>

      {radarQuery.isLoading ? <Text c="dimmed" size="sm">Loading radar…</Text> : null}
      {!radarQuery.isLoading && !radar ? (
        <Text size="sm" c="dimmed">
          No blocker radar yet. {isLead ? "Use Refresh radar to generate one." : "Ask a lead to run insights."}
        </Text>
      ) : null}

      {radar?.narrative?.headline ? (
        <div className="ai-assist__result ai-assist__narrative" style={{ marginBottom: "1rem" }}>
          <div className="ai-assist__result-head">
            <span className="ai-assist__result-label">{radar.narrative.headline}</span>
            <span className="ai-assist__source">{radar.llmUsed ? "LLM narrative" : "Metrics"}</span>
          </div>
          <ul>
            {(radar.narrative.bullets ?? []).slice(0, 4).map((b) => (
              <li key={b}>
                <Text size="sm">{b}</Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {signals.length > 0 ? (
        <ul className="ai-assist__signal-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {signals.slice(0, 12).map((s) => (
            <li
              key={s.id}
              style={{
                borderTop: "1px solid var(--color-border)",
                padding: "0.75rem 0",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="pill pill--warn" data-severity={s.severity}>
                  {s.severity}
                </span>
                <Link to={s.href} style={{ fontWeight: 600 }}>
                  {s.title}
                </Link>
                <Text size="xs" c="dimmed">
                  {s.source.replace(/_/g, " ")}
                </Text>
              </div>
              <Text size="sm" mt={4}>
                {s.whyHot}
              </Text>
              <Text size="sm" c="dimmed" mt={2}>
                Next: {s.suggestedNextAction}
              </Text>
              {s.triageItemId && isLead ? (
                <Button
                  size="compact-xs"
                  variant="light"
                  mt="xs"
                  loading={acceptMut.isPending}
                  onClick={() => acceptMut.mutate(s)}
                >
                  Accept → triage next action
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : radar ? (
        <Text size="sm" c="dimmed">
          No hot signals in the latest radar ({radar.metrics.signalCount ?? 0} total).
        </Text>
      ) : null}

      {radar ? (
        <Text size="xs" c="dimmed" mt="sm">
          Captured {new Date(radar.createdAt).toLocaleString()}
        </Text>
      ) : null}
    </section>
  );
}
