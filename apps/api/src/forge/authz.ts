import type { FastifyReply } from "fastify";
import type { User } from "@prisma/client";
import { canAccessForge, canAdminForge } from "@office/types";

export async function requireForgeAccess(
  me: User | null,
  reply: FastifyReply,
): Promise<User | null> {
  if (!me) {
    await reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  if (!canAccessForge(me.role)) {
    await reply.status(403).send({
      error: "forbidden",
      message: "Forge access requires forge_mobile_lead or lead role.",
    });
    return null;
  }
  return me;
}

export async function requireForgeAdmin(
  me: User | null,
  reply: FastifyReply,
): Promise<User | null> {
  if (!me) {
    await reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  if (!canAdminForge(me.role)) {
    await reply.status(403).send({
      error: "forbidden",
      message: "Forge administration requires forge_mobile_lead or lead role.",
    });
    return null;
  }
  return me;
}
