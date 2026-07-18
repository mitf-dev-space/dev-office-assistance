import type {
  CatalogExplainResult,
  CatalogGapsTopResult,
  DecisionDraftResult,
  ForgeExplainFailureResult,
  PlanningDraftResult,
  PriorityReorderResult,
  StandupDigestResult,
  TriageDuplicatesResult,
  TriageNextActionResult,
  TriageSummarizeResult,
} from "./types.js";

function daysUntil(dueAt: Date | string | null | undefined): number | null {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function heuristicTriageSummarize(input: {
  title: string;
  description?: string | null;
  category: string;
  status: string;
  escalated?: boolean;
  nextAction?: string | null;
  dueAt?: Date | string | null;
  program?: string | null;
  assigneeName?: string | null;
  sourceType?: string | null;
  sourcePreview?: string | null;
}): TriageSummarizeResult {
  const bullets: string[] = [];
  const dueDays = daysUntil(input.dueAt);
  const owner = input.assigneeName?.trim() || "unassigned";

  bullets.push(`${input.category.replace(/_/g, " ")} · ${input.status} · owner ${owner}`);
  if (input.program?.trim()) bullets.push(`Program: ${input.program.trim()}`);
  if (input.escalated) bullets.push("Escalated — treat as leadership-visible until cleared");
  if (dueDays != null) {
    if (dueDays < 0 && input.status !== "done") bullets.push(`Overdue by ${Math.abs(dueDays)} day(s)`);
    else if (dueDays === 0) bullets.push("Due today");
    else if (dueDays <= 3) bullets.push(`Due in ${dueDays} day(s)`);
  }
  if (input.nextAction?.trim()) bullets.push(`Next action on file: ${input.nextAction.trim()}`);
  else bullets.push("No next action recorded yet");
  if (input.sourceType && input.sourceType !== "manual") {
    bullets.push(`Imported from ${input.sourceType.replace(/_/g, " ")}`);
  }

  const desc = input.description?.trim() || input.sourcePreview?.trim();
  const summary = desc
    ? `${input.title} — ${desc.slice(0, 220)}${desc.length > 220 ? "…" : ""}`
    : `${input.title} is ${input.status} (${input.category.replace(/_/g, " ")})${
        input.escalated ? ", escalated" : ""
      }. Owner: ${owner}.`;

  return { summary, bullets: bullets.slice(0, 5), source: "heuristic" };
}

export function heuristicTriageNextAction(input: {
  title: string;
  category: string;
  status: string;
  escalated?: boolean;
  dueAt?: Date | string | null;
  nextAction?: string | null;
  program?: string | null;
  assigneeName?: string | null;
  description?: string | null;
}): TriageNextActionResult {
  const owner = input.assigneeName?.trim();
  const dueDays = daysUntil(input.dueAt);
  const overdue = dueDays != null && dueDays < 0 && input.status !== "done";
  const existing = input.nextAction?.trim();

  if (input.status === "done" || input.status === "dropped" || input.status === "cancelled") {
    return {
      nextAction: existing
        ? `Clear stale next action on closed "${input.title}" (or reopen if work remains).`
        : `Leave "${input.title}" closed unless something still blocks a dependent item.`,
      suggestedPriority: "low",
      rationale: "Closed items should not get fresh delivery next-actions unless reopened.",
      source: "heuristic",
    };
  }

  if (existing && !overdue && !input.escalated) {
    return {
      nextAction: existing,
      suggestedPriority: "normal",
      rationale: "Existing next action still looks usable — refine only if the situation changed.",
      source: "heuristic",
    };
  }

  if (input.escalated || input.category === "blocker") {
    return {
      nextAction: owner
        ? `Ask ${owner} for an unblock plan on "${input.title}" with impact and a timebox today.`
        : `Assign an owner for "${input.title}" and get an unblock plan with impact and timebox today.`,
      suggestedPriority: "urgent",
      rationale: "Blockers and escalations need an explicit owner and timebox, not a status update.",
      source: "heuristic",
    };
  }

  if (overdue) {
    return {
      nextAction: `Close or renegotiate overdue "${input.title}"${owner ? ` with ${owner}` : ""} — set a new due date or mark done.`,
      suggestedPriority: "high",
      rationale: "Past due without completion creates silent drag on the queue.",
      source: "heuristic",
    };
  }

  if (input.category === "decision") {
    return {
      nextAction: `Book a decision on "${input.title}"${input.program ? ` (${input.program})` : ""}: options, recommendation, and owner by end of week.`,
      suggestedPriority: "high",
      rationale: "Decision items stall unless a meeting or written choice is scheduled.",
      source: "heuristic",
    };
  }

  if (input.category === "risk") {
    return {
      nextAction: `Document trigger + mitigation for risk "${input.title}" and decide whether to escalate.`,
      suggestedPriority: "high",
      rationale: "Risks need an explicit trigger and mitigation, not only a title.",
      source: "heuristic",
    };
  }

  return {
    nextAction: existing
      ? existing
      : `Clarify the done-state for "${input.title}"${owner ? ` with ${owner}` : ""} and set a due date.`,
    suggestedPriority: input.escalated ? "urgent" : "normal",
    rationale: "Inbox items move when outcome and due date are explicit.",
    source: "heuristic",
  };
}

export function heuristicStandupDigest(
  checkIns: Array<{
    authorName?: string | null;
    prior?: string | null;
    next?: string | null;
    blockers?: string | null;
  }>,
): StandupDigestResult {
  const withContent = checkIns.filter(
    (c) => c.prior?.trim() || c.next?.trim() || c.blockers?.trim(),
  );
  const blockers = withContent
    .map((c) => {
      const b = c.blockers?.trim();
      if (!b) return null;
      const who = c.authorName?.trim();
      return who ? `${who}: ${b}` : b;
    })
    .filter((b): b is string => Boolean(b))
    .slice(0, 8);

  const themes: string[] = [];
  const blob = withContent
    .map((c) => [c.prior, c.next, c.blockers].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
  if (/build|forge|apk|ios|android/.test(blob)) themes.push("mobile builds");
  if (/release|deploy|prod|production/.test(blob)) themes.push("release");
  if (/bank|client|jumhoria|waha|sahara/.test(blob)) themes.push("bank delivery");
  if (/hire|recruit|onboard|team/.test(blob)) themes.push("team");
  if (blockers.length) themes.push("blockers");

  if (withContent.length === 0) {
    return {
      digest:
        "No leadership check-ins were submitted for this week yet. Ask each account holder to capture what moved, what is next, and any blockers before the sync — otherwise the digest cannot reflect real progress.",
      themes: [],
      blockers: [],
      source: "heuristic",
    };
  }

  const priorBits = withContent
    .filter((c) => c.prior?.trim())
    .map((c) => `${c.authorName ?? "Lead"}: ${c.prior!.trim()}`)
    .slice(0, 4);
  const nextBits = withContent
    .filter((c) => c.next?.trim())
    .map((c) => `${c.authorName ?? "Lead"}: ${c.next!.trim()}`)
    .slice(0, 4);

  const digest = [
    `${withContent.length} check-in(s) recorded.`,
    priorBits.length ? `Moved: ${priorBits.join(" · ")}` : "Prior work was left blank.",
    nextBits.length ? `Next: ${nextBits.join(" · ")}` : "Next plans were left blank.",
    blockers.length
      ? `Blockers needing attention: ${blockers.join(" · ")}`
      : "No blockers were called out.",
  ].join(" ");

  return { digest, themes: themes.slice(0, 5), blockers, source: "heuristic" };
}

export function heuristicCatalogExplain(input: {
  title: string;
  priority?: string | null;
  checkSlug?: string | null;
  overallScore?: number | null;
  message?: string | null;
  freshnessState?: string | null;
  connectivityState?: string | null;
  lifecycleState?: string | null;
  defaultBranch?: string | null;
  technicalOwnerName?: string | null;
  teamName?: string | null;
  reportedPipelineState?: string | null;
  reportedUnitTestState?: string | null;
  openGapCount?: number | null;
  failedPipelines7d?: number | null;
  branchCount?: number | null;
  providerKind?: string | null;
}): CatalogExplainResult {
  const actions: string[] = [];
  const parts: string[] = [];

  parts.push(
    input.message?.trim() ||
      `Repository "${input.title}" health review${
        input.overallScore != null ? ` (scorecard ${input.overallScore.toFixed(1)})` : ""
      }.`,
  );

  if (input.freshnessState === "never_synchronized" || input.freshnessState === "stale") {
    parts.push(
      `Catalog data is ${input.freshnessState.replace(/_/g, " ")} — branches, commits, and pipelines may be outdated until Sync runs.`,
    );
    actions.push("Run Sync now to refresh provider metadata");
  }
  if (input.connectivityState && input.connectivityState !== "reachable") {
    parts.push(`Connectivity is ${input.connectivityState.replace(/_/g, " ")}.`);
    actions.push("Verify the Git connection token and project path");
  }
  if (!input.technicalOwnerName?.trim()) {
    parts.push("No technical owner is assigned in the catalog.");
    actions.push("Assign a technical owner on the repository");
  } else {
    parts.push(`Technical owner: ${input.technicalOwnerName.trim()}.`);
  }
  if (input.teamName) parts.push(`Team: ${input.teamName}.`);
  if (input.reportedPipelineState === "unknown" || !input.reportedPipelineState) {
    actions.push("Declare or detect CI pipeline state for the default branch");
  }
  if (input.reportedUnitTestState === "unknown" || input.reportedUnitTestState === "undeclared") {
    actions.push("Record unit-test signal (declared or detected)");
  }
  if ((input.openGapCount ?? 0) > 0) {
    parts.push(`${input.openGapCount} open engineering gap(s) are linked.`);
    actions.push("Close or triage the highest-priority catalog gaps");
  }
  if ((input.failedPipelines7d ?? 0) > 0) {
    parts.push(`${input.failedPipelines7d} failed pipeline(s) in the last 7 days.`);
    actions.push("Inspect the latest failed pipeline and fix or quarantine the branch");
  }
  if (input.priority) {
    actions.push(`Treat gap priority as ${input.priority}`);
  }
  if (actions.length === 0) {
    actions.push("Re-run catalog checks after the next sync");
    actions.push("Confirm default branch and production criticality tags");
  }

  return {
    explanation: parts.join(" "),
    recommendedActions: [...new Set(actions)].slice(0, 5),
    source: "heuristic",
  };
}

function forgeFixFromError(
  category: string | null | undefined,
  message: string,
): { likelyCause: string; suggestedFix: string } {
  const cat = (category ?? "").toLowerCase();
  const msg = message.toLowerCase();

  if (
    /unresolved reference|cannot find symbol|package .* does not exist|error: /.test(msg) ||
    cat.includes("compile")
  ) {
    return {
      likelyCause:
        "Compile/type error in the selected branch — missing symbol, wrong module, or branch out of sync with dependencies.",
      suggestedFix:
        "Open the failing Gradle/Xcode error locally on the same git reference; fix the compile break (or switch to a green branch), then re-queue the Forge build.",
    };
  }
  if (/signing|keystore|provisioning|certificate|codesign/.test(msg) || cat.includes("sign")) {
    return {
      likelyCause: "Signing or provisioning configuration rejected the artifact.",
      suggestedFix:
        "Confirm the Forge build profile keystore/provisioning secrets match this application and bank flavor, then rebuild.",
    };
  }
  if (/timed.?out|timeout|lease|runner/.test(msg) || cat.includes("timeout") || cat.includes("runner")) {
    return {
      likelyCause: "Build timed out or the runner dropped the lease before completion.",
      suggestedFix:
        "Check runner heartbeat/capacity, reduce parallel load, and re-queue; if it times out again, inspect the last runner log segment.",
    };
  }
  if (/gradle|agp|sdk|ndk|flutter|pod install|cocoapods/.test(msg)) {
    return {
      likelyCause: "Toolchain or dependency resolution failed during the mobile build.",
      suggestedFix:
        "Align local SDK/Flutter/Gradle with the Forge runner image, clear lockfile mismatches, then re-queue on the same profile.",
    };
  }
  if (/cancel/.test(msg) || cat.includes("cancel")) {
    return {
      likelyCause: "Build was cancelled before producing artifacts.",
      suggestedFix: "Confirm it was intentional; otherwise re-queue and avoid stopping the runner mid-job.",
    };
  }

  return {
    likelyCause: message.slice(0, 280) || "No structured failure summary was stored.",
    suggestedFix:
      "Reproduce on the Forge runner with the same git reference and profile; fix the first hard error in the log, then re-queue.",
  };
}

export function heuristicForgeExplainFailure(input: {
  status?: string | null;
  platform?: string | null;
  errorMessage?: string | null;
  failureCategory?: string | null;
  logTail?: string | null;
  applicationName?: string | null;
  bankName?: string | null;
  gitReference?: string | null;
  profileName?: string | null;
  runnerName?: string | null;
}): ForgeExplainFailureResult {
  const err =
    input.errorMessage?.trim() ||
    input.logTail?.trim() ||
    "No error details recorded on this platform build.";
  const { likelyCause, suggestedFix } = forgeFixFromError(input.failureCategory, err);
  const where = [
    input.applicationName,
    input.bankName,
    input.platform,
    input.gitReference ? `ref ${input.gitReference}` : null,
    input.profileName ? `profile ${input.profileName}` : null,
    input.runnerName ? `runner ${input.runnerName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    summary: `${input.platform ?? "Build"} ${input.status ?? "Failed"}${where ? ` — ${where}` : ""}. ${
      input.failureCategory ? `Category: ${input.failureCategory}.` : ""
    }`.trim(),
    likelyCause,
    suggestedFix,
    source: "heuristic",
  };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function heuristicTriageDuplicates(input: {
  focus: { id: string; title: string; description?: string | null; category: string; program?: string | null };
  candidates: Array<{
    id: string;
    title: string;
    description?: string | null;
    status: string;
    category: string;
    program?: string | null;
  }>;
}): TriageDuplicatesResult {
  const focusTokens = tokenize(`${input.focus.title} ${input.focus.description ?? ""} ${input.focus.program ?? ""}`);
  const scored = input.candidates
    .filter((c) => c.id !== input.focus.id)
    .map((c) => {
      const tokens = tokenize(`${c.title} ${c.description ?? ""} ${c.program ?? ""}`);
      let score = jaccard(focusTokens, tokens);
      if (c.category === input.focus.category) score += 0.08;
      if (
        input.focus.program?.trim() &&
        c.program?.trim() &&
        input.focus.program.trim().toLowerCase() === c.program.trim().toLowerCase()
      ) {
        score += 0.12;
      }
      const titleEq =
        c.title.trim().toLowerCase() === input.focus.title.trim().toLowerCase() ? 0.35 : 0;
      score = Math.min(1, score + titleEq);
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        category: c.category,
        score: Math.round(score * 100) / 100,
        href: `/triage/${c.id}`,
      };
    })
    .filter((c) => c.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const recommendation =
    scored.length === 0
      ? "No likely duplicates in the open queue — keep this item."
      : scored[0]!.score >= 0.55
        ? `Likely duplicate of "${scored[0]!.title}" — cancel the weaker item or merge notes into the survivor.`
        : `Possible related items found — compare before creating more triage on the same theme.`;

  return { likelyDuplicates: scored, recommendation, source: "heuristic" };
}

export function heuristicPlanningDraft(input: {
  titleHint?: string | null;
  program?: string | null;
  department?: string | null;
  triageTitles?: string[];
  notes?: string | null;
}): PlanningDraftResult {
  const theme = input.titleHint?.trim() || input.triageTitles?.[0]?.trim() || "Delivery initiative";
  const linked = (input.triageTitles ?? []).slice(0, 4);
  const description = [
    `Outcome: advance "${theme}" with a clear milestone and owner.`,
    linked.length
      ? `Seeded from open triage: ${linked.join("; ")}.`
      : "Seeded from leadership context — attach related triage items after create.",
    input.notes?.trim() ? `Notes: ${input.notes.trim().slice(0, 280)}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: theme.length > 80 ? `${theme.slice(0, 77)}…` : theme,
    description,
    department: input.department?.trim() || null,
    program: input.program?.trim() || null,
    rationale: "Drafted from open work so planning stays tied to real triage pressure.",
    source: "heuristic",
  };
}

export function heuristicDecisionDraft(input: {
  titleHint?: string | null;
  context?: string | null;
  options?: string[];
  relatedTitle?: string | null;
}): DecisionDraftResult {
  const title =
    input.titleHint?.trim() ||
    (input.relatedTitle ? `Decide path for ${input.relatedTitle}` : "Record leadership decision");
  const options = (input.options ?? []).filter((o) => o.trim());
  const body = [
    input.context?.trim() || "Context: captured from Helm assist for the leadership log.",
    options.length ? `Options considered: ${options.join(" · ")}.` : "Options: (add alternatives before finalizing).",
    "Decision: (fill in the chosen option and owner).",
    "Follow-up: link related triage/planning and set the next check-in.",
  ].join("\n\n");

  return {
    title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
    body,
    rationale: "Decision drafts should be editable before they become the team record.",
    source: "heuristic",
  };
}

export function heuristicCatalogGapsTop(
  gaps: Array<{
    id: string;
    title: string;
    priority: string;
    repositoryId: string;
    repositoryName: string;
    freshnessState?: string | null;
  }>,
): CatalogGapsTopResult {
  const rank: Record<string, number> = {
    critical: 0,
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
  };
  const sorted = [...gaps].sort((a, b) => {
    const pa = rank[a.priority.toLowerCase()] ?? 5;
    const pb = rank[b.priority.toLowerCase()] ?? 5;
    if (pa !== pb) return pa - pb;
    const staleA = a.freshnessState === "stale" || a.freshnessState === "never_synchronized" ? 0 : 1;
    const staleB = b.freshnessState === "stale" || b.freshnessState === "never_synchronized" ? 0 : 1;
    return staleA - staleB;
  });

  const topGaps = sorted.slice(0, 3).map((g) => ({
    id: g.id,
    title: g.title,
    priority: g.priority,
    repositoryName: g.repositoryName,
    repositoryId: g.repositoryId,
    why:
      g.priority === "critical" || g.priority === "urgent"
        ? `${g.priority} gap on ${g.repositoryName} needs an owner this week.`
        : `Open ${g.priority} gap on ${g.repositoryName}${
            g.freshnessState === "stale" || g.freshnessState === "never_synchronized"
              ? " (catalog data may be stale)"
              : ""
          }.`,
    href: `/catalog/repositories/${g.repositoryId}`,
  }));

  return {
    topGaps,
    summary:
      topGaps.length === 0
        ? "No open engineering gaps matched the filter."
        : `Focus on ${topGaps.length} gap(s): ${topGaps.map((g) => g.repositoryName).join(", ")}.`,
    source: "heuristic",
  };
}

export function heuristicPriorityReorder(
  items: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    escalated?: boolean;
    ageDays?: number | null;
    dueAt?: Date | string | null;
  }>,
): PriorityReorderResult {
  const score = (it: (typeof items)[number]) => {
    let s = 0;
    if (it.escalated) s += 100;
    if (it.category === "blocker") s += 80;
    if (it.category === "risk") s += 50;
    if (it.category === "decision") s += 40;
    const due = daysUntil(it.dueAt);
    if (due != null && due < 0) s += 60;
    else if (due != null && due <= 2) s += 30;
    s += Math.min(40, it.ageDays ?? 0);
    return s;
  };

  const ordered = [...items].sort((a, b) => score(b) - score(a));
  const bullets = ordered.slice(0, 5).map((it, idx) => {
    const bits = [
      it.escalated ? "escalated" : null,
      it.category,
      daysUntil(it.dueAt) != null && daysUntil(it.dueAt)! < 0 ? "overdue" : null,
    ].filter(Boolean);
    return `${idx + 1}. ${it.title} (${bits.join(", ")})`;
  });

  return {
    orderedIds: ordered.map((i) => i.id),
    rationale:
      "Order favors escalated blockers, then overdue work, then risk/decision items by age.",
    bullets,
    source: "heuristic",
  };
}
