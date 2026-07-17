import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Table, Text } from "@mantine/core";
import { InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { useApi } from "../useApi";
import { useM365AppRegistration } from "../hooks/useM365AppRegistration";
import { m365GraphScopes, isM365Configured } from "../integrations/msalM365Config";
import { getM365Pca } from "../integrations/m365PublicClient";
import { PageHeader } from "../components/PageHeader";
import { CardPlaceholderSkeleton, DataTableSkeleton, SingleFieldSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";
import { MsalInitializer } from "../integrations/MsalInitializer";

type TaskList = { id: string; displayName: string };
type TaskRow = {
  id: string;
  title: string;
  status: string;
  importance: string;
  dueDateTime: { dateTime: string; timeZone: string } | null;
  bodyPreview: string | null;
  webUrl: string | null;
  createdDateTime: string | null;
  lastModifiedDateTime: string | null;
};

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    notStarted: "Not started",
    inProgress: "In progress",
    completed: "Completed",
    waitingOnOthers: "Waiting on others",
    deferred: "Deferred",
  };
  return map[s] ?? s;
}

function formatDue(d: TaskRow["dueDateTime"]): string {
  if (!d?.dateTime) return "—";
  try {
    const x = new Date(d.dateTime);
    if (Number.isNaN(x.getTime())) return d.dateTime;
    return x.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d.dateTime;
  }
}

function TodoAppContent() {
  const { instance, accounts } = useMsal();
  const { requestWithGraph } = useApi();
  const qc = useQueryClient();
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [listId, setListId] = useState("");

  const account: AccountInfo | null =
    instance.getActiveAccount() ?? accounts[0] ?? null;

  const getGraphToken = useCallback(async () => {
    if (!account) {
      throw new Error("msal_not_connected");
    }
    try {
      const r = await instance.acquireTokenSilent({
        scopes: [...m365GraphScopes],
        account,
      });
      return r.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const r = await instance.acquireTokenPopup({
          scopes: [...m365GraphScopes],
          account,
        });
        return r.accessToken;
      }
      throw e;
    }
  }, [instance, account]);

  const connectMs = useCallback(async () => {
    setConnectErr(null);
    try {
      await instance.loginPopup({
        scopes: [...m365GraphScopes],
        prompt: "select_account",
      });
    } catch (e) {
      setConnectErr(e instanceof Error ? e.message : "Microsoft sign-in failed");
    }
  }, [instance]);

  const listsQuery = useQuery({
    queryKey: ["m365-todo-lists", account?.localAccountId],
    enabled: Boolean(account),
    queryFn: async () => {
      const gt = await getGraphToken();
      const res = await requestWithGraph("/api/todo/lists", gt);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "lists_failed");
      }
      return (await res.json()) as { lists: TaskList[] };
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      if (!listId) throw new Error("list_required");
      const gt = await getGraphToken();
      const res = await requestWithGraph("/api/todo/import", gt, {
        method: "POST",
        body: JSON.stringify({ listId, maxTasks: 200 }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "import_failed");
      }
      return (await res.json()) as { upserted: number; message: string };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["triage-items"] });
      await qc.invalidateQueries({ queryKey: ["triage-summary"] });
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["m365-todo-tasks", account?.localAccountId, listId],
    enabled: Boolean(account) && Boolean(listId),
    queryFn: async () => {
      const gt = await getGraphToken();
      const q = new URLSearchParams({ top: "100" });
      const path = `/api/todo/lists/${encodeURIComponent(listId)}/tasks?${q}`;
      const res = await requestWithGraph(path, gt);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "tasks_failed");
      }
      return (await res.json()) as { tasks: TaskRow[] };
    },
  });

  const lists = listsQuery.data?.lists ?? [];
  const tasks = useMemo(
    () =>
      (tasksQuery.data?.tasks ?? []).slice().sort((a, b) => {
        const ad = a.dueDateTime?.dateTime ? new Date(a.dueDateTime.dateTime).getTime() : Infinity;
        const bd = b.dueDateTime?.dateTime ? new Date(b.dueDateTime.dateTime).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }),
    [tasksQuery.data?.tasks],
  );

  if (!account) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Apps"
          title="Microsoft To Do"
          lead="View tasks from your Microsoft To Do lists via Graph. Your app login stays separate; this only authorizes Microsoft 365 on this device for this tab."
        />
        <div className="card">
          {connectErr && <p role="alert">{connectErr}</p>}
          <button type="button" className="primary" onClick={() => void connectMs()}>
            Connect Microsoft 365
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Apps"
        title="Microsoft To Do"
        lead={
          <>
            Connected as <strong>{account.username}</strong>. Choose a list, then use{" "}
            <strong>Sync list to triage</strong> to copy tasks into the{" "}
            <Link to="/">dashboard</Link> (merged by To Do id). Saving status on a linked triage item
            updates To Do when Microsoft is signed in here.
          </>
        }
      />
      <div className="card">
        {listsQuery.isLoading && <SingleFieldSkeleton label="Loading task lists" />}
        {!listsQuery.isLoading && (
          <>
            {listsQuery.isError && (
              <p role="alert">Could not load task lists. Reconnect or check Tasks.Read / Tasks.ReadWrite in Entra.</p>
            )}
            <div className="field">
              <label htmlFor="task-list">List</label>
              <select
                id="task-list"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
              >
                <option value="">Select…</option>
                {lists.map((L) => (
                  <option key={L.id} value={L.id}>
                    {L.displayName}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {listId && !listsQuery.isLoading && (
          <div className="field" style={{ marginTop: "1.25rem" }}>
            <div className="form-actions" style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                className="primary"
                disabled={importMut.isPending || !listId}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? "Syncing…" : "Sync list to triage"}
              </button>
              {importMut.isSuccess && (
                <span className="hint-ok" style={{ marginLeft: "0.75rem" }}>
                  Updated {importMut.data.upserted} item(s). Open the{" "}
                  <Link to="/">dashboard</Link> to work them.
                </span>
              )}
              {importMut.isError && (
                <p role="alert" style={{ margin: "0.5rem 0 0" }}>
                  {(importMut.error as Error).message}
                </p>
              )}
            </div>
            {tasksQuery.isLoading && (
              <DataTableSkeleton
                embedded
                columns={3}
                columnLabels={["Title", "Status", "Due"]}
                tableLabel="Loading tasks"
              />
            )}
            {tasksQuery.isError && <p role="alert">Could not load tasks for this list.</p>}
            {tasksQuery.isSuccess && (
              <>
                <Text size="sm" c="dimmed" mb="xs">
                  {tasks.length} task{tasks.length === 1 ? "" : "s"}
                </Text>
                <AppDataTable embedded aria-label="Microsoft To Do tasks">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Title</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Due</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {tasks.map((t) => (
                      <Table.Tr key={t.id}>
                        <Table.Td>
                          {t.webUrl ? (
                            <a href={t.webUrl} target="_blank" rel="noreferrer">
                              {t.title}
                            </a>
                          ) : (
                            t.title
                          )}
                          {t.bodyPreview && (
                            <div className="muted" style={{ fontSize: "0.88rem", marginTop: 4 }}>
                              {t.bodyPreview}
                            </div>
                          )}
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{statusLabel(t.status)}</Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{formatDue(t.dueDateTime)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AppDataTable>
                {tasks.length === 0 && (
                  <p className="muted" style={{ marginTop: "0.75rem" }}>
                    No tasks in this list, or the list is empty in Graph.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={() => {
              void instance.logoutPopup({ postLogoutRedirectUri: window.location.origin });
            }}
          >
            Disconnect Microsoft
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoNotConfigured() {
  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Apps"
        title="Microsoft To Do"
        lead="This integration is not configured. The rest of the app works without it."
      />
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          A <strong>lead</strong> can set the Microsoft Entra <strong>tenant</strong> and{" "}
          <strong>client</strong> ID under <Link to="/apps/registration">App registration</Link>
          (or an admin can set <code>M365_TENANT_ID</code> / <code>M365_CLIENT_ID</code> for the
          API). In Entra, the same SPA needs <code>User.Read</code>, <code>Mail.Read</code>, and{" "}
          <code>Tasks.ReadWrite</code>; admin consent if your tenant requires it.
        </p>
      </div>
    </div>
  );
}

export function TodoPage() {
  const m365 = useM365AppRegistration();
  if (m365.isLoading) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Apps"
          title="Microsoft To Do"
          lead="Loading Microsoft 365 app registration from the server…"
        />
        <CardPlaceholderSkeleton />
      </div>
    );
  }
  if (m365.isError) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Apps"
          title="Microsoft To Do"
          lead="Could not load the Microsoft 365 app registration from the server."
        />
        <p role="alert">Request failed. Check your sign-in, then try again.</p>
      </div>
    );
  }
  if (!m365.data || !isM365Configured(m365.data.tenantId, m365.data.clientId)) {
    return <TodoNotConfigured />;
  }
  return (
    <MsalProvider instance={getM365Pca(m365.data.tenantId, m365.data.clientId)}>
      <MsalInitializer />
      <TodoAppContent />
    </MsalProvider>
  );
}
