import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IncidentDto } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";

export function IncidentCreatePage() {
  const { request, uploadIncidentAttachment } = useApi();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterDeveloperId, setReporterDeveloperId] = useState("");
  const [involvedIds, setInvolvedIds] = useState<string[]>([]);
  const [incidentAt, setIncidentAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await request("/api/incidents", {
        method: "POST",
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
        throw new Error(body || "create_failed");
      }
      return (await res.json()) as IncidentDto;
    },
    onSuccess: async (data) => {
      const failed: string[] = [];
      for (const f of files) {
        const up = await uploadIncidentAttachment(data.id, f);
        if (!up.ok) failed.push(f.name);
      }
      if (failed.length) {
        window.alert(
          `Incident saved. These files could not be uploaded (try again on the incident page): ${failed.join(
            ", ",
          )}`,
        );
      }
      await qc.invalidateQueries({ queryKey: ["incidents"] });
      await qc.invalidateQueries({ queryKey: ["incident", data.id] });
      navigate(`/incidents/${data.id}`);
    },
  });

  const developers = developersQuery.data?.developers ?? [];

  const toggleInvolved = (id: string) => {
    setInvolvedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Incidents"
        title="New incident"
        lead="Record a workplace incident. Choose the reporting employee, the employees involved, and attach supporting files (images, PDFs, Word documents)."
      />
      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Details</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
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
              {developers.length === 0 && (
                <p className="muted" style={{ margin: 0 }}>
                  No employees available.
                </p>
              )}
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
          <div className="field">
            <label htmlFor="files">Attachments (optional)</label>
            <input
              id="files"
              type="file"
              multiple
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                {files.length} file(s) selected: {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
          {createMut.isError && <p role="alert">{(createMut.error as Error).message}</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={createMut.isPending}>
              {createMut.isPending ? "Saving…" : "Save incident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
