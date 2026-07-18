import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../../db.js";
import type { Env } from "../../env.js";
import { workerFailSchema, workerProgressSchema } from "../../forge/schemas/runnerSchemas.js";
import {
  claimNextPlatformBuild,
  refreshBuildRequestOverallStatus,
  releaseRunnerJobSlot,
  transitionPlatformBuildStatus,
} from "../../forge/services/platformBuildService.js";
import { saveArtifactFile } from "../../forge/services/artifactStorage.js";
import { touchRunnerHeartbeat } from "../../forge/services/runnerService.js";
import { maybeNotifyBuildRequestComplete } from "../../forge/services/buildNotificationService.js";
import { maybePublishArtifactToSharedFolder } from "../../forge/services/sharedDeliveryService.js";

async function refreshOverallAndNotify(
  app: FastifyInstance,
  buildRequestId: string,
): Promise<void> {
  const { previousOverall, newOverall } = await refreshBuildRequestOverallStatus(buildRequestId);
  try {
    const sent = await maybeNotifyBuildRequestComplete(
      buildRequestId,
      previousOverall,
      newOverall,
    );
    if (sent) {
      app.log.info({ buildRequestId, newOverall }, "forge build notification email sent");
    }
  } catch (err) {
    app.log.error({ err, buildRequestId }, "forge build notification email failed");
  }
}

async function requireRunnerToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ runnerId: string } | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    await reply.status(401).send({ error: "missing_runner_token" });
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  if (token.length !== 64) {
    await reply.status(401).send({ error: "invalid_runner_token_format" });
    return null;
  }

  const hint = token.slice(0, 12);
  const candidates = await prisma.forgeRunner.findMany({
    where: { tokenHint: hint, tokenHash: { not: null } },
    select: { id: true, tokenHash: true },
  });

  for (const runner of candidates) {
    if (runner.tokenHash && (await bcrypt.compare(token, runner.tokenHash))) {
      return { runnerId: runner.id };
    }
  }

  await reply.status(401).send({ error: "invalid_runner_token" });
  return null;
}

export async function registerForgeWorkerRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/forge/runners/register", async (_request, reply) => {
    return reply.status(501).send({
      error: "not_implemented",
      message: "Use admin POST /api/forge/runners to create a runner and token.",
    });
  });

  app.post("/api/forge/runners/:id/heartbeat", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (auth.runnerId !== id) {
      return reply.status(403).send({ error: "runner_id_mismatch" });
    }
    await touchRunnerHeartbeat(id);
    return { ok: true };
  });

  app.post("/api/forge/runners/:id/claim", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (auth.runnerId !== id) {
      return reply.status(403).send({ error: "runner_id_mismatch" });
    }

    const runner = await prisma.forgeRunner.findUnique({ where: { id } });
    if (!runner) {
      return reply.status(404).send({ error: "not_found" });
    }

    const job = await claimNextPlatformBuild(id, runner.supportedPlatforms);
    if (!job) {
      return { job: null };
    }
    return { job };
  });

  app.post("/api/forge/platform-builds/:id/progress", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };

    const parsed = workerProgressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const row = await prisma.forgePlatformBuild.findUnique({ where: { id } });
    if (!row || row.runnerId !== auth.runnerId) {
      return reply.status(404).send({ error: "not_found" });
    }

    await transitionPlatformBuildStatus(id, parsed.data.status);
    await refreshOverallAndNotify(app, row.buildRequestId);
    return { ok: true };
  });

  app.post("/api/forge/platform-builds/:id/fail", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };

    const parsed = workerFailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }

    const row = await prisma.forgePlatformBuild.findUnique({ where: { id } });
    if (!row || row.runnerId !== auth.runnerId) {
      return reply.status(404).send({ error: "not_found" });
    }

    await transitionPlatformBuildStatus(id, "Failed", {
      failureCategory: parsed.data.failureCategory,
      failureSummary: parsed.data.failureSummary,
    });
    await refreshOverallAndNotify(app, row.buildRequestId);
    if (row.runnerId) {
      await releaseRunnerJobSlot(row.runnerId);
    }
    return { ok: true };
  });

  app.post("/api/forge/platform-builds/:id/complete", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };

    const row = await prisma.forgePlatformBuild.findUnique({ where: { id } });
    if (!row || row.runnerId !== auth.runnerId) {
      return reply.status(404).send({ error: "not_found" });
    }

    let currentStatus = row.status;
    if (currentStatus === "Building") {
      await transitionPlatformBuildStatus(id, "CollectingArtifact");
      currentStatus = "CollectingArtifact";
    }
    if (currentStatus === "CollectingArtifact") {
      await transitionPlatformBuildStatus(id, "UploadingArtifact");
    }

    const parts = request.parts();
    let fileName = "artifact.apk";
    let contentType = "application/octet-stream";
    let fileBuffer: Buffer | null = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "artifact") {
        fileName = part.filename || fileName;
        contentType = part.mimetype || contentType;
        fileBuffer = await part.toBuffer();
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: "missing_artifact_file" });
    }

    const saved = await saveArtifactFile(env, id, fileName, fileBuffer);

    await prisma.forgeArtifact.create({
      data: {
        platformBuildId: id,
        fileName,
        contentType,
        fileSizeBytes: saved.fileSizeBytes,
        checksumSha256: saved.checksumSha256,
        storagePath: saved.storagePath,
      },
    });

    try {
      const delivery = await maybePublishArtifactToSharedFolder({
        buildRequestId: row.buildRequestId,
        platformBuildId: id,
        sourceStoragePath: saved.storagePath,
        originalFileName: fileName,
      });
      if (delivery.status === "copied") {
        app.log.info(
          { buildRequestId: row.buildRequestId, path: delivery.path },
          "forge artifact published to shared folder",
        );
      } else if (delivery.status === "failed") {
        app.log.warn(
          { buildRequestId: row.buildRequestId, error: delivery.error },
          "forge shared folder publish failed",
        );
      }
    } catch (err) {
      app.log.error({ err, buildRequestId: row.buildRequestId }, "forge shared folder publish error");
    }

    await transitionPlatformBuildStatus(id, "Succeeded", { completedAtUtc: new Date() });
    await refreshOverallAndNotify(app, row.buildRequestId);
    if (row.runnerId) {
      await releaseRunnerJobSlot(row.runnerId);
    }

    return { ok: true, artifactPath: saved.storagePath };
  });
}
