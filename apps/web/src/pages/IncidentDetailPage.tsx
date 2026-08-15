import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IncidentDto } from "@office/types";
import { apiDownload, apiViewInNewTab } from "../apiClient";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { EditPageFormSkeleton } from "../components/skeletons/AppSkeletons";
import { formatIncidentDate, formatSize } from "../lib/incidentFormat";

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request, uploadIncidentAttachment } = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const incidentQuery = useQuery({
    queryKey: ["incident", id],
    queryFn: async () => {
      const res = await request(`/api/incidents/${id}`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as IncidentDto;
    },
    enabled: Boolean(id),
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

  const inc = incidentQuery.data;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterDeveloperId, setReporterDeveloperId] = useState("");
  const [involvedIds, setInvolvedIds] = useState<string[]>([]);
  const [incidentAt, setIncidentAt] = useState("");

  useEffect(() => {
    if (!inc) return;
    setTitle(inc.title);
    setDescription(inc.description);
    setReporterDeveloperId(inc.reporterDeveloperId);
    setInvolvedIds(inc.involved.map((i) => i.id));
    setIncidentAt(inc.incidentAt.slice(0, 16));
  }, [inc]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description,
          reporterDeveloperId,
          involvedDeveloperIds: involvedIds,
          incidentAt: new Date(incidentAt).toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "save_failed");
      }
      return (await res.json()) as IncidentDto;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["incident", id] });
      await qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/incidents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["incidents"] });
      navigate("/incidents");
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const res = await uploadIncidentAttachment(id!, file);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "upload_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["incident", id] });
      await qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const deleteAttMut = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await request(`/api/incident-attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["incident", id] });
      await qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const pdfMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/incidents/${id}/pdf`);
      if (!res.ok) throw new Error("pdf_failed");
      const blob = await res.blob();
      const filename = `incident-${inc?.incidentNumber ?? "report"}.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    },
  });

  if (incidentQuery.isLoading) {
    return <EditPageFormSkeleton />;
  }
  if (incidentQuery.isError || !inc) {
    return (
      <div className="app-page">
        <div className="card">
          <p role="alert" style={{ margin: 0 }}>
            Could not load this incident.
          </p>
        </div>
      </div>
    );
  }

  const developers = developersQuery.data?.developers ?? [];
  const attachments = inc.attachments ?? [];

  const toggleInvolved = (devId: string) => {
    setInvolvedIds((prev) =>
      prev.includes(devId) ? prev.filter((x) => x !== devId) : [...prev, devId],
    );
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Incidents"
        title={`${inc.incidentNumber} · ${title}`}
        lead="View and edit incident details, manage attachments, and export a printable PDF report."
        actions={
          <button
            type="button"
            className="primary"
            disabled={pdfMut.isPending}
            onClick={() => pdfMut.mutate()}
          >
            {pdfMut.isPending ? "Generating…" : "Export as PDF"}
          </button>
        }
      />

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Details</h2>
        </div>
        <dl className="incident-meta">
          <div>
            <dt>Reference</dt>
            <dd>{inc.incidentNumber}</dd>
          </div>
          <div>
            <dt>Reported by</dt>
            <dd>{inc.reporterName ?? "—"}</dd>
          </div>
          <div>
            <dt>Incident date &amp; time</dt>
            <dd>{formatIncidentDate(inc.incidentAt)}</dd>
          </div>
          <div>
            <dt>Record created</dt>
            <dd>{formatIncidentDate(inc.createdAt)}</dd>
          </div>
          <div>
            <dt>Employees involved</dt>
            <dd>
              {inc.involved.length
                ? inc.involved.map((i) => i.displayName).join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
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
            <label htmlFor="desc">Detailed description</label>
            <textarea
              id="desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="reporter">Employee who reported the incident</label>
            <select
              id="reporter"
              value={reporterDeveloperId}
              onChange={(e) => setReporterDeveloperId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select reporter…
              </option>
              {developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Employees involved or responsible</label>
            <div className="incident-involved-list">
              {developers.map((d) => (
                <label key={d.id} className="incident-involved-item">
                  <input
                    type="checkbox"
                    checked={involvedIds.includes(d.id)}
                    onChange={() => toggleInvolved(d.id)}
                  />
                  <span>{d.displayName}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="incidentAt">Date and time of the incident</label>
            <input
              id="incidentAt"
              type="datetime-local"
              value={incidentAt}
              onChange={(e) => setIncidentAt(e.target.value)}
              required
            />
          </div>
          {saveMut.isError && <p role="alert">{(saveMut.error as Error).message}</p>}
          {saveMut.isSuccess && <p className="hint-ok">Saved.</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (window.confirm("Delete this incident? This cannot be undone.")) {
                  deleteMut.mutate();
                }
              }}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
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
                    await apiViewInNewTab(
                      `/api/incident-attachments/${a.id}/file`,
                      a.originalName,
                    );
                  } catch {
                    window.alert("Could not open file.");
                  }
                }}
              >
                Preview
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={async () => {
                  try {
                    await apiDownload(
                      `/api/incident-attachments/${a.id}/file`,
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
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={uploadMut.isPending}
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              for (const f of list) {
                try {
                  await uploadMut.mutateAsync(f);
                } catch {
                  window.alert(`Failed to upload: ${f.name}`);
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
