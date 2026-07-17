import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Tabs, Table, Text, Switch, Checkbox } from "@mantine/core";
import type { ClickUpConnectionDto } from "@office/types";
import { useApi } from "../useApi";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { AppDataTable } from "../components/ui/AppDataTable";

type FlattenedList = {
  workspaceId: string;
  spaceId: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
  listId: string;
  listName: string;
  source?: "owned" | "shared";
  taskCount?: number | null;
};

type PreviewRow = {
  externalId: string;
  title: string;
  externalStatus: string | null;
  externalUrl: string | null;
  alreadyLinked: boolean;
};

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `request_failed_${res.status}`);
  }
  return (await res.json()) as T;
}

export function ClickUpPage() {
  const { request } = useApi();
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [taskUrl, setTaskUrl] = useState("");

  const connQuery = useQuery({
    queryKey: ["clickup-connection"],
    queryFn: async () =>
      readJson<{ connection: ClickUpConnectionDto | null }>(
        await request("/api/integrations/clickup"),
      ),
  });

  const listsQuery = useQuery({
    queryKey: ["clickup-flattened-lists"],
    enabled: Boolean(connQuery.data?.connection?.hasToken),
    queryFn: async () =>
      readJson<{ lists: FlattenedList[] }>(
        await request("/api/integrations/clickup/flattened-lists"),
      ),
  });

  const mappingsQuery = useQuery({
    queryKey: ["clickup-list-mappings"],
    enabled: Boolean(connQuery.data?.connection?.hasToken),
    queryFn: async () =>
      readJson<{
        mappings: Array<{
          listId: string;
          listName: string | null;
          enabled: boolean;
          workspaceId: string;
          spaceId: string;
        }>;
      }>(await request("/api/integrations/clickup/list-mappings")),
  });

  const saveConn = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (token.trim()) body.apiToken = token.trim();
      return readJson(
        await request("/api/integrations/clickup", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: () => {
      setToken("");
      setMsg("Connection saved.");
      void qc.invalidateQueries({ queryKey: ["clickup-connection"] });
      void qc.invalidateQueries({ queryKey: ["clickup-flattened-lists"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const testConn = useMutation({
    mutationFn: async () =>
      readJson<{ teams?: Array<{ id: string; name: string }> }>(
        await request("/api/integrations/clickup/test", { method: "POST" }),
      ),
    onSuccess: (r) => {
      setMsg(`Connected. Workspaces: ${(r.teams ?? []).map((t) => t.name).join(", ") || "—"}`);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const mapList = useMutation({
    mutationFn: async (list: FlattenedList) =>
      readJson(
        await request("/api/integrations/clickup/list-mappings", {
          method: "PUT",
          body: JSON.stringify({
            workspaceId: list.workspaceId,
            spaceId: list.spaceId,
            spaceName: list.spaceName,
            folderId: list.folderId,
            folderName: list.folderName,
            listId: list.listId,
            listName: list.listName,
            enabled: true,
          }),
        }),
      ),
    onSuccess: () => {
      setMsg("List mapped for sync/import.");
      void qc.invalidateQueries({ queryKey: ["clickup-list-mappings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const mapFromUrl = useMutation({
    mutationFn: async () =>
      readJson<{ mapping: { listName: string | null; listId: string } }>(
        await request("/api/integrations/clickup/list-mappings/from-task-url", {
          method: "POST",
          body: JSON.stringify({ urlOrTaskId: taskUrl.trim() }),
        }),
      ),
    onSuccess: (r) => {
      setMsg(`Mapped shared list “${r.mapping.listName ?? r.mapping.listId}” from task URL.`);
      setTaskUrl("");
      void qc.invalidateQueries({ queryKey: ["clickup-list-mappings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const disableMapping = useMutation({
    mutationFn: async (m: {
      listId: string;
      workspaceId: string;
      spaceId: string;
      listName: string | null;
    }) =>
      readJson(
        await request("/api/integrations/clickup/list-mappings", {
          method: "PUT",
          body: JSON.stringify({
            workspaceId: m.workspaceId,
            spaceId: m.spaceId,
            listId: m.listId,
            listName: m.listName,
            enabled: false,
          }),
        }),
      ),
    onSuccess: () => {
      setMsg("List disabled for sync.");
      void qc.invalidateQueries({ queryKey: ["clickup-list-mappings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const enableAllDiscovered = useMutation({
    mutationFn: async () =>
      readJson<{ mapped: number; skipped: number; discovered: number }>(
        await request("/api/integrations/clickup/list-mappings/enable-all-discovered", {
          method: "POST",
          body: JSON.stringify({ source: "all" }),
        }),
      ),
    onSuccess: (r) => {
      setMsg(
        `Mapped ${r.mapped} lists for sync (${r.discovered} discovered, ${r.skipped} skipped).`,
      );
      void qc.invalidateQueries({ queryKey: ["clickup-list-mappings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const clearImported = useMutation({
    mutationFn: async () =>
      readJson<{ deletedExternal: number; deletedTriage: number }>(
        await request("/api/integrations/clickup/clear-imported", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ),
    onSuccess: (r) => {
      setMsg(
        `Cleared ${r.deletedExternal} ClickUp work items and ${r.deletedTriage} Triage rows.`,
      );
      void qc.invalidateQueries({ queryKey: ["clickup-list-mappings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await readJson<{ rows: PreviewRow[] }>(
        await request("/api/integrations/clickup/import/preview", {
          method: "POST",
          body: JSON.stringify({ listId: selectedListId, maxTasks: 50 }),
        }),
      );
      return r.rows;
    },
    onSuccess: (rows) => {
      setPreview(rows);
      setMsg(`Preview: ${rows.length} tasks`);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const importMut = useMutation({
    mutationFn: async () =>
      readJson<{ upserted: number; linked: number }>(
        await request("/api/integrations/clickup/import", {
          method: "POST",
          body: JSON.stringify({ listId: selectedListId, maxTasks: 100 }),
        }),
      ),
    onSuccess: (r) => {
      setMsg(`Imported ${r.upserted} tasks (${r.linked} new triage links).`);
      void qc.invalidateQueries({ queryKey: ["triage-items"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const syncMut = useMutation({
    mutationFn: async () =>
      readJson<{ lists?: number; upserted?: number; linked?: number }>(
        await request("/api/integrations/clickup/sync", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ),
    onSuccess: (r) => {
      setMsg(
        `Sync completed: ${r.upserted ?? 0} tasks from ${r.lists ?? 0} list(s), ${r.linked ?? 0} new triage links.`,
      );
      void qc.invalidateQueries({ queryKey: ["triage-items"] });
      void qc.invalidateQueries({ queryKey: ["clickup-connection"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const autoSyncMut = useMutation({
    mutationFn: async (enabled: boolean) =>
      readJson(
        await request("/api/integrations/clickup", {
          method: "PUT",
          body: JSON.stringify({ autoSyncEnabled: enabled }),
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clickup-connection"] }),
  });

  const connection = connQuery.data?.connection;
  const mappedIds = useMemo(
    () => new Set((mappingsQuery.data?.mappings ?? []).map((m) => m.listId)),
    [mappingsQuery.data],
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Apps"
        title="ClickUp"
        lead="Connect a ClickUp workspace, map lists, import tasks into Triage via the shared ExternalWorkItem table, and sync on a separate cron from Microsoft To Do."
      />
      <p className="muted" style={{ marginTop: 0 }}>
        <Link to="/apps">← Apps</Link>
      </p>
      {msg && (
        <Text size="sm" mb="sm">
          {msg}
        </Text>
      )}

      <Tabs defaultValue="connection">
        <Tabs.List>
          <Tabs.Tab value="connection">Connection</Tabs.Tab>
          <Tabs.Tab value="locations" disabled={!connection?.hasToken}>
            Locations
          </Tabs.Tab>
          <Tabs.Tab value="import" disabled={!connection?.hasToken}>
            Import
          </Tabs.Tab>
          <Tabs.Tab value="sync" disabled={!connection?.hasToken}>
            Sync
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="connection" pt="md">
          <div className="card">
            {connection?.hasToken ? (
              <p>
                Connected{connection.workspaceName ? ` · ${connection.workspaceName}` : ""}
                {connection.workspaceId ? ` (${connection.workspaceId})` : ""}
                {connection.tokenHint ? ` · token ${connection.tokenHint}` : ""}
              </p>
            ) : (
              <p className="muted">No ClickUp token stored yet.</p>
            )}
            {isLead ? (
              <>
                <div className="field">
                  <label htmlFor="cu-token">Personal API token</label>
                  <input
                    id="cu-token"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={connection?.hasToken ? "Enter new token to rotate" : "pk_…"}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={saveConn.isPending || (!token.trim() && !connection)}
                    onClick={() => saveConn.mutate()}
                  >
                    {saveConn.isPending ? "Saving…" : "Save connection"}
                  </button>
                  <button
                    type="button"
                    disabled={!connection?.hasToken || testConn.isPending}
                    onClick={() => testConn.mutate()}
                  >
                    Test
                  </button>
                </div>
                {connection && (
                  <Switch
                    mt="md"
                    label="Auto-sync (ClickUp cron)"
                    checked={connection.autoSyncEnabled}
                    onChange={(e) => autoSyncMut.mutate(e.currentTarget.checked)}
                  />
                )}
              </>
            ) : (
              <p className="muted">A lead configures the ClickUp token.</p>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="locations" pt="md">
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Discovery includes owned Team Spaces and Shared with me. CSV import lists are skipped
              by “Map all”. Task URL mapping remains as a fallback.
            </p>
            {isLead && (
              <>
                <div className="form-actions" style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={enableAllDiscovered.isPending}
                    onClick={() => enableAllDiscovered.mutate()}
                  >
                    {enableAllDiscovered.isPending
                      ? "Mapping…"
                      : "Map all discovered lists"}
                  </button>
                  <button
                    type="button"
                    disabled={clearImported.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete all ClickUp ExternalWorkItems and ClickUp Triage rows?",
                        )
                      ) {
                        clearImported.mutate();
                      }
                    }}
                  >
                    {clearImported.isPending ? "Clearing…" : "Clear imported ClickUp data"}
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="cu-task-url">Add list from task URL</label>
                  <input
                    id="cu-task-url"
                    value={taskUrl}
                    onChange={(e) => setTaskUrl(e.target.value)}
                    placeholder="https://app.clickup.com/t/…/869dtxu9r"
                  />
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={!taskUrl.trim() || mapFromUrl.isPending}
                      onClick={() => mapFromUrl.mutate()}
                    >
                      Map list from URL
                    </button>
                  </div>
                </div>
              </>
            )}
            <p style={{ fontWeight: 600 }}>Mapped lists</p>
            <AppDataTable>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>List</Table.Th>
                  <Table.Th>Enabled</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(mappingsQuery.data?.mappings ?? []).map((m) => (
                  <Table.Tr key={m.listId}>
                    <Table.Td>
                      {m.listName ?? m.listId}{" "}
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        ({m.listId})
                      </span>
                    </Table.Td>
                    <Table.Td>{m.enabled ? "Yes" : "No"}</Table.Td>
                    <Table.Td>
                      {isLead && m.enabled && (
                        <button
                          type="button"
                          disabled={disableMapping.isPending}
                          onClick={() => disableMapping.mutate(m)}
                        >
                          Disable
                        </button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
            <p style={{ fontWeight: 600, marginTop: "1.25rem" }}>
              Discovered lists ({listsQuery.data?.lists?.length ?? 0})
            </p>
            <AppDataTable>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Space</Table.Th>
                  <Table.Th>Folder</Table.Th>
                  <Table.Th>List</Table.Th>
                  <Table.Th>Tasks</Table.Th>
                  <Table.Th>Mapped</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(listsQuery.data?.lists ?? []).map((l) => (
                  <Table.Tr key={l.listId}>
                    <Table.Td>{l.source ?? "—"}</Table.Td>
                    <Table.Td>{l.spaceName}</Table.Td>
                    <Table.Td>{l.folderName ?? "—"}</Table.Td>
                    <Table.Td>{l.listName}</Table.Td>
                    <Table.Td>{l.taskCount ?? "—"}</Table.Td>
                    <Table.Td>
                      <Checkbox checked={mappedIds.has(l.listId)} readOnly />
                    </Table.Td>
                    <Table.Td>
                      {isLead && (
                        <button
                          type="button"
                          disabled={mapList.isPending || mappedIds.has(l.listId)}
                          onClick={() => mapList.mutate(l)}
                        >
                          Map
                        </button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AppDataTable>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="import" pt="md">
          <div className="card">
            <div className="field">
              <label htmlFor="cu-list">List</label>
              <select
                id="cu-list"
                value={selectedListId}
                onChange={(e) => {
                  setSelectedListId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Select a list…</option>
                {(listsQuery.data?.lists ?? []).map((l) => (
                  <option key={l.listId} value={l.listId}>
                    {l.spaceName}
                    {l.folderName ? ` / ${l.folderName}` : ""} / {l.listName}
                  </option>
                ))}
              </select>
            </div>
            {isLead && (
              <div className="form-actions">
                <button
                  type="button"
                  disabled={!selectedListId || previewMut.isPending}
                  onClick={() => previewMut.mutate()}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!selectedListId || importMut.isPending}
                  onClick={() => importMut.mutate()}
                >
                  Import to Triage
                </button>
              </div>
            )}
            {preview && (
              <AppDataTable>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Linked</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((r) => (
                    <Table.Tr key={r.externalId}>
                      <Table.Td>
                        {r.externalUrl ? (
                          <a href={r.externalUrl} target="_blank" rel="noreferrer">
                            {r.title}
                          </a>
                        ) : (
                          r.title
                        )}
                      </Table.Td>
                      <Table.Td>{r.externalStatus ?? "—"}</Table.Td>
                      <Table.Td>{r.alreadyLinked ? "Yes" : "No"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="sync" pt="md">
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Last sync: {connection?.lastSyncAt ?? "never"}
              {connection?.lastSyncError ? ` · Error: ${connection.lastSyncError}` : ""}
            </p>
            {isLead && (
              <button
                type="button"
                className="primary"
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate()}
              >
                {syncMut.isPending ? "Syncing…" : "Sync now"}
              </button>
            )}
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
