import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";
import type { Env } from "../env.js";
import { deleteStoredFile, pathForKey, storeMultipartFile } from "../upload/storage.js";
import { buildIncidentPdf } from "../incidents/pdf.js";
import { nextIncidentNumberFrom } from "../incidents/number.js";

function uploadRoot(env: Env): string {
  return resolve(process.cwd(), env.UPLOAD_DIR);
}

const createBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(20000),
  reporterDeveloperId: z.string().min(1),
  involvedDeveloperIds: z.array(z.string().min(1)).max(100).default([]),
  incidentAt: z.string(),
});

const patchBody = createBody.partial();

type IncidentRow = {
  id: string;
  incidentNumber: string;
  title: string;
  description: string;
  reporterDeveloperId: string;
  createdById: string;
  incidentAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reporter?: { displayName: string } | null;
  involved?: Array<{
    developer: { id: string; displayName: string; workEmail: string | null; jobTitle: string | null };
  }>;
  attachments?: Array<{
    id: string;
    incidentId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }>;
  _count?: { attachments: number };
};

function incidentToDto(i: IncidentRow) {
  return {
    id: i.id,
    incidentNumber: i.incidentNumber,
    title: i.title,
    description: i.description,
    reporterDeveloperId: i.reporterDeveloperId,
    reporterName: i.reporter?.displayName,
    involved: (i.involved ?? []).map((inv) => ({
      id: inv.developer.id,
      displayName: inv.developer.displayName,
      workEmail: inv.developer.workEmail,
      jobTitle: inv.developer.jobTitle,
    })),
    incidentAt: i.incidentAt.toISOString(),
    createdById: i.createdById,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    attachmentCount: i._count?.attachments,
    attachments: (i.attachments ?? []).map((a) => ({
      id: a.id,
      incidentId: a.incidentId,
      originalName: a.originalName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

const incidentInclude = {
  reporter: { select: { displayName: true } },
  involved: {
    select: {
      developer: {
        select: { id: true, displayName: true, workEmail: true, jobTitle: true },
      },
    },
  },
} satisfies Prisma.IncidentInclude;

async function nextIncidentNumber(): Promise<string> {
  const last = await prisma.incident.findFirst({
    orderBy: { incidentNumber: "desc" },
    select: { incidentNumber: true },
  });
  return nextIncidentNumberFrom(last?.incidentNumber);
}

export async function registerIncidentRoutes(app: FastifyInstance, env: Env) {
  const root = uploadRoot(env);

  app.get("/api/incidents", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(q);
    const and: Prisma.IncidentWhereInput[] = [];
    if (q.reporterDeveloperId) and.push({ reporterDeveloperId: q.reporterDeveloperId });
    if (q.involvedDeveloperId) {
      and.push({ involved: { some: { developerId: q.involvedDeveloperId } } });
    }
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime())) return reply.status(400).send({ error: "invalid_from" });
      and.push({ incidentAt: { gte: d } });
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime())) return reply.status(400).send({ error: "invalid_to" });
      and.push({ incidentAt: { lte: d } });
    }
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { description: { contains: pq.q, mode: "insensitive" } },
          { incidentNumber: { contains: pq.q, mode: "insensitive" } },
          { reporter: { displayName: { contains: pq.q, mode: "insensitive" } } },
          {
            involved: {
              some: { developer: { displayName: { contains: pq.q, mode: "insensitive" } } },
            },
          },
        ],
      });
    }
    const where: Prisma.IncidentWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ incidentAt: "desc" }, { updatedAt: "desc" }],
        include: { ...incidentInclude, _count: { select: { attachments: true } } },
      }),
      prisma.incident.count({ where }),
    ]);
    return withPageMeta(
      { incidents: rows.map((r) => incidentToDto(r)) },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/incidents/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const row = await prisma.incident.findUnique({
      where: { id },
      include: { ...incidentInclude, attachments: true },
    });
    if (!row) return reply.status(404).send({ error: "not_found" });
    return incidentToDto(row);
  });

  app.post("/api/incidents", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const incidentAt = new Date(b.incidentAt);
    if (Number.isNaN(incidentAt.getTime())) {
      return reply.status(400).send({ error: "invalid_incidentAt" });
    }
    const reporter = await prisma.developer.findUnique({
      where: { id: b.reporterDeveloperId },
    });
    if (!reporter) return reply.status(400).send({ error: "invalid_reporter" });

    const involvedIds = [...new Set(b.involvedDeveloperIds)];
    if (involvedIds.length) {
      const count = await prisma.developer.count({ where: { id: { in: involvedIds } } });
      if (count !== involvedIds.length) {
        return reply.status(400).send({ error: "invalid_involved" });
      }
    }

    const incidentNumber = await nextIncidentNumber();
    const row = await prisma.incident.create({
      data: {
        incidentNumber,
        title: b.title,
        description: b.description,
        reporterDeveloperId: b.reporterDeveloperId,
        createdById: me.id,
        incidentAt,
        involved: {
          create: involvedIds.map((developerId) => ({ developerId })),
        },
      },
      include: incidentInclude,
    });
    return reply.status(201).send(incidentToDto(row));
  });

  app.patch("/api/incidents/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    let incidentAt: Date | undefined;
    if (b.incidentAt !== undefined) {
      incidentAt = new Date(b.incidentAt);
      if (Number.isNaN(incidentAt.getTime())) {
        return reply.status(400).send({ error: "invalid_incidentAt" });
      }
    }
    if (b.reporterDeveloperId !== undefined) {
      const reporter = await prisma.developer.findUnique({
        where: { id: b.reporterDeveloperId },
      });
      if (!reporter) return reply.status(400).send({ error: "invalid_reporter" });
    }
    let involvedIds: string[] | undefined;
    if (b.involvedDeveloperIds !== undefined) {
      involvedIds = [...new Set(b.involvedDeveloperIds)];
      if (involvedIds.length) {
        const count = await prisma.developer.count({ where: { id: { in: involvedIds } } });
        if (count !== involvedIds.length) {
          return reply.status(400).send({ error: "invalid_involved" });
        }
      }
    }

    const row = await prisma.$transaction(async (tx) => {
      if (involvedIds !== undefined) {
        await tx.incidentInvolvement.deleteMany({ where: { incidentId: id } });
        if (involvedIds.length) {
          await tx.incidentInvolvement.createMany({
            data: involvedIds.map((developerId) => ({ incidentId: id, developerId })),
          });
        }
      }
      return tx.incident.update({
        where: { id },
        data: {
          ...(b.title !== undefined ? { title: b.title } : {}),
          ...(b.description !== undefined ? { description: b.description } : {}),
          ...(b.reporterDeveloperId !== undefined
            ? { reporterDeveloperId: b.reporterDeveloperId }
            : {}),
          ...(incidentAt !== undefined ? { incidentAt } : {}),
        },
        include: incidentInclude,
      });
    });
    return incidentToDto(row);
  });

  app.delete("/api/incidents/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.incident.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    await prisma.incident.delete({ where: { id } });
    for (const a of existing.attachments) {
      await deleteStoredFile(root, a.storageKey);
    }
    return reply.status(204).send();
  });

  // --- Attachments ---

  app.post("/api/incidents/:id/attachments", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return reply.status(404).send({ error: "not_found" });

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "missing_file" });

    let stored;
    try {
      stored = await storeMultipartFile(root, data, env.MAX_UPLOAD_BYTES);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "file_too_large") return reply.status(413).send({ error: "file_too_large" });
      if (msg === "unsupported_mime") return reply.status(400).send({ error: "unsupported_mime" });
      throw e;
    }

    const row = await prisma.incidentAttachment.create({
      data: {
        incidentId: id,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        createdById: me.id,
      },
    });
    return reply.status(201).send({
      id: row.id,
      incidentId: row.incidentId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    });
  });

  app.get("/api/incident-attachments/:id/file", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const row = await prisma.incidentAttachment.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "not_found" });

    const abs = pathForKey(root, row.storageKey);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      )
      .type(row.mimeType);
    return reply.send(createReadStream(abs));
  });

  app.delete("/api/incident-attachments/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const row = await prisma.incidentAttachment.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ error: "not_found" });

    await prisma.incidentAttachment.delete({ where: { id } });
    await deleteStoredFile(root, row.storageKey);
    return reply.status(204).send();
  });

  // --- PDF export ---

  app.get("/api/incidents/:id/pdf", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const row = await prisma.incident.findUnique({
      where: { id },
      include: { ...incidentInclude, attachments: true },
    });
    if (!row) return reply.status(404).send({ error: "not_found" });

    const pdf = await buildIncidentPdf({
      incidentNumber: row.incidentNumber,
      title: row.title,
      description: row.description,
      reporterName: row.reporter?.displayName ?? "Unknown",
      involvedNames: row.involved.map((inv) => inv.developer.displayName),
      incidentAt: row.incidentAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      attachments: row.attachments.map((a) => ({
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      })),
    });

    const filename = `incident-${row.incidentNumber}.pdf`;
    reply
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      .type("application/pdf");
    return reply.send(pdf);
  });
}
