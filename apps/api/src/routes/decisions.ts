import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";

const createBody = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(16000),
  decidedOn: z.string().min(1).max(48),
  relatedTriageItemId: z.string().nullable().optional(),
  relatedPlanningItemId: z.string().nullable().optional(),
});

const patchBody = createBody.partial();

function decidedDate(s: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const asDate = new Date(s);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

export async function registerDecisionRoutes(app: FastifyInstance) {
  app.get("/api/decisions", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const raw = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(raw);
    const and: Prisma.TeamDecisionWhereInput[] = [];
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { body: { contains: pq.q, mode: "insensitive" } },
          { createdBy: { displayName: { contains: pq.q, mode: "insensitive" } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      prisma.teamDecision.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ decidedOn: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { displayName: true } },
          relatedTriageItem: { select: { id: true, title: true } },
          relatedPlanningItem: { select: { id: true, title: true } },
        },
      }),
      prisma.teamDecision.count({ where }),
    ]);
    return withPageMeta(
      {
        decisions: rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          decidedOn: r.decidedOn.toISOString().slice(0, 10),
          createdById: r.createdById,
          createdByDisplay: r.createdBy.displayName,
          relatedTriageItemId: r.relatedTriageItemId,
          relatedPlanningItemId: r.relatedPlanningItemId,
          relatedTriageTitle: r.relatedTriageItem?.title ?? null,
          relatedPlanningTitle: r.relatedPlanningItem?.title ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/decisions/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const r = await prisma.teamDecision.findUnique({
      where: { id },
      include: {
        createdBy: { select: { displayName: true } },
        relatedTriageItem: { select: { id: true, title: true } },
        relatedPlanningItem: { select: { id: true, title: true } },
      },
    });
    if (!r) return reply.status(404).send({ error: "not_found" });
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      decidedOn: r.decidedOn.toISOString().slice(0, 10),
      createdById: r.createdById,
      createdByDisplay: r.createdBy.displayName,
      relatedTriageItemId: r.relatedTriageItemId,
      relatedPlanningItemId: r.relatedPlanningItemId,
      relatedTriageTitle: r.relatedTriageItem?.title ?? null,
      relatedPlanningTitle: r.relatedPlanningItem?.title ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  app.post("/api/decisions", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const decided = decidedDate(b.decidedOn);
    if (!decided) {
      return reply.status(400).send({ error: "invalid_decidedOn" });
    }
    if (b.relatedTriageItemId) {
      const t = await prisma.triageItem.findUnique({ where: { id: b.relatedTriageItemId } });
      if (!t) return reply.status(400).send({ error: "unknown_triage" });
    }
    if (b.relatedPlanningItemId) {
      const p = await prisma.planningItem.findUnique({ where: { id: b.relatedPlanningItemId } });
      if (!p) return reply.status(400).send({ error: "unknown_planning" });
    }
    const r = await prisma.teamDecision.create({
      data: {
        id: randomUUID(),
        title: b.title,
        body: b.body,
        decidedOn: decided,
        createdById: me.id,
        relatedTriageItemId: b.relatedTriageItemId ?? null,
        relatedPlanningItemId: b.relatedPlanningItemId ?? null,
      },
      include: {
        createdBy: { select: { displayName: true } },
        relatedTriageItem: { select: { id: true, title: true } },
        relatedPlanningItem: { select: { id: true, title: true } },
      },
    });
    return reply.status(201).send({
      id: r.id,
      title: r.title,
      body: r.body,
      decidedOn: r.decidedOn.toISOString().slice(0, 10),
      createdById: r.createdById,
      createdByDisplay: r.createdBy.displayName,
      relatedTriageItemId: r.relatedTriageItemId,
      relatedPlanningItemId: r.relatedPlanningItemId,
      relatedTriageTitle: r.relatedTriageItem?.title ?? null,
      relatedPlanningTitle: r.relatedPlanningItem?.title ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  });

  app.patch("/api/decisions/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.teamDecision.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let decided: Date | undefined;
    if (b.decidedOn !== undefined) {
      const d = decidedDate(b.decidedOn);
      if (!d) {
        return reply.status(400).send({ error: "invalid_decidedOn" });
      }
      decided = d;
    }
    if (b.relatedTriageItemId) {
      const t = await prisma.triageItem.findUnique({ where: { id: b.relatedTriageItemId } });
      if (!t) return reply.status(400).send({ error: "unknown_triage" });
    }
    if (b.relatedPlanningItemId) {
      const p = await prisma.planningItem.findUnique({ where: { id: b.relatedPlanningItemId } });
      if (!p) return reply.status(400).send({ error: "unknown_planning" });
    }
    const r = await prisma.teamDecision.update({
      where: { id },
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.body !== undefined ? { body: b.body } : {}),
        ...(decided !== undefined ? { decidedOn: decided } : {}),
        ...(b.relatedTriageItemId !== undefined
          ? { relatedTriageItemId: b.relatedTriageItemId }
          : {}),
        ...(b.relatedPlanningItemId !== undefined
          ? { relatedPlanningItemId: b.relatedPlanningItemId }
          : {}),
      },
      include: {
        createdBy: { select: { displayName: true } },
        relatedTriageItem: { select: { id: true, title: true } },
        relatedPlanningItem: { select: { id: true, title: true } },
      },
    });
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      decidedOn: r.decidedOn.toISOString().slice(0, 10),
      createdById: r.createdById,
      createdByDisplay: r.createdBy.displayName,
      relatedTriageItemId: r.relatedTriageItemId,
      relatedPlanningItemId: r.relatedPlanningItemId,
      relatedTriageTitle: r.relatedTriageItem?.title ?? null,
      relatedPlanningTitle: r.relatedPlanningItem?.title ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  app.delete("/api/decisions/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.teamDecision.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    await prisma.teamDecision.delete({ where: { id } });
    return reply.status(204).send();
  });
}
