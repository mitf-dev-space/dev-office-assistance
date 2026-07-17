import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  Prisma,
  type TriageCategory,
  type TriageItem,
  type TriageStatus,
} from "@prisma/client";
import { createGraphClient } from "../graphClient.js";
import { graphStatusCode, readGraphToken } from "../graphHelpers.js";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";
import { getCurrentWeekRange } from "../weekRange.js";
import { patchGraphTodoToMatchTriage } from "../todoTriageService.js";
import { enrichmentFromRawMetadata } from "../clickup/enrichment.js";
import { toExternalWorkItemDto } from "../externalWork/upsert.js";

const categoryZ = z.enum([
  "blocker",
  "risk",
  "quality",
  "process",
  "other",
]);
const statusZ = z.enum([
  "inbox",
  "in_progress",
  "snoozed",
  "done",
  "dropped",
]);
const sourceZ = z.enum(["outlook", "manual", "microsoft_todo", "clickup"]);

const createBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(8000).nullable().optional(),
  category: categoryZ,
  status: statusZ.optional(),
  nextAction: z.string().max(2000).nullable().optional(),
  dueAt: z.string().nullable().optional(),
  snoozedUntil: z.string().nullable().optional(),
  assigneeDeveloperId: z.string().min(1),
  program: z.string().max(200).nullable().optional(),
  escalated: z.boolean().optional(),
  sourceType: sourceZ.optional(),
  graphMessageId: z.string().nullable().optional(),
  graphWebLink: z.string().url().nullable().optional(),
  sourcePreview: z.string().max(500).nullable().optional(),
});

const patchBody = createBody
  .partial()
  .extend({
    title: z.string().min(1).max(500).optional(),
    graphWebLink: z.union([z.string().url(), z.null()]).optional(),
  });

type AttachmentListRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

type AssigneeForDto = { displayName: string };

function assigneeNameFromDeveloper(u: AssigneeForDto | null | undefined) {
  if (!u) return undefined;
  const n = u.displayName?.trim();
  if (n) return n;
  return "Unknown person";
}

function toDto(
  row: TriageItem & { assignee?: AssigneeForDto | null },
  extra?: {
    attachments?: AttachmentListRow[];
    attachmentCount?: number;
    ageDays?: number;
    externalWorkItems?: ReturnType<typeof toExternalWorkItemDto>[];
    clickUpAssignees?: Array<{
      id: string;
      username: string | null;
      email: string | null;
      profilePicture: string | null;
    }>;
  },
) {
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    nextAction: row.nextAction,
    dueAt: row.dueAt?.toISOString() ?? null,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    assigneeDeveloperId: row.assigneeDeveloperId,
    ...(row.assignee != null ? { assigneeName: assigneeNameFromDeveloper(row.assignee) } : {}),
    ...(extra?.clickUpAssignees?.length
      ? { clickUpAssignees: extra.clickUpAssignees }
      : {}),
    sourceType: row.sourceType,
    graphMessageId: row.graphMessageId,
    graphWebLink: row.graphWebLink,
    sourcePreview: row.sourcePreview,
    graphTodoListId: row.graphTodoListId,
    graphTodoTaskId: row.graphTodoTaskId,
    lastTodoSyncedAt: row.lastTodoSyncedAt?.toISOString() ?? null,
    program: row.program ?? null,
    escalated: row.escalated,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(extra?.ageDays !== undefined ? { ageDays: extra.ageDays } : {}),
    ...(extra?.externalWorkItems ? { externalWorkItems: extra.externalWorkItems } : {}),
  };
  if (extra?.attachments) {
    return {
      ...base,
      attachments: extra.attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
  if (extra?.attachmentCount !== undefined) {
    return { ...base, attachmentCount: extra.attachmentCount };
  }
  return base;
}

export async function registerTriageRoutes(app: FastifyInstance) {
  app.get("/api/triage-items/summary", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const now = new Date();
    const { start, end } = getCurrentWeekRange(now);

    const [byStatusRaw, byCategoryRaw, overdueCount, dueThisWeekCount] =
      await Promise.all([
        prisma.triageItem.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.triageItem.groupBy({
          by: ["category"],
          _count: { _all: true },
        }),
        prisma.triageItem.count({
          where: {
            dueAt: { lt: now },
            status: { notIn: ["done", "dropped"] },
          },
        }),
        prisma.triageItem.count({
          where: {
            dueAt: { gte: start, lt: end },
            status: { notIn: ["done", "dropped"] },
          },
        }),
      ]);

    const byStatus = {
      inbox: 0,
      in_progress: 0,
      snoozed: 0,
      done: 0,
      dropped: 0,
    } as Record<TriageStatus, number>;
    for (const row of byStatusRaw) {
      byStatus[row.status] = row._count._all;
    }

    const byCategory = {
      blocker: 0,
      risk: 0,
      quality: 0,
      process: 0,
      other: 0,
    } as Record<TriageCategory, number>;
    for (const row of byCategoryRaw) {
      byCategory[row.category] = row._count._all;
    }

    return {
      byStatus,
      byCategory,
      overdueCount,
      dueThisWeekCount,
    };
  });

  app.get("/api/triage-items/priority-queue", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const raw = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(raw);
    const and: Prisma.TriageItemWhereInput[] = [
      { status: { notIn: ["done", "dropped"] } },
      {
        OR: [{ category: { in: ["blocker", "risk"] } }, { escalated: true }],
      },
    ];
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { program: { contains: pq.q, mode: "insensitive" } },
          { assignee: { displayName: { contains: pq.q, mode: "insensitive" } } },
        ],
      });
    }
    const where: Prisma.TriageItemWhereInput = { AND: and };

    const now = new Date();
    const [items, total] = await Promise.all([
      prisma.triageItem.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ escalated: "desc" }, { createdAt: "asc" }],
        include: {
          assignee: { select: { displayName: true } },
          _count: { select: { attachments: true } },
        },
      }),
      prisma.triageItem.count({ where }),
    ]);
    return withPageMeta(
      {
        items: items.map((it) => {
          const ageMs = now.getTime() - it.createdAt.getTime();
          const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000));
          return toDto(it, { attachmentCount: it._count.attachments, ageDays });
        }),
      },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/triage-items", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(q);
    const status = q.status ? statusZ.safeParse(q.status) : null;
    if (q.status && !status?.success) {
      return reply.status(400).send({ error: "invalid_status" });
    }
    const category = q.category ? categoryZ.safeParse(q.category) : null;
    if (q.category && !category?.success) {
      return reply.status(400).send({ error: "invalid_category" });
    }

    const and: Prisma.TriageItemWhereInput[] = [];
    if (status?.success) and.push({ status: status.data });
    if (category?.success) and.push({ category: category.data });
    if (q.assigneeDeveloperId) and.push({ assigneeDeveloperId: q.assigneeDeveloperId });
    if (q.program && q.program.trim()) {
      and.push({ program: q.program.trim() });
    }

    const now = new Date();
    if (q.overdue === "true") {
      and.push({ dueAt: { lt: now }, status: { notIn: ["done", "dropped"] } });
    }
    if (q.thisWeek === "true") {
      const { start, end } = getCurrentWeekRange(now);
      and.push({
        dueAt: { gte: start, lt: end },
        status: { notIn: ["done", "dropped"] },
      });
    }
    if (q.dueBefore) {
      and.push({ dueAt: { lt: new Date(q.dueBefore) } });
    }
    if (q.dueAfter) {
      and.push({ dueAt: { gt: new Date(q.dueAfter) } });
    }
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { program: { contains: pq.q, mode: "insensitive" } },
          { assignee: { displayName: { contains: pq.q, mode: "insensitive" } } },
        ],
      });
    }

    const where: Prisma.TriageItemWhereInput = and.length ? { AND: and } : {};

    const [items, total] = await Promise.all([
      prisma.triageItem.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        include: {
          assignee: { select: { displayName: true } },
          _count: { select: { attachments: true } },
          externalWorkItems: {
            where: { provider: "clickup" },
            select: { rawMetadata: true },
            take: 1,
          },
        },
      }),
      prisma.triageItem.count({ where }),
    ]);
    return withPageMeta(
      {
        items: items.map((it) => {
          const helm = enrichmentFromRawMetadata(it.externalWorkItems[0]?.rawMetadata);
          return toDto(it, {
            attachmentCount: it._count.attachments,
            clickUpAssignees: helm?.assignees,
          });
        }),
      },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/triage-items/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const { id } = request.params as { id: string };
    const item = await prisma.triageItem.findUnique({
      where: { id },
      include: {
        assignee: { select: { displayName: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        externalWorkItems: true,
      },
    });
    if (!item) return reply.status(404).send({ error: "not_found" });
    const clickUpEwi = item.externalWorkItems.find((e) => e.provider === "clickup");
    const helm = enrichmentFromRawMetadata(clickUpEwi?.rawMetadata);
    return toDto(item, {
      attachments: item.attachments,
      externalWorkItems: item.externalWorkItems.map(toExternalWorkItemDto),
      clickUpAssignees: helm?.assignees,
    });
  });

  app.post("/api/triage-items", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    const dueAt =
      b.dueAt === undefined ? undefined : b.dueAt === null ? null : new Date(b.dueAt);
    if (b.dueAt && dueAt && Number.isNaN(dueAt.getTime())) {
      return reply.status(400).send({ error: "invalid_dueAt" });
    }
    const snoozedUntil =
      b.snoozedUntil === undefined
        ? undefined
        : b.snoozedUntil === null
          ? null
          : new Date(b.snoozedUntil);
    if (b.snoozedUntil && snoozedUntil && Number.isNaN(snoozedUntil.getTime())) {
      return reply.status(400).send({ error: "invalid_snoozedUntil" });
    }

    const assignee = await prisma.developer.findUnique({
      where: { id: b.assigneeDeveloperId },
    });
    if (!assignee) {
      return reply.status(400).send({ error: "unknown_assignee" });
    }

    const program =
      b.program === undefined ? null : b.program === null ? null : b.program.trim() || null;

    const item = await prisma.triageItem.create({
      data: {
        title: b.title,
        description: b.description ?? null,
        category: b.category,
        status: b.status ?? "inbox",
        nextAction: b.nextAction ?? null,
        dueAt: dueAt ?? null,
        snoozedUntil: snoozedUntil ?? null,
        assigneeDeveloperId: b.assigneeDeveloperId,
        program,
        escalated: b.escalated ?? false,
        sourceType: b.sourceType ?? "manual",
        graphMessageId: b.graphMessageId ?? null,
        graphWebLink: b.graphWebLink ?? null,
        sourcePreview: b.sourcePreview ?? null,
        createdById: me.id,
      },
      include: { assignee: { select: { displayName: true } } },
    });
    return reply.status(201).send(toDto(item));
  });

  app.patch("/api/triage-items/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const { id } = request.params as { id: string };
    const existing = await prisma.triageItem.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    let dueAtPatch: Date | null | undefined;
    if (b.dueAt !== undefined) {
      if (b.dueAt === null) dueAtPatch = null;
      else {
        const d = new Date(b.dueAt);
        if (Number.isNaN(d.getTime())) {
          return reply.status(400).send({ error: "invalid_dueAt" });
        }
        dueAtPatch = d;
      }
    }
    let snoozedPatch: Date | null | undefined;
    if (b.snoozedUntil !== undefined) {
      if (b.snoozedUntil === null) snoozedPatch = null;
      else {
        const d = new Date(b.snoozedUntil);
        if (Number.isNaN(d.getTime())) {
          return reply.status(400).send({ error: "invalid_snoozedUntil" });
        }
        snoozedPatch = d;
      }
    }

    if (b.assigneeDeveloperId) {
      const assignee = await prisma.developer.findUnique({
        where: { id: b.assigneeDeveloperId },
      });
      if (!assignee) {
        return reply.status(400).send({ error: "unknown_assignee" });
      }
    }

    let pushedTodo = false;
    if (
      b.status !== undefined &&
      b.status !== existing.status &&
      existing.sourceType === "microsoft_todo" &&
      existing.graphTodoListId &&
      existing.graphTodoTaskId
    ) {
      const graphToken = readGraphToken(request);
      if (graphToken) {
        try {
          const g = createGraphClient(graphToken);
          await patchGraphTodoToMatchTriage(
            g,
            existing.graphTodoListId,
            existing.graphTodoTaskId,
            b.status,
          );
          pushedTodo = true;
        } catch (e) {
          const code = graphStatusCode(e);
          if (code === 401 || code === 403) {
            return reply.status(400).send({
              error: "todo_graph_write_denied",
              message:
                "Could not update Microsoft To Do. Connect Microsoft 365 (Tasks.ReadWrite) and retry, or change status again after signing in.",
            });
          }
          request.log.warn({ err: e }, "triage_todo_graph_patch_failed");
          return reply.status(502).send({ error: "todo_graph_unavailable" });
        }
      }
    }

    let programPatch: string | null | undefined;
    if (b.program !== undefined) {
      if (b.program === null) programPatch = null;
      else {
        const t = b.program.trim();
        programPatch = t === "" ? null : t;
      }
    }

    const item = await prisma.triageItem.update({
      where: { id },
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.category !== undefined ? { category: b.category } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.nextAction !== undefined ? { nextAction: b.nextAction } : {}),
        ...(dueAtPatch !== undefined ? { dueAt: dueAtPatch } : {}),
        ...(snoozedPatch !== undefined ? { snoozedUntil: snoozedPatch } : {}),
        ...(b.assigneeDeveloperId !== undefined
          ? { assigneeDeveloperId: b.assigneeDeveloperId }
          : {}),
        ...(b.sourceType !== undefined ? { sourceType: b.sourceType } : {}),
        ...(b.graphMessageId !== undefined
          ? { graphMessageId: b.graphMessageId }
          : {}),
        ...(b.graphWebLink !== undefined ? { graphWebLink: b.graphWebLink } : {}),
        ...(b.sourcePreview !== undefined
          ? { sourcePreview: b.sourcePreview }
          : {}),
        ...(programPatch !== undefined ? { program: programPatch } : {}),
        ...(b.escalated !== undefined ? { escalated: b.escalated } : {}),
        ...(pushedTodo ? { lastTodoSyncedAt: new Date() } : {}),
      },
      include: { assignee: { select: { displayName: true } } },
    });

    return toDto(item);
  });
}
