import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Code,
  Group,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageMeta } from "@office/types";
import { useApi } from "../../useApi";
import { FormModal } from "../../components/modals/FormModal";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../../components/ui/ListQueryBar";
import { useListQueryState } from "../../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../../lib/listQuery";

type ForgeRunnerDto = {
  id: string;
  name: string;
  operatingSystem: string;
  architecture: string;
  supportedPlatforms: string[];
  maximumConcurrentJobs: number;
  status: string;
  lastHeartbeatAtUtc: string | null;
  tokenHint: string;
};

export function ForgeRunnersPanel() {
  const { request } = useApi();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("local-windows-android");
  const [operatingSystem, setOperatingSystem] = useState<string | null>("Windows");
  const [platforms, setPlatforms] = useState<string[]>(["Android"]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(
    () => `/api/forge/runners?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const runnersQuery = useQuery({
    queryKey: ["forge", "runners", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("runners_failed");
      return (await res.json()) as { items: ForgeRunnerDto[] } & PageMeta;
    },
    refetchInterval: 10000,
  });

  const pageMeta = pickPageMeta(runnersQuery.data);

  const createMut = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const res = await request("/api/forge/runners", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          operatingSystem: operatingSystem ?? "Windows",
          architecture: "x64",
          supportedPlatforms: platforms,
          maximumConcurrentJobs: 1,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "create_failed");
      }
      return (await res.json()) as { token: string; runner: ForgeRunnerDto };
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["forge", "runners"] });
      setCreatedToken(data.token);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const runners = runnersQuery.data?.items ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={600}>Runners</Text>
          <Text size="sm" c="dimmed">
            Windows/macOS workers that claim and execute build jobs.
          </Text>
        </div>
        <Button onClick={() => { setCreateOpen(true); setCreatedToken(null); }}>Register runner</Button>
      </Group>

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search runner name…"
      />

      <AppDataTable aria-label="Forge runners">
        <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>OS</Table.Th>
              <Table.Th>Platforms</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Token hint</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runners.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td fw={500}>{r.name}</Table.Td>
                <Table.Td>
                  {r.operatingSystem} / {r.architecture}
                </Table.Td>
                <Table.Td>{r.supportedPlatforms.join(", ")}</Table.Td>
                <Table.Td>
                  <Badge color={r.status === "Online" ? "green" : "gray"} variant="light">
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {r.tokenHint}
                  </Text>
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
          setCreatedToken(null);
          setFormError(null);
        }}
        title="Register runner"
        closeOnClickOutside={!createMut.isPending}
        closeOnEscape={!createMut.isPending}
      >
        {createdToken ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Copy this token now — it will not be shown again.
            </Text>
            <Code block>{createdToken}</Code>
            <Text size="sm">
              Or run <Code>scripts/forge/register-local-runner.ps1</Code> (Windows) /{" "}
              <Code>scripts/forge/register-local-runner.sh</Code> (macOS) to write{" "}
              <Code>~/.forge/agent.env</Code>.
            </Text>
            <Group justify="flex-end">
              <Button onClick={() => setCreateOpen(false)}>Close</Button>
            </Group>
          </Stack>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <Stack gap="sm">
              <TextInput
                label="Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                disabled={createMut.isPending}
              />
              <Select
                label="Operating system"
                data={["Windows", "macOS", "Linux"]}
                value={operatingSystem}
                onChange={(value) => {
                  setOperatingSystem(value);
                  if (value === "macOS") {
                    setName((n) => (n === "local-windows-android" ? "local-macos-mobile" : n));
                    setPlatforms((p) =>
                      p.includes("iOS") ? p : [...p, "iOS"].filter((x, i, a) => a.indexOf(x) === i),
                    );
                  }
                }}
                disabled={createMut.isPending}
              />
              <MultiSelect
                label="Supported platforms"
                data={["Android", "iOS"]}
                value={platforms}
                onChange={setPlatforms}
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
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={createMut.isPending}>
                  Create runner
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </FormModal>
    </Stack>
  );
}
