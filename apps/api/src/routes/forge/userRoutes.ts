import type { FastifyInstance } from "fastify";
import type { Env } from "../../env.js";
import { requireDbUser } from "../../userService.js";
import { requireForgeAccess, requireForgeAdmin } from "../../forge/authz.js";

export async function registerForgeUserRoutes(app: FastifyInstance, _env: Env) {
  app.get("/api/forge/dashboard", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAccess(me, reply))) return;

    return {
      queuedBuilds: 0,
      runningBuilds: 0,
      waitingForMacOs: 0,
      successfulToday: 0,
      failedToday: 0,
      onlineRunners: 0,
      offlineRunners: 0,
      moduleStatus: "bootstrap" as const,
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
    return { items: [] as unknown[] };
  });

  app.post("/api/forge/banks", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
  });

  app.put("/api/forge/banks/:id", async (request, reply) => {
    const me = await requireDbUser(request.authUser, reply);
    if (!(await requireForgeAdmin(me, reply))) return;
    return reply.status(501).send({ error: "not_implemented" });
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
