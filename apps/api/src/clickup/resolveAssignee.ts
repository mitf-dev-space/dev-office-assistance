import type { PrismaClient } from "@prisma/client";
import {
  resolveAssigneeDeveloperId,
  type ClickUpAssigneeInfo,
} from "./assigneeMatch.js";
import type { NormalizedClickUpTask } from "./normalize.js";

export async function resolveClickUpTaskAssignee(
  prisma: PrismaClient,
  opts: {
    connectionId: string;
    task: NormalizedClickUpTask;
    defaultAssigneeId: string | null | undefined;
  },
): Promise<string | null> {
  const [userMaps, developers] = await Promise.all([
    prisma.clickUpUserMapping.findMany({ where: { connectionId: opts.connectionId } }),
    prisma.developer.findMany({
      select: { id: true, displayName: true, workEmail: true },
    }),
  ]);

  return resolveAssigneeDeveloperId({
    clickUpAssigneeIds: opts.task.assigneeIds,
    assignees: opts.task.assignees as ClickUpAssigneeInfo[],
    userMappings: userMaps,
    developers,
    defaultAssigneeId: opts.defaultAssigneeId,
  });
}
