import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PromoteStandupBlockerResultDto,
  StandupCheckInDto,
  StandupHelpersDto,
  StandupRollupDto,
  StandupSuggestionDto,
  StandupWeekResponseDto,
} from "@office/types";
import { Textarea, SimpleGrid, Paper, Text, Badge, List, Group, Button } from "@mantine/core";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistPanel } from "../components/ai/AiAssistPanel";

function isSaved(entry: StandupCheckInDto) {
  return !entry.id.startsWith("placeholder-");
}

function fieldsHaveContent(prior: string, next: string, blockers: string) {
  return Boolean(prior.trim() || next.trim() || blockers.trim());
}

function mergeFieldText(existing: string, addition: string): string {
  const base = existing.trim();
  const add = addition.trim();
  if (!add) return existing;
  if (!base) return add;
  const existingLines = new Set(
    base
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s*/, "").trim().toLowerCase())
      .filter(Boolean),
  );
  const extra = add
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.replace(/^\s*[-*]\s*/, "").trim().toLowerCase();
      return key && !existingLines.has(key);
    });
  if (!extra.length) return existing;
  return `${base}\n${extra.join("\n")}`;
}

function SuggestionChips({
  label,
  suggestions,
  onAdd,
}: {
  label: string;
  suggestions: StandupSuggestionDto[];
  onAdd: (s: StandupSuggestionDto) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="standup-chip-group">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
        {label}
      </Text>
      <Group gap="xs">
        {suggestions.slice(0, 10).map((s) => (
          <button
            key={s.id}
            type="button"
            className="standup-chip"
            onClick={() => onAdd(s)}
            title={s.source}
          >
            {s.label}
          </button>
        ))}
      </Group>
    </div>
  );
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

  const helpersUrl = useMemo(() => {
    if (!weekParam) return "/api/standup/helpers";
    const p = new URLSearchParams();
    p.set("weekStart", weekParam);
    return `/api/standup/helpers?${p.toString()}`;
  }, [weekParam]);

  const rollupUrl = useMemo(() => {
    if (!weekParam) return "/api/standup/rollup";
    const p = new URLSearchParams();
    p.set("weekStart", weekParam);
    return `/api/standup/rollup?${p.toString()}`;
  }, [weekParam]);

  const listQuery = useQuery({
    queryKey: ["standup", weekParam],
    queryFn: async () => {
      const res = await request(weekQueryUrl);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as StandupWeekResponseDto;
    },
  });

  const helpersQuery = useQuery({
    queryKey: ["standup-helpers", weekParam],
    queryFn: async () => {
      const res = await request(helpersUrl);
      if (!res.ok) throw new Error("helpers_failed");
      return (await res.json()) as StandupHelpersDto;
    },
  });

  const rollupQuery = useQuery({
    queryKey: ["standup-rollup", weekParam],
    queryFn: async () => {
      const res = await request(rollupUrl);
      if (!res.ok) throw new Error("rollup_failed");
      return (await res.json()) as StandupRollupDto;
    },
  });

  const meEntry = useMemo(() => {
    return listQuery.data?.entries.find((e) => e.userId === user?.id) ?? null;
  }, [listQuery.data?.entries, user?.id]);

  const [priorWork, setPriorWork] = useState("");
  const [nextWork, setNextWork] = useState("");
  const [blockers, setBlockers] = useState("");
  const [promoteTitle, setPromoteTitle] = useState("");
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
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
      await qc.invalidateQueries({ queryKey: ["standup-rollup"] });
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

  const promoteMut = useMutation({
    mutationFn: async (title: string) => {
      const res = await request("/api/standup/promote-blocker", {
        method: "POST",
        body: JSON.stringify({
          title,
          weekStart: listQuery.data?.weekStart,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "promote_failed");
      return data as PromoteStandupBlockerResultDto;
    },
    onSuccess: async (data) => {
      setPromoteMsg(`Added to priority queue: ${data.title}`);
      setPromoteTitle("");
      await qc.invalidateQueries({ queryKey: ["standup-helpers"] });
      await qc.invalidateQueries({ queryKey: ["standup-rollup"] });
      await qc.invalidateQueries({ queryKey: ["triage-priority"] });
    },
    onError: (err) => {
      setPromoteMsg(err instanceof Error ? err.message : "Could not promote blocker");
    },
  });

  const draft = helpersQuery.data?.draft;
  const suggestions = helpersQuery.data?.suggestions;
  const rollup = rollupQuery.data;

  function applyDraft(mode: "replace" | "merge") {
    if (!draft) return;
    const hasContent = fieldsHaveContent(priorWork, nextWork, blockers);
    if (mode === "replace" && hasContent) {
      const ok = window.confirm(
        "Replace your current check-in fields with the suggested draft from triage?",
      );
      if (!ok) return;
      setPriorWork(draft.priorWork);
      setNextWork(draft.nextWork);
      setBlockers(draft.blockers);
      return;
    }
    if (mode === "replace" || !hasContent) {
      setPriorWork(draft.priorWork || priorWork);
      setNextWork(draft.nextWork || nextWork);
      setBlockers(draft.blockers || blockers);
      return;
    }
    setPriorWork(mergeFieldText(priorWork, draft.priorWork));
    setNextWork(mergeFieldText(nextWork, draft.nextWork));
    setBlockers(mergeFieldText(blockers, draft.blockers));
  }

  function appendSuggestion(
    field: "prior" | "next" | "blockers",
    s: StandupSuggestionDto,
  ) {
    const line = `- ${s.label}`;
    if (field === "prior") setPriorWork((v) => mergeFieldText(v, line));
    else if (field === "next") setNextWork((v) => mergeFieldText(v, line));
    else setBlockers((v) => mergeFieldText(v, line));
  }

  const entries = listQuery.data?.entries ?? [];
  const weekLabel = listQuery.data?.weekLabel ?? "";

  return (
    <div className="app-page app-page--standup">
      <PageHeader
        eyebrow="Ops"
        title="Leadership check-in"
        lead="Weekly sync after walking blockers: confirm what moved, what’s next, and what’s blocked. Suggestions come from triage — edit and save; this does not replace the queue."
        actions={
          <Link to="/priority?ritual=1" className="btn btn-ghost">
            Walk priority board
          </Link>
        }
      />

      {rollup ? (
        <div className="standup-rollup" role="status">
          <span>
            {rollup.checkIns.filledCount}/{rollup.checkIns.totalUsers} check-ins
          </span>
          <span aria-hidden>·</span>
          <span>
            {rollup.priorityQueue.count} blockers
            {rollup.priorityQueue.oldestAgeDays != null
              ? ` (oldest ${rollup.priorityQueue.oldestAgeDays}d)`
              : ""}
          </span>
          <span aria-hidden>·</span>
          <span>{rollup.triageClosedThisWeek} closed this week</span>
          {rollup.priorityQueue.missingNextActionCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <Link to="/priority?ritual=1">
                {rollup.priorityQueue.missingNextActionCount} need next action
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

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

              <div className="standup-helpers" aria-label="Suggestions from your week">
                <div className="standup-helpers__head">
                  <div>
                    <h3 className="standup-helpers__title">From your week</h3>
                    <p className="standup-helpers__sub">
                      Pulled from closed triage, open work, and the priority queue. Click a chip to
                      add it, or apply the full draft.
                    </p>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="compact-sm"
                      variant="filled"
                      disabled={!draft || helpersQuery.isLoading}
                      onClick={() => applyDraft("replace")}
                    >
                      Use draft
                    </Button>
                    <Button
                      size="compact-sm"
                      variant="light"
                      disabled={!draft || helpersQuery.isLoading}
                      onClick={() => applyDraft("merge")}
                    >
                      Merge into fields
                    </Button>
                  </Group>
                </div>
                {helpersQuery.isLoading ? (
                  <Text size="sm" c="dimmed">
                    Loading suggestions…
                  </Text>
                ) : null}
                {helpersQuery.isError ? (
                  <Text size="sm" c="red">
                    Could not load suggestions.
                  </Text>
                ) : null}
                {suggestions ? (
                  <>
                    <SuggestionChips
                      label="Prior"
                      suggestions={suggestions.priorWork}
                      onAdd={(s) => appendSuggestion("prior", s)}
                    />
                    <SuggestionChips
                      label="Next"
                      suggestions={suggestions.nextWork}
                      onAdd={(s) => appendSuggestion("next", s)}
                    />
                    <div className="standup-chip-group">
                      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6}>
                        Blockers
                      </Text>
                      <Group gap="xs">
                        {suggestions.blockers.slice(0, 10).map((s) => (
                          <span key={s.id} className="standup-chip-wrap">
                            <button
                              type="button"
                              className="standup-chip"
                              onClick={() => appendSuggestion("blockers", s)}
                              title={s.source}
                            >
                              {s.label}
                            </button>
                            {s.triageItemId ? (
                              <Link
                                to={`/triage/${s.triageItemId}`}
                                className="standup-chip-link"
                              >
                                Open
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="standup-chip-link"
                                onClick={() =>
                                  promoteMut.mutate(
                                    s.label.replace(/^[^:]+:\s*/, "").trim() || s.label,
                                  )
                                }
                              >
                                Queue
                              </button>
                            )}
                          </span>
                        ))}
                      </Group>
                    </div>
                  </>
                ) : null}
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

                <div className="standup-promote">
                  <label htmlFor="standup-promote-title">Add a blocker to the priority queue</label>
                  <div className="standup-promote__row">
                    <input
                      id="standup-promote-title"
                      type="text"
                      value={promoteTitle}
                      onChange={(e) => setPromoteTitle(e.target.value)}
                      placeholder="Short blocker title…"
                      maxLength={500}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!promoteTitle.trim() || promoteMut.isPending}
                      onClick={() => promoteMut.mutate(promoteTitle.trim())}
                    >
                      {promoteMut.isPending ? "Adding…" : "Add to priority queue"}
                    </button>
                    <Link to="/priority" className="btn btn-ghost">
                      View queue
                    </Link>
                  </div>
                  {promoteMsg ? (
                    <Text size="sm" mt={6} c={promoteMut.isError ? "red" : "dimmed"}>
                      {promoteMsg}{" "}
                      {promoteMut.data?.triageItemId ? (
                        <Link to={`/triage/${promoteMut.data.triageItemId}`}>Open item</Link>
                      ) : null}
                    </Text>
                  ) : null}
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
