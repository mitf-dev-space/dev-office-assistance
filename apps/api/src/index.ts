import { resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "./env.js";
import { createAuthPlugin } from "./auth.js";
import { registerAuthLoginRoutes } from "./routes/authLogin.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerUsersRoutes } from "./routes/users.js";
import { registerTriageRoutes } from "./routes/triage.js";
import { registerTriageAttachmentRoutes } from "./routes/triageAttachments.js";
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
import { registerM365IntegrationsRoutes } from "./routes/m365Integrations.js";
import { registerForgeUserRoutes } from "./routes/forge/userRoutes.js";
import { registerForgeWorkerRoutes } from "./routes/forge/workerRoutes.js";
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
            },
          };
        },
      },
    },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Graph-Access-Token",
    ],
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
  });

  app.get("/healthz", async () => ({ ok: true }));

  registerAuthLoginRoutes(app, env);

  await registerForgeWorkerRoutes(app, env);

  await app.register(async function protectedApi(inner) {
    await inner.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES } });
    inner.addHook("preValidation", authMiddleware);
    await registerMeRoutes(inner, env);
    await registerM365IntegrationsRoutes(inner, env);
    await registerUsersRoutes(inner);
    await registerTriageRoutes(inner);
    await registerTriageAttachmentRoutes(inner, env);
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
    await registerForgeUserRoutes(inner, env);
  });

  return { app, env };
}

async function main() {
  const { app, env } = await buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
