import { Link, useSearchParams } from "react-router-dom";
import { List, Table, Text } from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PageMeta, TriageItemDto } from "@office/types";
import { useMemo, useState } from "react";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistPanel } from "../components/ai/AiAssistPanel";
import { BlockerRadarCard } from "../components/ai/BlockerRadarCard";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";

export function PriorityPage() {
  const { request } = useApi();
  const [searchParams] = useSearchParams();
  const ritualMode = searchParams.get("ritual") === "1";
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);
  const [reorder, setReorder] = useState<{
    orderedIds: string[];
    rationale: string;
    bullets: string[];
    source: string;
  } | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const reorderMut = useMutation({
    mutationFn: async () => {
      setReorderError(null);
      const res = await request("/api/assist/priority-reorder", {
        method: "POST",
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "assist_failed");
      return data as {
        orderedIds: string[];
        rationale: string;
        bullets: string[];
        source: string;
      };
    },
    onSuccess: (data) => setReorder(data),
    onError: (err) => setReorderError(err instanceof Error ? err.message : "assist_failed"),
  });

  const listUrl = useMemo(
    () => `/api/triage-items/priority-queue?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const q = useQuery({
    queryKey: ["triage-priority", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { items: TriageItemDto[] } & PageMeta;
    },
  });

  const items = q.data?.items ?? [];
  const pageMeta = pickPageMeta(q.data);

  return (
    <div className="app-page app-page--priority">
      {ritualMode ? (
        <div className="ritual-bar" role="navigation" aria-label="Morning ritual steps">
          <div className="ritual-bar__steps">
            <span className="ritual-bar__step ritual-bar__step--active">1 · Walk blockers</span>
            <span className="ritual-bar__sep" aria-hidden>
              →
            </span>
            <span className="ritual-bar__step">2 · Check-in</span>
          </div>
          <p className="ritual-bar__hint">
            Scan aged blockers first, set next actions, then continue to the weekly check-in.
          </p>
          <Link to="/standup" className="btn btn-primary">
            Continue to check-in
          </Link>
        </div>
      ) : null}

      <PageHeader
        eyebrow="Ops"
        title="Blockers, risk & escalations"
        lead={
          ritualMode
            ? "Morning ritual step 1: walk the priority board (oldest and escalated first), then continue to check-in."
            : "Leadership lens on open blockers, risks, and escalations. Walk this board before filling the weekly check-in — age is days since creation."
        }
        actions={
          <>
            {!ritualMode ? (
              <Link to="/standup" className="btn btn-ghost">
                Weekly check-in
              </Link>
            ) : null}
            <Link to="/triage/new" className="btn btn-primary">
              New triage
            </Link>
          </>
        }
      />

      <BlockerRadarCard />

      <AiAssistPanel
        lead="Explain a leadership-useful order for the open priority queue (does not rewrite ranks)."
        label="Explain reorder"
        loading={reorderMut.isPending}
        onSuggest={() => reorderMut.mutate()}
        error={reorderError}
        source={reorder?.source ?? null}
        suggestion={
          reorder ? (
            <>
              <Text size="sm">{reorder.rationale}</Text>
              <List size="sm">
                {reorder.bullets.map((b) => (
                  <List.Item key={b}>{b}</List.Item>
                ))}
              </List>
            </>
          ) : null
        }
      />

      <section className="card" aria-label="Priority queue">
        <div className="card__head">
          <h2 className="card__title">Queue</h2>
          <p className="card__sub" style={{ margin: 0 }}>
            {q.data ? `${pageMeta.total} open · escalated and oldest first` : "Loading…"}
          </p>
        </div>

        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search title, program, assignee…"
        />

        {q.isLoading && (
          <DataTableSkeleton
            embedded
            columns={7}
            columnLabels={[
              "Title",
              "Category",
              "Age (days)",
              "Status",
              "Assignee",
              "Flags",
              "Action",
            ]}
            tableLabel="Loading priority queue"
          />
        )}
        {q.isError && (
          <p role="alert" style={{ margin: 0 }}>
            Could not load the priority queue.
          </p>
        )}
        {q.data && (
          <>
            <AppDataTable embedded aria-label="Priority queue">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Age</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Assignee</Table.Th>
                  <Table.Th>Flags</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((it) => (
                  <Table.Tr
                    key={it.id}
                    data-escalated={it.escalated || undefined}
                    data-aged={
                      typeof it.ageDays === "number" && it.ageDays >= 3 ? "true" : undefined
                    }
                  >
                    <Table.Td>
                      <Link to={`/triage/${it.id}`}>{it.title}</Link>
                      {it.program && (
                        <div className="preview-line" title="Program">
                          {it.program}
                        </div>
                      )}
                      {it.nextAction ? (
                        <div className="preview-line" title="Next action">
                          Next: {it.nextAction}
                        </div>
                      ) : (
                        <div className="preview-line muted">No next action yet</div>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <span className="pill pill--cat" data-category={it.category}>
                        {it.category}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span
                        className={
                          typeof it.ageDays === "number" && it.ageDays >= 3
                            ? "priority-age priority-age--stale"
                            : "priority-age"
                        }
                      >
                        {it.ageDays ?? "—"}
                        {typeof it.ageDays === "number" ? "d" : ""}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span className="pill pill--status" data-status={it.status}>
                        {it.status}
                      </span>
                    </Table.Td>
                    <Table.Td className="muted">{it.assigneeName ?? "—"}</Table.Td>
                    <Table.Td>
                      {it.escalated && <span className="pill pill--warn">Escalated</span>}
                    </Table.Td>
                    <Table.Td>
                      <Link to={`/triage/${it.id}`} className="btn btn-ghost btn-compact">
                        Open
                      </Link>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            {items.length === 0 && (
              <div className="empty-state" role="status">
                <strong>Queue is clear</strong>
                <p style={{ margin: "0.5rem 0 0" }}>
                  No open blockers, risks, or escalations.{" "}
                  <Link to="/triage/new">Create triage</Link>
                  {" · "}
                  <Link to="/standup">Fill this week’s check-in</Link>
                </p>
              </div>
            )}
            <TablePagination
              page={pageMeta.page}
              totalPages={pageMeta.totalPages}
              total={pageMeta.total}
              limit={pageMeta.limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </section>

      {ritualMode ? (
        <div className="ritual-bar ritual-bar--footer">
          <Link to="/standup" className="btn btn-primary">
            Continue to check-in →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
