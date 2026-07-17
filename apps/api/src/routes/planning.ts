import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma, PlanningStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";

const statusZ = z.enum(["draft", "active", "done", "cancelled"]);

const createBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(8000).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  program: z.string().max(200).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  status: statusZ.optional(),
});

const patchBody = createBody.partial();

function planToDto(
  p: {
    id: string;
    title: string;
    description: string | null;
    department: string | null;
    program: string | null;
    targetDate: Date | null;
    status: PlanningStatus;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  },
  linked?: { id: string; title: string; category: string; status: string }[],
) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    department: p.department,
    program: p.program,
    targetDate: p.targetDate?.toISOString() ?? null,
    status: p.status,
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    ...(linked && linked.length
      ? {
          linkedTriage: linked.map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            status: t.status,
          })),
        }
      : {}),
  };
}

export async function registerPlanningRoutes(app: FastifyInstance) {
  app.get("/api/planning", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(q);
    const and: Prisma.PlanningItemWhereInput[] = [];
    if (q.status) {
      const s = statusZ.safeParse(q.status);
      if (!s.success) {
        return reply.status(400).send({ error: "invalid_status" });
      }
      and.push({ status: s.data });
    }
    if (q.department) {
      and.push({ department: q.department });
    }
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { description: { contains: pq.q, mode: "insensitive" } },
          { department: { contains: pq.q, mode: "insensitive" } },
          { program: { contains: pq.q, mode: "insensitive" } },
        ],
      });
    }
    const where: Prisma.PlanningItemWhereInput = and.length ? { AND: and } : {};

    const [items, total] = await Promise.all([
      prisma.planningItem.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ targetDate: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.planningItem.count({ where }),
    ]);
    return withPageMeta(
      { items: items.map((p) => planToDto(p)) },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/planning/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const p = await prisma.planningItem.findUnique({
      where: { id },
      include: {
        triageLinks: {
          include: {
            triageItem: { select: { id: true, title: true, category: true, status: true } },
          },
        },
      },
    });
    if (!p) return reply.status(404).send({ error: "not_found" });
    const linked = p.triageLinks.map((l) => l.triageItem);
    return planToDto(p, linked);
  });

  app.post("/api/planning", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let targetDate: Date | null = null;
    if (b.targetDate !== undefined && b.targetDate !== null) {
      const d = new Date(b.targetDate);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ error: "invalid_targetDate" });
      }
      targetDate = d;
    }
    const program =
      b.program === undefined ? null : b.program === null ? null : b.program.trim() || null;

    const p = await prisma.planningItem.create({
      data: {
        title: b.title,
        description: b.description ?? null,
        department: b.department ?? null,
        program,
        targetDate,
        status: (b.status ?? "draft") as PlanningStatus,
        createdById: me.id,
      },
    });
    return reply.status(201).send(planToDto(p));
  });

  app.patch("/api/planning/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.planningItem.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let targetDate: Date | null | undefined;
    if (b.targetDate === null) {
      targetDate = null;
    } else if (b.targetDate !== undefined) {
      const d = new Date(b.targetDate);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ error: "invalid_targetDate" });
      }
      targetDate = d;
    }
    let program: string | null | undefined;
    if (b.program !== undefined) {
      if (b.program === null) program = null;
      else {
        const t = b.program.trim();
        program = t === "" ? null : t;
      }
    }
    const p = await prisma.planningItem.update({
      where: { id },
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.department !== undefined ? { department: b.department } : {}),
        ...(program !== undefined ? { program } : {}),
        ...(targetDate !== undefined ? { targetDate } : {}),
        ...(b.status !== undefined ? { status: b.status as PlanningStatus } : {}),
      },
    });
    return planToDto(p);
  });

  const linkBody = z.object({ triageItemId: z.string().min(1) });

  app.post("/api/planning/:id/triage-links", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const plan = await prisma.planningItem.findUnique({ where: { id } });
    if (!plan) return reply.status(404).send({ error: "not_found" });
    const parsed = linkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const tri = await prisma.triageItem.findUnique({ where: { id: parsed.data.triageItemId } });
    if (!tri) {
      return reply.status(400).send({ error: "unknown_triage" });
    }
    try {
      await prisma.planningTriageItem.create({
        data: { planningItemId: id, triageItemId: tri.id },
      });
    } catch (e) {
      const isPrisma = e && typeof e === "object" && "code" in e;
      if (isPrisma && (e as { code: string }).code === "P2002") {
        return reply.status(409).send({ error: "already_linked" });
      }
      throw e;
    }
    const full = await prisma.planningItem.findUnique({
      where: { id },
      include: {
        triageLinks: {
          include: {
            triageItem: { select: { id: true, title: true, category: true, status: true } },
          },
        },
      },
    });
    if (!full) return reply.status(404).send({ error: "not_found" });
    return planToDto(
      full,
      full.triageLinks.map((l) => l.triageItem),
    );
  });

  app.delete("/api/planning/:id/triage-links/:triageId", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id, triageId } = request.params as { id: string; triageId: string };
    const plan = await prisma.planningItem.findUnique({ where: { id } });
    if (!plan) return reply.status(404).send({ error: "not_found" });
    await prisma.planningTriageItem.deleteMany({
      where: { planningItemId: id, triageItemId: triageId },
    });
    return reply.status(204).send();
  });

  app.delete("/api/planning/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.planningItem.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    await prisma.planningItem.delete({ where: { id } });
    return reply.status(204).send();
  });
}
