import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  List,
} from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  IssueInfo,
  RepositoryConnectivityState,
  RepositoryFreshnessState,
  RepositoryLifecycleState,
} from "@office/types";
import { canAdminCatalog, canWriteCatalog } from "@office/types";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { AppPage } from "../../components/ui/AppPage";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { useApi } from "../../useApi";
import {
  ConnectivityBadge,
  FreshnessBadge,
  LifecycleBadge,
  PipelineBadge,
  providerLabel,
} from "./catalogUi";
import { AiAssistPanel } from "../../components/ai/AiAssistPanel";

type Connection = { id: string; slug: string; name: string; providerKind: string; hasToken?: boolean };

type RepoDetail = {
  id: string;
  name: string;
  canonicalUrl: string;
  lifecycleState: string;
  connectivityState: string;
  freshnessState: string;
  defaultBranch?: string;
  reportedMainBranch?: string;
  reportedDevelopmentBranch?: string;
  reportedPipelineState?: string;
  reportedUnitTestState?: string;
  reportedStaticAnalysisState?: string;
  notes?: string;
  connection?: { slug: string; providerKind: string };
  team?: { name: string };
  branches?: Array<{ name: string; classification: string; isProtected: boolean; latestCommitAt?: string }>;
  commits?: Array<{ sha: string; title: string; committedAt: string; authorName?: string; webUrl?: string }>;
  mergeRequests?: Array<{
    id: string;
    title: string;
    state: string;
    sourceBranch: string;
    targetBranch: string;
    authorName?: string;
    isDraft: boolean;
    webUrl?: string;
    updatedAt: string;
  }>;
  pipelineRuns?: Array<{
    id: string;
    status: string;
    ref?: string;
    webUrl?: string;
    finishedAt?: string;
    jobs?: Array<{ name: string; status: string }>;
  }>;
  originHistory?: Array<{ canonicalUrl: string; endedAt: string; reason?: string }>;
  gaps?: Array<{ id: string; title: string; priority: string }>;
  forgeApplications?: Array<{ id: string; name: string; bank?: { code: string } }>;
  checkResults?: Array<{ status: string; checkDefinition: { name: string; slug: string } }>;
};

export function CatalogRepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { request } = useApi();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user ? canWriteCatalog(user.role) : false;
  const canAdmin = user ? canAdminCatalog(user.role) : false;

  const [migrateOpen, setMigrateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [migrateUrl, setMigrateUrl] = useState("");
  const [migrateConnectionId, setMigrateConnectionId] = useState<string | null>(null);
  const [migrateReason, setMigrateReason] = useState("");
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const q = useQuery({
    queryKey: ["catalog", "repository", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}`);
      if (!res.ok) throw new Error("detail_failed");
      return (await res.json()) as { repository: RepoDetail };
    },
  });

  const issuesQ = useQuery({
    queryKey: ["catalog", "repository", id, "issues"],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}/issues?state=open&limit=30`);
      if (!res.ok) throw new Error("issues_failed");
      return (await res.json()) as { issues: IssueInfo[] };
    },
    retry: false,
  });

  const connectionsQ = useQuery({
    queryKey: ["catalog", "connections"],
    queryFn: async () => {
      const res = await request("/api/catalog/connections");
      if (!res.ok) throw new Error("connections_failed");
      return (await res.json()) as { connections: Connection[] };
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error("sync_failed");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog", "repository", id] });
      void qc.invalidateQueries({ queryKey: ["catalog", "repositories"] });
    },
  });

  const migrateMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}/origin/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: migrateConnectionId,
          url: migrateUrl,
          reason: migrateReason,
        }),
      });
      if (!res.ok) throw new Error("migrate_failed");
      return res.json();
    },
    onSuccess: () => {
      setMigrateOpen(false);
      void qc.invalidateQueries({ queryKey: ["catalog", "repository", id] });
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), notes: editNotes.trim() || null }),
      });
      if (!res.ok) throw new Error("update_failed");
      return res.json();
    },
    onSuccess: () => {
      setEditOpen(false);
      void qc.invalidateQueries({ queryKey: ["catalog", "repository", id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/catalog/repositories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => navigate("/catalog/repositories"),
  });

  const [catalogExplain, setCatalogExplain] = useState<{
    explanation: string;
    recommendedActions: string[];
    source: string;
  } | null>(null);
  const [catalogExplainError, setCatalogExplainError] = useState<string | null>(null);

  const explainMut = useMutation({
    mutationFn: async () => {
      setCatalogExplainError(null);
      const res = await request("/api/assist/catalog-explain", {
        method: "POST",
        body: JSON.stringify({ repositoryId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return data as { explanation: string; recommendedActions: string[]; source: string };
    },
    onSuccess: (data) => setCatalogExplain(data),
    onError: (err) =>
      setCatalogExplainError(err instanceof Error ? err.message : "assist_failed"),
  });

  if (q.isLoading) {
    return (
      <AppPage variant="catalog">
        <Text c="dimmed">Loading repository…</Text>
      </AppPage>
    );
  }
  if (q.isError || !q.data) {
    return (
      <AppPage variant="catalog">
        <Text c="red">Repository not found.</Text>
        <Button component={Link} to="/catalog/repositories" variant="light" mt="md">
          Back to repositories
        </Button>
      </AppPage>
    );
  }

  const repo = q.data.repository;
  const openMrs = (repo.mergeRequests ?? []).filter((mr) => ["open", "opened"].includes(mr.state.toLowerCase()));

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title={repo.name}
        lead={
          <Stack gap={4}>
            <Anchor href={repo.canonicalUrl} target="_blank" rel="noreferrer" size="sm">
              {repo.canonicalUrl}
            </Anchor>
            <Group gap="xs">
              <Badge variant="light">{providerLabel(repo.connection?.providerKind ?? "", repo.connection?.slug ?? "")}</Badge>
              <ConnectivityBadge state={repo.connectivityState as RepositoryConnectivityState} />
              <FreshnessBadge state={repo.freshnessState as RepositoryFreshnessState} />
              <LifecycleBadge state={repo.lifecycleState as RepositoryLifecycleState} />
              {repo.team?.name && <Badge variant="outline">{repo.team.name}</Badge>}
            </Group>
          </Stack>
        }
        actions={
          canWrite ? (
            <Group>
              <Button variant="default" onClick={() => { setEditName(repo.name); setEditNotes(repo.notes ?? ""); setEditOpen(true); }}>
                Edit
              </Button>
              {canAdmin && (
                <Button variant="light" color="red" onClick={() => setDeleteOpen(true)}>
                  Archive
                </Button>
              )}
              <Button loading={syncMut.isPending} onClick={() => syncMut.mutate()}>
                Sync now
              </Button>
              {canAdmin && (
                <Button variant="light" onClick={() => setMigrateOpen(true)}>
                  Change origin
                </Button>
              )}
            </Group>
          ) : undefined
        }
      />

      <AiAssistPanel
        lead="Diagnose freshness, ownership, and scorecard gaps — with concrete catalog actions."
        label="Explain scorecard / health"
        loading={explainMut.isPending}
        error={catalogExplainError}
        onSuggest={() => explainMut.mutate()}
        source={catalogExplain?.source}
        suggestion={
          catalogExplain ? (
            <>
              <Text size="sm">{catalogExplain.explanation}</Text>
              <Text size="sm" fw={600}>
                Recommended actions
              </Text>
              <List size="sm">
                {catalogExplain.recommendedActions.map((a) => (
                  <List.Item key={a}>{a}</List.Item>
                ))}
              </List>
            </>
          ) : null
        }
      />

      <section className="card" aria-label="Repository intelligence">
        <Tabs defaultValue="overview" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="branches">Branches ({repo.branches?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="commits">Commits ({repo.commits?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="merge-requests">Merge requests ({openMrs.length})</Tabs.Tab>
            <Tabs.Tab value="issues">Issues ({issuesQ.data?.issues.length ?? "…"})</Tabs.Tab>
            <Tabs.Tab value="pipelines">Pipelines ({repo.pipelineRuns?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="quality">Quality</Tabs.Tab>
            <Tabs.Tab value="forge">Forge</Tabs.Tab>
            <Tabs.Tab value="audit">Audit</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview">
            <Stack gap="sm">
              <Text><strong>Reported main branch:</strong> {repo.reportedMainBranch ?? "unknown"}</Text>
              <Text><strong>Reported dev branch:</strong> {repo.reportedDevelopmentBranch ?? "unknown"}</Text>
              <Text><strong>Detected default:</strong> {repo.defaultBranch ?? "unknown"}</Text>
              <Text><strong>Reported pipeline:</strong> {repo.reportedPipelineState ?? "unknown"}</Text>
              <Text><strong>Reported unit tests:</strong> {repo.reportedUnitTestState ?? "unknown"}</Text>
              <Text><strong>Reported static analysis:</strong> {repo.reportedStaticAnalysisState ?? "unknown"}</Text>
              {repo.notes && <Text><strong>Notes:</strong> {repo.notes}</Text>}
              <Text size="sm" c="dimmed">
                Run <strong>Sync now</strong> to refresh branches, commits, merge requests, and pipelines from the provider.
                Issues are fetched live from GitHub/GitLab when you open the Issues tab.
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="branches">
            {(repo.branches ?? []).length === 0 ? (
              <Text c="dimmed">No branches synced yet. Run Sync now.</Text>
            ) : (
              <AppDataTable embedded>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Branch</Table.Th>
                    <Table.Th>Classification</Table.Th>
                    <Table.Th>Protected</Table.Th>
                    <Table.Th>Last commit</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(repo.branches ?? []).map((b) => (
                    <Table.Tr key={b.name}>
                      <Table.Td>{b.name}</Table.Td>
                      <Table.Td><Badge variant="light">{b.classification}</Badge></Table.Td>
                      <Table.Td>{b.isProtected ? "Yes" : "No"}</Table.Td>
                      <Table.Td>{b.latestCommitAt ? new Date(b.latestCommitAt).toLocaleString() : "—"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="commits">
            {(repo.commits ?? []).length === 0 ? (
              <Text c="dimmed">No commits synced yet.</Text>
            ) : (
              <AppDataTable embedded scrollMaxHeight="420px">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>Author</Table.Th>
                    <Table.Th>Link</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(repo.commits ?? []).map((c) => (
                    <Table.Tr key={c.sha}>
                      <Table.Td>{new Date(c.committedAt).toLocaleDateString()}</Table.Td>
                      <Table.Td>{c.title}</Table.Td>
                      <Table.Td>{c.authorName ?? "—"}</Table.Td>
                      <Table.Td>
                        {c.webUrl ? (
                          <Anchor href={c.webUrl} target="_blank" rel="noreferrer" size="sm">View</Anchor>
                        ) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="merge-requests">
            {(repo.mergeRequests ?? []).length === 0 ? (
              <Text c="dimmed">No merge requests synced yet. Run Sync now after configuring the connection token.</Text>
            ) : (
              <AppDataTable embedded scrollMaxHeight="420px">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>State</Table.Th>
                    <Table.Th>Source → Target</Table.Th>
                    <Table.Th>Author</Table.Th>
                    <Table.Th>Updated</Table.Th>
                    <Table.Th>Link</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(repo.mergeRequests ?? []).map((mr) => (
                    <Table.Tr key={mr.id}>
                      <Table.Td>{mr.title}{mr.isDraft ? " (draft)" : ""}</Table.Td>
                      <Table.Td><Badge variant="light">{mr.state}</Badge></Table.Td>
                      <Table.Td>{mr.sourceBranch} → {mr.targetBranch}</Table.Td>
                      <Table.Td>{mr.authorName ?? "—"}</Table.Td>
                      <Table.Td>{new Date(mr.updatedAt).toLocaleDateString()}</Table.Td>
                      <Table.Td>
                        {mr.webUrl ? (
                          <Anchor href={mr.webUrl} target="_blank" rel="noreferrer" size="sm">Open</Anchor>
                        ) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="issues">
            {issuesQ.isLoading ? (
              <Text c="dimmed">Loading issues from provider…</Text>
            ) : issuesQ.isError ? (
              <Text c="orange">Could not load issues. Verify the connection token and repository access.</Text>
            ) : (issuesQ.data?.issues ?? []).length === 0 ? (
              <Text c="dimmed">No open issues.</Text>
            ) : (
              <AppDataTable embedded scrollMaxHeight="420px">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>State</Table.Th>
                    <Table.Th>Labels</Table.Th>
                    <Table.Th>Author</Table.Th>
                    <Table.Th>Link</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(issuesQ.data?.issues ?? []).map((issue) => (
                    <Table.Tr key={issue.id}>
                      <Table.Td>{issue.number}</Table.Td>
                      <Table.Td>{issue.title}</Table.Td>
                      <Table.Td><Badge variant="light">{issue.state}</Badge></Table.Td>
                      <Table.Td>{issue.labels.join(", ") || "—"}</Table.Td>
                      <Table.Td>{issue.authorName ?? "—"}</Table.Td>
                      <Table.Td>
                        {issue.webUrl ? (
                          <Anchor href={issue.webUrl} target="_blank" rel="noreferrer" size="sm">Open</Anchor>
                        ) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="pipelines">
            {(repo.pipelineRuns ?? []).length === 0 ? (
              <Text c="dimmed">No pipeline runs synced yet.</Text>
            ) : (
              <AppDataTable embedded scrollMaxHeight="420px">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ref</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Finished</Table.Th>
                    <Table.Th>Jobs</Table.Th>
                    <Table.Th>Link</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(repo.pipelineRuns ?? []).map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>{p.ref ?? "—"}</Table.Td>
                      <Table.Td><PipelineBadge status={p.status} /></Table.Td>
                      <Table.Td>{p.finishedAt ? new Date(p.finishedAt).toLocaleString() : "—"}</Table.Td>
                      <Table.Td>{(p.jobs ?? []).map((j) => j.name).join(", ") || "—"}</Table.Td>
                      <Table.Td>
                        {p.webUrl ? (
                          <Anchor href={p.webUrl} target="_blank" rel="noreferrer" size="sm">Open</Anchor>
                        ) : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </AppDataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="quality">
            {(repo.checkResults ?? []).length === 0 ? (
              <Text c="dimmed">No quality checks recorded. Sync the repository first.</Text>
            ) : (
              <Stack gap="xs">
                {(repo.checkResults ?? []).map((c, i) => (
                  <Group key={i} justify="space-between">
                    <Text size="sm">{c.checkDefinition.name}</Text>
                    <Badge variant="light">{c.status}</Badge>
                  </Group>
                ))}
              </Stack>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="forge">
            {(repo.forgeApplications ?? []).length === 0 ? (
              <Text c="dimmed">No linked Forge applications.</Text>
            ) : (
              repo.forgeApplications!.map((a) => (
                <Text key={a.id} component={Link} to="/forge/admin">{a.name} ({a.bank?.code})</Text>
              ))
            )}
          </Tabs.Panel>

          <Tabs.Panel value="audit">
            <Stack gap="md">
              <div>
                <Text fw={600} mb="xs">Origin history</Text>
                {(repo.originHistory ?? []).length === 0 ? (
                  <Text c="dimmed" size="sm">No origin changes recorded.</Text>
                ) : (
                  (repo.originHistory ?? []).map((h, i) => (
                    <Text key={i} size="sm">{h.canonicalUrl}</Text>
                  ))
                )}
              </div>
              <div>
                <Text fw={600} mb="xs">Open gaps</Text>
                {(repo.gaps ?? []).length === 0 ? (
                  <Text c="dimmed" size="sm">No open engineering gaps.</Text>
                ) : (
                  (repo.gaps ?? []).map((g) => (
                    <Text key={g.id} size="sm" c="orange">{g.priority}: {g.title}</Text>
                  ))
                )}
              </div>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </section>

      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit repository">
        <Stack>
          <TextInput label="Display name" value={editName} onChange={(e) => setEditName(e.currentTarget.value)} />
          <Textarea label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.currentTarget.value)} minRows={3} />
          <Button loading={updateMut.isPending} onClick={() => updateMut.mutate()}>Save</Button>
        </Stack>
      </Modal>

      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Archive repository">
        <Stack>
          <Text>Archive this repository? It will be removed from active lists.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button color="red" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Archive</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={migrateOpen} onClose={() => setMigrateOpen(false)} title="Change repository origin">
        <Stack>
          <Select
            label="Target connection"
            data={(connectionsQ.data?.connections ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.providerKind})` }))}
            value={migrateConnectionId}
            onChange={setMigrateConnectionId}
          />
          <TextInput label="New repository URL" value={migrateUrl} onChange={(e) => setMigrateUrl(e.currentTarget.value)} />
          <Textarea label="Reason" value={migrateReason} onChange={(e) => setMigrateReason(e.currentTarget.value)} />
          <Button loading={migrateMut.isPending} onClick={() => migrateMut.mutate()} disabled={!migrateConnectionId || !migrateUrl}>
            Migrate origin
          </Button>
        </Stack>
      </Modal>
    </AppPage>
  );
}
