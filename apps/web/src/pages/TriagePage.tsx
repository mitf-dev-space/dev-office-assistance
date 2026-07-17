import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Table } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { PageMeta, TriageItemDto } from "@office/types";
import { PageHeader } from "../components/PageHeader";
import { AppPage } from "../components/ui/AppPage";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { useApi } from "../useApi";

function formatTriageAssignees(
  it: TriageItemDto,
  developerById: Map<string, string>,
): string {
  const clickUp = it.clickUpAssignees ?? [];
  if (clickUp.length > 0) {
    const names = clickUp.map((a) => a.username?.trim() || a.email?.trim() || a.id);
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]}, ${names[1]}`;
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }
  return it.assigneeName ?? developerById.get(it.assigneeDeveloperId) ?? "—";
}

export function TriagePage() {
  const { request } = useApi();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [preset, setPreset] = useState<"" | "overdue" | "thisWeek">("");
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange, resetPage } =
    useListQueryState(25);

  useEffect(() => {
    resetPage();
  }, [status, category, assignee, preset, resetPage]);

  const activeFilterCount = useMemo(
    () => [preset, status, category, assignee].filter(Boolean).length,
    [preset, status, category, assignee],
  );

  const listUrl = useMemo(() => {
    const qs = buildListQuery({
      page,
      limit,
      q: search,
      filters: {
        status: status || undefined,
        category: category || undefined,
        assigneeDeveloperId: assignee || undefined,
        overdue: preset === "overdue" ? "true" : undefined,
        thisWeek: preset === "thisWeek" ? "true" : undefined,
      },
    });
    return `/api/triage-items?${qs}`;
  }, [status, category, assignee, preset, page, limit, search]);

  const developersQuery = useQuery({
    queryKey: ["developers", "dropdown"],
    queryFn: async () => {
      const res = await request("/api/developers?limit=500");
      if (!res.ok) throw new Error("developers_failed");
      return (await res.json()) as {
        developers: Array<{ id: string; displayName: string; skills: string | null }>;
      };
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["triage-items", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { items: TriageItemDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(itemsQuery.data);
  const developers = developersQuery.data?.developers ?? [];
  const developerById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of developers) m.set(d.id, d.displayName);
    return m;
  }, [developers]);

  return (
    <AppPage variant="dashboard">
      <PageHeader
        eyebrow="Work"
        title="Triage"
        lead="Filter and work the queue. Open a row for detail, or create a new item when something lands."
        actions={
          <Button component={Link} to="/triage/new">
            New item
          </Button>
        }
      />

      <section className="card" aria-label="Triage list and filters">
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search title, program, assignee…"
          activeFilterCount={activeFilterCount}
          onClearFilters={() => {
            setPreset("");
            setStatus("");
            setCategory("");
            setAssignee("");
            resetPage();
          }}
        />

        <details className="dashboard-triage-filters-wrap" open>
          <summary className="dashboard-triage-filters__summary">
            <span className="dashboard-triage-filters__summary-left">
              <span className="dashboard-triage-filters__summary-title" id="triage-filters-legend">
                Triage filters
              </span>
              {activeFilterCount > 0 && (
                <span
                  className="dashboard-triage-filters__summary-badge"
                  aria-label={`${activeFilterCount} filter(s) active`}
                >
                  {activeFilterCount} active
                </span>
              )}
            </span>
          </summary>
          <div
            className="dashboard-triage-filters"
            role="search"
            aria-label="Triage filters"
            aria-labelledby="triage-filters-legend"
          >
            <div className="toolbar dashboard-toolbar--presets">
              <span className="dashboard-filter-label" id="dash-presets-lbl">
                Quick
              </span>
              <button
                type="button"
                className={preset === "overdue" ? "primary" : undefined}
                aria-pressed={preset === "overdue"}
                onClick={() => setPreset((p) => (p === "overdue" ? "" : "overdue"))}
              >
                Overdue
              </button>
              <button
                type="button"
                className={preset === "thisWeek" ? "primary" : undefined}
                aria-pressed={preset === "thisWeek"}
                onClick={() => setPreset((p) => (p === "thisWeek" ? "" : "thisWeek"))}
              >
                Due this week
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreset("");
                  setStatus("");
                  setCategory("");
                  setAssignee("");
                }}
              >
                Clear
              </button>
            </div>
            <div className="dashboard-toolbar--fields">
              <div className="dashboard-field">
                <label htmlFor="f-status">Status</label>
                <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Any</option>
                  <option value="inbox">inbox</option>
                  <option value="in_progress">in_progress</option>
                  <option value="snoozed">snoozed</option>
                  <option value="done">done</option>
                  <option value="dropped">dropped</option>
                </select>
              </div>
              <div className="dashboard-field">
                <label htmlFor="f-cat">Category</label>
                <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Any</option>
                  <option value="blocker">blocker</option>
                  <option value="risk">risk</option>
                  <option value="quality">quality</option>
                  <option value="process">process</option>
                  <option value="other">other</option>
                </select>
              </div>
              <div className="dashboard-field">
                <label htmlFor="f-assignee">Assignee</label>
                <select
                  id="f-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Any</option>
                  {developers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName || d.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </details>

        {itemsQuery.isLoading && (
          <DataTableSkeleton
            embedded
            columns={8}
            columnLabels={["Title", "Status", "Category", "Program", "Files", "Assignee", "Due", "Source"]}
            tableLabel="Loading triage items"
          />
        )}
        {itemsQuery.isError && (
          <p role="alert">Could not load items. Try signing in again if your session expired.</p>
        )}
        {itemsQuery.data && (
          <>
            <p className="card__sub" style={{ margin: "0.75rem 0" }}>
              {pageMeta.total} item{pageMeta.total === 1 ? "" : "s"} match filters
            </p>
            <AppDataTable embedded aria-label="Triage items">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Program</Table.Th>
                  <Table.Th>Files</Table.Th>
                  <Table.Th>Assignee</Table.Th>
                  <Table.Th>Due</Table.Th>
                  <Table.Th>Source</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {itemsQuery.data.items.map((it) => (
                  <Table.Tr key={it.id}>
                    <Table.Td>
                      <Link to={`/triage/${it.id}`}>{it.title}</Link>
                      {it.sourcePreview && <div className="preview-line">{it.sourcePreview}</div>}
                    </Table.Td>
                    <Table.Td>
                      <span className="pill pill--status" data-status={it.status}>
                        {it.status}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <span className="pill pill--cat" data-category={it.category}>
                        {it.category}
                      </span>
                    </Table.Td>
                    <Table.Td className="muted">{it.program?.trim() ? it.program : "—"}</Table.Td>
                    <Table.Td className="muted">{it.attachmentCount ?? 0}</Table.Td>
                    <Table.Td className="muted">
                      {formatTriageAssignees(it, developerById)}
                    </Table.Td>
                    <Table.Td>{it.dueAt ? it.dueAt.slice(0, 10) : "—"}</Table.Td>
                    <Table.Td>
                      <span className="muted">
                        {it.sourceType === "microsoft_todo"
                          ? "To Do"
                          : it.sourceType === "clickup"
                            ? "ClickUp"
                            : it.sourceType === "outlook"
                              ? "Outlook"
                              : it.sourceType}
                      </span>
                      {it.graphWebLink && (
                        <>
                          {" "}
                          <a
                            className="link-out"
                            href={it.graphWebLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        </>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            {itemsQuery.data.items.length === 0 && (
              <div className="empty-state" role="status" style={{ marginTop: "0.75rem" }}>
                <strong>No matching items</strong>
                Try clearing filters or changing the assignee.
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
    </AppPage>
  );
}
