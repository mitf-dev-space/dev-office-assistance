/**
 * Structured ClickUp extras stored under ExternalWorkItem.rawMetadata._helm
 * and exposed on ExternalWorkItemDto.clickUp.
 */

import type { ClickUpClient } from "./client.js";
import type { ClickUpTaskRaw } from "./normalize.js";

export type ClickUpPersonSummary = {
  id: string;
  username: string | null;
  email: string | null;
  profilePicture: string | null;
};

export type ClickUpCommentSummary = {
  id: string;
  text: string;
  author: string | null;
  authorId: string | null;
  date: string | null;
};

export type ClickUpCustomFieldSummary = {
  id: string;
  name: string;
  type: string | null;
  valueText: string | null;
};

export type ClickUpEnrichment = {
  assignees: ClickUpPersonSummary[];
  watchers: ClickUpPersonSummary[];
  creator: ClickUpPersonSummary | null;
  tags: string[];
  customFields: ClickUpCustomFieldSummary[];
  checklists: Array<{
    id: string;
    name: string;
    resolved: number;
    unresolved: number;
  }>;
  comments: ClickUpCommentSummary[];
  timeEstimateMs: number | null;
  timeSpentMs: number | null;
  points: number | null;
  startDate: string | null;
  dateCreated: string | null;
  dateDone: string | null;
  dateClosed: string | null;
  attachmentCount: number;
  listName: string | null;
  folderName: string | null;
  spaceName: string | null;
  commentsFetchedAt: string | null;
};

type LoosePerson = {
  id?: number | string;
  username?: string;
  email?: string;
  profilePicture?: string | null;
};

function person(p: LoosePerson | null | undefined): ClickUpPersonSummary | null {
  if (p?.id == null) return null;
  return {
    id: String(p.id),
    username: p.username ?? null,
    email: p.email ?? null,
    profilePicture: p.profilePicture ?? null,
  };
}

function msToIso(ms: string | number | null | undefined): string | null {
  if (ms == null || ms === "") return null;
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function customFieldValueText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => {
        if (v == null) return null;
        if (typeof v === "string" || typeof v === "number") return String(v);
        if (typeof v === "object" && v !== null && "name" in v) {
          return String((v as { name?: unknown }).name ?? "");
        }
        if (typeof v === "object" && v !== null && "username" in v) {
          return String((v as { username?: unknown }).username ?? "");
        }
        return null;
      })
      .filter((x): x is string => Boolean(x && x.trim()));
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.username === "string") return o.username;
    if (typeof o.percent_complete === "number") return `${o.percent_complete}%`;
    if (o.value != null && (typeof o.value === "string" || typeof o.value === "number")) {
      return String(o.value);
    }
  }
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return null;
  }
}

export function extractClickUpEnrichment(
  raw: Record<string, unknown>,
  opts?: { comments?: ClickUpCommentSummary[]; commentsFetchedAt?: string | null },
): ClickUpEnrichment {
  const assignees = (Array.isArray(raw.assignees) ? raw.assignees : [])
    .map((a) => person(a as LoosePerson))
    .filter((a): a is ClickUpPersonSummary => a != null);

  const watchers = (Array.isArray(raw.watchers) ? raw.watchers : [])
    .map((a) => person(a as LoosePerson))
    .filter((a): a is ClickUpPersonSummary => a != null);

  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map((t) => {
      if (typeof t === "string") return t;
      if (t && typeof t === "object" && "name" in t) {
        return String((t as { name?: unknown }).name ?? "");
      }
      return "";
    })
    .filter((n) => n.trim().length > 0);

  const customFields = (Array.isArray(raw.custom_fields) ? raw.custom_fields : [])
    .map((f) => {
      const field = f as {
        id?: string;
        name?: string;
        type?: string;
        value?: unknown;
      };
      if (!field.id && !field.name) return null;
      return {
        id: String(field.id ?? field.name),
        name: field.name ?? String(field.id ?? "field"),
        type: field.type ?? null,
        valueText: customFieldValueText(field.value),
      };
    })
    .filter((f): f is ClickUpCustomFieldSummary => f != null)
    .filter((f) => f.valueText != null && f.valueText.trim() !== "");

  const checklists = (Array.isArray(raw.checklists) ? raw.checklists : []).map((c) => {
    const cl = c as {
      id?: string;
      name?: string;
      resolved?: number;
      unresolved?: number;
    };
    return {
      id: String(cl.id ?? ""),
      name: cl.name ?? "Checklist",
      resolved: Number(cl.resolved ?? 0),
      unresolved: Number(cl.unresolved ?? 0),
    };
  });

  const list = raw.list as { name?: string } | undefined;
  const folder = raw.folder as { name?: string } | undefined;
  const space = raw.space as { name?: string } | undefined;
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];

  const priorHelm =
    raw._helm && typeof raw._helm === "object"
      ? (raw._helm as Partial<ClickUpEnrichment>)
      : null;

  return {
    assignees,
    watchers,
    creator: person(raw.creator as LoosePerson),
    tags,
    customFields,
    checklists,
    comments: opts?.comments ?? priorHelm?.comments ?? [],
    timeEstimateMs:
      raw.time_estimate != null && Number(raw.time_estimate) > 0
        ? Number(raw.time_estimate)
        : null,
    timeSpentMs:
      raw.time_spent != null && Number(raw.time_spent) > 0 ? Number(raw.time_spent) : null,
    points: raw.points != null && Number.isFinite(Number(raw.points)) ? Number(raw.points) : null,
    startDate: msToIso(raw.start_date as string | null),
    dateCreated: msToIso(raw.date_created as string | null),
    dateDone: msToIso(raw.date_done as string | null),
    dateClosed: msToIso(raw.date_closed as string | null),
    attachmentCount: attachments.length,
    listName: list?.name ?? null,
    folderName: folder?.name ?? null,
    spaceName: space?.name ?? null,
    commentsFetchedAt:
      opts?.commentsFetchedAt ?? priorHelm?.commentsFetchedAt ?? null,
  };
}

export function mergeRawWithHelmEnrichment(
  raw: unknown,
  enrichment: ClickUpEnrichment,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  base._helm = enrichment;
  return base;
}

export function enrichmentFromRawMetadata(
  rawMetadata: unknown,
): ClickUpEnrichment | null {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return null;
  }
  const raw = rawMetadata as Record<string, unknown>;
  if (raw._helm && typeof raw._helm === "object") {
    return raw._helm as ClickUpEnrichment;
  }
  // Legacy rows: build from raw task shape without comments.
  return extractClickUpEnrichment(raw);
}

export async function buildEnrichedRawMetadata(
  client: ClickUpClient,
  raw: ClickUpTaskRaw,
  opts: { fetchComments: boolean },
): Promise<Record<string, unknown>> {
  const base = raw as unknown as Record<string, unknown>;
  let comments: ClickUpCommentSummary[] | undefined;
  let commentsFetchedAt: string | null = null;
  if (opts.fetchComments && raw.id) {
    try {
      const payload = await client.getTaskComments(String(raw.id));
      comments = normalizeClickUpComments(payload);
      commentsFetchedAt = new Date().toISOString();
    } catch {
      /* keep prior comments via extractClickUpEnrichment priorHelm */
    }
  }
  const enrichment = extractClickUpEnrichment(base, {
    comments,
    commentsFetchedAt,
  });
  return mergeRawWithHelmEnrichment(base, enrichment);
}

export function normalizeClickUpComments(payload: unknown): ClickUpCommentSummary[] {
  const comments =
    payload && typeof payload === "object" && "comments" in payload
      ? (payload as { comments?: unknown[] }).comments
      : Array.isArray(payload)
        ? payload
        : [];
  if (!Array.isArray(comments)) return [];
  return comments
    .map((c) => {
      const row = c as {
        id?: string | number;
        comment_text?: string;
        text?: string;
        date?: string | number;
        user?: { id?: number | string; username?: string };
        comment?: Array<{ text?: string }> | string;
      };
      if (row.id == null) return null;
      let text = (row.comment_text ?? row.text ?? "").trim();
      if (!text && Array.isArray(row.comment)) {
        text = row.comment
          .map((p) => p.text ?? "")
          .join("")
          .trim();
      }
      if (!text && typeof row.comment === "string") text = row.comment.trim();
      return {
        id: String(row.id),
        text: text.slice(0, 4000),
        author: row.user?.username ?? null,
        authorId: row.user?.id != null ? String(row.user.id) : null,
        date: msToIso(row.date),
      };
    })
    .filter((c): c is ClickUpCommentSummary => c != null);
}
