import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../useApi";

type AssistStatus = {
  enabled: boolean;
  providerPreset: string;
  model: string;
  billingSource: "workspace" | "none";
  usage: { usedToday: number; dailyCap: number; remaining: number };
};

export function AiAssistStatusBadge() {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ["assist-status"],
    queryFn: async () => {
      const res = await request("/api/assist/status");
      if (!res.ok) throw new Error("status_failed");
      return (await res.json()) as AssistStatus;
    },
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return <span className="ai-assist__badge ai-assist__badge--muted">AI…</span>;
  }

  if (!q.data?.enabled) {
    return (
      <span className="ai-assist__badge ai-assist__badge--muted" title="Enable under Apps → Workspace AI">
        AI off
      </span>
    );
  }

  const title = `${q.data.providerPreset} · ${q.data.model} · ${q.data.usage.remaining} of ${q.data.usage.dailyCap} calls left today`;

  return (
    <span className="ai-assist__badge" title={title}>
      <span className="ai-assist__badge-dot" aria-hidden />
      Workspace · {q.data.usage.remaining}/{q.data.usage.dailyCap}
    </span>
  );
}
