import { useId, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ForgeBankDto, PageMeta } from "@office/types";
import { useApi } from "../../useApi";
import { FormModal } from "../../components/modals/FormModal";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../../components/ui/ListQueryBar";
import { useListQueryState } from "../../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../../lib/listQuery";
import type { ForgeApplicationDto } from "../../lib/forge/types";

export function ForgeApplicationsPanel() {
  const { request } = useApi();
  const qc = useQueryClient();
  const uid = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [bankId, setBankId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [projectSubpath, setProjectSubpath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("dev");
  const [formError, setFormError] = useState<string | null>(null);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const banksQuery = useQuery({
    queryKey: ["forge", "banks", "dropdown"],
    queryFn: async () => {
      const res = await request("/api/forge/banks?limit=500");
      if (!res.ok) throw new Error("banks_failed");
      return (await res.json()) as { items: ForgeBankDto[] };
    },
  });

  const listUrl = useMemo(
    () => `/api/forge/applications?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const appsQuery = useQuery({
    queryKey: ["forge", "applications", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("apps_failed");
      return (await res.json()) as { items: ForgeApplicationDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(appsQuery.data);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!bankId) throw new Error("bank_required");
      setFormError(null);
      const res = await request("/api/forge/applications", {
        method: "POST",
        body: JSON.stringify({
          bankId,
          name: name.trim(),
          repositoryProvider: "github",
          repositoryUrl: repositoryUrl.trim(),
          projectSubpath: projectSubpath.trim() || undefined,
          defaultBranch: defaultBranch.trim() || "dev",
          androidEnabled: true,
          iosEnabled: false,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "create_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "applications"] });
      setCreateOpen(false);
      setName("");
      setRepositoryUrl("");
      setProjectSubpath("");
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (app: ForgeApplicationDto) => {
      const res = await request(`/api/forge/applications/${app.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !app.isActive }),
      });
      if (!res.ok) throw new Error("update_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "applications"] });
    },
  });

  const apps = appsQuery.data?.items ?? [];
  const activeBanks = (banksQuery.data?.items ?? []).filter((b) => b.isActive);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={600}>Applications</Text>
          <Text size="sm" c="dimmed">
            Git repositories registered per bank.
          </Text>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add application</Button>
      </Group>

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search app, bank, repo…"
      />

      <AppDataTable aria-label="Forge applications">
        <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Bank</Table.Th>
              <Table.Th>Branch</Table.Th>
              <Table.Th>Profiles</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {apps.map((app) => (
              <Table.Tr key={app.id}>
                <Table.Td>
                  <Text fw={500}>{app.name}</Text>
                  <Text size="xs" c="dimmed">
                    {app.projectSubpath ?? app.repositoryUrl}
                  </Text>
                </Table.Td>
                <Table.Td>{app.bankCode}</Table.Td>
                <Table.Td>{app.defaultBranch}</Table.Td>
                <Table.Td>{app.profileCount}</Table.Td>
                <Table.Td>
                  <Badge color={app.isActive ? "green" : "gray"} variant="light">
                    {app.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={app.isActive}
                    onChange={() => toggleMut.mutate(app)}
                    aria-label={`Toggle ${app.name}`}
                  />
                </Table.Td>
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

      <FormModal
        opened={createOpen}
        onClose={() => {
          if (createMut.isPending) return;
          setCreateOpen(false);
          setFormError(null);
        }}
        title="Add application"
        closeOnClickOutside={!createMut.isPending}
        closeOnEscape={!createMut.isPending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
        >
          <Stack gap="sm">
            <Select
              label="Bank"
              data={activeBanks.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
              value={bankId}
              onChange={setBankId}
              required
              id={`${uid}-bank`}
              disabled={createMut.isPending}
            />
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              disabled={createMut.isPending}
            />
            <TextInput
              label="Repository URL"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.currentTarget.value)}
              required
              disabled={createMut.isPending}
            />
            <TextInput
              label="Project subpath"
              placeholder="mobile/gateway_tester"
              value={projectSubpath}
              onChange={(e) => setProjectSubpath(e.currentTarget.value)}
              disabled={createMut.isPending}
            />
            <TextInput
              label="Default branch"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.currentTarget.value)}
              disabled={createMut.isPending}
            />
            {formError && (
              <Text c="red" size="sm" role="alert">
                {formError}
              </Text>
            )}
            <Group justify="flex-end" mt="xs">
              <Button
                type="button"
                variant="default"
                disabled={createMut.isPending}
                onClick={() => {
                  setCreateOpen(false);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMut.isPending}>
                Create application
              </Button>
            </Group>
          </Stack>
        </form>
      </FormModal>
    </Stack>
  );
}
