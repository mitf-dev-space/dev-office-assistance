import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";
import { useApi } from "../../useApi";
import type { ForgeCatalogApplicationDto } from "../../lib/forge/types";

export function ForgeRequestBuildPage() {
  const { request } = useApi();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: ["forge", "catalog"],
    queryFn: async () => {
      const res = await request("/api/forge/catalog");
      if (!res.ok) throw new Error("catalog_failed");
      return (await res.json()) as { applications: ForgeCatalogApplicationDto[] };
    },
  });

  const [applicationId, setApplicationId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [gitReference, setGitReference] = useState("dev");
  const [requestNote, setRequestNote] = useState("");
  const [android, setAndroid] = useState(true);

  const selectedApp = useMemo(
    () => catalogQuery.data?.applications.find((a) => a.id === applicationId) ?? null,
    [catalogQuery.data?.applications, applicationId],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!applicationId || !profileId) throw new Error("missing_selection");
      const res = await request("/api/forge/build-requests", {
        method: "POST",
        body: JSON.stringify({
          applicationId,
          buildProfileId: profileId,
          gitReferenceType: "branch",
          gitReference: gitReference.trim(),
          requestNote: requestNote.trim() || undefined,
          platforms: android ? ["Android"] : [],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "create_failed");
      }
      return (await res.json()) as { buildRequest: { id: string } };
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["forge", "build-requests"] });
      navigate(`/forge/builds/${data.buildRequest.id}`);
    },
  });

  return (
    <AppPage variant="forge">
      <PageHeader
        eyebrow="Forge"
        title="Request build"
        lead="Select application, profile, and Git branch for a demo Android build."
        actions={
          <Link to="/forge/builds" className="btn btn-ghost">
            View builds
          </Link>
        }
      />

      {catalogQuery.isError && (
        <p className="dashboard-error" role="alert">
          Could not load Forge catalog. Ask an admin to register applications and profiles.
        </p>
      )}

      <section className="card form-panel" aria-label="Build request form">
        <div className="field">
          <label htmlFor="forge-app">Application</label>
          <select
            id="forge-app"
            value={applicationId}
            onChange={(e) => {
              const v = e.target.value;
              setApplicationId(v);
              setProfileId("");
              const app = catalogQuery.data?.applications.find((a) => a.id === v);
              if (app?.defaultBranch) setGitReference(app.defaultBranch);
            }}
            required
          >
            <option value="">Select application</option>
            {(catalogQuery.data?.applications ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.bankCode})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="forge-profile">Build profile</label>
          <select
            id="forge-profile"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            disabled={!applicationId}
            required
          >
            <option value="">Select profile</option>
            {(selectedApp?.profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.androidBuildMode})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="forge-branch">Git branch</label>
          <input
            id="forge-branch"
            value={gitReference}
            onChange={(e) => setGitReference(e.target.value)}
            required
          />
        </div>

        <div className="field field--row">
          <label htmlFor="forge-android">
            <input
              id="forge-android"
              type="checkbox"
              checked={android}
              onChange={(e) => setAndroid(e.target.checked)}
            />
            Build Android
          </label>
        </div>

        <div className="field">
          <label htmlFor="forge-note">Note (optional)</label>
          <textarea
            id="forge-note"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            rows={3}
          />
        </div>

        {createMut.isError && (
          <p className="dashboard-error" role="alert">
            Build request failed.
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!applicationId || !profileId || !android || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Submitting…" : "Submit build request"}
          </button>
        </div>
      </section>
    </AppPage>
  );
}
