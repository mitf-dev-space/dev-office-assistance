import { createReadStream } from "node:fs";
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
  createForgeApplicationSchema,
  updateForgeApplicationSchema,
} from "../../forge/schemas/applicationSchemas.js";
import {
  createForgeBuildProfileSchema,
  updateForgeBuildProfileSchema,
} from "../../forge/schemas/buildProfileSchemas.js";
import { createForgeBuildRequestSchema } from "../../forge/schemas/buildRequestSchemas.js";
import { createForgeRunnerSchema } from "../../forge/schemas/runnerSchemas.js";
import {
  createForgeBank,
  getForgeBankById,
  listForgeBanks,
  updateForgeBank,
} from "../../forge/services/bankService.js";
import {
  createForgeApplication,
  getForgeApplicationById,
  listActiveForgeCatalog,
  listForgeApplications,
  updateForgeApplication,
} from "../../forge/services/applicationService.js";
import {
  createForgeBuildProfile,
  getForgeBuildProfileById,
  listForgeBuildProfiles,
  updateForgeBuildProfile,
} from "../../forge/services/buildProfileService.js";
import {
  createForgeBuildRequest,
  getForgeBuildRequestDetail,
  listForgeBuildRequests,
} from "../../forge/services/buildRequestService.js";
import { createForgeRunner, listForgeRunners } from "../../forge/services/runnerService.js";
import { resolveArtifactReadPath } from "../../forge/services/artifactStorage.js";
import { isSmtpConfigured, sendMail } from "../../mail/mailService.js";
import { renderForgeEmailSamples } from "../../forge/services/buildNotificationService.js";
import { prisma } from "../../db.js";
import { parseListQuery, withPageMeta } from "../../lib/listQuery.js";
import { z } from "zod";

type ForgeBankRow = Awaited<ReturnType<typeof listForgeBanks>>["rows"][number];
type ForgeApplicationRow = Awaited<ReturnType<typeof listForgeApplications>>["rows"][number];
type ForgeProfileRow = Awaited<ReturnType<typeof listForgeBuildProfiles>>["rows"][number];
type ForgeBuildRequestRow = Awaited<ReturnType<typeof listForgeBuildRequests>>["rows"][number];
type ForgeRunnerRow = Awaited<ReturnType<typeof listForgeRunners>>["rows"][number];

function mapBank(row: ForgeBankRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.isActive,
    sharedDeliveryPath: row.sharedDeliveryPath,
    applicationCount: row._count.applications,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapApplication(row: ForgeApplicationRow) {
  return {
    id: row.id,
    bankId: row.bankId,
    bankName: row.bank.name,
    bankCode: row.bank.code,
    name: row.name,
    description: row.description,
    repositoryProvider: row.repositoryProvider,
    repositoryUrl: row.repositoryUrl,
    projectSubpath: row.projectSubpath,
    defaultBranch: row.defaultBranch,
    requiredFlutterVersion: row.requiredFlutterVersion,
    androidEnabled: row.androidEnabled,
    iosEnabled: row.iosEnabled,
    isActive: row.isActive,
    sharedDeliveryPath: row.sharedDeliveryPath,
    bankSharedDeliveryPath: row.bank.sharedDeliveryPath ?? null,
    profileCount: row._count.buildProfiles,
    buildCount: row._count.buildRequests,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapProfile(row: ForgeProfileRow) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    applicationName: row.application.name,
    name: row.name,
    description: row.description,
    flutterFlavor: row.flutterFlavor,
    dartEntryPoint: row.dartEntryPoint,
    environmentName: row.environmentName,
    androidArtifactType: row.androidArtifactType,
    androidBuildMode: row.androidBuildMode,
    iosExportMethod: row.iosExportMethod,
    timeoutMinutes: row.timeoutMinutes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBuildRequestSummary(row: ForgeBuildRequestRow) {
  return {
    id: row.id,
    applicationName: row.application.name,
    bankName: row.application.bank.name,
    overallStatus: row.overallStatus,
    gitReference: row.gitReference,
    createdAt: row.createdAt.toISOString(),
    requestedBy: row.requestedBy.displayName ?? row.requestedBy.email,
  };
}

function mapBuildRequestDetail(row: NonNullable<Awaited<ReturnType<typeof getForgeBuildRequestDetail>>>) {
  return {
    id: row.id,
    overallStatus: row.overallStatus,
    gitReferenceType: row.gitReferenceType,
    gitReference: row.gitReference,
    requestNote: row.requestNote,
    publishToSharedFolder: row.publishToSharedFolder,
    notifyEmail: row.notifyEmail,
    sharedDeliveryPath: row.sharedDeliveryPath,
    sharedDeliveryFileName: row.sharedDeliveryFileName,
    sharedDeliveryStatus: row.sharedDeliveryStatus,
    sharedDeliveryError: row.sharedDeliveryError,
    createdAt: row.createdAt.toISOString(),
    startedAtUtc: row.startedAtUtc?.toISOString() ?? null,
    completedAtUtc: row.completedAtUtc?.toISOString() ?? null,
    application: {
      id: row.application.id,
      name: row.application.name,
      bankName: row.application.bank.name,
    },
    buildProfile: {
      id: row.buildProfile.id,
      name: row.buildProfile.name,
      androidBuildMode: row.buildProfile.androidBuildMode,
    },
    requestedBy: row.requestedBy.displayName ?? row.requestedBy.email,
    platformBuilds: row.platformBuilds.map((pb) => ({
      id: pb.id,
      platform: pb.platform,
      status: pb.status,
      failureCategory: pb.failureCategory,
      failureSummary: pb.failureSummary,
      startedAtUtc: pb.startedAtUtc?.toISOString() ?? null,
      completedAtUtc: pb.completedAtUtc?.toISOString() ?? null,
      runnerName: pb.runner?.name ?? null,
      artifacts: pb.artifacts.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        contentType: a.contentType,
        fileSizeBytes: a.fileSizeBytes.toString(),
        checksumSha256: a.checksumSha256,
        createdAt: a.createdAt.toISOString(),
      })),
    })),
  };
}

export async function registerForgeUserRoutes(app: FastifyInstance, env: Env) {
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
      where: { overallStatus: "Succeeded", completedAtUtc: { gte: startOfDay } },
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
      moduleStatus: "loop10" as const,
    };
  });

  app.get("/api/forge/catalog", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;

    const apps = await listActiveForgeCatalog();
    return {
      applications: apps.map((app) => ({
        id: app.id,
        name: app.name,
        bankId: app.bank.id,
        bankName: app.bank.name,
        bankCode: app.bank.code,
        defaultBranch: app.defaultBranch,
        androidEnabled: app.androidEnabled,
        iosEnabled: app.iosEnabled,
        sharedDeliveryPath: app.sharedDeliveryPath,
        bankSharedDeliveryPath: app.bank.sharedDeliveryPath,
        resolvedSharedDeliveryPath: app.sharedDeliveryPath ?? app.bank.sharedDeliveryPath ?? null,
        profiles: app.buildProfiles.map((p) => ({
          id: p.id,
          name: p.name,
          androidBuildMode: p.androidBuildMode,
          androidArtifactType: p.androidArtifactType,
        })),
      })),
    };
  });

  app.get("/api/forge/build-requests", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    const raw = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(raw);
    const { rows, total } = await listForgeBuildRequests(pq, { status: raw.status });
    return withPageMeta({ items: rows.map(mapBuildRequestSummary) }, pq.page, pq.limit, total);
  });

  app.post("/api/forge/build-requests", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireForgeAccess(me, reply))) return;

    const parsed = createForgeBuildRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    try {
      const detail = await createForgeBuildRequest(me.id, parsed.data);
      if (!detail) {
        return reply.status(500).send({ error: "create_failed" });
      }
      return reply.status(201).send({ buildRequest: mapBuildRequestDetail(detail) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "create_failed";
      if (msg === "application_not_found" || msg === "profile_not_found") {
        return reply.status(404).send({ error: msg });
      }
      if (
        msg === "android_not_enabled" ||
        msg === "ios_not_enabled" ||
        msg === "notify_email_required" ||
        msg === "shared_delivery_path_required" ||
        msg === "invalid_shared_delivery_path"
      ) {
        return reply.status(400).send({ error: msg });
      }
      throw err;
    }
  });

  app.get("/api/forge/build-requests/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    const { id } = request.params as { id: string };
    const detail = await getForgeBuildRequestDetail(id);
    if (!detail) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { buildRequest: mapBuildRequestDetail(detail) };
  });

  app.get("/api/forge/artifacts/:id/download", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;
    const { id } = request.params as { id: string };

    const artifact = await prisma.forgeArtifact.findUnique({
      where: { id },
      include: { platformBuild: { include: { buildRequest: true } } },
    });
    if (!artifact) {
      return reply.status(404).send({ error: "not_found" });
    }

    try {
      const path = resolveArtifactReadPath(env, artifact.storagePath);
      reply.header("Content-Type", artifact.contentType);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${artifact.fileName.replace(/"/g, "")}"`,
      );
      return reply.send(createReadStream(path));
    } catch {
      return reply.status(404).send({ error: "artifact_missing" });
    }
  });

  app.get("/api/forge/banks", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    const pq = parseListQuery(request.query as Record<string, string | undefined>);
    const { rows, total } = await listForgeBanks(pq);
    return withPageMeta({ items: rows.map(mapBank) }, pq.page, pq.limit, total);
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
          sharedDeliveryPath: row.sharedDeliveryPath,
          applicationCount: 0,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("invalid_shared_path")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({ error: "conflict", message: "A bank with this code already exists." });
      }
      throw err;
    }
  });

  app.put("/api/forge/banks/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const { id } = request.params as { id: string };
    if (!(await getForgeBankById(id))) {
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
          sharedDeliveryPath: row.sharedDeliveryPath,
          applicationCount: counts,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("invalid_shared_path")) {
        return reply.status(400).send({ error: err.message });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({ error: "conflict", message: "A bank with this code already exists." });
      }
      throw err;
    }
  });

  app.get("/api/forge/applications", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    const pq = parseListQuery(request.query as Record<string, string | undefined>);
    const { rows, total } = await listForgeApplications(pq);
    return withPageMeta({ items: rows.map(mapApplication) }, pq.page, pq.limit, total);
  });

  app.post("/api/forge/applications", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const parsed = createForgeApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const bank = await getForgeBankById(parsed.data.bankId);
    if (!bank) {
      return reply.status(404).send({ error: "bank_not_found" });
    }

    try {
      const row = await createForgeApplication(parsed.data);
      return reply.status(201).send({
        application: {
          id: row.id,
          name: row.name,
          sharedDeliveryPath: row.sharedDeliveryPath,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("invalid_shared_path")) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.put("/api/forge/applications/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const { id } = request.params as { id: string };
    if (!(await getForgeApplicationById(id))) {
      return reply.status(404).send({ error: "not_found" });
    }

    const parsed = updateForgeApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    try {
      const row = await updateForgeApplication(id, parsed.data);
      return {
        application: {
          id: row.id,
          name: row.name,
          isActive: row.isActive,
          sharedDeliveryPath: row.sharedDeliveryPath,
        },
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("invalid_shared_path")) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/api/forge/build-profiles", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    const raw = request.query as { applicationId?: string };
    const pq = parseListQuery(raw);
    const { rows, total } = await listForgeBuildProfiles(pq, raw.applicationId);
    return withPageMeta({ items: rows.map(mapProfile) }, pq.page, pq.limit, total);
  });

  app.post("/api/forge/build-profiles", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const parsed = createForgeBuildProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const appRow = await getForgeApplicationById(parsed.data.applicationId);
    if (!appRow) {
      return reply.status(404).send({ error: "application_not_found" });
    }

    const row = await createForgeBuildProfile(parsed.data);
    return reply.status(201).send({ profile: { id: row.id, name: row.name } });
  });

  app.put("/api/forge/build-profiles/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const { id } = request.params as { id: string };
    if (!(await getForgeBuildProfileById(id))) {
      return reply.status(404).send({ error: "not_found" });
    }

    const parsed = updateForgeBuildProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const row = await updateForgeBuildProfile(id, parsed.data);
    return { profile: { id: row.id, name: row.name, isActive: row.isActive } };
  });

  app.get("/api/forge/runners", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    const pq = parseListQuery(request.query as Record<string, string | undefined>);
    const { rows, total } = await listForgeRunners(pq);
    return withPageMeta(
      {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          operatingSystem: r.operatingSystem,
          architecture: r.architecture,
          supportedPlatforms: r.supportedPlatforms,
          status: r.status,
          tokenHint: r.tokenHint,
          lastHeartbeatAtUtc: r.lastHeartbeatAtUtc?.toISOString() ?? null,
          maximumConcurrentJobs: r.maximumConcurrentJobs,
          currentJobCount: r.currentJobCount,
          version: r.version,
        })),
      },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.post("/api/forge/runners", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;

    const parsed = createForgeRunnerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    try {
      const { runner, token } = await createForgeRunner(parsed.data);
      return reply.status(201).send({
        runner: { id: runner.id, name: runner.name, tokenHint: runner.tokenHint },
        token,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.status(409).send({ error: "conflict", message: "Runner name already exists." });
      }
      throw err;
    }
  });

  app.post("/api/forge/admin/test-email", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!me) return;
    if (!(await requireForgeAdmin(me, reply))) return;

    if (!isSmtpConfigured(env)) {
      return reply.status(503).send({ error: "smtp_not_configured" });
    }

    const parsed = z
      .object({
        to: z.string().email().optional(),
        /** When true (default), send styled success + failure samples instead of a plain SMTP ping. */
        samples: z.boolean().optional().default(true),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const to = parsed.data.to ?? me.email;
    const baseUrl = env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5174";
    try {
      if (parsed.data.samples === false) {
        await sendMail(env, {
          to,
          subject: "[Helm Forge] SMTP connectivity test",
          text: `SMTP OK at ${new Date().toISOString()}`,
        });
        return { ok: true, to, kind: "connectivity" };
      }

      const samples = renderForgeEmailSamples(`${baseUrl}/forge/builds/sample`);
      await sendMail(env, {
        to,
        subject: samples.success.subject,
        text: samples.success.text,
        html: samples.success.html,
      });
      await sendMail(env, {
        to,
        subject: samples.failure.subject,
        text: samples.failure.text,
        html: samples.failure.html,
      });
      return { ok: true, to, kind: "samples", sent: ["success", "failure"] };
    } catch (err) {
      const message = err instanceof Error ? err.message : "send_failed";
      return reply.status(502).send({ error: "smtp_send_failed", message });
    }
  });
}
