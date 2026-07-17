import type { TriageStatus } from "@prisma/client";

export type ClickUpTaskRaw = {
  id?: string;
  name?: string;
  status?: { status?: string; type?: string } | string;
  priority?: { id?: string; priority?: string } | string | null;
  due_date?: string | null;
  date_updated?: string | null;
  date_created?: string | null;
  url?: string;
  parent?: string | null;
  list?: { id?: string; name?: string };
  folder?: { id?: string; name?: string };
  space?: { id?: string };
  assignees?: Array<{ id?: number | string; username?: string; email?: string }>;
  creator?: { id?: number | string; username?: string; email?: string };
  description?: string;
  text_content?: string;
};

export type NormalizedClickUpPerson = {
  id: string;
  username: string | null;
  email: string | null;
};

export type NormalizedClickUpTask = {
  externalId: string;
  title: string;
  externalStatus: string | null;
  externalPriority: string | null;
  dueAt: Date | null;
  externalUpdatedAt: Date | null;
  externalUrl: string | null;
  externalParentId: string | null;
  listId: string | null;
  folderId: string | null;
  spaceId: string | null;
  description: string | null;
  assigneeIds: string[];
  assignees: NormalizedClickUpPerson[];
  creator: NormalizedClickUpPerson | null;
};

function statusString(status: ClickUpTaskRaw["status"]): string | null {
  if (!status) return null;
  if (typeof status === "string") return status;
  return status.status ?? null;
}

function priorityString(priority: ClickUpTaskRaw["priority"]): string | null {
  if (!priority) return null;
  if (typeof priority === "string") return priority;
  return priority.priority ?? priority.id ?? null;
}

function msToDate(ms: string | null | undefined): Date | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeClickUpTask(raw: ClickUpTaskRaw): NormalizedClickUpTask | null {
  if (!raw.id) return null;
  const title = (raw.name && raw.name.trim()) || "(untitled)";
  const desc =
    (typeof raw.text_content === "string" && raw.text_content.trim()
      ? raw.text_content.trim()
      : null) ||
    (typeof raw.description === "string" && raw.description.trim()
      ? raw.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : null);

  const assignees: NormalizedClickUpPerson[] = (raw.assignees ?? [])
    .filter((a) => a.id != null)
    .map((a) => ({
      id: String(a.id),
      username: a.username ?? null,
      email: a.email ?? null,
    }));

  const creator =
    raw.creator?.id != null
      ? {
          id: String(raw.creator.id),
          username: raw.creator.username ?? null,
          email: raw.creator.email ?? null,
        }
      : null;

  return {
    externalId: raw.id,
    title: title.slice(0, 500),
    externalStatus: statusString(raw.status),
    externalPriority: priorityString(raw.priority),
    dueAt: msToDate(raw.due_date),
    externalUpdatedAt: msToDate(raw.date_updated) ?? msToDate(raw.date_created),
    externalUrl: raw.url ?? `https://app.clickup.com/t/${raw.id}`,
    externalParentId: raw.parent ?? null,
    listId: raw.list?.id ?? null,
    folderId: raw.folder?.id ?? null,
    spaceId: raw.space?.id ?? null,
    description: desc ? desc.slice(0, 8000) : null,
    assigneeIds: assignees.map((a) => a.id),
    assignees,
    creator,
  };
}

/** Default ClickUp status → triage when no mapping row exists. */
export function defaultClickUpStatusToTriage(status: string | null | undefined): TriageStatus {
  const s = (status ?? "").toLowerCase();
  if (!s) return "inbox";
  if (s.includes("complete") || s === "closed" || s === "done") return "done";
  if (s.includes("progress") || s === "active" || s === "in progress") return "in_progress";
  if (s.includes("review") || s.includes("blocked")) return "in_progress";
  return "inbox";
}
