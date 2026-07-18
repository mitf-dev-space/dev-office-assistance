import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import type { TriageCategory, TriageItemDto, TriageStatus } from "@office/types";
import { apiDownload } from "../apiClient";
import { useApi } from "../useApi";
import { useM365AppRegistration } from "../hooks/useM365AppRegistration";
import { m365GraphScopes, isM365Configured } from "../integrations/msalM365Config";
import { getM365Pca } from "../integrations/m365PublicClient";
import { MsalInitializer } from "../integrations/MsalInitializer";
import { PageHeader } from "../components/PageHeader";
import { TriageDetailPageSkeleton } from "../components/skeletons/AppSkeletons";
import { AiAssistPanel } from "../components/ai/AiAssistPanel";
import { List, Text } from "@mantine/core";

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type AcquireGraphToken = () => Promise<string | null>;

function TriageGraphShell({ id }: { id: string }) {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;

  const acquireGraphToken = useCallback(async () => {
    if (!account) return null;
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
      return null;
    }
  }, [instance, account]);

  return <TriageDetailInner id={id} acquireGraphToken={acquireGraphToken} />;
}

function TriageDetailInner({
  id,
  acquireGraphToken,
}: {
  id: string;
  acquireGraphToken: AcquireGraphToken;
}) {
  const { request, requestWithGraph, uploadTriageAttachment } = useApi();
  const qc = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ["triage-item", id],
    queryFn: async () => {
      const res = await request(`/api/triage-items/${id}`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as TriageItemDto;
    },
  });

  const developersQuery = useQuery({
    queryKey: ["developers"],
    queryFn: async () => {
      const res = await request("/api/developers");
      if (!res.ok) throw new Error("developers_failed");
      return (await res.json()) as {
        developers: Array<{ id: string; displayName: string }>;
      };
    },
  });

  const it = itemQuery.data;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TriageCategory>("other");
  const [status, setStatus] = useState<TriageStatus>("inbox");
  const [nextAction, setNextAction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState("");
  const [assigneeDeveloperId, setAssigneeDeveloperId] = useState("");
  const [program, setProgram] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{
    summary: string;
    bullets: string[];
    source: string;
  } | null>(null);
  const [nextActionResult, setNextActionResult] = useState<{
    nextAction: string;
    suggestedPriority: string;
    rationale: string;
    source: string;
  } | null>(null);
  const [dupResult, setDupResult] = useState<{
    likelyDuplicates: Array<{ id: string; title: string; status: string; score: number; href: string }>;
    recommendation: string;
    source: string;
  } | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);

  useEffect(() => {
    if (!it) return;
    setTitle(it.title);
    setDescription(it.description ?? "");
    setCategory(it.category);
    setStatus(it.status);
    setNextAction(it.nextAction ?? "");
    setDueAt(it.dueAt ? it.dueAt.slice(0, 16) : "");
    setSnoozedUntil(it.snoozedUntil ? it.snoozedUntil.slice(0, 16) : "");
    setAssigneeDeveloperId(it.assigneeDeveloperId);
    setProgram(it.program ?? "");
    setEscalated(it.escalated);
  }, [it]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description || null,
        category,
        status,
        nextAction: nextAction || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        snoozedUntil: snoozedUntil ? new Date(snoozedUntil).toISOString() : null,
        assigneeDeveloperId,
        program: program.trim() || null,
        escalated,
      };
      const graphAccess =
        it?.sourceType === "microsoft_todo" ? await acquireGraphToken() : null;
      const res = graphAccess
        ? await requestWithGraph(`/api/triage-items/${id}`, graphAccess, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await request(`/api/triage-items/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "save_failed");
      }
      return (await res.json()) as TriageItemDto;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["triage-item", id] });
      await qc.invalidateQueries({ queryKey: ["triage-items"] });
      await qc.invalidateQueries({ queryKey: ["triage-summary"] });
    },
  });

  const deleteAttMut = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await request(`/api/triage-attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["triage-item", id] });
      await qc.invalidateQueries({ queryKey: ["triage-items"] });
    },
  });

  const uploadPending = useMutation({
    mutationFn: async (file: File) => {
      const res = await uploadTriageAttachment(id, file);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "upload_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["triage-item", id] });
      await qc.invalidateQueries({ queryKey: ["triage-items"] });
    },
  });

  const summarizeMut = useMutation({
    mutationFn: async () => {
      setAssistError(null);
      const res = await request("/api/assist/triage-summarize", {
        method: "POST",
        body: JSON.stringify({ triageItemId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return data as { summary: string; bullets: string[]; source: string };
    },
    onSuccess: (data) => setSummaryResult(data),
    onError: (err) => setAssistError(err instanceof Error ? err.message : "assist_failed"),
  });

  const nextActionMut = useMutation({
    mutationFn: async () => {
      setAssistError(null);
      const res = await request("/api/assist/triage-next-action", {
        method: "POST",
        body: JSON.stringify({ triageItemId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return data as {
        nextAction: string;
        suggestedPriority: string;
        rationale: string;
        source: string;
      };
    },
    onSuccess: (data) => setNextActionResult(data),
    onError: (err) => setAssistError(err instanceof Error ? err.message : "assist_failed"),
  });

  const dupMut = useMutation({
    mutationFn: async () => {
      setAssistError(null);
      const res = await request("/api/assist/triage-duplicates", {
        method: "POST",
        body: JSON.stringify({ triageItemId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "assist_failed");
      return data as {
        likelyDuplicates: Array<{
          id: string;
          title: string;
          status: string;
          score: number;
          href: string;
        }>;
        recommendation: string;
        source: string;
      };
    },
    onSuccess: (data) => setDupResult(data),
    onError: (err) => setAssistError(err instanceof Error ? err.message : "assist_failed"),
  });

  const queueCancelDupMut = useMutation({
    mutationFn: async (duplicateId: string) => {
      const res = await request("/api/assist/proposals", {
        method: "POST",
        body: JSON.stringify({
          kind: "triage_cancel_duplicate",
          title: `Cancel duplicate triage`,
          summary: `Cancel ${duplicateId} as duplicate of ${id}`,
          payload: {
            triageItemId: duplicateId,
            note: `Cancelled as duplicate of ${id}`,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "proposal_failed");
      return data;
    },
  });

  if (itemQuery.isLoading) {
    return <TriageDetailPageSkeleton />;
  }
  if (itemQuery.isError || !it) {
    return (
      <div className="app-page">
        <div className="card">
          <p role="alert" style={{ margin: 0 }}>
            Could not load this item.
          </p>
        </div>
      </div>
    );
  }

  const developers = developersQuery.data?.developers ?? [];
  const attachments = it.attachments ?? [];
  const lastTodo =
    it.lastTodoSyncedAt &&
    (() => {
      try {
        return new Date(it.lastTodoSyncedAt).toLocaleString();
      } catch {
        return it.lastTodoSyncedAt;
      }
    })();

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Triage"
        title={title}
        lead="Update status, owner, and dates. Add files (screenshots, PDFs, voice notes) for context."
      />
      <AiAssistPanel
        lead="Summarize the item, propose a next action, or check for likely duplicates."
        error={assistError}
        actions={[
          {
            label: "Summarize",
            loading: summarizeMut.isPending,
            onSuggest: () => {
              setNextActionResult(null);
              setDupResult(null);
              summarizeMut.mutate();
            },
          },
          {
            label: "Suggest next action",
            loading: nextActionMut.isPending,
            onSuggest: () => {
              setSummaryResult(null);
              setDupResult(null);
              nextActionMut.mutate();
            },
          },
          {
            label: "Find duplicates",
            loading: dupMut.isPending,
            onSuggest: () => {
              setSummaryResult(null);
              setNextActionResult(null);
              dupMut.mutate();
            },
          },
        ]}
        source={dupResult?.source ?? nextActionResult?.source ?? summaryResult?.source ?? null}
        suggestion={
          dupResult ? (
            <>
              <Text size="sm">{dupResult.recommendation}</Text>
              <List size="sm">
                {dupResult.likelyDuplicates.map((d) => (
                  <List.Item key={d.id}>
                    <a href={d.href}>{d.title}</a> · {d.status} · score {d.score}{" "}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8rem" }}
                      disabled={queueCancelDupMut.isPending}
                      onClick={() => queueCancelDupMut.mutate(d.id)}
                    >
                      Queue cancel
                    </button>
                  </List.Item>
                ))}
              </List>
              {queueCancelDupMut.isSuccess ? (
                <Text size="xs" c="dimmed">
                  Cancel proposal queued — approve on AI review queue.
                </Text>
              ) : null}
            </>
          ) : nextActionResult ? (
            <>
              <Text size="sm" fw={600}>
                {nextActionResult.nextAction}
              </Text>
              <Text size="sm">
                Suggested priority: <strong>{nextActionResult.suggestedPriority}</strong>
              </Text>
              <Text size="sm" c="dimmed">
                {nextActionResult.rationale}
              </Text>
            </>
          ) : summaryResult ? (
            <>
              <Text size="sm">{summaryResult.summary}</Text>
              <List size="sm">
                {summaryResult.bullets.map((b) => (
                  <List.Item key={b}>{b}</List.Item>
                ))}
              </List>
            </>
          ) : null
        }
        onAccept={
          nextActionResult && !dupResult
            ? () => {
                setNextAction(nextActionResult.nextAction);
                setNextActionResult(null);
              }
            : undefined
        }
        acceptLabel="Apply to next action field"
      />
      <div className="card">
        {it.sourceType === "outlook" && it.graphWebLink && (
          <p style={{ marginTop: 0, marginBottom: "1rem" }}>
            <a href={it.graphWebLink} target="_blank" rel="noreferrer" className="link-out">
              Open in Outlook
            </a>
          </p>
        )}
        {it.sourceType === "microsoft_todo" && it.graphWebLink && (
          <p style={{ marginTop: 0, marginBottom: "0.35rem" }}>
            <a href={it.graphWebLink} target="_blank" rel="noreferrer" className="link-out">
              Open in Microsoft To Do
            </a>
          </p>
        )}
        {it.sourceType === "clickup" && it.graphWebLink && (
          <p style={{ marginTop: 0, marginBottom: "0.35rem" }}>
            <a href={it.graphWebLink} target="_blank" rel="noreferrer" className="link-out">
              Open in ClickUp
            </a>
          </p>
        )}
        {(it.externalWorkItems?.length ?? 0) > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>External tasks</p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {it.externalWorkItems!.map((ew) => (
                <li key={ew.id}>
                  <span className="muted">
                    {ew.provider === "clickup" ? "ClickUp" : "To Do"}
                  </span>
                  {": "}
                  {ew.externalUrl ? (
                    <a href={ew.externalUrl} target="_blank" rel="noreferrer" className="link-out">
                      {ew.title}
                    </a>
                  ) : (
                    ew.title
                  )}
                  {ew.externalStatus ? ` · ${ew.externalStatus}` : ""}
                </li>
              ))}
            </ul>
            {it.sourceType === "clickup" && (
              <div className="form-actions" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    void request(`/api/triage-items/${it.id}/clickup/sync`, {
                      method: "POST",
                    }).then((res) => {
                      if (res.ok) void qc.invalidateQueries({ queryKey: ["triage-item", id] });
                    });
                  }}
                >
                  Refresh from ClickUp
                </button>
              </div>
            )}
          </div>
        )}
        {(() => {
          const cu = it.externalWorkItems?.find((e) => e.provider === "clickup")?.clickUp;
          if (!cu) return null;
          return (
            <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>ClickUp details</p>
              {(cu.listName || cu.folderName) && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {[cu.folderName, cu.listName].filter(Boolean).join(" / ")}
                </p>
              )}
              {cu.assignees.length > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Assignees ({cu.assignees.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cu.assignees.map((a) => (
                      <span key={a.id} className="pill pill--status" data-status="inbox">
                        {a.username || a.email || a.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {cu.watchers.length > 0 && (
                <p className="muted" style={{ fontSize: "0.9rem" }}>
                  Watchers:{" "}
                  {cu.watchers
                    .map((w) => w.username || w.email || w.id)
                    .slice(0, 8)
                    .join(", ")}
                  {cu.watchers.length > 8 ? ` +${cu.watchers.length - 8}` : ""}
                </p>
              )}
              {cu.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "0.75rem" }}>
                  {cu.tags.map((t) => (
                    <span key={t} className="pill pill--cat" data-category="other">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {cu.customFields.length > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Custom fields
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {cu.customFields.slice(0, 12).map((f) => (
                      <li key={f.id}>
                        <span className="muted">{f.name}:</span> {f.valueText}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(cu.timeEstimateMs || cu.timeSpentMs || cu.points != null) && (
                <p className="muted" style={{ fontSize: "0.9rem" }}>
                  {cu.points != null ? `Points ${cu.points}` : null}
                  {cu.timeEstimateMs
                    ? `${cu.points != null ? " · " : ""}Estimate ${(cu.timeEstimateMs / 3_600_000).toFixed(1)}h`
                    : null}
                  {cu.timeSpentMs
                    ? ` · Spent ${(cu.timeSpentMs / 3_600_000).toFixed(1)}h`
                    : null}
                </p>
              )}
              {cu.comments.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 6 }}>
                    Activity / comments ({cu.comments.length}
                    {cu.commentsFetchedAt
                      ? ` · fetched ${cu.commentsFetchedAt.slice(0, 16).replace("T", " ")}`
                      : ""}
                    )
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", maxHeight: 280, overflow: "auto" }}>
                    {cu.comments.map((c) => (
                      <li key={c.id} style={{ marginBottom: 8 }}>
                        <div>
                          <strong>{c.author ?? "Unknown"}</strong>
                          {c.date ? (
                            <span className="muted"> · {c.date.slice(0, 16).replace("T", " ")}</span>
                          ) : null}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{c.text || "(empty)"}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
        {it.sourceType === "microsoft_todo" && lastTodo && (
          <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
            Last pulled from To Do: {lastTodo}
          </p>
        )}
        <div className="card__head">
          <h2 className="card__title">Edit fields</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="desc">Description</label>
            <textarea
              id="desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cat">Category</label>
            <select
              id="cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as TriageCategory)}
            >
              <option value="blocker">blocker</option>
              <option value="risk">risk</option>
              <option value="quality">quality</option>
              <option value="process">process</option>
              <option value="other">other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="st">Status</label>
            <select
              id="st"
              value={status}
              onChange={(e) => setStatus(e.target.value as TriageStatus)}
            >
              <option value="inbox">inbox</option>
              <option value="in_progress">in_progress</option>
              <option value="snoozed">snoozed</option>
              <option value="done">done</option>
              <option value="dropped">dropped</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="na">Next action</label>
            <input
              id="na"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="due">Due</label>
            <input
              id="due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="snz">Snoozed until</label>
            <input
              id="snz"
              type="datetime-local"
              value={snoozedUntil}
              onChange={(e) => setSnoozedUntil(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="as">Helm primary assignee</label>
            <select
              id="as"
              value={assigneeDeveloperId}
              onChange={(e) => setAssigneeDeveloperId(e.target.value)}
            >
              {developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </select>
            {(it.clickUpAssignees?.length ?? 0) > 1 && (
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                ClickUp has {it.clickUpAssignees!.length} assignees — Helm keeps one primary owner
                for triage ownership; all names are shown above under ClickUp details.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="program">Program / client (optional)</label>
            <input
              id="program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            />
          </div>
          <div className="field field--row">
            <input
              id="escalated"
              type="checkbox"
              checked={escalated}
              onChange={(e) => setEscalated(e.target.checked)}
            />
            <label htmlFor="escalated" style={{ margin: 0, fontWeight: 600 }}>
              Escalate to priority queue
            </label>
          </div>
          {it.sourceType === "microsoft_todo" && (
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Changing status updates Microsoft To Do when you are signed in to Microsoft 365 in this
              browser. Without a session, triage is saved and you can re-import from the To Do app page
              to align tasks.
            </p>
          )}
          {saveMut.isError && <p role="alert">{(saveMut.error as Error).message}</p>}
          {saveMut.isSuccess && <p className="hint-ok">Saved.</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Attachments</h2>
        </div>
        {attachments.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            No files yet.
          </p>
        )}
        <ul className="attach-list">
          {attachments.map((a) => (
            <li key={a.id} className="attach-list__row">
              <span style={{ fontWeight: 600 }}>{a.originalName}</span>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {a.mimeType} · {formatSize(a.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await apiDownload(
                      `/api/triage-attachments/${a.id}/file`,
                      a.originalName,
                    );
                  } catch {
                    window.alert("Download failed");
                  }
                }}
              >
                Download
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={deleteAttMut.isPending}
                onClick={() => {
                  if (window.confirm("Remove this attachment?")) {
                    deleteAttMut.mutate(a.id);
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="add-file">Add files</label>
          <input
            id="add-file"
            type="file"
            multiple
            disabled={uploadPending.isPending}
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              for (const f of list) {
                try {
                  await uploadPending.mutateAsync(f);
                } catch {
                  window.alert(`Failed to upload: ${f.name}`);
                }
              }
            }}
          />
          {uploadPending.isPending && <p className="muted">Uploading…</p>}
          {uploadPending.isError && (
            <p role="alert">{(uploadPending.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TriageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const m365 = useM365AppRegistration();

  if (!id) {
    return (
      <div className="app-page">
        <p role="alert">Missing item id.</p>
      </div>
    );
  }

  if (m365.isLoading) {
    return <TriageDetailPageSkeleton />;
  }

  const reg = m365.data;
  if (reg && isM365Configured(reg.tenantId, reg.clientId)) {
    return (
      <MsalProvider instance={getM365Pca(reg.tenantId, reg.clientId)}>
        <MsalInitializer />
        <TriageGraphShell id={id} />
      </MsalProvider>
    );
  }

  return <TriageDetailInner id={id} acquireGraphToken={async () => null} />;
}
