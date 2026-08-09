import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageMeta, SurveyDto, SurveyStatus } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";

const STATUS_TABS: Array<{ value: SurveyStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function SurveysPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SurveyStatus | "all">("all");
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(() => {
    const filters: Record<string, string | undefined> = {};
    if (tab !== "all") filters.status = tab;
    return `/api/surveys?${buildListQuery({ page, limit, q: search, filters })}`;
  }, [page, limit, search, tab]);

  const listQuery = useQuery({
    queryKey: ["surveys", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { surveys: SurveyDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(listQuery.data);

  const actionMut = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await request(`/api/surveys/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "action_failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await request(`/api/surveys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  const runAction = (survey: SurveyDto, action: string, confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    actionMut.mutate({ id: survey.id, action });
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Surveys"
        title="Surveys"
        lead="Create anonymous Yes/No surveys, invite eligible employees with private links, and review aggregate results."
        actions={
          <Link to="/surveys/new" className="primary">
            New survey
          </Link>
        }
      />

      <div className="survey-tabs" role="tablist" aria-label="Survey status">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? "survey-tab survey-tab--active" : "survey-tab"}
            onClick={() => {
              setTab(t.value);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="card" aria-label="Survey list">
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search surveys…"
        />
        {listQuery.isLoading && (
          <DataTableSkeleton
            embedded
            columns={7}
            columnLabels={["Title", "Status", "Questions", "Eligible", "Responses", "Participation", "Actions"]}
            tableLabel="Loading surveys"
          />
        )}
        {listQuery.isError && <p role="alert">Could not load surveys.</p>}
        {listQuery.data && (
          <>
            <AppDataTable embedded aria-label="Surveys">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Questions</Table.Th>
                  <Table.Th>Eligible</Table.Th>
                  <Table.Th>Responses</Table.Th>
                  <Table.Th>Participation</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listQuery.data.surveys.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Link to={`/surveys/${s.id}/results`}>{s.title}</Link>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {s.publishedAt ? `Published ${formatDate(s.publishedAt)}` : "Not published"}
                        {s.closesAt ? ` · Closes ${formatDate(s.closesAt)}` : ""}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <span className={`badge badge--${s.status}`}>{s.status}</span>
                    </Table.Td>
                    <Table.Td>{s.questions.length}</Table.Td>
                    <Table.Td>{s.eligibleCount}</Table.Td>
                    <Table.Td>{s.responseCount}</Table.Td>
                    <Table.Td>{s.participationPercent}%</Table.Td>
                    <Table.Td>
                      <div className="survey-actions">
                        {s.status === "draft" && (
                          <>
                            <Link to={`/surveys/${s.id}/edit`} className="btn btn-ghost btn-sm">
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                runAction(s, "publish", "Publish this survey and generate invitations?")
                              }
                            >
                              Publish
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                if (window.confirm("Delete this draft?")) deleteMut.mutate(s.id);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {s.status === "published" && (
                          <>
                            <Link to={`/surveys/${s.id}/invitations`} className="btn btn-ghost btn-sm">
                              Invitations
                            </Link>
                            <Link to={`/surveys/${s.id}/results`} className="btn btn-ghost btn-sm">
                              Results
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                runAction(s, "close", "Close this survey? It will stop accepting responses.")
                              }
                            >
                              Close
                            </button>
                          </>
                        )}
                        {s.status === "closed" && (
                          <>
                            <Link to={`/surveys/${s.id}/results`} className="btn btn-ghost btn-sm">
                              Results
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                runAction(s, "archive", "Archive this survey? Results are retained.")
                              }
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                runAction(s, "duplicate", "Duplicate into a new draft?")
                              }
                            >
                              Duplicate
                            </button>
                          </>
                        )}
                        {s.status === "archived" && (
                          <>
                            <Link to={`/surveys/${s.id}/results`} className="btn btn-ghost btn-sm">
                              Results
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                runAction(s, "duplicate", "Duplicate into a new draft?")
                              }
                            >
                              Duplicate
                            </button>
                          </>
                        )}
                      </div>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            {listQuery.data.surveys.length === 0 && (
              <p className="muted" style={{ padding: "1rem" }}>
                No surveys found.
              </p>
            )}
            <TablePagination
              page={page}
              totalPages={pageMeta.totalPages}
              total={pageMeta.total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </section>
    </div>
  );
}
