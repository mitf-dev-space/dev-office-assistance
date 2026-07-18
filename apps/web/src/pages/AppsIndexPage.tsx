import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canAccessForge } from "../lib/forge/roles";
import { PageHeader } from "../components/PageHeader";

/**
 * Hub for third-party / Microsoft 365 app integrations. Add new entries here and in AppLayout.
 */
export function AppsIndexPage() {
  const { user } = useAuth();
  const isLead = user?.role === "lead";
  const showForge = user ? canAccessForge(user.role) : false;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Workspace"
        title="Apps"
        lead="Connect optional Microsoft 365 and other services. Core workflows do not require these."
      />
      <p className="muted" style={{ fontSize: "0.9rem", marginTop: 0, marginBottom: "1rem" }}>
        {isLead ? (
          <>
            Set Microsoft Entra <strong>tenant</strong> and <strong>client</strong> IDs in{" "}
            <Link to="/apps/registration" style={{ fontWeight: 600 }}>
              App registration
            </Link>{" "}
            (or configure <code>M365_TENANT_ID</code> / <code>M365_CLIENT_ID</code> on the API
            server).
          </>
        ) : (
          <>
            A team <strong>lead</strong> manages Microsoft app IDs under App registration. If you
            have access, open{" "}
            <Link to="/apps/registration" style={{ fontWeight: 600 }}>
              App registration
            </Link>
            .
          </>
        )}
      </p>
      <ul className="card" style={{ listStyle: "none", margin: 0, padding: "1rem 1.25rem" }}>
        <li
          style={{
            borderBottom: "1px solid var(--color-border)",
            padding: "0.75rem 0",
          }}
        >
          <Link to="/apps/ai" style={{ fontWeight: 600 }}>
            Workspace AI
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Configure LM Studio or OpenRouter for assist buttons and background insights.
          </p>
        </li>
        <li
          style={{
            borderBottom: "1px solid var(--color-border)",
            padding: "0.75rem 0",
          }}
        >
          <Link to="/apps/ai/chat" style={{ fontWeight: 600 }}>
            Ask Helm
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Natural-language questions over triage, briefs, blockers, planning, and catalog gaps.
          </p>
        </li>
        <li
          style={{
            borderBottom: "1px solid var(--color-border)",
            padding: "0.75rem 0",
          }}
        >
          <Link to="/apps/ai/review" style={{ fontWeight: 600 }}>
            AI review queue
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Approve or reject staged AI write proposals before they apply.
          </p>
        </li>
        {showForge && (
          <li
            style={{
              borderBottom: "1px solid var(--color-border)",
              padding: "0.75rem 0",
            }}
          >
            <Link to="/forge" style={{ fontWeight: 600 }}>
              Forge · mobile builds
            </Link>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              Request demo Flutter APK builds from approved Git branches and profiles.
            </p>
          </li>
        )}
        <li style={{ borderBottom: "1px solid var(--color-border)", padding: "0.75rem 0" }}>
          <Link to="/apps/outlook" style={{ fontWeight: 600 }}>
            Outlook
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Import messages from a mailbox folder into triage.
          </p>
        </li>
        <li style={{ borderBottom: "1px solid var(--color-border)", padding: "0.75rem 0" }}>
          <Link to="/apps/todo" style={{ fontWeight: 600 }}>
            Microsoft To Do
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Read tasks from your Microsoft To Do lists (Microsoft Graph).
          </p>
        </li>
        <li style={{ padding: "0.75rem 0 0" }}>
          <Link to="/apps/clickup" style={{ fontWeight: 600 }}>
            ClickUp
          </Link>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            Connect spaces and lists; import and sync tasks into Triage (shared ExternalWorkItem table).
          </p>
        </li>
      </ul>
    </div>
  );
}
