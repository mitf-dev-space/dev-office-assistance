/** Deterministic LLM responses for providerPreset `mock` (CI / E2E). */
export function mockLlmChatJson<T>(systemPrompt: string, userPrompt: string): T | null {
  const sys = systemPrompt.toLowerCase();
  const user = userPrompt.toLowerCase();

  if (sys.includes("reply with json only") && user === "ping") {
    return { ok: true } as T;
  }

  if (sys.includes("summarize triage")) {
    return {
      summary: "Mock LLM: triage item needs attention on a delivery risk.",
      bullets: ["Clarify owner and due date", "Check linked catalog/Forge context"],
    } as T;
  }

  if (sys.includes("next action for triage")) {
    return {
      nextAction: "Mock LLM: confirm impact with assignee and set a due date.",
      suggestedPriority: "high",
      rationale: "Escalated or overdue work usually needs an explicit next step.",
    } as T;
  }

  if (sys.includes("standup digest")) {
    return {
      digest: "Mock LLM: team progress is steady; a few blockers need unblockers.",
      themes: ["delivery", "coordination"],
      blockers: ["Waiting on external dependency"],
    } as T;
  }

  if (sys.includes("catalog gap") || sys.includes("scorecard")) {
    return {
      explanation: "Mock LLM: repository health gap is actionable and ownership is clear.",
      recommendedActions: ["Assign owner", "Close the gap within the sprint"],
    } as T;
  }

  if (sys.includes("forge") && (sys.includes("failure") || sys.includes("build"))) {
    return {
      summary: "Mock LLM: build failed during compile or packaging.",
      likelyCause: "Dependency or branch configuration mismatch",
      suggestedFix: "Re-run after verifying branch and profile settings",
    } as T;
  }

  if (sys.includes("insight narrative") || sys.includes("explain these metrics")) {
    return {
      headline: "Mock LLM: weekly ops look manageable with a few hot spots.",
      bullets: ["Triage load is concentrated in a few categories", "Catalog gaps remain open"],
      risks: ["Overdue escalations may slip without owner follow-up"],
    } as T;
  }

  return null;
}
