import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { AiAssistPanel } from "../../components/ai/AiAssistPanel";
import { AppPage } from "../../components/ui/AppPage";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { useApi } from "../../useApi";

export function CatalogRegisterRepositoryPage() {
  const { request } = useApi();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const previewMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/catalog/repositories/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: name || url.split("/").pop() }),
      });
      if (!res.ok) throw new Error("preview_failed");
      return res.json();
    },
    onSuccess: (data) => setPreview(data as Record<string, unknown>),
  });

  const registerMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/catalog/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name: name || String((preview?.metadata as { name?: string })?.name ?? "repo"),
        }),
      });
      if (!res.ok) throw new Error("register_failed");
      return res.json() as Promise<{ repository: { id: string } }>;
    },
    onSuccess: (data) => navigate(`/catalog/repositories/${data.repository.id}`),
  });

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Register repository"
        lead="Preview metadata from GitLab or GitHub, then confirm to add the project to the catalog."
        actions={
          <Button component={Link} to="/catalog/repositories" variant="light">
            Back to repositories
          </Button>
        }
      />
      <section className="card">
        <Stack gap="md">
          <TextInput
            label="Repository URL"
            placeholder="https://github.com/org/repo or GitLab URL"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <TextInput
            label="Display name"
            placeholder="Optional — defaults from provider metadata"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Group>
            <Button onClick={() => previewMut.mutate()} loading={previewMut.isPending} disabled={!url.trim()}>
              Preview
            </Button>
            <Button
              variant="filled"
              onClick={() => registerMut.mutate()}
              loading={registerMut.isPending}
              disabled={!preview}
            >
              Confirm & save
            </Button>
          </Group>
          {previewMut.isError && <Text c="red" size="sm">Preview failed. Check the URL and connection token.</Text>}
          {registerMut.isError && <Text c="red" size="sm">Could not register repository (duplicate or connection error).</Text>}
        </Stack>
      </section>
      {previewMut.isPending && <Loader />}
      {preview && (
        <section className="card">
          <Text fw={600} mb="xs">Preview</Text>
          <Text size="sm" component="pre" className="catalog-code-block">
            {JSON.stringify(preview, null, 2)}
          </Text>
        </section>
      )}
    </AppPage>
  );
}

export function CatalogImportsPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const importMut = useMutation({
    mutationFn: async (dataset: "backend" | "mobile" | "web") => {
      const res = await request(`/api/catalog/imports/${dataset}`, { method: "POST" });
      if (!res.ok) throw new Error("import_failed");
      return res.json() as Promise<{ job: { id: string } }>;
    },
    onSuccess: (data) => setLastJobId(data.job.id),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/catalog/imports/${lastJobId}/commit`, { method: "POST" });
      if (!res.ok) throw new Error("commit_failed");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  const previewQ = useQuery({
    queryKey: ["catalog", "import", lastJobId],
    enabled: Boolean(lastJobId),
    queryFn: async () => {
      const res = await request(`/api/catalog/imports/${lastJobId}`);
      if (!res.ok) throw new Error("preview_failed");
      return res.json();
    },
  });

  const datasets = [
    { id: "backend" as const, title: "Backend", description: "API and service inventory from the Backend spreadsheet." },
    { id: "mobile" as const, title: "Mobile", description: "Banking and payment mobile apps inventory." },
    { id: "web" as const, title: "Web", description: "Frontend web applications inventory." },
  ];

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Imports"
        lead="Import Backend, Mobile, or Web inventories from fixture JSON. Review the job preview, then commit to upsert systems, apps, and repositories."
      />
      <section className="card catalog-dataset-grid" aria-label="Import datasets">
        {datasets.map((d) => (
          <div key={d.id} className="catalog-dataset-card">
            <Text fw={700}>{d.title}</Text>
            <Text size="sm" c="dimmed" mb="md">{d.description}</Text>
            <Button
              variant="light"
              loading={importMut.isPending && importMut.variables === d.id}
              onClick={() => importMut.mutate(d.id)}
            >
              Load {d.title} fixture
            </Button>
          </div>
        ))}
      </section>
      {lastJobId && (
        <section className="card">
          <Text fw={600} mb="xs">Import job</Text>
          <Text size="sm" c="dimmed" mb="sm">Job ID: {lastJobId}</Text>
          {previewQ.isLoading ? (
            <Loader size="sm" />
          ) : (
            <Text size="sm" mb="md">
              Rows ready: {(previewQ.data as { job?: { rowCount?: number } })?.job?.rowCount ?? 0}
            </Text>
          )}
          <Button onClick={() => commitMut.mutate()} loading={commitMut.isPending}>
            Commit import
          </Button>
          {commitMut.isSuccess && (
            <Text c="teal" size="sm" mt="sm">
              Import committed.{" "}
              <Text component={Link} to="/catalog/repositories" c="teal" inherit span>
                View repositories
              </Text>
            </Text>
          )}
        </section>
      )}
    </AppPage>
  );
}

export function CatalogIntegrationsPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [verifyResult, setVerifyResult] = useState<Record<string, { ok: boolean; message?: string; accountLogin?: string }>>({});

  const q = useQuery({
    queryKey: ["catalog", "connections"],
    queryFn: async () => {
      const res = await request("/api/catalog/connections");
      if (!res.ok) throw new Error("connections_failed");
      return (await res.json()) as {
        connections: Array<{
          id: string;
          name: string;
          slug: string;
          providerKind: string;
          baseUrl: string;
          hasToken: boolean;
          lastVerifiedAt?: string;
        }>;
      };
    },
  });

  const saveTokenMut = useMutation({
    mutationFn: async ({ id, token }: { id: string; token: string }) => {
      const res = await request(`/api/catalog/connections/${id}/token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "save_token_failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setTokens((prev) => ({ ...prev, [vars.id]: "" }));
      void qc.invalidateQueries({ queryKey: ["catalog", "connections"] });
    },
  });

  const verifyMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await request(`/api/catalog/connections/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await res.json()) as { ok: boolean; message?: string; accountLogin?: string; state?: string };
      if (!res.ok) throw new Error(body.message ?? "verify_failed");
      return { id, ...body };
    },
    onSuccess: (data) => {
      setVerifyResult((prev) => ({
        ...prev,
        [data.id]: { ok: data.ok, message: data.message, accountLogin: data.accountLogin },
      }));
      void qc.invalidateQueries({ queryKey: ["catalog", "connections"] });
    },
    onError: (_err, id) => {
      setVerifyResult((prev) => ({ ...prev, [id]: { ok: false, message: "Connection test failed" } }));
    },
  });

  if (q.isLoading) {
    return (
      <AppPage variant="catalog">
        <Text c="dimmed">Loading integrations…</Text>
      </AppPage>
    );
  }

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Integrations"
        lead="Configure GitLab self-hosted and GitHub cloud tokens. GitHub PAT needs Metadata, Contents, Actions, and Pull requests for catalog sync."
      />
      <Stack gap="md">
        {(q.data?.connections ?? []).map((c) => {
          const result = verifyResult[c.id];
          return (
            <section key={c.id} className="card">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="sm" mb={4}>
                      <Text fw={700}>{c.name}</Text>
                      <Badge variant="light">{c.providerKind}</Badge>
                      <Badge variant="light" color={c.hasToken ? "teal" : "orange"}>
                        {c.hasToken ? "Token configured" : "Token missing"}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {c.slug} · {c.baseUrl}
                    </Text>
                    {c.lastVerifiedAt && (
                      <Text size="sm" mt={4}>
                        Last verified {new Date(c.lastVerifiedAt).toLocaleString()}
                      </Text>
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    loading={verifyMut.isPending && verifyMut.variables === c.id}
                    onClick={() => verifyMut.mutate(c.id)}
                  >
                    Test connection
                  </Button>
                </Group>
                {result && (
                  <Text size="sm" c={result.ok ? "teal" : "red"}>
                    {result.ok
                      ? result.accountLogin
                        ? `Connected as ${result.accountLogin}`
                        : result.message ?? "Connection OK"
                      : result.message ?? "Connection failed"}
                  </Text>
                )}
                <Group align="flex-end" wrap="nowrap">
                  <PasswordInput
                    label="Access token"
                    placeholder={`${c.providerKind === "github" ? "GitHub PAT" : "GitLab token"} (leave blank to keep existing)`}
                    value={tokens[c.id] ?? ""}
                    onChange={(e) => setTokens((prev) => ({ ...prev, [c.id]: e.currentTarget.value }))}
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="sm"
                    disabled={!tokens[c.id]?.trim()}
                    loading={saveTokenMut.isPending && saveTokenMut.variables?.id === c.id}
                    onClick={() => saveTokenMut.mutate({ id: c.id, token: tokens[c.id]!.trim() })}
                  >
                    Save token
                  </Button>
                </Group>
                {saveTokenMut.isError && saveTokenMut.variables?.id === c.id && (
                  <Text size="sm" c="red">
                    {saveTokenMut.error instanceof Error &&
                    saveTokenMut.error.message === "encryption_key_not_configured"
                      ? "Set CATALOG_TOKEN_ENCRYPTION_KEY in the API environment before storing tokens."
                      : "Could not save token."}
                  </Text>
                )}
              </Stack>
            </section>
          );
        })}
      </Stack>
    </AppPage>
  );
}

export function CatalogGapsPage() {
  const { request } = useApi();
  const [topAssist, setTopAssist] = useState<{
    summary: string;
    topGaps: Array<{
      id: string;
      title: string;
      priority: string;
      repositoryName: string;
      why: string;
      href: string;
    }>;
    source: string;
  } | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["catalog", "gaps"],
    queryFn: async () => {
      const res = await request("/api/catalog/gaps");
      if (!res.ok) throw new Error("gaps_failed");
      return (await res.json()) as {
        gaps: Array<{ id: string; title: string; priority: string; repository: { id: string; name: string } }>;
      };
    },
  });

  const topMut = useMutation({
    mutationFn: async () => {
      setTopError(null);
      const res = await request("/api/assist/catalog-gaps-top", {
        method: "POST",
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "assist_failed");
      return data as {
        summary: string;
        topGaps: Array<{
          id: string;
          title: string;
          priority: string;
          repositoryName: string;
          why: string;
          href: string;
        }>;
        source: string;
      };
    },
    onSuccess: (data) => setTopAssist(data),
    onError: (err) => setTopError(err instanceof Error ? err.message : "assist_failed"),
  });

  if (q.isLoading) {
    return (
      <AppPage variant="catalog">
        <Text c="dimmed">Loading engineering gaps…</Text>
      </AppPage>
    );
  }

  const gaps = q.data?.gaps ?? [];

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Engineering gaps"
        lead="Open quality and ownership gaps detected across catalog repositories."
      />
      <AiAssistPanel
        lead="Pick the top 3 gaps that need leadership attention this week."
        label="Top 3 gaps"
        loading={topMut.isPending}
        onSuggest={() => topMut.mutate()}
        error={topError}
        source={topAssist?.source ?? null}
        suggestion={
          topAssist ? (
            <>
              <Text size="sm">{topAssist.summary}</Text>
              <Stack gap={6} mt="xs">
                {topAssist.topGaps.map((g, idx) => (
                  <div key={g.id}>
                    <Text size="sm" fw={600}>
                      {idx + 1}.{" "}
                      <Text component={Link} to={g.href} span inherit>
                        {g.repositoryName}: {g.title}
                      </Text>
                    </Text>
                    <Text size="xs" c="dimmed">
                      {g.priority} — {g.why}
                    </Text>
                  </div>
                ))}
              </Stack>
            </>
          ) : null
        }
      />
      <section className="card">
        {gaps.length === 0 ? (
          <Text c="dimmed">No open gaps.</Text>
        ) : (
          <AppDataTable embedded>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Gap</Table.Th>
                <Table.Th>Repository</Table.Th>
                <Table.Th>Priority</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {gaps.map((g) => (
                <Table.Tr key={g.id}>
                  <Table.Td>
                    <Text fw={600} size="sm">{g.title}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text component={Link} to={`/catalog/repositories/${g.repository.id}`} size="sm">
                      {g.repository.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={g.priority === "high" ? "red" : g.priority === "low" ? "gray" : "orange"}
                    >
                      {g.priority}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AppDataTable>
        )}
      </section>
    </AppPage>
  );
}

export function CatalogSyncPage() {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ["catalog", "sync-runs"],
    queryFn: async () => {
      const res = await request("/api/catalog/sync-runs");
      if (!res.ok) throw new Error("sync_failed");
      return (await res.json()) as {
        runs: Array<{
          id: string;
          kind: string;
          status: string;
          startedAt: string;
          itemsSynced?: number;
          repository?: { id: string; name: string } | null;
        }>;
      };
    },
    refetchInterval: 10000,
  });

  if (q.isLoading) {
    return (
      <AppPage variant="catalog">
        <Text c="dimmed">Loading sync activity…</Text>
      </AppPage>
    );
  }

  const runs = q.data?.runs ?? [];

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Sync activity"
        lead="Recent repository sync runs and their status. Open a repository detail page and use Sync now to refresh provider data."
      />
      <section className="card">
        {runs.length === 0 ? (
          <Text c="dimmed">No sync runs yet.</Text>
        ) : (
          <AppDataTable embedded>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Repository</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Started</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    {r.repository ? (
                      <Text component={Link} to={`/catalog/repositories/${r.repository.id}`} size="sm" fw={600}>
                        {r.repository.name}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">Connection</Text>
                    )}
                  </Table.Td>
                  <Table.Td>{r.kind}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={
                        r.status === "succeeded" || r.status === "completed"
                          ? "teal"
                          : r.status === "failed"
                            ? "red"
                            : "gray"
                      }
                    >
                      {r.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{r.itemsSynced ?? "—"}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{new Date(r.startedAt).toLocaleString()}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AppDataTable>
        )}
      </section>
    </AppPage>
  );
}
