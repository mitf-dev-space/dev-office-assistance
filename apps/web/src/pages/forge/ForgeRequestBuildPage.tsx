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
  const [ios, setIos] = useState(false);
  const [publishToSharedFolder, setPublishToSharedFolder] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");

  const selectedApp = useMemo(
    () => catalogQuery.data?.applications.find((a) => a.id === applicationId) ?? null,
    [catalogQuery.data?.applications, applicationId],
  );

  const platforms = useMemo(() => {
    const list: Array<"Android" | "iOS"> = [];
    if (android && selectedApp?.androidEnabled !== false) list.push("Android");
    if (ios && selectedApp?.iosEnabled) list.push("iOS");
    return list;
  }, [android, ios, selectedApp?.androidEnabled, selectedApp?.iosEnabled]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!applicationId || !profileId) throw new Error("missing_selection");
      if (platforms.length === 0) throw new Error("select_platform");
      const res = await request("/api/forge/build-requests", {
        method: "POST",
        body: JSON.stringify({
          applicationId,
          buildProfileId: profileId,
          gitReferenceType: "branch",
          gitReference: gitReference.trim(),
          requestNote: requestNote.trim() || undefined,
          platforms,
          publishToSharedFolder,
          notifyEmail: publishToSharedFolder ? notifyEmail.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "create_failed");
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
        lead="Select application, profile, and Git branch. Optionally publish the artifact to the bank/app shared folder and notify a PM by email."
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
              setIos(false);
              const app = catalogQuery.data?.applications.find((a) => a.id === v);
              if (app?.defaultBranch) setGitReference(app.defaultBranch);
              if (app && !app.androidEnabled) setAndroid(false);
              else setAndroid(true);
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
              disabled={selectedApp != null && !selectedApp.androidEnabled}
              onChange={(e) => setAndroid(e.target.checked)}
            />
            Build Android
          </label>
        </div>

        <div className="field field--row">
          <label htmlFor="forge-ios">
            <input
              id="forge-ios"
              type="checkbox"
              checked={ios}
              disabled={!selectedApp?.iosEnabled}
              onChange={(e) => setIos(e.target.checked)}
            />
            Build iOS
            {!selectedApp?.iosEnabled ? (
              <span className="muted"> (enable iOS on the application first)</span>
            ) : null}
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

        <div className="field field--row">
          <label htmlFor="forge-publish">
            <input
              id="forge-publish"
              type="checkbox"
              checked={publishToSharedFolder}
              onChange={(e) => setPublishToSharedFolder(e.target.checked)}
            />
            Publish to shared folder (copy artifact for PM)
          </label>
        </div>

        {publishToSharedFolder ? (
          <>
            <div className="field">
              <label htmlFor="forge-pm-email">PM notify email</label>
              <input
                id="forge-pm-email"
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="pm@example.com"
                required
              />
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                On success, email this address and mobile leads with the shared folder path (no Helm login for the PM).
              </p>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Delivery path:{" "}
              <code>{selectedApp?.resolvedSharedDeliveryPath ?? "not configured — set on bank/app in Forge settings"}</code>
            </p>
          </>
        ) : null}

        {createMut.isError && (
          <p className="dashboard-error" role="alert">
            {createMut.error instanceof Error ? createMut.error.message : "Build request failed."}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              !applicationId ||
              !profileId ||
              platforms.length === 0 ||
              createMut.isPending ||
              (publishToSharedFolder && !notifyEmail.trim())
            }
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Submitting…" : "Submit build request"}
          </button>
        </div>
      </section>
    </AppPage>
  );
}
