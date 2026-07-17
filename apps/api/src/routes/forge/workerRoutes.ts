import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../../db.js";
import type { Env } from "../../env.js";

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

export async function registerForgeWorkerRoutes(app: FastifyInstance, _env: Env) {
  app.post("/api/forge/runners/register", async (_request, reply) => {
    return reply.status(501).send({
      error: "not_implemented",
      message: "Runner registration lands in PRD Loop 8.",
    });
  });

  app.post("/api/forge/runners/:id/heartbeat", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (auth.runnerId !== id) {
      return reply.status(403).send({ error: "runner_id_mismatch" });
    }
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.post("/api/forge/runners/:id/claim", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (auth.runnerId !== id) {
      return reply.status(403).send({ error: "runner_id_mismatch" });
    }
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.post("/api/forge/platform-builds/:id/progress", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.post("/api/forge/platform-builds/:id/logs", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.post("/api/forge/platform-builds/:id/complete", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.post("/api/forge/platform-builds/:id/fail", async (request, reply) => {
    const auth = await requireRunnerToken(request, reply);
    if (!auth) return;
    return reply.status(501).send({ error: "not_implemented" });
  });
}
