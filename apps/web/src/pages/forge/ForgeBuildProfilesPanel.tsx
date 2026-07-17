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
import type { PageMeta } from "@office/types";
import { useApi } from "../../useApi";
import { FormModal } from "../../components/modals/FormModal";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { ListQueryBar, TablePagination } from "../../components/ui/ListQueryBar";
import { useListQueryState } from "../../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../../lib/listQuery";
import type { ForgeApplicationDto, ForgeBuildProfileDto } from "../../lib/forge/types";

export function ForgeBuildProfilesPanel() {
  const { request } = useApi();
  const qc = useQueryClient();
  const uid = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dartEntryPoint, setDartEntryPoint] = useState("lib/main.dart");
  const [androidBuildMode, setAndroidBuildMode] = useState<string | null>("debug");
  const [formError, setFormError] = useState<string | null>(null);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const appsQuery = useQuery({
    queryKey: ["forge", "applications", "dropdown"],
    queryFn: async () => {
      const res = await request("/api/forge/applications?limit=500");
      if (!res.ok) throw new Error("apps_failed");
      return (await res.json()) as { items: ForgeApplicationDto[] };
    },
  });

  const listUrl = useMemo(
    () => `/api/forge/build-profiles?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const profilesQuery = useQuery({
    queryKey: ["forge", "build-profiles", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("profiles_failed");
      return (await res.json()) as { items: ForgeBuildProfileDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(profilesQuery.data);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("app_required");
      setFormError(null);
      const res = await request("/api/forge/build-profiles", {
        method: "POST",
        body: JSON.stringify({
          applicationId,
          name: name.trim(),
          dartEntryPoint: dartEntryPoint.trim(),
          androidArtifactType: "apk",
          androidBuildMode: androidBuildMode ?? "debug",
          timeoutMinutes: 90,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "create_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "build-profiles"] });
      setCreateOpen(false);
      setName("");
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (profile: ForgeBuildProfileDto) => {
      const res = await request(`/api/forge/build-profiles/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !profile.isActive }),
      });
      if (!res.ok) throw new Error("update_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["forge", "build-profiles"] });
    },
  });

  const profiles = profilesQuery.data?.items ?? [];
  const apps = appsQuery.data?.items ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={600}>Build profiles</Text>
          <Text size="sm" c="dimmed">
            Flutter entry point and Android build mode per application.
          </Text>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add profile</Button>
      </Group>

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search profile or app…"
      />

      <AppDataTable aria-label="Forge build profiles">
        <Table.Thead>
            <Table.Tr>
              <Table.Th>Profile</Table.Th>
              <Table.Th>Application</Table.Th>
              <Table.Th>Mode</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {profiles.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td fw={500}>{p.name}</Table.Td>
                <Table.Td>{p.applicationName}</Table.Td>
                <Table.Td>
                  {p.androidBuildMode} / {p.androidArtifactType}
                </Table.Td>
                <Table.Td>
                  <Badge color={p.isActive ? "green" : "gray"} variant="light">
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={p.isActive}
                    onChange={() => toggleMut.mutate(p)}
                    aria-label={`Toggle ${p.name}`}
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
        title="Add build profile"
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
              label="Application"
              data={apps.map((a) => ({ value: a.id, label: `${a.name} (${a.bankCode})` }))}
              value={applicationId}
              onChange={setApplicationId}
              required
              id={`${uid}-app`}
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
              label="Dart entry point"
              value={dartEntryPoint}
              onChange={(e) => setDartEntryPoint(e.currentTarget.value)}
              disabled={createMut.isPending}
            />
            <Select
              label="Android build mode"
              data={[
                { value: "debug", label: "debug" },
                { value: "release", label: "release" },
                { value: "profile", label: "profile" },
              ]}
              value={androidBuildMode}
              onChange={setAndroidBuildMode}
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
                Create profile
              </Button>
            </Group>
          </Stack>
        </form>
      </FormModal>
    </Stack>
  );
}
