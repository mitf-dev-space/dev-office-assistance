import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import { buildSystemPrompt } from "./assistPrompts.js";
import { isChatToolName, runChatTool, type ChatToolName } from "./chatTools.js";
import { openAiCompatibleChatJson, redactForLlm } from "./openaiCompatible.js";
import { consumeUsage, DailyCapExceededError } from "./usageGuard.js";
import { resolveWorkspaceLlmConfig, USAGE_SCOPE } from "./workspaceSettings.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatTurnResult = {
  answer: string;
  citations: string[];
  toolsUsed: ChatToolName[];
  source: "heuristic" | "heuristic+llm";
};

type LlmStep =
  | { action: "tool"; tool: string; args?: Record<string, unknown> }
  | { action: "final"; answer: string; citations?: string[] };

function heuristicChatAnswer(question: string, toolNotes: string[]): ChatTurnResult {
  const q = question.toLowerCase();
  let answer =
    "I can answer from Helm data (triage, morning brief, blocker radar, planning, decisions, catalog gaps, standup). ";
  if (/blocker|escalat|priority|risk/.test(q)) {
    answer += "Ask about blockers or open the Priority page for the blocker radar.";
  } else if (/brief|morning|today/.test(q)) {
    answer += "Ask for today’s morning brief or open the Dashboard.";
  } else if (/gap|catalog|repo/.test(q)) {
    answer += "Ask which catalog gaps need attention.";
  } else {
    answer += "Try a concrete question like “What are the open blockers?”";
  }
  if (toolNotes.length) {
    answer += `\n\nFrom workspace data:\n${toolNotes.slice(0, 6).join("\n")}`;
  }
  return {
    answer,
    citations: toolNotes.length ? ["workspace"] : [],
    toolsUsed: [],
    source: "heuristic",
  };
}

function notesFromTool(tool: ChatToolName, result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const row = result as Record<string, unknown>;
  if (tool === "search_triage" && Array.isArray(row.items)) {
    return (row.items as Array<{ title?: string; category?: string; href?: string }>)
      .slice(0, 5)
      .map((t) => `- Triage: ${t.title} (${t.category}) ${t.href ?? ""}`);
  }
  if (tool === "get_morning_brief" && row.found) {
    const narrative = row.narrative as { headline?: string } | null;
    return [narrative?.headline ? `- Brief: ${narrative.headline}` : "- Morning brief metrics available"];
  }
  if (tool === "get_blocker_radar" && row.found) {
    const metrics = row.metrics as { signalCount?: number; signals?: Array<{ title?: string }> };
    const titles = (metrics?.signals ?? []).slice(0, 4).map((s) => s.title).filter(Boolean);
    return [
      `- Blocker radar: ${metrics?.signalCount ?? 0} signal(s)`,
      ...titles.map((t) => `  · ${t}`),
    ];
  }
  if (tool === "search_planning" && Array.isArray(row.items)) {
    return (row.items as Array<{ title?: string; status?: string }>)
      .slice(0, 5)
      .map((p) => `- Planning: ${p.title} (${p.status})`);
  }
  if (tool === "search_decisions" && Array.isArray(row.items)) {
    return (row.items as Array<{ title?: string }>)
      .slice(0, 5)
      .map((d) => `- Decision: ${d.title}`);
  }
  if (tool === "search_catalog_gaps" && Array.isArray(row.gaps)) {
    return (row.gaps as Array<{ title?: string; repositoryName?: string; priority?: string }>)
      .slice(0, 5)
      .map((g) => `- Gap: ${g.repositoryName}: ${g.title} (${g.priority})`);
  }
  if (tool === "get_standup" && Array.isArray(row.checkIns)) {
    const withBlockers = (
      row.checkIns as Array<{ author?: string; blockers?: string }>
    ).filter((c) => c.blockers?.trim());
    return withBlockers.length
      ? withBlockers.slice(0, 5).map((c) => `- Standup blocker (${c.author}): ${c.blockers}`)
      : ["- Standup: no blocker notes in recent check-ins"];
  }
  return [];
}

function pickBootstrapTools(question: string): Array<{ tool: ChatToolName; args: Record<string, unknown> }> {
  const q = question.toLowerCase();
  const tools: Array<{ tool: ChatToolName; args: Record<string, unknown> }> = [];
  if (/brief|morning|today|dashboard/.test(q)) tools.push({ tool: "get_morning_brief", args: {} });
  if (/blocker|escalat|priority|risk|hot/.test(q)) tools.push({ tool: "get_blocker_radar", args: {} });
  if (/triage|open item|queue|overdue/.test(q)) tools.push({ tool: "search_triage", args: { q: "", limit: 8 } });
  if (/plan|initiative|roadmap/.test(q)) tools.push({ tool: "search_planning", args: { q: "", limit: 8 } });
  if (/decision|decided/.test(q)) tools.push({ tool: "search_decisions", args: { q: "", limit: 8 } });
  if (/gap|catalog|scorecard|repo/.test(q)) tools.push({ tool: "search_catalog_gaps", args: { q: "", limit: 8 } });
  if (/standup|check-?in|this week/.test(q)) tools.push({ tool: "get_standup", args: {} });
  if (tools.length === 0) {
    tools.push({ tool: "get_morning_brief", args: {} });
    tools.push({ tool: "search_triage", args: { q: "", limit: 6 } });
  }
  return tools.slice(0, 3);
}

export async function assistWorkspaceChat(
  prisma: PrismaClient,
  env: Env,
  input: { message: string; history?: ChatMessage[] },
): Promise<ChatTurnResult> {
  const message = input.message.trim();
  if (!message) {
    return {
      answer: "Ask a question about triage, blockers, planning, decisions, catalog gaps, or standup.",
      citations: [],
      toolsUsed: [],
      source: "heuristic",
    };
  }

  const toolsUsed: ChatToolName[] = [];
  const toolNotes: string[] = [];
  const toolBundle: Record<string, unknown> = {};

  for (const step of pickBootstrapTools(message)) {
    const result = await runChatTool(prisma, step.tool, step.args);
    toolsUsed.push(step.tool);
    toolBundle[step.tool] = result;
    toolNotes.push(...notesFromTool(step.tool, result));
  }

  const heuristic = heuristicChatAnswer(message, toolNotes);
  const config = await resolveWorkspaceLlmConfig(prisma, env);
  if (!config) return { ...heuristic, toolsUsed };

  try {
    consumeUsage(USAGE_SCOPE, config.dailyCap);
  } catch (err) {
    if (err instanceof DailyCapExceededError) throw err;
    throw err;
  }

  const system = buildSystemPrompt("workspace_chat", config.assistLocale);
  const history = (input.history ?? []).slice(-6);
  let workingNotes = { ...toolBundle };

  for (let round = 0; round < 3; round++) {
    const userPayload = redactForLlm(
      JSON.stringify({
        message,
        history,
        toolResults: workingNotes,
        availableTools: [
          "search_triage",
          "get_morning_brief",
          "get_blocker_radar",
          "search_planning",
          "search_decisions",
          "search_catalog_gaps",
          "get_standup",
        ],
        instruction:
          round === 0
            ? "Answer using toolResults, or request one additional tool if needed."
            : "Prefer action=final now using the toolResults.",
      }),
    );

    const { data } = await openAiCompatibleChatJson<LlmStep>(config, system, userPayload);
    if (!data || typeof data !== "object") break;

    if (data.action === "final" && data.answer?.trim()) {
      return {
        answer: data.answer.trim(),
        citations: Array.isArray(data.citations) ? data.citations.map(String).slice(0, 8) : [],
        toolsUsed: [...new Set(toolsUsed)],
        source: "heuristic+llm",
      };
    }

    if (data.action === "tool" && typeof data.tool === "string" && isChatToolName(data.tool)) {
      if (toolsUsed.includes(data.tool) && workingNotes[data.tool]) {
        // Already have this tool — nudge toward final on next round.
        continue;
      }
      const result = await runChatTool(prisma, data.tool, data.args ?? {});
      toolsUsed.push(data.tool);
      workingNotes = { ...workingNotes, [data.tool]: result };
      toolNotes.push(...notesFromTool(data.tool, result));
      continue;
    }
    break;
  }

  return {
    ...heuristicChatAnswer(message, toolNotes),
    toolsUsed: [...new Set(toolsUsed)],
    source: toolsUsed.length ? "heuristic" : heuristic.source,
  };
}

export { DailyCapExceededError };
