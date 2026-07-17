import { useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExpenseDto, PageMeta } from "@office/types";
import { apiViewInNewTab } from "../apiClient";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton, MetricStripSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";
import { ExpenseEntryModal } from "../components/expenses/ExpenseEntryModal";

function monthStartIso(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function monthEndIso(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString().slice(0, 10);
}

export function ExpensesPage() {
  const { request, uploadExpenseReceipt } = useApi();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editFromUrl = searchParams.get("edit");

  const [expenseModalMode, setExpenseModalMode] = useState<"create" | "edit">("create");
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(monthStartIso(now));
  const [to, setTo] = useState(monthEndIso(now));
  const expenseRangeLegendId = useId();
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange, resetPage } =
    useListQueryState(25);

  useEffect(() => {
    resetPage();
  }, [from, to, resetPage]);

  const listUrl = useMemo(
    () =>
      `/api/expenses?${buildListQuery({
        page,
        limit,
        q: search,
        filters: { from, to },
      })}`,
    [page, limit, search, from, to],
  );

  const listQuery = useQuery({
    queryKey: ["expenses", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { expenses: ExpenseDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(listQuery.data);

  const summaryQuery = useQuery({
    queryKey: ["expenses-summary", from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const res = await request(`/api/expenses/summary?${p.toString()}`);
      if (!res.ok) throw new Error("summary_failed");
      return (await res.json()) as {
        byDepartment: { department: string; total: string }[];
      };
    },
  });

  useEffect(() => {
    if (editFromUrl) {
      setExpenseModalMode("edit");
      openModal();
    }
  }, [editFromUrl, openModal]);

  const closeExpenseModal = () => {
    closeModal();
    setSearchParams((params) => {
      params.delete("edit");
      return params;
    });
  };

  const openCreateModal = () => {
    setExpenseModalMode("create");
    setSearchParams((params) => {
      params.delete("edit");
      return params;
    });
    openModal();
  };

  const receiptRowMut = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const res = await uploadExpenseReceipt(id, file);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "upload_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expenses"] });
      await qc.invalidateQueries({ queryKey: ["expenses-summary"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Finance"
        title="Dev department expenses"
        lead="Track spend by team and month. Add or edit entries in a dialog; attach receipts there or from the list."
      />

      <section className="card" aria-label="Date range and totals">
        <div className="card__head">
          <h2 className="card__title">Summary (selected range)</h2>
          <p className="card__sub">Totals by department for the date window below.</p>
        </div>
        <details className="app-filters-disclosure" style={{ marginTop: "0.5rem" }}>
          <summary className="app-filters-disclosure__summary">
            <span className="app-filters-disclosure__summary-left">
              <span className="app-filters-disclosure__summary-title" id={expenseRangeLegendId}>
                Date range
              </span>
            </span>
          </summary>
          <div
            className="app-filters-disclosure__panel"
            role="group"
            aria-label="Expense date range"
            aria-labelledby={expenseRangeLegendId}
          >
            <div className="toolbar" style={{ alignItems: "flex-end" }}>
              <div>
                <label htmlFor="e-from">From</label>
                <input
                  id="e-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="e-to">To</label>
                <input id="e-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </div>
        </details>
        {summaryQuery.isLoading && (
          <MetricStripSkeleton count={4} style={{ marginTop: "0.75rem" }} label="Loading expense summary" />
        )}
        {summaryQuery.data && (
          <div className="metric-strip" style={{ marginTop: "0.75rem" }}>
            {summaryQuery.data.byDepartment.map((s) => (
              <div key={s.department} className="metric">
                <span className="metric-value">{Number(s.total).toFixed(2)}</span>
                <span className="metric-label">{s.department}</span>
              </div>
            ))}
            {summaryQuery.data.byDepartment.length === 0 && (
              <p className="muted">No expenses in this range.</p>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-label="Expense list">
        <div className="card__head card__head--row">
          <div>
            <h2 className="card__title">Entries</h2>
            <p className="card__sub" style={{ marginBottom: 0 }}>
              {listQuery.data
                ? `${pageMeta.total} in-range entr${pageMeta.total === 1 ? "y" : "ies"}`
                : "In-range rows for the dates above. Use Add to open the form, or follow a title to edit."}
            </p>
          </div>
          <div className="card__head__actions">
            <button type="button" className="primary" onClick={openCreateModal}>
              Add expense
            </button>
          </div>
        </div>
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search title, department, category…"
        />
        {listQuery.isLoading && (
          <DataTableSkeleton
            embedded
            columns={6}
            columnLabels={["Date", "Title", "Amount", "Department", "Category", "Receipt"]}
            tableLabel="Loading expenses"
          />
        )}
        {listQuery.isError && <p role="alert">Could not load expenses.</p>}
        {listQuery.data && (
          <>
            <AppDataTable embedded aria-label="Expense entries">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Receipt</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listQuery.data.expenses.map((e) => {
                  const rowBusy =
                    receiptRowMut.isPending && receiptRowMut.variables?.id === e.id;
                  return (
                    <Table.Tr key={e.id}>
                      <Table.Td>{e.expenseDate.slice(0, 10)}</Table.Td>
                      <Table.Td>
                        <Link
                          to={{
                            pathname: "/expenses",
                            search: new URLSearchParams({ edit: e.id }).toString(),
                          }}
                        >
                          {e.title}
                        </Link>
                      </Table.Td>
                      <Table.Td>
                        {e.currency} {e.amount}
                      </Table.Td>
                      <Table.Td className="muted">{e.department}</Table.Td>
                      <Table.Td>
                        <span className="badge">{e.category}</span>
                      </Table.Td>
                      <Table.Td>
                        <div className="expense-receipt-cell">
                          <span className="muted expense-receipt-cell__state">
                            {e.hasReceipt ? "Yes" : "—"}
                          </span>
                          {e.hasReceipt && (
                            <button
                              type="button"
                              className="link-out expense-receipt-cell__btn"
                              disabled={rowBusy}
                              onClick={async () => {
                                const name = e.receiptName ?? "receipt";
                                try {
                                  await apiViewInNewTab(
                                    `/api/expenses/${e.id}/receipt`,
                                    name,
                                  );
                                } catch {
                                  window.alert("Could not open receipt. Try editing the entry.");
                                }
                              }}
                            >
                              View
                            </button>
                          )}
                          <input
                            id={`expense-receipt-${e.id}`}
                            type="file"
                            className="expense-receipt-file"
                            tabIndex={-1}
                            aria-label={
                              e.hasReceipt
                                ? `Replace receipt for ${e.title}`
                                : `Add receipt for ${e.title}`
                            }
                            disabled={rowBusy}
                            onChange={(ev) => {
                              const f = ev.target.files?.[0];
                              ev.target.value = "";
                              if (f) {
                                receiptRowMut.mutate({ id: e.id, file: f });
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="link-out expense-receipt-cell__btn"
                            disabled={rowBusy}
                            onClick={() => {
                              document.getElementById(`expense-receipt-${e.id}`)?.click();
                            }}
                          >
                            {rowBusy ? "Uploading…" : e.hasReceipt ? "Replace" : "Add receipt"}
                          </button>
                        </div>
                        {receiptRowMut.isError && receiptRowMut.variables?.id === e.id && (
                          <p
                            className="muted"
                            style={{ fontSize: "0.8rem", margin: "0.25rem 0 0" }}
                            role="alert"
                          >
                            {(receiptRowMut.error as Error).message}
                          </p>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </AppDataTable>
            {listQuery.data.expenses.length === 0 && (
              <div className="empty-state" role="status" style={{ margin: "0.75rem 0 0" }}>
                <strong>No expenses in this range</strong>
                Adjust the date range or add an entry with &quot;Add expense&quot;.
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

      <ExpenseEntryModal
        opened={modalOpened}
        onClose={closeExpenseModal}
        mode={expenseModalMode}
        expenseId={expenseModalMode === "edit" && editFromUrl ? editFromUrl : null}
      />
    </div>
  );
}
