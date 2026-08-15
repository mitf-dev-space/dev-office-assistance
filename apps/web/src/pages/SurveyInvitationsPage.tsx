import { useParams } from "react-router-dom";
import { Table } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { SurveyInvitationDto } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { DataTableSkeleton } from "../components/skeletons/AppSkeletons";
import { AppDataTable } from "../components/ui/AppDataTable";

function votingUrl(token: string): string {
  const base = window.location.origin;
  return `${base}/survey/respond/${token}`;
}

type InvitationLinkRow = {
  id: string;
  developerId: string;
  developerName: string;
  workEmail: string | null;
  used: boolean;
  /** Raw token. Fresh per fetch; invalidates any previous token for that employee. */
  url: string | null;
};

export function SurveyInvitationsPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useApi();

  const linksQuery = useQuery({
    queryKey: ["survey-invitation-links", id],
    queryFn: async () => {
      const res = await request(`/api/surveys/${id}/invitations/links`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { links: InvitationLinkRow[] };
    },
    enabled: Boolean(id),
  });

  // Fall back to the plain invitation list if the links endpoint is unavailable.
  const invitationsQuery = useQuery({
    queryKey: ["survey-invitations", id],
    queryFn: async () => {
      const res = await request(`/api/surveys/${id}/invitations`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as { invitations: SurveyInvitationDto[] };
    },
    enabled: Boolean(id),
  });

  const links = linksQuery.data?.links;
  const invitations = invitationsQuery.data?.invitations ?? [];

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(votingUrl(url));
    window.alert(`Invitation link copied to clipboard:\n\n${votingUrl(url)}`);
  };

  const rows = links ?? invitations.map((inv) => ({
    id: inv.id,
    developerName: inv.developerName,
    workEmail: inv.workEmail,
    used: inv.used,
    developerId: inv.developerId,
    url: null,
  }));

  const downloadCsv = async () => {
    const csvRows = rows.map((r) => ({
      name: r.developerName,
      email: r.workEmail ?? "",
      used: r.used ? "used" : "unused",
      url: r.url ? votingUrl(r.url) : "",
    }));
    const header = "name,email,status,url";
    const lines = csvRows.map((r) =>
      [r.name, r.email, r.used, r.url].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `survey-invitations-${id}.csv`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  };

  const copyAll = async () => {
    const lines = rows.map((r) => `${r.developerName}\t${r.url ? votingUrl(r.url) : "(used/no link)"}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    window.alert("Copied all invitation links to clipboard.");
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Surveys"
        title="Manage invitations"
        lead="Each eligible employee has one private, single-use voting link. Links are regenerated fresh here — generating a new link invalidates the previous one for that employee."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={downloadCsv}>
              Download invitation CSV
            </button>
            <button type="button" className="btn btn-ghost" onClick={copyAll}>
              Copy all links
            </button>
          </>
        }
      />

      <section className="card" aria-label="Invitations">
        {(linksQuery.isLoading || invitationsQuery.isLoading) && (
          <DataTableSkeleton
            embedded
            columns={4}
            columnLabels={["Employee", "Status", "Invitation link", "Actions"]}
            tableLabel="Loading invitations"
          />
        )}
        {linksQuery.isError && invitationsQuery.isError && (
          <p role="alert">Could not load invitations.</p>
        )}
        {!linksQuery.isLoading && !invitationsQuery.isLoading && (
          <AppDataTable embedded aria-label="Invitations">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Employee</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Invitation link</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    {row.developerName}
                    {row.workEmail ? (
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {row.workEmail}
                      </div>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <span className={`badge ${row.used ? "badge--closed" : "badge--published"}`}>
                      {row.used ? "Used" : "Unused"}
                    </span>
                  </Table.Td>
                  <Table.Td>
                    {row.url ? (
                      <code className="survey-invite-code">{votingUrl(row.url)}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {row.url ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyLink(row.url!)}
                      >
                        Copy link
                      </button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AppDataTable>
        )}
        {invitations.length === 0 && !linksQuery.isLoading && !invitationsQuery.isLoading && (
          <p className="muted" style={{ padding: "1rem" }}>
            No invitations yet. Publish the survey to generate invitations.
          </p>
        )}
      </section>
    </div>
  );
}
