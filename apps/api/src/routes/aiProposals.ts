import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";

const createBody = z.object({
  kind: z.enum([
    "triage_set_next_action",
    "planning_create",
    "decision_create",
    "triage_cancel_duplicate",
  ]),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4000),
  payload: z.record(z.unknown()),
});

async function applyProposal(
  kind: string,
  payload: Record<string, unknown>,
  actorUserId: string,
): Promise<Record<string, unknown>> {
  switch (kind) {
    case "triage_set_next_action": {
      const triageItemId = String(payload.triageItemId ?? "");
      const nextAction = String(payload.nextAction ?? "").trim();
      if (!triageItemId || !nextAction) throw new Error("invalid_payload");
      const updated = await prisma.triageItem.update({
        where: { id: triageItemId },
        data: { nextAction },
        select: { id: true, nextAction: true },
      });
      return { triageItemId: updated.id, nextAction: updated.nextAction };
    }
    case "planning_create": {
      const title = String(payload.title ?? "").trim();
      if (!title) throw new Error("invalid_payload");
      const created = await prisma.planningItem.create({
        data: {
          title,
          description: typeof payload.description === "string" ? payload.description : null,
          department: typeof payload.department === "string" ? payload.department : null,
          program: typeof payload.program === "string" ? payload.program : null,
          status: "draft",
          createdById: actorUserId,
        },
        select: { id: true, title: true },
      });
      return { planningItemId: created.id, title: created.title, href: `/planning/${created.id}` };
    }
    case "decision_create": {
      const title = String(payload.title ?? "").trim();
      const body = String(payload.body ?? "").trim();
      if (!title || !body) throw new Error("invalid_payload");
      const decidedOn =
        typeof payload.decidedOn === "string" && payload.decidedOn
          ? new Date(payload.decidedOn)
          : new Date();
      const created = await prisma.teamDecision.create({
        data: {
          title,
          body,
          decidedOn,
          createdById: actorUserId,
          relatedTriageItemId:
            typeof payload.relatedTriageItemId === "string" ? payload.relatedTriageItemId : null,
          relatedPlanningItemId:
            typeof payload.relatedPlanningItemId === "string"
              ? payload.relatedPlanningItemId
              : null,
        },
        select: { id: true, title: true },
      });
      return { decisionId: created.id, title: created.title, href: "/decisions" };
    }
    case "triage_cancel_duplicate": {
      const triageItemId = String(payload.triageItemId ?? "");
      if (!triageItemId) throw new Error("invalid_payload");
      const note = typeof payload.note === "string" ? payload.note.trim() : "";
      const updated = await prisma.triageItem.update({
        where: { id: triageItemId },
        data: {
          status: "dropped",
          nextAction: note || "Dropped as duplicate via AI review queue",
        },
        select: { id: true, status: true },
      });
      return { triageItemId: updated.id, status: updated.status };
    }
    default:
      throw new Error("unsupported_kind");
  }
}

export async function registerAiProposalRoutes(app: FastifyInstance) {
  app.get("/api/assist/proposals", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = z
      .object({
        status: z.enum(["pending", "approved", "rejected", "failed", "all"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .safeParse(request.query ?? {});
    if (!q.success) {
      return reply.status(400).send({ error: "validation", details: q.error.flatten() });
    }

    const status = q.data.status ?? "pending";
    const limit = q.data.limit ?? 40;
    const rows = await prisma.aiActionProposal.findMany({
      where: status === "all" ? undefined : { status },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        reviewedBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        title: r.title,
        summary: r.summary,
        payload: r.payload,
        result: r.result,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdBy: r.createdBy
          ? { id: r.createdBy.id, name: r.createdBy.displayName ?? r.createdBy.email }
          : null,
        reviewedBy: r.reviewedBy
          ? { id: r.reviewedBy.id, name: r.reviewedBy.displayName ?? r.reviewedBy.email }
          : null,
      })),
    };
  });

  app.post("/api/assist/proposals", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const row = await prisma.aiActionProposal.create({
      data: {
        kind: parsed.data.kind,
        title: parsed.data.title,
        summary: parsed.data.summary,
        payload: parsed.data.payload as Prisma.InputJsonValue,
        status: "pending",
        createdById: me.id,
      },
    });

    return reply.status(201).send({
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      summary: row.summary,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
  });

  app.post("/api/assist/proposals/:id/approve", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead") return reply.status(403).send({ error: "forbidden" });

    const { id } = request.params as { id: string };
    const row = await prisma.aiActionProposal.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    if (row.status !== "pending") {
      return reply.status(409).send({ error: "not_pending", status: row.status });
    }

    try {
      const result = await applyProposal(
        row.kind,
        row.payload as Record<string, unknown>,
        me.id,
      );
      const updated = await prisma.aiActionProposal.update({
        where: { id },
        data: {
          status: "approved",
          result: result as Prisma.InputJsonValue,
          reviewedById: me.id,
          reviewedAt: new Date(),
        },
      });
      return {
        id: updated.id,
        status: updated.status,
        result: updated.result,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "apply_failed";
      await prisma.aiActionProposal.update({
        where: { id },
        data: {
          status: "failed",
          result: { error: message } as Prisma.InputJsonValue,
          reviewedById: me.id,
          reviewedAt: new Date(),
        },
      });
      return reply.status(400).send({ error: "apply_failed", message });
    }
  });

  app.post("/api/assist/proposals/:id/reject", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (me.role !== "lead") return reply.status(403).send({ error: "forbidden" });

    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().max(1000).optional() }).safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "validation", details: body.error.flatten() });
    }

    const row = await prisma.aiActionProposal.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "not_found" });
    if (row.status !== "pending") {
      return reply.status(409).send({ error: "not_pending", status: row.status });
    }

    const updated = await prisma.aiActionProposal.update({
      where: { id },
      data: {
        status: "rejected",
        result: body.data.reason ? { reason: body.data.reason } : { reason: "rejected" },
        reviewedById: me.id,
        reviewedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    };
  });
}
