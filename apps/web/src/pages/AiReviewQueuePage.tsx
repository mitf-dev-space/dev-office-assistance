import { Link } from "react-router-dom";
import { Button, Group, Select, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistStatusBadge } from "../components/ai/AiAssistStatusBadge";

type Proposal = {
  id: string;
  kind: string;
  status: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  reviewedAt: string | null;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
};

export function AiReviewQueuePage() {
  const { request } = useApi();
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("pending");

  const listQuery = useQuery({
    queryKey: ["ai-proposals", status],
    queryFn: async () => {
      const res = await request(`/api/assist/proposals?status=${encodeURIComponent(status)}`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { items: Proposal[] };
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await request(`/api/assist/proposals/${id}/approve`, { method: "POST", body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "approve_failed");
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai-proposals"] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await request(`/api/assist/proposals/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "Rejected from review queue" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "reject_failed");
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai-proposals"] });
    },
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Workspace AI"
        title="AI review queue"
        lead="Staged write proposals from assist. Nothing is applied externally until a lead approves."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AiAssistStatusBadge />
            <Link to="/apps/ai/chat" className="btn btn-ghost">
              Ask Helm
            </Link>
          </div>
        }
      />

      <section className="card" aria-label="Review queue">
        <div className="card__head card__head--row">
          <div>
            <h2 className="card__title">Proposals</h2>
            <p className="card__sub" style={{ margin: 0 }}>
              {listQuery.isLoading ? "Loading…" : `${items.length} shown`}
            </p>
          </div>
          <Select
            size="sm"
            w={160}
            value={status}
            onChange={(v) => setStatus(v || "pending")}
            data={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "failed", label: "Failed" },
              { value: "all", label: "All" },
            ]}
          />
        </div>

        {listQuery.isError ? (
          <Text role="alert" c="red" size="sm">
            Could not load proposals.
          </Text>
        ) : null}

        {items.length === 0 && !listQuery.isLoading ? (
          <div className="empty-state" role="status">
            <strong>Queue is empty</strong>
            Draft planning/decision assists can queue writes here for lead approval.
          </div>
        ) : null}

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((p) => (
            <li
              key={p.id}
              style={{
                borderTop: "1px solid var(--color-border)",
                padding: "0.9rem 0",
              }}
            >
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Text fw={600} size="sm">
                    {p.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {p.kind.replace(/_/g, " ")} · {p.status} ·{" "}
                    {new Date(p.createdAt).toLocaleString()}
                    {p.createdBy ? ` · by ${p.createdBy.name}` : ""}
                  </Text>
                  <Text size="sm" mt={6}>
                    {p.summary}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(p.payload, null, 0)}
                  </Text>
                  {p.result ? (
                    <Text size="xs" mt={4}>
                      Result: {JSON.stringify(p.result)}
                    </Text>
                  ) : null}
                </div>
                {isLead && p.status === "pending" ? (
                  <Group gap="xs">
                    <Button
                      size="compact-sm"
                      loading={approveMut.isPending}
                      onClick={() => approveMut.mutate(p.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="gray"
                      loading={rejectMut.isPending}
                      onClick={() => rejectMut.mutate(p.id)}
                    >
                      Reject
                    </Button>
                  </Group>
                ) : null}
              </Group>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
