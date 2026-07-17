import type { FastifyReply } from "fastify";
import type { User } from "@prisma/client";
import { canAccessCatalog, canAdminCatalog, canWriteCatalog } from "@office/types";

export async function requireCatalogAccess(
  me: User | null,
  reply: FastifyReply,
): Promise<User | null> {
  if (!me) {
    await reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  if (!canAccessCatalog(me.role)) {
    await reply.status(403).send({ error: "forbidden", message: "Catalog access denied." });
    return null;
  }
  return me;
}

export async function requireCatalogAdmin(
  me: User | null,
  reply: FastifyReply,
): Promise<User | null> {
  const user = await requireCatalogAccess(me, reply);
  if (!user) return null;
  if (!canAdminCatalog(user.role)) {
    await reply.status(403).send({ error: "forbidden", message: "Catalog admin requires lead role." });
    return null;
  }
  return user;
}

export async function requireCatalogWrite(
  me: User | null,
  reply: FastifyReply,
): Promise<User | null> {
  const user = await requireCatalogAccess(me, reply);
  if (!user) return null;
  if (!canWriteCatalog(user.role)) {
    await reply.status(403).send({ error: "forbidden", message: "Catalog write requires lead role." });
    return null;
  }
  return user;
}
