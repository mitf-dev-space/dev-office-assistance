import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistStatusBadge } from "../components/ai/AiAssistStatusBadge";

type LlmSettingsDto = {
  enabled: boolean;
  providerPreset: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  assistLocale: string;
  dailyCap: number;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  usage: { usedToday: number; dailyCap: number; remaining: number; resetsAtUtc: string };
  presets: Array<{
    id: string;
    label: string;
    description: string;
    baseUrl: string;
    defaultModel: string;
    apiKeyRequired: boolean;
  }>;
};

export function AiSettingsPage() {
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const { request } = useApi();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["llm-settings"],
    queryFn: async () => {
      const res = await request("/api/settings/llm");
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as LlmSettingsDto;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [providerPreset, setProviderPreset] = useState("lmstudio");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [model, setModel] = useState("google/gemma-4-e4b");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [assistLocale, setAssistLocale] = useState("en");
  const [dailyCap, setDailyCap] = useState(200);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setEnabled(s.enabled);
    setProviderPreset(s.providerPreset);
    setBaseUrl(s.baseUrl);
    setModel(s.model);
    setAssistLocale(s.assistLocale);
    setDailyCap(s.dailyCap);
    setApiKey("");
    setClearApiKey(false);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        enabled,
        providerPreset,
        baseUrl,
        model,
        assistLocale,
        dailyCap,
      };
      if (clearApiKey) body.clearApiKey = true;
      else if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await request("/api/settings/llm", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "save_failed");
      }
      return (await res.json()) as LlmSettingsDto;
    },
    onSuccess: async () => {
      setApiKey("");
      setClearApiKey(false);
      await qc.invalidateQueries({ queryKey: ["llm-settings"] });
      await qc.invalidateQueries({ queryKey: ["assist-status"] });
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/settings/llm/test", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        error?: string | null;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message || data.error || "test_failed");
      return data;
    },
    onSuccess: async (data) => {
      setTestMsg(
        data.ok
          ? `Connection OK (${data.latencyMs ?? 0} ms)`
          : `Connection failed: ${data.error ?? "unknown"}`,
      );
      await qc.invalidateQueries({ queryKey: ["llm-settings"] });
    },
    onError: (err) => {
      setTestMsg(err instanceof Error ? err.message : "test_failed");
    },
  });

  const presets = settingsQuery.data?.presets ?? [];
  const selectedMeta = presets.find((p) => p.id === providerPreset);

  if (settingsQuery.isLoading) {
    return (
      <div className="app-page">
        <PageHeader eyebrow="Apps" title="AI" lead="Loading workspace AI settings…" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Apps"
        title="Workspace AI"
        lead="One workspace LLM for assist buttons and background insights. Prefer LM Studio locally; OpenRouter for cloud."
        actions={<AiAssistStatusBadge />}
      />

      {!isLead ? (
        <Alert color="blue" mb="md">
          Only a lead can change the workspace AI key. You can still use assist when AI is enabled.
        </Alert>
      ) : null}

      <div className="card">
        <Stack gap="md">
          <Switch
            label="Enable workspace AI"
            checked={enabled}
            onChange={(e) => setEnabled(e.currentTarget.checked)}
            disabled={!isLead}
          />

          <Select
            label="Provider"
            data={presets.map((p) => ({ value: p.id, label: p.label }))}
            value={providerPreset}
            onChange={(v) => {
              if (!v) return;
              setProviderPreset(v);
              const meta = presets.find((p) => p.id === v);
              if (meta) {
                if (meta.baseUrl) setBaseUrl(meta.baseUrl);
                if (meta.defaultModel) setModel(meta.defaultModel);
              }
            }}
            disabled={!isLead}
            description={selectedMeta?.description}
          />

          <TextInput
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
            disabled={!isLead}
            placeholder="http://localhost:1234/v1 or https://openrouter.ai/api/v1"
          />

          <TextInput
            label="Model"
            value={model}
            onChange={(e) => setModel(e.currentTarget.value)}
            disabled={!isLead}
            placeholder="google/gemma-4-e4b or openai/gpt-4o-mini"
          />

          <PasswordInput
            label="API key"
            description={
              settingsQuery.data?.hasApiKey
                ? `Saved key: ${settingsQuery.data.apiKeyHint ?? "••••"} — leave blank to keep`
                : providerPreset === "openrouter"
                  ? "Required for OpenRouter"
                  : "Optional for LM Studio / Ollama"
            }
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.currentTarget.value);
              setClearApiKey(false);
            }}
            disabled={!isLead}
          />

          {settingsQuery.data?.hasApiKey && isLead ? (
            <Switch
              label="Clear saved API key"
              checked={clearApiKey}
              onChange={(e) => setClearApiKey(e.currentTarget.checked)}
            />
          ) : null}

          <Select
            label="Assist locale"
            data={[
              { value: "en", label: "English" },
              { value: "ar", label: "Arabic" },
              { value: "auto", label: "Auto (match content)" },
            ]}
            value={assistLocale}
            onChange={(v) => v && setAssistLocale(v)}
            disabled={!isLead}
          />

          <NumberInput
            label="Daily call cap"
            value={dailyCap}
            onChange={(v) => setDailyCap(typeof v === "number" ? v : 200)}
            min={1}
            max={100000}
            disabled={!isLead}
          />

          {settingsQuery.data ? (
            <Text size="sm" c="dimmed">
              Usage today: {settingsQuery.data.usage.usedToday} / {settingsQuery.data.usage.dailyCap}{" "}
              (resets {new Date(settingsQuery.data.usage.resetsAtUtc).toLocaleString()})
              {settingsQuery.data.lastTestedAt
                ? ` · Last test: ${settingsQuery.data.lastTestOk ? "OK" : "failed"} at ${new Date(settingsQuery.data.lastTestedAt).toLocaleString()}`
                : null}
            </Text>
          ) : null}

          {saveMut.isError ? (
            <Alert color="red">{saveMut.error instanceof Error ? saveMut.error.message : "Save failed"}</Alert>
          ) : null}
          {testMsg ? (
            <Alert color={testMsg.startsWith("Connection OK") ? "teal" : "red"}>{testMsg}</Alert>
          ) : null}

          {isLead ? (
            <Group>
              <Button loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
                Save
              </Button>
              <Button
                variant="light"
                loading={testMut.isPending}
                onClick={() => {
                  setTestMsg(null);
                  testMut.mutate();
                }}
              >
                Test connection
              </Button>
            </Group>
          ) : null}

          <Text size="sm" c="dimmed">
            LM Studio must be reachable from the API host (not only the browser). For Docker API on
            Windows, use <code>http://host.docker.internal:1234/v1</code>.
          </Text>
        </Stack>
      </div>
    </div>
  );
}
