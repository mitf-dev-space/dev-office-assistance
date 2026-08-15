import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, catalogEnvFrom } from "./env.js";
import { createAuthPlugin } from "./auth.js";
import {
  registerAuthLoginRoutes,
  registerAuthPasswordChangeRoutes,
} from "./routes/authLogin.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerUsersRoutes } from "./routes/users.js";
import { registerTriageRoutes } from "./routes/triage.js";
import { registerTriageAttachmentRoutes } from "./routes/triageAttachments.js";
import { registerIncidentRoutes } from "./routes/incidents.js";
import { registerSurveyRoutes } from "./routes/surveys.js";
import { registerPublicSurveyRoutes } from "./routes/publicSurveys.js";
import { registerExpensesRoutes } from "./routes/expenses.js";
import { registerPlanningRoutes } from "./routes/planning.js";
import { registerTeamMembershipRoutes } from "./routes/teamMemberships.js";
import { registerDashboardOverviewRoutes } from "./routes/dashboardOverview.js";
import { registerStandupRoutes } from "./routes/standup.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerDeveloperRoutes } from "./routes/developers.js";
import { registerOutlookRoutes } from "./routes/outlook.js";
import { registerMicrosoftTodoRoutes } from "./routes/microsoftTodo.js";
import { registerClickUpRoutes, registerClickUpWebhookRoutes } from "./routes/clickup.js";
import { registerM365IntegrationsRoutes } from "./routes/m365Integrations.js";
import { registerForgeUserRoutes } from "./routes/forge/userRoutes.js";
import { registerForgeWorkerRoutes } from "./routes/forge/workerRoutes.js";
import { registerCatalogRoutes, registerCatalogWebhookRoutes } from "./routes/catalogRoutes.js";
import { registerLlmSettingsRoutes } from "./routes/llmSettings.js";
import { registerAssistRoutes } from "./routes/assist.js";
import { registerAiProposalRoutes } from "./routes/aiProposals.js";
import { registerInsightsRoutes } from "./routes/insights.js";
import { registerVoiceRoutes } from "./voice/routes.js";
import { startCatalogWorker } from "./catalog/jobs/worker.js";
import {
  startClickUpScheduler,
  startMicrosoftTodoScheduler,
} from "./jobs/externalWorkWorker.js";
import { startInsightsScheduler } from "./insights/runInsightJob.js";
import { seedCatalog } from "./catalog/seed/catalogBasics.js";
import { seedCatalogInventory } from "./catalog/seed/inventorySeed.js";
import { seedConnectionTokensFromEnv } from "./catalog/seed/connectionTokens.js";
import { seedHelmGithubRepository } from "./catalog/seed/helmGithubRepository.js";
import { seedClickUpTokenFromEnv } from "./clickup/connectionService.js";
import { seedOpenRouterFromEnv } from "./llm/seedOpenRouterFromEnv.js";
import { prisma } from "./db.js";
import { ensureUploadDir } from "./upload/storage.js";

export async function buildServer() {
  const env = loadEnv();
  await ensureUploadDir(resolve(process.cwd(), env.UPLOAD_DIR));
  const authMiddleware = createAuthPlugin(env);

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            headers: {
              host: request.headers.host,
              "user-agent": request.headers["user-agent"],
              "x-request-id": request.headers["x-request-id"],
            },
          };
        },
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: (req) => {
      const existing = req.headers["x-request-id"];
      if (typeof existing === "string" && existing.trim()) return existing.trim();
      return randomUUID();
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Graph-Access-Token",
      "X-Request-Id",
    ],
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
  });

  app.get("/health/live", async () => ({
    status: "ok",
    service: "helm-api",
    check: "live",
  }));

  app.get("/healthz", async () => ({
    status: "ok",
    service: "helm-api",
    check: "live",
  }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", service: "helm-api", check: "ready", database: "up" };
    } catch {
      return reply.code(503).send({
        status: "unavailable",
        service: "helm-api",
        check: "ready",
        database: "down",
      });
    }
  });

  registerAuthLoginRoutes(app, env);

  await app.register(multipart, {
    limits: { fileSize: Math.max(env.MAX_UPLOAD_BYTES, env.FORGE_MAX_ARTIFACT_BYTES) },
  });

  await registerForgeWorkerRoutes(app, env);
  await registerCatalogWebhookRoutes(app, env);
  await registerClickUpWebhookRoutes(app, env);
  await registerPublicSurveyRoutes(app);

  await app.register(async function protectedApi(inner) {
    inner.addHook("preValidation", authMiddleware);
    await registerMeRoutes(inner, env);
    await registerAuthPasswordChangeRoutes(inner, env);
    await registerM365IntegrationsRoutes(inner, env);
    await registerUsersRoutes(inner, env);
    await registerTriageRoutes(inner);
    await registerTriageAttachmentRoutes(inner, env);
    await registerIncidentRoutes(inner, env);
    await registerSurveyRoutes(inner, env);
    await registerExpensesRoutes(inner, env);
    await registerPlanningRoutes(inner);
    await registerTeamMembershipRoutes(inner);
    await registerDashboardOverviewRoutes(inner);
    await registerStandupRoutes(inner);
    await registerDecisionRoutes(inner);
    await registerSearchRoutes(inner);
    await registerDeveloperRoutes(inner);
    await registerOutlookRoutes(inner);
    await registerMicrosoftTodoRoutes(inner);
    await registerClickUpRoutes(inner, env);
    await registerForgeUserRoutes(inner, env);
    await registerCatalogRoutes(inner, env);
    await registerLlmSettingsRoutes(inner, env);
    await registerAssistRoutes(inner, env);
    await registerAiProposalRoutes(inner);
    await registerInsightsRoutes(inner, env);
    await registerVoiceRoutes(inner, env);
  });

  startCatalogWorker(prisma, catalogEnvFrom(env), env);
  startClickUpScheduler(prisma, env);
  startMicrosoftTodoScheduler(prisma, env);
  startInsightsScheduler(prisma, env);

  try {
    // Connections/teams must exist before inventory fixtures can attach repos.
    // Production migrate-only deploys never ran prisma db seed — seed here (idempotent).
    await seedCatalog(prisma);
    await seedCatalogInventory(prisma);
    await seedConnectionTokensFromEnv(prisma, env);
    await seedHelmGithubRepository(prisma, catalogEnvFrom(env));
    await seedClickUpTokenFromEnv(prisma, env);
    await seedOpenRouterFromEnv(prisma, env);
  } catch (err) {
    app.log.warn({ err }, "Catalog inventory startup seed failed (non-fatal)");
  }

  return { app, env };
}

async function main() {
  const { app, env } = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gracefully");
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
