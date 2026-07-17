import { useId, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
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

type BanksResponse = { items: ForgeBankDto[] } & PageMeta;

export function ForgeBanksPanel() {
  const { request } = useApi();
  const qc = useQueryClient();
  const uid = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(
    () => `/api/forge/banks?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const banksQuery = useQuery({
    queryKey: ["forge", "banks", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("forge_banks_failed");
      return (await res.json()) as BanksResponse;
    },
  });

  const pageMeta = pickPageMeta(banksQuery.data);

  const createMut = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const res = await request("/api/forge/banks", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), code: code.trim(), isActive: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "create_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "banks"] });
      setCreateOpen(false);
      setName("");
      setCode("");
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (bank: ForgeBankDto) => {
      const res = await request(`/api/forge/banks/${bank.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !bank.isActive }),
      });
      if (!res.ok) throw new Error("update_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "banks"] });
    },
  });

  const banks = banksQuery.data?.items ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={600}>Banks</Text>
          <Text size="sm" c="dimmed">
            Register Libyan bank tenants for mobile wallet and portal applications.
          </Text>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add bank</Button>
      </Group>

      {banksQuery.isError && (
        <Text role="alert" c="red">
          Could not load banks.
        </Text>
      )}

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search name or code…"
      />

      <AppDataTable aria-label="Forge banks">
        <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Applications</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={120}>Active</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {banksQuery.isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed" p="sm">
                    Loading banks…
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {!banksQuery.isLoading && banks.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed" p="sm">
                    No banks yet. Add one or re-run the database seed for demo data.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {banks.map((bank) => (
              <Table.Tr key={bank.id}>
                <Table.Td>{bank.name}</Table.Td>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {bank.code}
                  </Text>
                </Table.Td>
                <Table.Td>{bank.applicationCount}</Table.Td>
                <Table.Td>
                  <Badge color={bank.isActive ? "green" : "gray"} variant="light">
                    {bank.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={bank.isActive}
                    disabled={toggleMut.isPending}
                    aria-label={`Toggle ${bank.name} active`}
                    onChange={() => toggleMut.mutate(bank)}
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
        title="Add bank"
        closeOnClickOutside={!createMut.isPending}
        closeOnEscape={!createMut.isPending}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
        >
          <Stack gap="md">
            <TextInput
              id={`${uid}-name`}
              label="Bank name"
              placeholder="Jumhoria Bank"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              disabled={createMut.isPending}
            />
            <TextInput
              id={`${uid}-code`}
              label="Code"
              description="Short unique identifier (stored uppercase)."
              placeholder="JUM"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
              required
              disabled={createMut.isPending}
            />
            {formError && (
              <Text role="alert" c="red" size="sm">
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
                Create bank
              </Button>
            </Group>
          </Stack>
        </form>
      </FormModal>
    </Stack>
  );
}
