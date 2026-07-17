import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { JOB_KINDS } from "../externalWork/constants.js";
import { getClickUpClient } from "./connectionService.js";

export function verifyClickUpWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function registerClickUpWebhook(
  prisma: PrismaClient,
  env: Env,
  connectionId: string,
): Promise<{ webhookId: string | null }> {
  const base = env.CLICKUP_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("CLICKUP_WEBHOOK_BASE_URL_required");

  const pair = await getClickUpClient(prisma, env, connectionId);
  if (!pair) throw new Error("clickup_not_connected");
  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  if (!connection.workspaceId) throw new Error("workspace_required");

  const endpoint = `${base}/api/integrations/clickup/webhook`;
  const res = await pair.client.createWebhook(connection.workspaceId, {
    endpoint,
    events: [
      "taskCreated",
      "taskUpdated",
      "taskDeleted",
      "taskStatusUpdated",
      "taskAssigneeUpdated",
      "taskDueDateUpdated",
    ],
  });
  const webhookId = res.webhook?.id ?? res.id ?? null;
  const secret = res.webhook?.secret ?? null;
  await prisma.clickUpConnection.update({
    where: { id: connectionId },
    data: {
      webhookId,
      webhookSecret: secret,
    },
  });
  return { webhookId };
}

export async function handleClickUpWebhookDelivery(
  prisma: PrismaClient,
  opts: {
    connectionId: string;
    deliveryId: string;
    event: string;
    taskId: string | null;
    payload: unknown;
  },
) {
  const idempotencyKey = `${opts.connectionId}:${opts.deliveryId}:${opts.event}`;
  const existing = await prisma.clickUpWebhookDelivery.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return { queued: false };

  await prisma.clickUpWebhookDelivery.create({
    data: {
      connectionId: opts.connectionId,
      deliveryId: opts.deliveryId,
      eventType: opts.event,
      status: "received",
      payload: opts.payload as object,
      idempotencyKey,
    },
  });

  if (opts.taskId) {
    await prisma.backgroundJob.create({
      data: {
        kind: JOB_KINDS.clickupRefreshTask,
        payload: { connectionId: opts.connectionId, taskId: opts.taskId },
        idempotencyKey: `clickup.refresh:${opts.connectionId}:${opts.taskId}:${opts.deliveryId}`,
      },
    }).catch(() => undefined);
  }

  await prisma.clickUpWebhookDelivery.update({
    where: { idempotencyKey },
    data: { status: "queued", processedAt: new Date() },
  });
  return { queued: Boolean(opts.taskId) };
}
