import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { upsertExternalWorkItem } from "../externalWork/upsert.js";
import { getClickUpClient } from "./connectionService.js";
import { normalizeClickUpTask, type ClickUpTaskRaw } from "./normalize.js";
import { triageStatusToClickUpStatus } from "./statusMap.js";

export async function createClickUpTaskFromTriage(
  prisma: PrismaClient,
  env: Env,
  opts: {
    triageItemId: string;
    connectionId: string;
    listId: string;
    actorUserId: string;
  },
) {
  const triage = await prisma.triageItem.findUnique({ where: { id: opts.triageItemId } });
  if (!triage) throw new Error("triage_not_found");

  const existing = await prisma.externalWorkItem.findFirst({
    where: {
      provider: "clickup",
      connectionKey: opts.connectionId,
      triageItemId: opts.triageItemId,
    },
  });
  if (existing) throw new Error("already_linked");

  const pair = await getClickUpClient(prisma, env, opts.connectionId);
  if (!pair) throw new Error("clickup_not_connected");

  const statusMaps = await prisma.clickUpStatusMapping.findMany({
    where: { connectionId: opts.connectionId },
  });
  const status = triageStatusToClickUpStatus(triage.status, statusMaps);

  const created = (await pair.client.createTask(opts.listId, {
    name: triage.title,
    description: triage.description ?? undefined,
    status: status ?? undefined,
    due_date: triage.dueAt ? String(triage.dueAt.getTime()) : undefined,
  })) as ClickUpTaskRaw;

  const n = normalizeClickUpTask(created);
  if (!n) throw new Error("create_failed");

  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: opts.connectionId },
  });

  await prisma.triageItem.update({
    where: { id: opts.triageItemId },
    data: {
      sourceType: triage.sourceType === "manual" ? "clickup" : triage.sourceType,
      graphWebLink: n.externalUrl,
      sourcePreview: n.title.slice(0, 500),
    },
  });

  const ewi = await upsertExternalWorkItem(prisma, {
    provider: "clickup",
    connectionKey: opts.connectionId,
    externalId: n.externalId,
    title: n.title,
    listId: n.listId ?? opts.listId,
    workspaceId: connection.workspaceId,
    spaceId: n.spaceId,
    folderId: n.folderId,
    externalUrl: n.externalUrl,
    externalStatus: n.externalStatus,
    externalPriority: n.externalPriority,
    externalUpdatedAt: n.externalUpdatedAt,
    rawMetadata: created as object,
    triageItemId: opts.triageItemId,
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: opts.actorUserId,
      action: "clickup.task_created",
      entityType: "ExternalWorkItem",
      entityId: ewi.id,
      metadata: { triageItemId: opts.triageItemId, taskId: n.externalId },
    },
  });

  return ewi;
}

export async function updateClickUpTaskFromTriage(
  prisma: PrismaClient,
  env: Env,
  opts: { triageItemId: string; actorUserId: string },
) {
  const ewi = await prisma.externalWorkItem.findFirst({
    where: { provider: "clickup", triageItemId: opts.triageItemId },
  });
  if (!ewi) throw new Error("not_linked");

  const triage = await prisma.triageItem.findUniqueOrThrow({
    where: { id: opts.triageItemId },
  });
  const pair = await getClickUpClient(prisma, env, ewi.connectionKey);
  if (!pair) throw new Error("clickup_not_connected");

  const statusMaps = await prisma.clickUpStatusMapping.findMany({
    where: { connectionId: ewi.connectionKey },
  });
  const status = triageStatusToClickUpStatus(triage.status, statusMaps);

  await pair.client.updateTask(ewi.externalId, {
    name: triage.title,
    description: triage.description ?? undefined,
    status: status ?? undefined,
    due_date: triage.dueAt ? String(triage.dueAt.getTime()) : undefined,
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: opts.actorUserId,
      action: "clickup.task_updated",
      entityType: "ExternalWorkItem",
      entityId: ewi.id,
      metadata: { triageItemId: opts.triageItemId },
    },
  });
}

export async function commentOnClickUpTask(
  prisma: PrismaClient,
  env: Env,
  opts: { triageItemId: string; comment: string; actorUserId: string },
) {
  const ewi = await prisma.externalWorkItem.findFirst({
    where: { provider: "clickup", triageItemId: opts.triageItemId },
  });
  if (!ewi) throw new Error("not_linked");
  const pair = await getClickUpClient(prisma, env, ewi.connectionKey);
  if (!pair) throw new Error("clickup_not_connected");
  await pair.client.createComment(ewi.externalId, opts.comment);
  await prisma.auditEvent.create({
    data: {
      actorUserId: opts.actorUserId,
      action: "clickup.task_commented",
      entityType: "ExternalWorkItem",
      entityId: ewi.id,
      metadata: { triageItemId: opts.triageItemId },
    },
  });
}
