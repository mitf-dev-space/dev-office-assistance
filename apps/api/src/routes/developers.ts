import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, type RosterPosition } from "@prisma/client";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";

function trimOrNull(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function patchStr(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const rosterPositionZ = z.enum(["member", "department_head", "department_assistant"]);

const postBody = z.object({
  displayName: z.string().min(1).max(200).trim(),
  skills: z.string().max(16000).optional(),
  workEmail: z.string().max(320).optional(),
  phone: z.string().max(64).optional(),
  location: z.string().max(200).optional(),
  bio: z.string().max(16000).optional(),
  skillDetails: z.string().max(16000).optional(),
  achievements: z.string().max(16000).optional(),
  jobTitle: z.string().max(200).optional(),
  hireDate: z.union([z.string().max(48), z.null()]).optional(),
  tenureLabel: z.string().max(120).optional(),
  rosterPosition: rosterPositionZ.optional(),
});

const patchBody = z.object({
  displayName: z.string().min(1).max(200).trim().optional(),
  skills: z.union([z.string().max(16000), z.null()]).optional(),
  workEmail: z.union([z.string().max(320), z.null()]).optional(),
  phone: z.union([z.string().max(64), z.null()]).optional(),
  location: z.union([z.string().max(200), z.null()]).optional(),
  bio: z.union([z.string().max(16000), z.null()]).optional(),
  skillDetails: z.union([z.string().max(16000), z.null()]).optional(),
  achievements: z.union([z.string().max(16000), z.null()]).optional(),
  jobTitle: z.union([z.string().max(200), z.null()]).optional(),
  hireDate: z.union([z.string().max(48), z.null()]).optional(),
  tenureLabel: z.union([z.string().max(120), z.null()]).optional(),
  rosterPosition: rosterPositionZ.optional(),
});

type DeveloperRow = {
  id: string;
  displayName: string;
  skills: string | null;
  workEmail: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  skillDetails: string | null;
  achievements: string | null;
  jobTitle: string | null;
  hireDate: Date | null;
  tenureLabel: string | null;
  rosterPosition: RosterPosition;
  createdAt: Date;
  updatedAt: Date;
};

function hireDateToDto(d: Date | null) {
  if (d == null) return null;
  return d.toISOString().slice(0, 10);
}

function toDto(d: DeveloperRow) {
  return {
    id: d.id,
    displayName: d.displayName,
    skills: d.skills,
    workEmail: d.workEmail,
    phone: d.phone,
    location: d.location,
    bio: d.bio,
    skillDetails: d.skillDetails,
    achievements: d.achievements,
    jobTitle: d.jobTitle,
    hireDate: hireDateToDto(d.hireDate),
    tenureLabel: d.tenureLabel,
    rosterPosition: d.rosterPosition,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function parseHireInput(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  if (t === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const asDate = new Date(t);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

async function canDeleteDeveloper(id: string) {
  const triage = await prisma.triageItem.count({ where: { assigneeDeveloperId: id } });
  return {
    ok: triage === 0,
    blockedBy: { triageAsAssignee: triage },
  };
}

export async function registerDeveloperRoutes(app: FastifyInstance) {
  app.get("/api/developers", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const raw = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(raw, { maxLimit: 500 });
    const and: Prisma.DeveloperWhereInput[] = [];
    if (pq.q) {
      and.push({
        OR: [
          { displayName: { contains: pq.q, mode: "insensitive" } },
          { skills: { contains: pq.q, mode: "insensitive" } },
          { workEmail: { contains: pq.q, mode: "insensitive" } },
          { jobTitle: { contains: pq.q, mode: "insensitive" } },
          { location: { contains: pq.q, mode: "insensitive" } },
        ],
      });
    }
    const where: Prisma.DeveloperWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      prisma.developer.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ displayName: "asc" }],
      }),
      prisma.developer.count({ where }),
    ]);
    return withPageMeta(
      { developers: rows.map((d) => toDto(d)) },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/developers/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const d = await prisma.developer.findUnique({ where: { id } });
    if (!d) return reply.status(404).send({ error: "not_found" });
    return toDto(d);
  });

  app.post("/api/developers", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = postBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const d = await prisma.developer.create({
      data: {
        displayName: b.displayName,
        skills: trimOrNull(b.skills),
        workEmail: trimOrNull(b.workEmail),
        phone: trimOrNull(b.phone),
        location: trimOrNull(b.location),
        bio: trimOrNull(b.bio),
        skillDetails: trimOrNull(b.skillDetails),
        achievements: trimOrNull(b.achievements),
        jobTitle: trimOrNull(b.jobTitle),
        hireDate: parseHireInput(b.hireDate ?? undefined) ?? null,
        tenureLabel: trimOrNull(b.tenureLabel),
        rosterPosition: b.rosterPosition ?? "member",
      },
    });
    return reply.status(201).send(toDto(d));
  });

  app.patch("/api/developers/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.developer.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const d = await prisma.developer.update({
      where: { id },
      data: {
        ...(b.displayName !== undefined ? { displayName: b.displayName } : {}),
        ...(b.skills !== undefined ? { skills: patchStr(b.skills) ?? null } : {}),
        ...(b.workEmail !== undefined ? { workEmail: patchStr(b.workEmail) ?? null } : {}),
        ...(b.phone !== undefined ? { phone: patchStr(b.phone) ?? null } : {}),
        ...(b.location !== undefined ? { location: patchStr(b.location) ?? null } : {}),
        ...(b.bio !== undefined ? { bio: patchStr(b.bio) ?? null } : {}),
        ...(b.skillDetails !== undefined ? { skillDetails: patchStr(b.skillDetails) ?? null } : {}),
        ...(b.achievements !== undefined ? { achievements: patchStr(b.achievements) ?? null } : {}),
        ...(b.jobTitle !== undefined ? { jobTitle: patchStr(b.jobTitle) ?? null } : {}),
        ...(b.hireDate !== undefined
          ? { hireDate: parseHireInput(b.hireDate === null ? null : b.hireDate) ?? null }
          : {}),
        ...(b.tenureLabel !== undefined ? { tenureLabel: patchStr(b.tenureLabel) ?? null } : {}),
        ...(b.rosterPosition !== undefined ? { rosterPosition: b.rosterPosition } : {}),
      },
    });
    return toDto(d);
  });

  app.delete("/api/developers/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const d = await prisma.developer.findUnique({ where: { id } });
    if (!d) return reply.status(404).send({ error: "not_found" });
    const { ok, blockedBy } = await canDeleteDeveloper(id);
    if (!ok) {
      return reply.status(409).send({ error: "has_related_data", blockedBy });
    }
    try {
      await prisma.developer.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return reply.status(409).send({ error: "foreign_key", message: e.message });
      }
      throw e;
    }
    return reply.status(204).send();
  });
}
