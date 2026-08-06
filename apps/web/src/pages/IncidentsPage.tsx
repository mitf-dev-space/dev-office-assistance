import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Table } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { IncidentDto, PageMeta } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";
import { formatIncidentDate } from "../lib/incidentFormat";

export function IncidentsPage() {
  const { request } = useApi();
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(
    () =>
      `/api/incidents?${buildListQuery({
        page,
        limit,
        q: search,
      })}`,
    [page, limit, search],
  );

  const listQuery = useQuery({
    queryKey: ["incidents", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { incidents: IncidentDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(listQuery.data);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Incidents"
        title="Incidents"
        lead="Record and track workplace incidents. Create a new incident, or open one to view details, attachments, and export a PDF report."
        actions={
          <Link to="/incidents/new" className="primary">
            New incident
          </Link>
        }
      />

      <section className="card" aria-label="Incident list">
        <div className="card__head card__head--row">
          <div>
            <h2 className="card__title">All incidents</h2>
            <p className="card__sub" style={{ marginBottom: 0 }}>
              {listQuery.data
                ? `${pageMeta.total} incident${pageMeta.total === 1 ? "" : "s"}`
                : "Search by title, description, reference, or employee name."}
            </p>
          </div>
        </div>
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search incidents…"
        />
        {listQuery.isLoading && (
          <DataTableSkeleton
            embedded
            columns={5}
            columnLabels={["Reference", "Title", "Reporter", "Incident date", "Files"]}
            tableLabel="Loading incidents"
          />
        )}
        {listQuery.isError && <p role="alert">Could not load incidents.</p>}
        {listQuery.data && (
          <>
            <AppDataTable embedded aria-label="Incidents">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Reference</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Reporter</Table.Th>
                  <Table.Th>Incident date</Table.Th>
                  <Table.Th>Files</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listQuery.data.incidents.map((inc) => (
                  <Table.Tr key={inc.id}>
                    <Table.Td>
                      <span className="badge">{inc.incidentNumber}</span>
                    </Table.Td>
                    <Table.Td>
                      <Link to={`/incidents/${inc.id}`}>{inc.title}</Link>
                    </Table.Td>
                    <Table.Td className="muted">{inc.reporterName ?? "—"}</Table.Td>
                    <Table.Td>{formatIncidentDate(inc.incidentAt)}</Table.Td>
                    <Table.Td className="muted">
                      {inc.attachmentCount ? `${inc.attachmentCount} file(s)` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            {listQuery.data.incidents.length === 0 && (
              <p className="muted" style={{ padding: "1rem" }}>
                No incidents found.
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
