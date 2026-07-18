import type { PrismaClient } from "@prisma/client";

const OPEN = ["inbox", "in_progress", "snoozed"] as const;

export const CHAT_TOOL_NAMES = [
  "search_triage",
  "get_morning_brief",
  "get_blocker_radar",
  "search_planning",
  "search_decisions",
  "search_catalog_gaps",
  "get_standup",
] as const;

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

export function isChatToolName(v: string): v is ChatToolName {
  return (CHAT_TOOL_NAMES as readonly string[]).includes(v);
}

export async function runChatTool(
  prisma: PrismaClient,
  tool: ChatToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  const q = typeof args.q === "string" ? args.q.trim() : "";
  const take = Math.min(20, Math.max(1, Number(args.limit) || 8));

  switch (tool) {
    case "search_triage": {
      const items = await prisma.triageItem.findMany({
        where: {
          status: { in: [...OPEN] },
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                  { program: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ escalated: "desc" }, { updatedAt: "desc" }],
        take,
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          escalated: true,
          dueAt: true,
          program: true,
          nextAction: true,
          assignee: { select: { displayName: true } },
        },
      });
      return {
        items: items.map((t) => ({
          ...t,
          dueAt: t.dueAt?.toISOString() ?? null,
          assigneeName: t.assignee.displayName,
          href: `/triage/${t.id}`,
        })),
      };
    }
    case "get_morning_brief": {
      const snap = await prisma.insightSnapshot.findFirst({
        where: { kind: "morning_brief", status: "ready" },
        orderBy: { createdAt: "desc" },
      });
      if (!snap) return { found: false };
      return {
        found: true,
        createdAt: snap.createdAt.toISOString(),
        metrics: snap.metrics,
        narrative: snap.narrative,
      };
    }
    case "get_blocker_radar": {
      const snap = await prisma.insightSnapshot.findFirst({
        where: { kind: "blocker_radar", status: "ready" },
        orderBy: { createdAt: "desc" },
      });
      if (!snap) return { found: false };
      return {
        found: true,
        createdAt: snap.createdAt.toISOString(),
        metrics: snap.metrics,
        narrative: snap.narrative,
      };
    }
    case "search_planning": {
      const items = await prisma.planningItem.findMany({
        where: q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { program: { contains: q, mode: "insensitive" } },
              ],
            }
          : { status: { in: ["draft", "active"] } },
        orderBy: { updatedAt: "desc" },
        take,
        select: {
          id: true,
          title: true,
          status: true,
          department: true,
          program: true,
          targetDate: true,
        },
      });
      return {
        items: items.map((p) => ({
          ...p,
          targetDate: p.targetDate?.toISOString() ?? null,
          href: `/planning/${p.id}`,
        })),
      };
    }
    case "search_decisions": {
      const items = await prisma.teamDecision.findMany({
        where: q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { body: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { decidedOn: "desc" },
        take,
        select: {
          id: true,
          title: true,
          body: true,
          decidedOn: true,
          relatedTriageItemId: true,
          relatedPlanningItemId: true,
        },
      });
      return {
        items: items.map((d) => ({
          id: d.id,
          title: d.title,
          bodyPreview: d.body.slice(0, 240),
          decidedOn: d.decidedOn.toISOString().slice(0, 10),
          relatedTriageItemId: d.relatedTriageItemId,
          relatedPlanningItemId: d.relatedPlanningItemId,
          href: "/decisions",
        })),
      };
    }
    case "search_catalog_gaps": {
      const gaps = await prisma.engineeringGap.findMany({
        where: {
          status: "open",
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { repository: { name: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take,
        include: { repository: { select: { id: true, name: true, freshnessState: true } } },
      });
      return {
        gaps: gaps.map((g) => ({
          id: g.id,
          title: g.title,
          priority: g.priority,
          repositoryId: g.repository.id,
          repositoryName: g.repository.name,
          freshnessState: g.repository.freshnessState,
          href: `/catalog/repositories/${g.repository.id}`,
        })),
      };
    }
    case "get_standup": {
      const rows = await prisma.standupCheckIn.findMany({
        orderBy: { weekStart: "desc" },
        take: 20,
        include: { user: { select: { displayName: true, email: true } } },
      });
      return {
        checkIns: rows.map((r) => ({
          weekStart: r.weekStart.toISOString().slice(0, 10),
          author: r.user.displayName ?? r.user.email,
          prior: r.priorWork.slice(0, 200),
          next: r.nextWork.slice(0, 200),
          blockers: r.blockers.slice(0, 200),
        })),
      };
    }
    default: {
      const _exhaustive: never = tool;
      return _exhaustive;
    }
  }
}
