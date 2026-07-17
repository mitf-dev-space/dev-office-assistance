import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageMeta, PlanningItemDto, PlanningStatus } from "@office/types";
import { PLANNING_STATUSES } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";
import { PlanningKanbanBoard } from "../components/planning/PlanningKanbanBoard";
import { PLANNING_STATUS_LABEL } from "../constants/planningLabels";
import { PlanningInitiativeModal } from "../components/planning/PlanningInitiativeModal";
import { DEV_DEPARTMENT_SUGGESTIONS } from "../constants/departments";
import "../components/planning/planning-board.css";

type ViewMode = "board" | "table";

export function PlanningPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const boardLiveId = useId();
  const [statusFilter, setStatusFilter] = useState<PlanningStatus | "">("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [liveBoardMsg, setLiveBoardMsg] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();
  const planningEdit = searchParams.get("edit");
  const [planningModalMode, setPlanningModalMode] = useState<"create" | "edit">("create");
  const [planningModalOpened, { open: openPlanningModal, close: closePlanningModal }] = useDisclosure(false);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange, resetPage } =
    useListQueryState(25);

  const boardLimit = 500;
  const listUrl = useMemo(() => {
    const qs = buildListQuery({
      page: viewMode === "board" ? 1 : page,
      limit: viewMode === "board" ? boardLimit : limit,
      q: search,
      filters: {
        status: statusFilter || undefined,
        department: departmentFilter || undefined,
      },
    });
    return `/api/planning?${qs}`;
  }, [viewMode, page, limit, search, statusFilter, departmentFilter]);

  const listQuery = useQuery({
    queryKey: ["planning", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { items: PlanningItemDto[] } & PageMeta;
    },
  });

  const items = listQuery.data?.items ?? [];
  const pageMeta = pickPageMeta(listQuery.data);

  useEffect(() => {
    resetPage();
  }, [statusFilter, departmentFilter, resetPage]);

  const activeFilterCount = useMemo(
    () => [statusFilter, departmentFilter].filter(Boolean).length,
    [statusFilter, departmentFilter],
  );
  const planningFiltersLegendId = useId();

  const filteredForTable = items;

  const announceBoard = useCallback((message: string) => {
    setLiveBoardMsg(message);
  }, []);

  useEffect(() => {
    if (!liveBoardMsg) return;
    const t = window.setTimeout(() => setLiveBoardMsg(""), 4000);
    return () => window.clearTimeout(t);
  }, [liveBoardMsg]);

  useEffect(() => {
    if (planningEdit) {
      setPlanningModalMode("edit");
      openPlanningModal();
    }
  }, [planningEdit, openPlanningModal]);

  const closePlanningInitiativeModal = () => {
    closePlanningModal();
    setSearchParams((p) => {
      p.delete("edit");
      return p;
    });
  };

  const openCreateInitiative = () => {
    setPlanningModalMode("create");
    setSearchParams((p) => {
      p.delete("edit");
      return p;
    });
    openPlanningModal();
  };

  const moveStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PlanningStatus }) => {
      const res = await request(`/api/planning/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "status_update_failed");
      }
      return (await res.json()) as PlanningItemDto;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["planning"] });
      const previous = qc.getQueryData<{ items: PlanningItemDto[] }>(["planning"]);
      if (previous) {
        qc.setQueryData(["planning"], {
          items: previous.items.map((row) => (row.id === id ? { ...row, status } : row)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["planning"], ctx.previous);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["planning"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });

  const boardSkeleton = (
    <div className="planning-board-wrap" aria-busy="true">
      <div className="planning-board">
        {PLANNING_STATUSES.map((s) => (
          <div key={s} className={`planning-column planning-column--status-${s}`}>
            <div className="planning-column__head">
              <h3 className="planning-column__title">{PLANNING_STATUS_LABEL[s]}</h3>
              <span className="planning-column__count">…</span>
            </div>
            <div className="planning-column__body">
              <p className="planning-column__empty">Loading…</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Roadmap"
        title="Dev planning"
        lead="Roadmap and initiatives by area: what we are building next, when we aim to ship, and current status. Separate from day-to-day triage items."
      />

      <p className="planning-view-hint">
        On the board, drag a card (anywhere on the card, or the grip) to change status; follow the link on the right to
        open details. Switch to the table for a compact scan or printing.
      </p>

      <div id={boardLiveId} className="planning-board-live" aria-live="polite">
        {liveBoardMsg}
      </div>

      <section className="card">
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search initiatives…"
          activeFilterCount={activeFilterCount}
          onClearFilters={() => {
            setStatusFilter("");
            setDepartmentFilter("");
            resetPage();
          }}
        />
        <details className="app-filters-disclosure">
          <summary className="app-filters-disclosure__summary">
            <span className="app-filters-disclosure__summary-left">
              <span className="app-filters-disclosure__summary-title" id={planningFiltersLegendId}>
                View &amp; filter
              </span>
              {activeFilterCount > 0 && (
                <span
                  className="app-filters-disclosure__summary-badge"
                  aria-label={`${activeFilterCount} filter(s) active`}
                >
                  {activeFilterCount} active
                </span>
              )}
            </span>
          </summary>
          <div
            className="app-filters-disclosure__panel"
            role="search"
            aria-label="Planning filters"
            aria-labelledby={planningFiltersLegendId}
          >
            <div className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="planning-view-toggle" role="group" aria-label="Planning view">
                <button
                  type="button"
                  aria-pressed={viewMode === "board"}
                  onClick={() => setViewMode("board")}
                >
                  Board
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
              </div>
              <div className="field" style={{ maxWidth: "16rem", marginBottom: 0 }}>
                <label htmlFor="pf">Status filter</label>
                <select
                  id="pf"
                  value={statusFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStatusFilter(v === "" ? "" : (v as PlanningStatus));
                    resetPage();
                  }}
                >
                  <option value="">All statuses</option>
                  {PLANNING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PLANNING_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ maxWidth: "16rem", marginBottom: 0 }}>
                <label htmlFor="pdept">Area filter</label>
                <select
                  id="pdept"
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    resetPage();
                  }}
                >
                  <option value="">All areas</option>
                  {DEV_DEPARTMENT_SUGGESTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {statusFilter || departmentFilter ? (
              <p className="preview-line" style={{ marginTop: 0, marginBottom: 0 }}>
                {[
                  statusFilter && `status: ${PLANNING_STATUS_LABEL[statusFilter]}`,
                  departmentFilter && `area: ${departmentFilter}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . Clear the filters to see the full list.
              </p>
            ) : null}
          </div>
        </details>
        <div className="form-actions" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          <button type="button" className="primary" onClick={openCreateInitiative}>
            Add initiative
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">{viewMode === "board" ? "Initiative board" : "Initiatives"}</h2>
        </div>
        {moveStatusMut.isError && (
          <p role="alert" style={{ margin: "0 0 0.75rem" }}>
            Could not update status. {(moveStatusMut.error as Error).message}
          </p>
        )}
        {listQuery.isLoading && viewMode === "board" && boardSkeleton}
        {listQuery.isLoading && viewMode === "table" && (
          <DataTableSkeleton
            columns={6}
            columnLabels={["Target", "Title", "Status", "Area", "Program", ""]}
            tableLabel="Loading planning list"
          />
        )}
        {listQuery.isError && <p role="alert">Could not load planning items.</p>}
        {listQuery.data && viewMode === "board" && (
          <PlanningKanbanBoard
            items={items}
            statusFilter={statusFilter}
            disabled={moveStatusMut.isPending}
            announce={announceBoard}
            onMove={(id, nextStatus) => moveStatusMut.mutate({ id, status: nextStatus })}
          />
        )}
        {listQuery.data && viewMode === "table" && (
          <>
            <AppDataTable embedded aria-label="Planning initiatives">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Target</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Area</Table.Th>
                  <Table.Th>Program</Table.Th>
                  <Table.Th w={72} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredForTable.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td className="muted">{p.targetDate ? p.targetDate.slice(0, 10) : "—"}</Table.Td>
                    <Table.Td>
                      <Link
                        to={{
                          pathname: "/planning",
                          search: new URLSearchParams({ edit: p.id }).toString(),
                        }}
                      >
                        {p.title}
                      </Link>
                    </Table.Td>
                    <Table.Td>
                      <span className="badge">{p.status}</span>
                    </Table.Td>
                    <Table.Td className="muted">{p.department ?? "—"}</Table.Td>
                    <Table.Td className="muted">{p.program?.trim() ? p.program : "—"}</Table.Td>
                    <Table.Td>
                      <Link
                        to={{
                          pathname: "/planning",
                          search: new URLSearchParams({ edit: p.id }).toString(),
                        }}
                        className="link-out"
                      >
                        Edit
                      </Link>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            {filteredForTable.length === 0 && (
              <div className="empty-state" role="status" style={{ margin: "0.75rem 0 0" }}>
                <strong>No initiatives match</strong>
                Add one with &quot;Add initiative&quot; above, or change the status / area filters.
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
      <PlanningInitiativeModal
        opened={planningModalOpened}
        onClose={closePlanningInitiativeModal}
        mode={planningModalMode}
        itemId={planningModalMode === "edit" && planningEdit ? planningEdit : null}
      />
    </div>
  );
}
