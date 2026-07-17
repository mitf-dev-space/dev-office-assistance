import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import type { DeveloperDto, PageMeta, RosterPosition } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";
import { DeveloperModal } from "../components/developers/DeveloperModal";

function cellPreview(s: string | null, max = 64) {
  if (!s?.trim()) return "—";
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function rosterLabel(p: RosterPosition) {
  if (p === "department_head") return "Head";
  if (p === "department_assistant") return "Asst";
  return "—";
}

export function DevManagementPage() {
  const { request } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const devEdit = searchParams.get("edit");
  const [devModalMode, setDevModalMode] = useState<"create" | "edit">("create");
  const [devModalOpened, { open: openDevModal, close: closeDevModal }] = useDisclosure(false);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(
    () => `/api/developers?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const listQuery = useQuery({
    queryKey: ["developers", "roster", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { developers: DeveloperDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(listQuery.data);

  useEffect(() => {
    if (devEdit) {
      setDevModalMode("edit");
      openDevModal();
    }
  }, [devEdit, openDevModal]);

  const closeDeveloperModal = () => {
    closeDevModal();
    setSearchParams((p) => {
      p.delete("edit");
      return p;
    });
  };

  const openCreateDeveloper = () => {
    setDevModalMode("create");
    setSearchParams((p) => {
      p.delete("edit");
      return p;
    });
    openDevModal();
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Directory"
        title="Dev management"
        lead="Roster for people you assign in triage and place on teams. Add or edit people in a dialog — not an app sign-in, only the lead and assistance accounts can log in."
      />

      <section className="card" aria-label="Roster list">
        <div className="card__head card__head--row">
          <div>
            <h2 className="card__title">Roster</h2>
            <p className="card__sub" style={{ marginBottom: 0 }}>
              {listQuery.data
                ? `${pageMeta.total} on roster`
                : "Searchable from Team management. Use Add to open the form, or a name to edit."}
            </p>
          </div>
          <div className="card__head__actions">
            <button type="button" className="primary" onClick={openCreateDeveloper}>
              Add person
            </button>
          </div>
        </div>
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search name, skills, email…"
        />
        {listQuery.isLoading && (
          <DataTableSkeleton
            embedded
            columns={6}
            columnLabels={["Name", "Work email", "Job title", "Org", "Focus", ""]}
            tableLabel="Loading roster"
          />
        )}
        {listQuery.isError && <p role="alert">Could not load roster.</p>}
        {listQuery.data && (
          <>
            <AppDataTable embedded aria-label="Developer roster">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Work email</Table.Th>
                  <Table.Th>Job title</Table.Th>
                  <Table.Th>Org</Table.Th>
                  <Table.Th>Focus / skills</Table.Th>
                  <Table.Th w={72} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listQuery.data.developers.map((d) => (
                  <Table.Tr key={d.id}>
                    <Table.Td>
                      <Link
                        to={{
                          pathname: "/developers",
                          search: new URLSearchParams({ edit: d.id }).toString(),
                        }}
                      >
                        {d.displayName}
                      </Link>
                    </Table.Td>
                    <Table.Td className="muted">{d.workEmail?.trim() || "—"}</Table.Td>
                    <Table.Td className="muted">{cellPreview(d.jobTitle, 80)}</Table.Td>
                    <Table.Td className="muted">{rosterLabel(d.rosterPosition)}</Table.Td>
                    <Table.Td className="muted">{cellPreview(d.skills)}</Table.Td>
                    <Table.Td>
                      <Link
                        to={{
                          pathname: "/developers",
                          search: new URLSearchParams({ edit: d.id }).toString(),
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
            {listQuery.data.developers.length === 0 && (
              <p className="muted" style={{ margin: "0.75rem 0 0" }}>
                No one on the roster yet. Add a person, then use Team management to place them in squads.
              </p>
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

      <DeveloperModal
        opened={devModalOpened}
        onClose={closeDeveloperModal}
        mode={devModalMode}
        developerId={devModalMode === "edit" && devEdit ? devEdit : null}
      />
    </div>
  );
}
