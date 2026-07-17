import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { Env } from "../../env.js";
import { requireDbUser } from "../../userService.js";
import { requireForgeAccess, requireForgeAdmin } from "../../forge/authz.js";
import {
  createForgeBankSchema,
  updateForgeBankSchema,
} from "../../forge/schemas/bankSchemas.js";
import {
  createForgeBank,
  getForgeBankById,
  listForgeBanks,
  updateForgeBank,
} from "../../forge/services/bankService.js";
import { prisma } from "../../db.js";

function mapBank(row: Awaited<ReturnType<typeof listForgeBanks>>[number]) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.isActive,
    applicationCount: row._count.applications,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerForgeUserRoutes(app: FastifyInstance, _env: Env) {
  app.get("/api/forge/dashboard", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;

    const [queuedBuilds, runningBuilds, waitingForMacOs, onlineRunners, offlineRunners] =
      await Promise.all([
        prisma.forgePlatformBuild.count({
          where: { status: { in: ["Queued", "WaitingForCompatibleRunner"] } },
        }),
        prisma.forgePlatformBuild.count({
          where: {
            status: {
              in: [
                "Claimed",
                "PreparingWorkspace",
                "CloningRepository",
                "Building",
                "Signing",
                "CollectingArtifact",
                "UploadingArtifact",
              ],
            },
          },
        }),
        prisma.forgePlatformBuild.count({
          where: { platform: "iOS", status: "WaitingForCompatibleRunner" },
        }),
        prisma.forgeRunner.count({ where: { status: "Online" } }),
        prisma.forgeRunner.count({ where: { status: { not: "Online" } } }),
      ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const successfulToday = await prisma.forgeBuildRequest.count({
      where: {
        overallStatus: "Succeeded",
        completedAtUtc: { gte: startOfDay },
      },
    });

    const failedToday = await prisma.forgeBuildRequest.count({
      where: {
        overallStatus: { in: ["Failed", "PartiallySucceeded"] },
        completedAtUtc: { gte: startOfDay },
      },
    });

    return {
      queuedBuilds,
      runningBuilds,
      waitingForMacOs,
      successfulToday,
      failedToday,
      onlineRunners,
      offlineRunners,
      moduleStatus: "loop5" as const,
    };
  });

  app.get("/api/forge/build-requests", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    return { items: [] as unknown[] };
  });

  app.post("/api/forge/build-requests", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    return reply.status(501).send({
      error: "not_implemented",
      message: "Build submission lands in PRD Loop 7.",
    });
  });

  app.get("/api/forge/build-requests/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    const { id } = request.params as { id: string };
    return reply.status(404).send({
      error: "not_found",
      message: `Build request ${id} not found (bootstrap stub).`,
    });
  });

  app.get("/api/forge/banks", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    const rows = await listForgeBanks();
    return { items: rows.map(mapBank) };
  });

  app.post("/api/forge/banks", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const parsed = createForgeBankSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    try {
      const row = await createForgeBank(parsed.data);
      return reply.status(201).send({
        bank: {
          id: row.id,
          name: row.name,
          code: row.code,
          isActive: row.isActive,
          applicationCount: 0,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({
          error: "conflict",
          message: "A bank with this code already exists.",
        });
      }
      throw err;
    }
  });

  app.put("/api/forge/banks/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const { id } = request.params as { id: string };
    const existing = await getForgeBankById(id);
    if (!existing) {
      return reply.status(404).send({ error: "not_found", message: "Bank not found." });
    }

    const parsed = updateForgeBankSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    if (Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: "validation", message: "No fields to update." });
    }

    try {
      const row = await updateForgeBank(id, parsed.data);
      const counts = await prisma.forgeApplication.count({ where: { bankId: id } });
      return {
        bank: {
          id: row.id,
          name: row.name,
          code: row.code,
          isActive: row.isActive,
          applicationCount: counts,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({
          error: "conflict",
          message: "A bank with this code already exists.",
        });
      }
      throw err;
    }
  });

  app.get("/api/forge/applications", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return { items: [] as unknown[] };
  });

  app.post("/api/forge/applications", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.put("/api/forge/applications/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.get("/api/forge/build-profiles", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return { items: [] as unknown[] };
  });

  app.post("/api/forge/build-profiles", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.put("/api/forge/build-profiles/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.get("/api/forge/runners", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return { items: [] as unknown[] };
  });
}
