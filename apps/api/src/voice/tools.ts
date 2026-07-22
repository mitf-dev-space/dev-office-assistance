import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { canAccessForge } from "@office/types";
import { runChatTool, isChatToolName } from "../llm/chatTools.js";

export const VOICE_TOOL_NAMES = [
  "get_dashboard_overview",
  "search_triage_items",
  "get_today_standups",
  "summarize_standups",
  "get_team_workload",
  "get_planning_initiatives",
  "get_recent_decisions",
  "search_engineering_catalog",
  "get_repository_status",
  "get_forge_build_status",
  "create_action_draft",
] as const;

export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];

export function isVoiceToolName(v: string): v is VoiceToolName {
  return (VOICE_TOOL_NAMES as readonly string[]).includes(v);
}

const limitSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const voiceToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "get_dashboard_overview",
      description: "Get compact dashboard counts for open triage, planning, and standups.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_triage_items",
      description: "Search open triage items by keyword.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_today_standups",
      description: "List recent standup check-ins.",
      parameters: { type: "object", properties: { limit: { type: "integer" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "summarize_standups",
      description: "Summarize blockers mentioned in recent standups.",
      parameters: { type: "object", properties: { limit: { type: "integer" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_workload",
      description: "Count open triage items by assignee.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_planning_initiatives",
      description: "List active/draft planning initiatives.",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_decisions",
      description: "List recent team decisions.",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_engineering_catalog",
      description: "Search open engineering catalog gaps.",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_repository_status",
      description: "Get a repository freshness/status by id or name query.",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, repositoryId: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_forge_build_status",
      description: "List recent Forge build requests (Forge roles / lead only).",
      parameters: { type: "object", properties: { limit: { type: "integer" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_action_draft",
      description:
        "Create an immutable action draft for user confirmation. Does not mutate data.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "triage_create",
              "triage_set_next_action",
              "planning_create",
              "decision_create",
              "standup_upsert",
            ],
          },
          title: { type: "string" },
          summary: { type: "string" },
          payload: { type: "object" },
        },
        required: ["kind", "title", "summary", "payload"],
      },
    },
  },
];

export type VoiceToolContext = {
  prisma: PrismaClient;
  userId: string;
  role: string;
  voiceSessionId: string;
};

export async function runVoiceTool(
  ctx: VoiceToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!isVoiceToolName(name)) {
    return { error: "unsupported_tool", name };
  }

  const parsed = limitSchema.safeParse(args);
  const q = parsed.success ? parsed.data.q?.trim() ?? "" : "";
  const take = parsed.success ? Math.min(20, Math.max(1, parsed.data.limit ?? 8)) : 8;

  switch (name) {
    case "search_triage_items": {
      if (isChatToolName("search_triage")) {
        return runChatTool(ctx.prisma, "search_triage", { q, limit: take });
      }
      return { items: [] };
    }
    case "get_planning_initiatives":
      return runChatTool(ctx.prisma, "search_planning", { q, limit: take });
    case "get_recent_decisions":
      return runChatTool(ctx.prisma, "search_decisions", { q, limit: take });
    case "search_engineering_catalog":
      return runChatTool(ctx.prisma, "search_catalog_gaps", { q, limit: take });
    case "get_today_standups":
      return runChatTool(ctx.prisma, "get_standup", { limit: take });
    case "summarize_standups": {
      const raw = (await runChatTool(ctx.prisma, "get_standup", {
        limit: take,
      })) as { checkIns: Array<{ author: string; blockers: string }> };
      const blockers = raw.checkIns
        .filter((c) => c.blockers && c.blockers.trim() && c.blockers.trim() !== "-")
        .map((c) => ({ author: c.author, blockers: c.blockers.slice(0, 200) }));
      return { blockerCount: blockers.length, blockers };
    }
    case "get_dashboard_overview": {
      const [openTriage, planningActive, standupCount] = await Promise.all([
        ctx.prisma.triageItem.count({
          where: { status: { in: ["inbox", "in_progress", "snoozed"] } },
        }),
        ctx.prisma.planningItem.count({ where: { status: { in: ["draft", "active"] } } }),
        ctx.prisma.standupCheckIn.count(),
      ]);
      return { openTriage, planningActive, standupCount };
    }
    case "get_team_workload": {
      const groups = await ctx.prisma.triageItem.groupBy({
        by: ["assigneeDeveloperId"],
        where: { status: { in: ["inbox", "in_progress", "snoozed"] } },
        _count: { _all: true },
      });
      const ids = groups.map((g) => g.assigneeDeveloperId);
      const devs = await ctx.prisma.developer.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true },
      });
      const byId = new Map(devs.map((d) => [d.id, d.displayName]));
      return {
        workload: groups.map((g) => ({
          assigneeId: g.assigneeDeveloperId,
          name: byId.get(g.assigneeDeveloperId) ?? "Unknown",
          openCount: g._count._all,
        })),
      };
    }
    case "get_repository_status": {
      const repositoryId =
        typeof args.repositoryId === "string" ? args.repositoryId.trim() : "";
      const select = {
        id: true,
        name: true,
        freshnessState: true,
        defaultBranch: true,
        connectivityState: true,
      } as const;
      const repo = repositoryId
        ? await ctx.prisma.repository.findUnique({ where: { id: repositoryId }, select })
        : await ctx.prisma.repository.findFirst({
            where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
            orderBy: { updatedAt: "desc" },
            select,
          });
      if (!repo) return { found: false };
      return { found: true, repository: repo };
    }
    case "get_forge_build_status": {
      if (!canAccessForge(ctx.role)) {
        return { error: "forbidden", message: "Forge access required" };
      }
      const builds = await ctx.prisma.forgeBuildRequest.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          overallStatus: true,
          createdAt: true,
          application: { select: { name: true } },
          platformBuilds: { select: { platform: true, status: true }, take: 4 },
        },
      });
      return {
        builds: builds.map((b) => ({
          id: b.id,
          status: b.overallStatus,
          platforms: b.platformBuilds.map((p) => ({
            platform: p.platform,
            status: p.status,
          })),
          application: b.application.name,
          createdAt: b.createdAt.toISOString(),
        })),
      };
    }
    case "create_action_draft": {
      const kind = String(args.kind ?? "");
      const title = String(args.title ?? "").trim().slice(0, 300);
      const summary = String(args.summary ?? "").trim().slice(0, 4000);
      const payload =
        args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
          ? (args.payload as Record<string, unknown>)
          : {};
      const allowed = new Set([
        "triage_create",
        "triage_set_next_action",
        "planning_create",
        "decision_create",
        "standup_upsert",
      ]);
      if (!allowed.has(kind) || !title || !summary) {
        return { error: "invalid_draft" };
      }
      const draft = await ctx.prisma.aiActionProposal.create({
        data: {
          kind,
          title,
          summary,
          payload: payload as Prisma.InputJsonValue,
          status: "pending",
          createdById: ctx.userId,
          voiceSessionId: ctx.voiceSessionId,
        },
        select: { id: true, kind: true, title: true, summary: true, status: true },
      });
      return { draft, requiresOnScreenConfirm: true };
    }
    default: {
      const _e: never = name;
      return _e;
    }
  }
}
