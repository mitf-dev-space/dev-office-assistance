import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageMeta, TeamDecisionDto } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { FormModal } from "../components/modals/FormModal";
import { ListQueryBar, TablePagination } from "../components/ui/ListQueryBar";
import { useListQueryState } from "../hooks/useListQueryState";
import { buildListQuery, pickPageMeta } from "../lib/listQuery";

function DecisionModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing: TeamDecisionDto | null;
}) {
  const { request } = useApi();
  const qc = useQueryClient();
  const uid = useId();
  const f = `decision-${uid}`;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [decidedOn, setDecidedOn] = useState("");
  const [relatedTriageId, setRelatedTriageId] = useState("");
  const [relatedPlanningId, setRelatedPlanningId] = useState("");

  useEffect(() => {
    if (!opened) return;
    if (editing) {
      setTitle(editing.title);
      setBody(editing.body);
      setDecidedOn(editing.decidedOn);
      setRelatedTriageId(editing.relatedTriageItemId ?? "");
      setRelatedPlanningId(editing.relatedPlanningItemId ?? "");
    } else {
      setTitle("");
      setBody("");
      setDecidedOn(new Date().toISOString().slice(0, 10));
      setRelatedTriageId("");
      setRelatedPlanningId("");
    }
  }, [opened, editing]);

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          decidedOn: decidedOn,
          relatedTriageItemId: relatedTriageId.trim() || null,
          relatedPlanningItemId: relatedPlanningId.trim() || null,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "create_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["decisions"] });
      onClose();
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("no_edit");
      const res = await request(`/api/decisions/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          decidedOn: decidedOn,
          relatedTriageItemId: relatedTriageId.trim() || null,
          relatedPlanningItemId: relatedPlanningId.trim() || null,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "save_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["decisions"] });
      onClose();
    },
  });

  const delMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("no_edit");
      const res = await request(`/api/decisions/${editing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["decisions"] });
      onClose();
    },
  });

  const busy = createMut.isPending || saveMut.isPending || delMut.isPending;
  const isEdit = Boolean(editing);

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Edit decision" : "Log decision"}
      size="lg"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isEdit) {
            saveMut.mutate();
          } else {
            createMut.mutate();
          }
        }}
      >
        <div className="field">
          <label htmlFor={`${f}-t`}>Title</label>
          <input
            id={`${f}-t`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor={`${f}-b`}>Details</label>
          <textarea
            id={`${f}-b`}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            disabled={busy}
          />
        </div>
        <div className="toolbar" style={{ alignItems: "flex-end" }}>
          <div>
            <label htmlFor={`${f}-d`}>Decided on</label>
            <input
              id={`${f}-d`}
              type="date"
              value={decidedOn}
              onChange={(e) => setDecidedOn(e.target.value)}
              required
              disabled={busy}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${f}-tr`}>Related triage id (optional)</label>
          <input
            id={`${f}-tr`}
            value={relatedTriageId}
            onChange={(e) => setRelatedTriageId(e.target.value)}
            placeholder="UUID from triage"
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor={`${f}-pl`}>Related planning id (optional)</label>
          <input
            id={`${f}-pl`}
            value={relatedPlanningId}
            onChange={(e) => setRelatedPlanningId(e.target.value)}
            placeholder="UUID from planning"
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy}>
            {isEdit ? (saveMut.isPending ? "Saving…" : "Save") : createMut.isPending ? "Logging…" : "Log decision"}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {isEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this decision?")) {
                  delMut.mutate();
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </FormModal>
  );
}

export function DecisionsPage() {
  const { request } = useApi();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamDecisionDto | null>(null);
  const { page, setPage, limit, setLimit, searchInput, search, onSearchChange } =
    useListQueryState(25);

  const listUrl = useMemo(
    () => `/api/decisions?${buildListQuery({ page, limit, q: search })}`,
    [page, limit, search],
  );

  const list = useQuery({
    queryKey: ["decisions", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { decisions: TeamDecisionDto[] } & PageMeta;
    },
  });

  const pageMeta = pickPageMeta(list.data);

  return (
    <div className="app-page app-page--decisions" id="decisions-top">
      <PageHeader
        eyebrow="Ops"
        title="Decisions & notes"
        lead="A lightweight log of what you decided, with optional links to triage or planning when it helps the story stay traceable."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Log decision
          </button>
        }
      />

      <ListQueryBar
        search={searchInput}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search title, body, author…"
      />

      {list.isLoading && <p className="muted">Loading…</p>}
      {list.isError && <p role="alert">Could not load decisions.</p>}

      {list.data && (
        <ul className="decisions-timeline" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.data.decisions.map((d) => (
            <li
              key={d.id}
              id={d.id}
              className="decision-tile"
              style={{
                marginBottom: "1rem",
                padding: "1rem 1.25rem",
                borderRadius: 12,
                border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
                background: "var(--color-surface, #fff)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.5rem" }}>
                <div>
                  <h2
                    className="decision-tile__title"
                    style={{ fontSize: "1.05rem", margin: 0, fontWeight: 700 }}
                  >
                    {d.title}
                  </h2>
                  <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                    Decided {d.decidedOn} · {d.createdByDisplay ?? d.createdById}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(d);
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
              </div>
              <p className="decision-tile__body" style={{ margin: "0.75rem 0 0", whiteSpace: "pre-wrap" }}>
                {d.body}
              </p>
              <div className="decision-tile__links" style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
                {d.relatedTriageItemId && (
                  <p style={{ margin: 0 }}>
                    Triage:{" "}
                    <Link to={`/triage/${d.relatedTriageItemId}`}>
                      {d.relatedTriageTitle ?? d.relatedTriageItemId}
                    </Link>
                  </p>
                )}
                {d.relatedPlanningItemId && (
                  <p style={{ margin: "0.25rem 0 0" }}>
                    Planning:{" "}
                    <Link
                      to={{
                        pathname: "/planning",
                        search: new URLSearchParams({ edit: d.relatedPlanningItemId! }).toString(),
                      }}
                    >
                      {d.relatedPlanningTitle ?? d.relatedPlanningItemId}
                    </Link>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.data && list.data.decisions.length === 0 && !list.isLoading && (
        <div className="empty-state" role="status">
          <strong>No decisions yet</strong>
          When you need a durable record, log it here and optionally link a triage or planning item.
        </div>
      )}

      <TablePagination
        page={pageMeta.page}
        totalPages={pageMeta.totalPages}
        total={pageMeta.total}
        limit={pageMeta.limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      <DecisionModal
        opened={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}
