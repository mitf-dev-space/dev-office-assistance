import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import type { CatalogOverviewDto, PageMeta, RepositorySummaryDto } from "@office/types";
import { useAuth } from "../../auth/AuthContext";
import { canAdminCatalog, canWriteCatalog } from "@office/types";
import { PageHeader } from "../../components/PageHeader";
import { AppPage } from "../../components/ui/AppPage";
import { AppDataTable, AppDataTableSkeleton } from "../../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../../components/ui/ListQueryBar";
import { useListQueryState } from "../../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../../lib/listQuery";
import { useApi } from "../../useApi";
import {
  ConnectivityBadge,
  FreshnessBadge,
  LifecycleBadge,
  PipelineBadge,
  providerLabel,
} from "./catalogUi";

type EditForm = {
  name: string;
  notes: string;
  lifecycleState: string;
  reportedMainBranch: string;
  reportedDevelopmentBranch: string;
};

export function CatalogRepositoriesPage() {
  const { request } = useApi();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user ? canWriteCatalog(user.role) : false;
  const canAdmin = user ? canAdminCatalog(user.role) : false;

  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } = useListQueryState(25);
  const [connectionSlug, setConnectionSlug] = useState<string | null>(null);
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [editRepo, setEditRepo] = useState<RepositorySummaryDto | null>(null);
  const [deleteRepo, setDeleteRepo] = useState<RepositorySummaryDto | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    notes: "",
    lifecycleState: "active",
    reportedMainBranch: "",
    reportedDevelopmentBranch: "",
  });

  const overviewQ = useQuery({
    queryKey: ["catalog", "overview"],
    queryFn: async () => {
      const res = await request("/api/catalog/overview");
      if (!res.ok) throw new Error("overview_failed");
      return (await res.json()) as CatalogOverviewDto;
    },
  });

  const connectionsQ = useQuery({
    queryKey: ["catalog", "connections"],
    queryFn: async () => {
      const res = await request("/api/catalog/connections");
      if (!res.ok) throw new Error("connections_failed");
      return (await res.json()) as { connections: Array<{ slug: string; name: string; providerKind: string }> };
    },
  });

  const listUrl = useMemo(
    () =>
      `/api/catalog/repositories?${buildListQuery({
        page,
        limit,
        q: search,
        filters: {
          connectionSlug: connectionSlug ?? undefined,
          lifecycleState: lifecycleState ?? undefined,
        },
      })}`,
    [page, limit, search, connectionSlug, lifecycleState],
  );

  const listQ = useQuery({
    queryKey: ["catalog", "repositories", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("repos_failed");
      return (await res.json()) as { repositories: RepositorySummaryDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(listQ.data);
  const overview = overviewQ.data;

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editRepo) throw new Error("missing_repo");
      const res = await request(`/api/catalog/repositories/${editRepo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          notes: editForm.notes.trim() || null,
          lifecycleState: editForm.lifecycleState,
          reportedMainBranch: editForm.reportedMainBranch.trim() || null,
          reportedDevelopmentBranch: editForm.reportedDevelopmentBranch.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("update_failed");
      return res.json();
    },
    onSuccess: () => {
      setEditRepo(null);
      void qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await request(`/api/catalog/repositories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => {
      setDeleteRepo(null);
      void qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  const openEdit = (repo: RepositorySummaryDto) => {
    setEditRepo(repo);
    setEditForm({
      name: repo.name,
      notes: repo.notes ?? "",
      lifecycleState: repo.lifecycleState,
      reportedMainBranch: repo.reportedMainBranch ?? repo.defaultBranch ?? "",
      reportedDevelopmentBranch: repo.reportedDevelopmentBranch ?? "",
    });
  };

  const activeFilters = [connectionSlug, lifecycleState].filter(Boolean).length;

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Repositories"
        lead="Browse imported and registered projects across GitLab self-hosted and GitHub cloud. Sync a repository to populate branches, merge requests, pipelines, and issues."
        actions={
          canWrite ? (
            <Button component={Link} to="/catalog/repositories/new">
              Register repository
            </Button>
          ) : undefined
        }
      />

      {overview && (
        <section className="card catalog-summary-grid" aria-label="Catalog summary">
          <div className="catalog-stat">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total</Text>
            <Text fw={700} size="xl">{overview.totalRepositories}</Text>
          </div>
          <div className="catalog-stat">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Reachable</Text>
            <Text fw={700} size="xl" c="teal">{overview.reachableRepositories}</Text>
          </div>
          <div className="catalog-stat">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Unreachable</Text>
            <Text fw={700} size="xl" c="orange">{overview.unreachableRepositories}</Text>
          </div>
          <div className="catalog-stat">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>With pipelines</Text>
            <Text fw={700} size="xl">{overview.withPipelines}</Text>
          </div>
          <div className="catalog-stat">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Open gaps</Text>
            <Text fw={700} size="xl">{overview.openGaps}</Text>
          </div>
        </section>
      )}

      <section className="card catalog-info-callout" aria-label="How to explore repository data">
        <Text fw={600} mb={4}>Branches, merge requests, pipelines, and issues</Text>
        <Text size="sm" c="dimmed">
          Click a repository name to open its detail page. Use <strong>Sync now</strong> to pull branches, commits,
          merge requests, and pipeline runs from GitHub or GitLab. Open the <strong>Issues</strong> tab for live issues
          from the provider. Edit or archive repositories from the row actions or the detail header.
        </Text>
      </section>

      <section className="card" aria-label="Repository list">
        <ListQueryBar
          search={searchInput}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search by name or path…"
          activeFilterCount={activeFilters}
          onClearFilters={() => {
            setConnectionSlug(null);
            setLifecycleState(null);
            setPage(1);
          }}
        >
          <Select
            label="Connection"
            placeholder="All connections"
            clearable
            data={(connectionsQ.data?.connections ?? []).map((c) => ({
              value: c.slug,
              label: `${c.name} (${c.providerKind})`,
            }))}
            value={connectionSlug}
            onChange={(v) => {
              setConnectionSlug(v);
              setPage(1);
            }}
            w={220}
          />
          <Select
            label="Lifecycle"
            placeholder="All states"
            clearable
            data={[
              { value: "active", label: "Active" },
              { value: "preparing", label: "Preparing" },
              { value: "proposed", label: "Proposed" },
              { value: "deprecated", label: "Deprecated" },
            ]}
            value={lifecycleState}
            onChange={(v) => {
              setLifecycleState(v);
              setPage(1);
            }}
            w={160}
          />
        </ListQueryBar>

        {listQ.isLoading ? (
          <AppDataTableSkeleton columns={9} embedded rows={8} tableLabel="Loading repositories" />
        ) : listQ.isError ? (
          <Text c="red" p="md">Failed to load repositories.</Text>
        ) : (listQ.data?.repositories ?? []).length === 0 ? (
          <Text c="dimmed" p="md">No repositories match your filters.</Text>
        ) : (
          <AppDataTable embedded aria-label="Repositories">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Repository</Table.Th>
                <Table.Th>Provider</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Branch</Table.Th>
                <Table.Th>Branches</Table.Th>
                <Table.Th>MRs</Table.Th>
                <Table.Th>Pipeline</Table.Th>
                <Table.Th>Health</Table.Th>
                {canWrite && <Table.Th>Actions</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(listQ.data?.repositories ?? []).map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Text component={Link} to={`/catalog/repositories/${r.id}`} fw={600} size="sm">
                      {r.name}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{r.canonicalUrl}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{providerLabel(r.providerKind, r.connectionSlug)}</Text>
                    <Text size="xs" c="dimmed">{r.connectionSlug}</Text>
                  </Table.Td>
                  <Table.Td>{r.teamName ?? "—"}</Table.Td>
                  <Table.Td>{r.defaultBranch ?? "—"}</Table.Td>
                  <Table.Td>{r.branchCount}</Table.Td>
                  <Table.Td>{r.openMergeRequestCount}</Table.Td>
                  <Table.Td><PipelineBadge status={r.latestPipelineStatus} /></Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="wrap">
                      <ConnectivityBadge state={r.connectivityState} />
                      <FreshnessBadge state={r.freshnessState} />
                      <LifecycleBadge state={r.lifecycleState} />
                    </Group>
                  </Table.Td>
                  {canWrite && (
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Edit">
                          <ActionIcon variant="subtle" onClick={() => openEdit(r)} aria-label="Edit repository">
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {canAdmin && (
                          <Tooltip label="Archive">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => setDeleteRepo(r)}
                              aria-label="Archive repository"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AppDataTable>
        )}

        <TablePagination
          page={pageMeta.page}
          totalPages={pageMeta.totalPages}
          total={pageMeta.total}
          limit={pageMeta.limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      </section>

      <Modal opened={Boolean(editRepo)} onClose={() => setEditRepo(null)} title="Edit repository">
        <Stack>
          <TextInput
            label="Display name"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
          <Select
            label="Lifecycle"
            data={["active", "preparing", "proposed", "deprecated"]}
            value={editForm.lifecycleState}
            onChange={(v) => v && setEditForm((f) => ({ ...f, lifecycleState: v }))}
          />
          <TextInput
            label="Reported main branch"
            value={editForm.reportedMainBranch}
            onChange={(e) => setEditForm((f) => ({ ...f, reportedMainBranch: e.currentTarget.value }))}
          />
          <TextInput
            label="Reported development branch"
            value={editForm.reportedDevelopmentBranch}
            onChange={(e) => setEditForm((f) => ({ ...f, reportedDevelopmentBranch: e.currentTarget.value }))}
          />
          <Textarea
            label="Notes"
            value={editForm.notes}
            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.currentTarget.value }))}
            minRows={3}
          />
          <Button loading={updateMut.isPending} onClick={() => updateMut.mutate()}>
            Save changes
          </Button>
        </Stack>
      </Modal>

      <Modal opened={Boolean(deleteRepo)} onClose={() => setDeleteRepo(null)} title="Archive repository">
        <Stack>
          <Text>
            Archive <strong>{deleteRepo?.name}</strong>? It will be removed from active lists but history is retained.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteRepo(null)}>Cancel</Button>
            <Button
              color="red"
              loading={deleteMut.isPending}
              onClick={() => deleteRepo && deleteMut.mutate(deleteRepo.id)}
            >
              Archive
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppPage>
  );
}
