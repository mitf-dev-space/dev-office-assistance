import { useId, useMemo, useState } from "react";
import { Table } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DevTeam, DeveloperSummaryDto, RosterPosition, TeamMembershipDto } from "@office/types";
import { DEV_TEAMS } from "@office/types";
import { DEV_TEAM_LABELS, DEV_TEAMS_ORDER } from "../constants/teams";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AppDataTable } from "../components/ui/AppDataTable";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { buildListQuery } from "../lib/listQuery";
import {
  TeamAddListSkeleton,
  TeamPanelsSkeleton,
  TeamStatsRowSkeleton,
} from "../components/skeletons/AppSkeletons";

function memberLabel(m: DeveloperSummaryDto) {
  return m.displayName?.trim() || "—";
}

function initials(u: DeveloperSummaryDto) {
  const src = u.displayName.trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase() || "—";
}

function developerSearchText(u: DeveloperSummaryDto) {
  return [
    u.displayName,
    u.jobTitle,
    u.skills,
    u.tenureLabel,
    u.workEmail,
    u.phone,
    u.location,
    u.bio,
    u.skillDetails,
    u.achievements,
  ]
    .map((s) => (s ?? "").toLowerCase())
    .join(" ");
}

function orgBadge(p: RosterPosition) {
  if (p === "department_head") return "Head";
  if (p === "department_assistant") return "Asst";
  return null;
}

function matchesQuery(
  m: TeamMembershipDto,
  q: string,
) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return developerSearchText(m.developer).includes(t);
}

function matchesDeveloperQuery(u: DeveloperSummaryDto, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return developerSearchText(u).includes(t);
}

export function TeamManagementPage() {
  const { request } = useApi();
  const qc = useQueryClient();
  const baseId = useId();

  const [rosterSearch, setRosterSearch] = useState("");
  const rosterQ = useDebouncedValue(rosterSearch);
  const [teamFilter, setTeamFilter] = useState<Record<DevTeam, string>>(() => ({
    backend: "",
    qa: "",
    frontend_web: "",
    frontend_mobile: "",
  }));

  const [addTargetTeam, setAddTargetTeam] = useState<DevTeam>("backend");
  const [addSearch, setAddSearch] = useState("");

  const listUrl = useMemo(
    () => `/api/team-memberships?${buildListQuery({ page: 1, limit: 500, q: rosterQ })}`,
    [rosterQ],
  );

  const listQuery = useQuery({
    queryKey: ["team-memberships", listUrl],
    queryFn: async () => {
      const res = await request(listUrl);
      if (!res.ok) throw new Error("list_failed");
      return (await res.json()) as { memberships: TeamMembershipDto[] };
    },
  });

  const developersQuery = useQuery({
    queryKey: ["developers", "team-picker"],
    queryFn: async () => {
      const res = await request("/api/developers?limit=500");
      if (!res.ok) throw new Error("developers_failed");
      return (await res.json()) as { developers: DeveloperSummaryDto[] };
    },
  });

  const byTeam = useMemo(() => {
    const map: Record<DevTeam, TeamMembershipDto[]> = {
      backend: [],
      qa: [],
      frontend_web: [],
      frontend_mobile: [],
    };
    for (const m of listQuery.data?.memberships ?? []) {
      map[m.team].push(m);
    }
    for (const t of DEV_TEAMS) {
      map[t].sort((a, b) => {
        if (a.isTeamLead !== b.isTeamLead) return a.isTeamLead ? -1 : 1;
        return memberLabel(a.developer).localeCompare(memberLabel(b.developer), undefined, {
          sensitivity: "base",
        });
      });
    }
    return map;
  }, [listQuery.data?.memberships]);

  const totalMemberships = useMemo(
    () => DEV_TEAMS.reduce((acc, t) => acc + byTeam[t].length, 0),
    [byTeam],
  );

  const uniqueOnRoster = useMemo(() => {
    const s = new Set<string>();
    for (const t of DEV_TEAMS) {
      for (const m of byTeam[t]) {
        s.add(m.developerId);
      }
    }
    return s.size;
  }, [byTeam]);

  const addMut = useMutation({
    mutationFn: async ({ developerId, team }: { developerId: string; team: DevTeam }) => {
      const res = await request("/api/team-memberships", {
        method: "POST",
        body: JSON.stringify({ developerId, team }),
      });
      if (!res.ok) {
        const te = await res.text();
        throw new Error(te || "add_failed");
      }
      return (await res.json()) as TeamMembershipDto;
    },
    onSuccess: async () => {
      setAddSearch("");
      await qc.invalidateQueries({ queryKey: ["team-memberships"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });

  const leadMut = useMutation({
    mutationFn: async ({ id, isTeamLead }: { id: string; isTeamLead: boolean }) => {
      const res = await request(`/api/team-memberships/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isTeamLead }),
      });
      if (!res.ok) {
        const te = await res.text();
        throw new Error(te || "lead_update_failed");
      }
      return (await res.json()) as TeamMembershipDto;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-memberships"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (membershipId: string) => {
      const res = await request(`/api/team-memberships/${membershipId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const te = await res.text();
        throw new Error(te || "remove_failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-memberships"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });

  const developers = developersQuery.data?.developers ?? [];

  function developerOptionsForTeam(team: DevTeam) {
    const inTeam = new Set(byTeam[team].map((m) => m.developerId));
    return developers.filter((u) => !inTeam.has(u.id));
  }

  const availableToAdd = useMemo(() => {
    return developerOptionsForTeam(addTargetTeam)
      .filter((u) => matchesDeveloperQuery(u, addSearch))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
      );
  }, [developers, byTeam, addTargetTeam, addSearch]);

  function filteredMembersForTeam(team: DevTeam) {
    const local = teamFilter[team] ?? "";
    return byTeam[team].filter((m) => matchesQuery(m, local));
  }

  return (
    <div className="app-page tm-page">
      <PageHeader
        eyebrow="People"
        title="Team management"
        lead={
          <>
            Large rosters: search the roster, filter per team, and add people with a search — no
            endless dropdowns. Add people in <strong>Dev management</strong> first (roster, not
            sign-in).
          </>
        }
      />

      {listQuery.isError && <p role="alert">Could not load team memberships.</p>}
      {developersQuery.isError && <p role="alert">Could not load roster.</p>}

      <section className="tm-toolbar card" aria-label="Roster search">
        <details className="app-filters-disclosure">
          <summary className="app-filters-disclosure__summary">
            <span className="app-filters-disclosure__summary-left">
              <span className="app-filters-disclosure__summary-title" id={`${baseId}-roster-filters-legend`}>
                Search the roster
              </span>
              {rosterSearch.trim() ? (
                <span
                  className="app-filters-disclosure__summary-badge"
                  aria-label="Search text is active"
                >
                  1 active
                </span>
              ) : null}
            </span>
          </summary>
          <div
            className="app-filters-disclosure__panel"
            role="search"
            aria-label="Roster search"
            aria-labelledby={`${baseId}-roster-filters-legend`}
          >
            <p className="card__sub" style={{ margin: 0 }}>
              Type a name or a skill. Every team list below updates so you can quickly find who sits
              where.
            </p>
            <div className="field" style={{ marginBottom: 0, maxWidth: "28rem" }}>
              <label htmlFor={`${baseId}-roster`}>Find someone</label>
              <input
                id={`${baseId}-roster`}
                type="search"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="e.g. React or Sam"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </details>
      </section>

      {listQuery.isLoading ? (
        <TeamStatsRowSkeleton />
      ) : (
        <div className="tm-stats" role="status" aria-live="polite">
          <div className="tm-stat">
            <span className="tm-stat__n">{uniqueOnRoster}</span>
            <span className="tm-stat__label">People on a team</span>
          </div>
          <div className="tm-stat">
            <span className="tm-stat__n">{totalMemberships}</span>
            <span className="tm-stat__label">Total assignments</span>
          </div>
          {DEV_TEAMS_ORDER.map((t) => (
            <div key={t} className="tm-stat">
              <span className="tm-stat__n">{byTeam[t].length}</span>
              <span className="tm-stat__label">{DEV_TEAM_LABELS[t]}</span>
            </div>
          ))}
        </div>
      )}

      <section className="card tm-add" aria-label="Add to team">
        <div className="card__head">
          <h2 className="card__title">Add to a team</h2>
          <p className="card__sub">
            Pick a team, then search the directory. One tap adds them — you can be on many teams.
          </p>
        </div>
        <div className="tm-segment" role="group" aria-label="Team to add to">
          {DEV_TEAMS_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={addTargetTeam === t ? "tm-segment__btn is-active" : "tm-segment__btn"}
              onClick={() => {
                setAddTargetTeam(t);
                setAddSearch("");
              }}
            >
              {DEV_TEAM_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`${baseId}-addsearch`}>
            {developersQuery.isLoading
              ? "Find in roster"
              : `Find in roster (${availableToAdd.length} can join ${DEV_TEAM_LABELS[addTargetTeam]})`}
          </label>
          <input
            id={`${baseId}-addsearch`}
            type="search"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Name or skills…"
            autoComplete="off"
            disabled={
              developersQuery.isLoading || developerOptionsForTeam(addTargetTeam).length === 0
            }
          />
        </div>
        {developersQuery.isLoading ? (
          <TeamAddListSkeleton />
        ) : developerOptionsForTeam(addTargetTeam).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Everyone is already on {DEV_TEAM_LABELS[addTargetTeam]}. Try another team above.
          </p>
        ) : availableToAdd.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No one matches that search. Clear the box or add people in Dev management.
          </p>
        ) : (
          (() => {
            const searching = addSearch.trim().length > 0;
            const cap = searching ? 80 : 10;
            const listed = availableToAdd.slice(0, cap);
            const hidden = availableToAdd.length - listed.length;
            return (
              <ul className="tm-add__list" aria-label="People you can add">
                {listed.map((u) => (
                  <li key={u.id} className="tm-add__row">
                    <span className="tm-avatar" aria-hidden>
                      {initials(u)}
                    </span>
                    <span className="tm-add__text">
                      <span className="tm-add__name">{memberLabel(u)}</span>
                      <span className="tm-add__email">
                        {(u.jobTitle?.trim() || u.skills?.trim() || " ").trim().slice(0, 100)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={addMut.isPending}
                      onClick={() => addMut.mutate({ developerId: u.id, team: addTargetTeam })}
                    >
                      Add
                    </button>
                  </li>
                ))}
                {!searching && hidden > 0 && (
                  <li className="tm-add__more muted">
                    Type a name or skill to search the full roster — {hidden} more people
                    can join {DEV_TEAM_LABELS[addTargetTeam]}
                  </li>
                )}
                {searching && availableToAdd.length > 80 && (
                  <li className="tm-add__more muted">Showing the first 80 matches — keep typing</li>
                )}
              </ul>
            );
          })()
        )}
        {addMut.isError && <p role="alert">{(addMut.error as Error).message}</p>}
      </section>

      {listQuery.isLoading ? (
        <TeamPanelsSkeleton />
      ) : (
        <div className="tm-panels">
          {DEV_TEAMS_ORDER.map((team) => {
            const members = filteredMembersForTeam(team);
            const total = byTeam[team].length;
            const qLocal = teamFilter[team] ?? "";
            return (
            <section
              key={team}
              className="card tm-panel"
              aria-labelledby={`tm-h-${team}`}
            >
              <div className="tm-panel__head">
                <div>
                  <h2 className="tm-panel__title" id={`tm-h-${team}`}>
                    {DEV_TEAM_LABELS[team]}
                    <span className="tm-panel__count">
                      {members.length}
                      {total !== members.length ? ` / ${total}` : null}
                    </span>
                  </h2>
                </div>
                <div className="tm-panel__filter field" style={{ margin: 0 }}>
                  <label className="sr-only" htmlFor={`${baseId}-t-${team}`}>
                    Filter {DEV_TEAM_LABELS[team]} only
                  </label>
                  <input
                    id={`${baseId}-t-${team}`}
                    type="search"
                    value={qLocal}
                    onChange={(e) =>
                      setTeamFilter((s) => ({ ...s, [team]: e.target.value }))
                    }
                    placeholder="Filter this team…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              {members.length === 0 && total > 0 && (
                <p className="empty-state" role="status" style={{ marginTop: "0.5rem" }}>
                  <strong>No matches</strong>
                  No one in {DEV_TEAM_LABELS[team]} matches your filters. Try clearing the search
                  above or the team field.
                </p>
              )}
              {total === 0 && (
                <p className="empty-state" role="status" style={{ marginTop: "0.5rem" }}>
                  <strong>Empty</strong>
                  Add colleagues using the &quot;Add to a team&quot; section, or add people in Dev
                  management first.
                </p>
              )}
              {members.length > 0 && (
                <AppDataTable
                  embedded
                  scrollMaxHeight="min(24rem, 55vh)"
                  aria-label={`${DEV_TEAM_LABELS[team]} roster`}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={48} />
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th w={64} ta="center">
                        Lead
                      </Table.Th>
                      <Table.Th w={100} ta="right">
                        Action
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((m) => (
                      <Table.Tr key={m.id}>
                        <Table.Td>
                          <span className="tm-avatar" aria-hidden>
                            {initials(m.developer)}
                          </span>
                        </Table.Td>
                        <Table.Td>
                          <div className="tm-mtable__name">
                            {memberLabel(m.developer)}
                            {orgBadge(m.developer.rosterPosition) && (
                              <span className="tm-org-badge" title="Department role">
                                {" "}
                                {orgBadge(m.developer.rosterPosition)}
                              </span>
                            )}
                          </div>
                        </Table.Td>
                        <Table.Td>
                          <span className="tm-mtable__email muted">
                            {m.developer.jobTitle?.trim() ||
                              m.developer.skills?.trim() ||
                              "—"}
                          </span>
                        </Table.Td>
                        <Table.Td ta="center">
                          <label className="tm-lead-toggle">
                            <input
                              type="checkbox"
                              checked={m.isTeamLead}
                              disabled={leadMut.isPending}
                              onChange={() => {
                                leadMut.mutate({ id: m.id, isTeamLead: !m.isTeamLead });
                              }}
                            />
                            <span className="sr-only">Team lead for {DEV_TEAM_LABELS[team]}</span>
                          </label>
                        </Table.Td>
                        <Table.Td ta="right">
                          <button
                            type="button"
                            className="btn-ghost tm-mtable__remove"
                            disabled={removeMut.isPending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Remove ${memberLabel(m.developer)} from ${DEV_TEAM_LABELS[team]}?`,
                                )
                              ) {
                                return;
                              }
                              removeMut.mutate(m.id);
                            }}
                          >
                            Remove
                          </button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AppDataTable>
              )}
            </section>
            );
          })}
        </div>
      )}

      {(removeMut.isError || leadMut.isError) && (
        <p className="tm-footer-alert" role="alert">
          {(removeMut.isError
            ? (removeMut.error as Error).message
            : (leadMut.error as Error).message) ?? "Something went wrong."}
        </p>
      )}
    </div>
  );
}
