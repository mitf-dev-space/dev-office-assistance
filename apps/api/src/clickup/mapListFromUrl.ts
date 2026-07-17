import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { getClickUpClient } from "./connectionService.js";
import { parseClickUpUrl } from "./urlParse.js";
import type { ClickUpTaskRaw } from "./normalize.js";

/**
 * Shared/guest spaces often do not appear in GET /team/{id}/space.
 * Resolve a list from a task URL/id (works when the PAT can open the task).
 */
export async function mapClickUpListFromTaskUrl(
  prisma: PrismaClient,
  env: Env,
  opts: { connectionId: string; urlOrTaskId: string },
) {
  const pair = await getClickUpClient(prisma, env, opts.connectionId);
  if (!pair) throw new Error("clickup_not_connected");

  const parsed = parseClickUpUrl(opts.urlOrTaskId);
  const taskId = parsed.taskId;
  if (!taskId) throw new Error("task_id_required");

  const raw = (await pair.client.getTask(taskId)) as ClickUpTaskRaw & {
    list?: { id?: string; name?: string };
    folder?: { id?: string; name?: string };
    space?: { id?: string };
    team_id?: string;
  };
  const listId = raw.list?.id;
  if (!listId) throw new Error("list_not_found_on_task");

  const listMeta = await pair.client.getList(listId);
  const connection = await prisma.clickUpConnection.findUniqueOrThrow({
    where: { id: opts.connectionId },
  });

  const workspaceId =
    (typeof raw.team_id === "string" || typeof raw.team_id === "number"
      ? String(raw.team_id)
      : null) ??
    parsed.workspaceId ??
    connection.workspaceId ??
    "";

  const mapping = await prisma.clickUpListMapping.upsert({
    where: {
      connectionId_listId: { connectionId: opts.connectionId, listId },
    },
    create: {
      connectionId: opts.connectionId,
      workspaceId: workspaceId || "unknown",
      spaceId: raw.space?.id ?? listMeta.space?.id ?? "unknown",
      spaceName: null,
      folderId: raw.folder?.id ?? listMeta.folder?.id ?? null,
      folderName: raw.folder?.name ?? listMeta.folder?.name ?? null,
      listId,
      listName: raw.list?.name ?? listMeta.name ?? listId,
      enabled: true,
    },
    update: {
      enabled: true,
      listName: raw.list?.name ?? listMeta.name ?? listId,
      folderId: raw.folder?.id ?? listMeta.folder?.id ?? null,
      folderName: raw.folder?.name ?? listMeta.folder?.name ?? null,
      spaceId: raw.space?.id ?? listMeta.space?.id ?? undefined,
      workspaceId: workspaceId || undefined,
    },
  });

  return {
    mapping,
    sampleTask: {
      id: raw.id,
      name: raw.name,
      assignees: (raw.assignees ?? []).map((a) => ({
        id: a.id != null ? String(a.id) : "",
        username: a.username ?? null,
        email: a.email ?? null,
      })),
    },
  };
}
