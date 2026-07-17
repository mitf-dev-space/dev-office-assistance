import { Link } from "react-router-dom";
import { Select, Table } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ForgeBuildRequestSummaryDto, PageMeta } from "@office/types";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../../components/ui/ListQueryBar";
import { useListQueryState } from "../../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../../lib/listQuery";
import { useApi } from "../../useApi";
import { useMemo, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Queued", label: "Queued" },
  { value: "InProgress", label: "In progress" },
  { value: "Succeeded", label: "Succeeded" },
  { value: "Failed", label: "Failed" },
  { value: "PartiallySucceeded", label: "Partial" },
];

export function ForgeBuildsPage() {
  const { request } = useApi();
  const [statusFilter, setStatusFilter] = useState("");
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange, resetPage } =
    useListQueryState(25);

  const listUrl = useMemo(
    () =>
      `/api/forge/build-requests?${buildListQuery({
        page,
        limit,
        q: search,
        filters: { status: statusFilter || undefined },
      })}`,
    [page, limit, search, statusFilter],
  );

  const listQuery = useQuery({
    queryKey: ["forge", "build-requests", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { items: ForgeBuildRequestSummaryDto[] } & PageMeta;
    },
    refetchInterval: 5000,
  });

  const items = listQuery.data?.items ?? [];
  const pageMeta = pickPageMeta(listQuery.data);

  return (
    <AppPage variant="forge">
      <PageHeader
        eyebrow="Forge"
        title="Builds"
        lead="History of demo and mock Flutter build requests."
        actions={
          <Link to="/forge/builds/new" className="btn btn-primary">
            Request build
          </Link>
        }
      />

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search app, bank, branch…"
        activeFilterCount={statusFilter ? 1 : 0}
        onClearFilters={() => {
          setStatusFilter("");
          resetPage();
        }}
      >
        <Select
          label="Status"
          data={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v ?? "");
            resetPage();
          }}
          w={160}
          size="sm"
        />
      </ListQueryBar>

      {listQuery.isError && (
        <p className="dashboard-error" role="alert">
          Could not load builds.
        </p>
      )}

      <AppDataTable aria-label="Build requests">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Application</Table.Th>
            <Table.Th>Bank</Table.Th>
            <Table.Th>Branch</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Requested</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {listQuery.isLoading && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <span className="muted">Loading…</span>
              </Table.Td>
            </Table.Tr>
          )}
          {!listQuery.isLoading && items.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <span className="muted">No build requests match your filters.</span>
              </Table.Td>
            </Table.Tr>
          )}
          {items.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>
                <Link to={`/forge/builds/${row.id}`}>{row.applicationName}</Link>
              </Table.Td>
              <Table.Td>{row.bankName}</Table.Td>
              <Table.Td>{row.gitReference ?? "—"}</Table.Td>
              <Table.Td>
                <StatusBadge status={row.overallStatus} />
              </Table.Td>
              <Table.Td>{new Date(row.createdAt).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </AppDataTable>

      <TablePagination
        page={pageMeta.page}
        totalPages={pageMeta.totalPages}
        total={pageMeta.total}
        limit={pageMeta.limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </AppPage>
  );
}
