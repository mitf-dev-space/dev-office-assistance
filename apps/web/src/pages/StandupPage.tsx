import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StandupCheckInDto, StandupWeekResponseDto } from "@office/types";
import { Textarea, SimpleGrid, Paper, Text, Badge, List } from "@mantine/core";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistPanel } from "../components/ai/AiAssistPanel";

function isSaved(entry: StandupCheckInDto) {
  return !entry.id.startsWith("placeholder-");
}

export function StandupPage() {
  const { user } = useAuth();
  const { request } = useApi();
  const qc = useQueryClient();
  const weekFilterLegendId = useId();

  const [weekParam, setWeekParam] = useState<string>("");
  const weekQueryUrl = useMemo(() => {
    if (!weekParam) return "/api/standup";
    const p = new URLSearchParams();
    p.set("weekStart", weekParam);
    return `/api/standup?${p.toString()}`;
  }, [weekParam]);

  const listQuery = useQuery({
    queryKey: ["standup", weekParam],
    queryFn: async () => {
      const res = await request(weekQueryUrl);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as StandupWeekResponseDto;
    },
  });

  const meEntry = useMemo(() => {
    return listQuery.data?.entries.find((e) => e.userId === user?.id) ?? null;
  }, [listQuery.data?.entries, user?.id]);

  const [priorWork, setPriorWork] = useState("");
  const [nextWork, setNextWork] = useState("");
  const [blockers, setBlockers] = useState("");
  const [digest, setDigest] = useState<{
    digest: string;
    themes: string[];
    blockers: string[];
    source: string;
  } | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);

  useEffect(() => {
    if (!meEntry) return;
    setPriorWork(meEntry.priorWork);
    setNextWork(meEntry.nextWork);
    setBlockers(meEntry.blockers);
  }, [meEntry?.id, meEntry?.updatedAt, listQuery.data?.weekStart]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/standup", {
        method: "PUT",
        body: JSON.stringify({
          weekStart: listQuery.data?.weekStart,
          priorWork,
          nextWork,
          blockers,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "save_failed");
      }
      return (await res.json()) as StandupCheckInDto;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["standup"] });
    },
  });

  const digestMut = useMutation({
    mutationFn: async () => {
      setDigestError(null);
      const res = await request("/api/assist/standup-digest", {
        method: "POST",
        body: JSON.stringify(
          listQuery.data?.weekStart
            ? { weekStart: listQuery.data.weekStart }
            : {},
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return data as {
        digest: string;
        themes: string[];
        blockers: string[];
        source: string;
      };
    },
    onSuccess: (data) => setDigest(data),
    onError: (err) => setDigestError(err instanceof Error ? err.message : "assist_failed"),
  });

  const entries = listQuery.data?.entries ?? [];
  const weekLabel = listQuery.data?.weekLabel ?? "";

  return (
    <div className="app-page app-page--standup">
      <PageHeader
        eyebrow="Ops"
        title="Leadership check-in"
        lead="A lightweight weekly sync for the two account holders: what moved, what is next, and what is blocked. It does not replace your triage queue."
      />

      <AiAssistPanel
        lead="Turn this week’s check-ins into a short leadership digest you can paste into notes."
        label="Draft weekly digest"
        loading={digestMut.isPending}
        error={digestError}
        onSuggest={() => digestMut.mutate()}
        source={digest?.source}
        suggestion={
          digest ? (
            <>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {digest.digest}
              </Text>
              {digest.themes.length > 0 ? (
                <Text size="sm">
                  Themes: <strong>{digest.themes.join(", ")}</strong>
                </Text>
              ) : null}
              {digest.blockers.length > 0 ? (
                <>
                  <Text size="sm" fw={600}>
                    Blockers
                  </Text>
                  <List size="sm">
                    {digest.blockers.map((b) => (
                      <List.Item key={b}>{b}</List.Item>
                    ))}
                  </List>
                </>
              ) : null}
            </>
          ) : null
        }
      />

      <details className="app-filters-disclosure app-filters-disclosure--standup-week">
        <summary className="app-filters-disclosure__summary">
          <span className="app-filters-disclosure__summary-left">
            <span className="app-filters-disclosure__summary-title" id={weekFilterLegendId}>
              Week
            </span>
            {weekParam ? (
              <span
                className="app-filters-disclosure__summary-badge"
                aria-label="A specific week is selected"
              >
                1 active
              </span>
            ) : null}
          </span>
        </summary>
        <div
          className="app-filters-disclosure__panel"
          role="group"
          aria-label="Week selection"
          aria-labelledby={weekFilterLegendId}
        >
          <div className="toolbar" style={{ alignItems: "center", flexWrap: "wrap", margin: 0 }}>
            <div className="field" style={{ minWidth: 200, marginBottom: 0 }}>
              <label htmlFor="standup-week">Week start (optional)</label>
              <input
                id="standup-week"
                type="date"
                value={weekParam}
                onChange={(e) => setWeekParam(e.target.value)}
                aria-label="Filter by week"
              />
            </div>
            {weekParam && (
              <button type="button" className="btn btn-ghost" onClick={() => setWeekParam("")}>
                This week
              </button>
            )}
          </div>
        </div>
      </details>

      {listQuery.isLoading && <p className="muted">Loading check-ins…</p>}
      {listQuery.isError && (
        <p role="alert">
          Could not load standup.
        </p>
      )}

      {listQuery.data && (
        <>
          <p className="standup-week-banner" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
            <Badge variant="light" size="lg" radius="sm">
              {weekLabel}
            </Badge>
          </p>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="xl">
            {entries
              .filter((e) => e.userId !== user?.id)
              .map((e) => (
                <Paper key={e.userId} p="md" withBorder radius="md" className="standup-peer-card">
                  <Text size="sm" fw={700} mb="md">
                    {e.userDisplayName ?? e.userEmail}
                    {!isSaved(e) && (
                      <Text span size="xs" c="dimmed" ml="xs" fw={500}>
                        (not started)
                      </Text>
                    )}
                  </Text>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
                    Prior
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }} mb="md">
                    {e.priorWork || "—"}
                  </Text>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
                    Next
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }} mb="md">
                    {e.nextWork || "—"}
                  </Text>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
                    Blockers
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {e.blockers || "—"}
                  </Text>
                </Paper>
              ))}
          </SimpleGrid>

          {meEntry && (
            <section className="card" aria-label="Your check-in for this week">
              <div className="card__head">
                <h2 className="card__title">Your check-in</h2>
                {isSaved(meEntry) && (
                  <p className="card__sub" style={{ margin: 0 }}>
                    Last saved {new Date(meEntry.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMut.mutate();
                }}
                className="standup-form"
              >
                <div className="field">
                  <label htmlFor="standup-prior">What moved since last time?</label>
                  <Textarea
                    id="standup-prior"
                    value={priorWork}
                    onChange={(e) => setPriorWork(e.currentTarget.value)}
                    minRows={3}
                    maxRows={12}
                    autosize
                  />
                </div>
                <div className="field">
                  <label htmlFor="standup-next">What are you planning next for the team?</label>
                  <Textarea
                    id="standup-next"
                    value={nextWork}
                    onChange={(e) => setNextWork(e.currentTarget.value)}
                    minRows={3}
                    maxRows={12}
                    autosize
                  />
                </div>
                <div className="field">
                  <label htmlFor="standup-blockers">Blockers or risks you want visibility on</label>
                  <Textarea
                    id="standup-blockers"
                    value={blockers}
                    onChange={(e) => setBlockers(e.currentTarget.value)}
                    minRows={2}
                    maxRows={10}
                    autosize
                  />
                </div>
                {saveMut.isError && (
                  <p role="alert" style={{ margin: "0.5rem 0" }}>
                    Could not save. Try again.
                  </p>
                )}
                <div className="form-actions">
                  <button type="submit" className="primary" disabled={saveMut.isPending}>
                    {saveMut.isPending ? "Saving…" : "Save my check-in"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
