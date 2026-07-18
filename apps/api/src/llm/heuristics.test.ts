import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  heuristicCatalogExplain,
  heuristicCatalogGapsTop,
  heuristicDecisionDraft,
  heuristicForgeExplainFailure,
  heuristicPlanningDraft,
  heuristicPriorityReorder,
  heuristicStandupDigest,
  heuristicTriageDuplicates,
  heuristicTriageNextAction,
  heuristicTriageSummarize,
} from "./heuristics.js";
import { redactForLlm } from "./openaiCompatible.js";
import { consumeUsage, DailyCapExceededError, resetUsageForTests } from "./usageGuard.js";
import {
  decryptSecret,
  encryptSecret,
  resetLlmEncryptionKeyCache,
  resolveLlmEncryptionKey,
} from "./secretCipher.js";
import { isLlmProviderPreset, presetMeta } from "./providerPresets.js";

describe("llm heuristics", () => {
  it("summarizes triage without LLM", () => {
    const r = heuristicTriageSummarize({
      title: "API outage",
      description: "Gateway 502",
      category: "blocker",
      status: "inbox",
      escalated: true,
    });
    assert.equal(r.source, "heuristic");
    assert.match(r.summary, /API outage/);
    assert.ok(r.bullets.some((b) => /escalated/i.test(b)));
  });

  it("suggests urgent next action for blockers", () => {
    const r = heuristicTriageNextAction({
      title: "Blocked release",
      category: "blocker",
      status: "inbox",
    });
    assert.equal(r.suggestedPriority, "urgent");
    assert.ok(r.nextAction.length > 0);
  });

  it("builds standup digest", () => {
    const r = heuristicStandupDigest([
      { authorName: "A", prior: "x", next: "y", blockers: "Waiting on bank" },
    ]);
    assert.equal(r.blockers.length, 1);
    assert.equal(r.source, "heuristic");
  });

  it("explains catalog gaps", () => {
    const r = heuristicCatalogExplain({ title: "Missing CI", checkSlug: "ci", priority: "high" });
    assert.match(r.explanation, /Missing CI/);
  });

  it("explains forge compile failures with a concrete fix", () => {
    const r = heuristicForgeExplainFailure({
      status: "Failed",
      platform: "Android",
      failureCategory: "CompileError",
      errorMessage: "Gradle task assembleDebug failed: unresolved reference: FooBar",
      applicationName: "Gateway Tester",
      gitReference: "dev",
    });
    assert.match(r.summary, /Gateway Tester|Android/);
    assert.match(r.likelyCause, /Compile|symbol|branch/i);
    assert.match(r.suggestedFix, /re-queue|git reference/i);
  });

  it("explains never-synced catalog repos with sync-first actions", () => {
    const r = heuristicCatalogExplain({
      title: "Payment Ecosystem",
      freshnessState: "never_synchronized",
      connectivityState: "reachable",
      technicalOwnerName: null,
      reportedPipelineState: "unknown",
    });
    assert.match(r.explanation, /never synchronized|outdated/i);
    assert.ok(r.recommendedActions.some((a) => /Sync/i.test(a)));
    assert.ok(r.recommendedActions.some((a) => /owner/i.test(a)));
  });

  it("detects likely triage duplicates by title overlap", () => {
    const r = heuristicTriageDuplicates({
      focus: {
        id: "a",
        title: "Gateway 502 on payment",
        description: "customers cannot pay",
        category: "blocker",
        program: "Jumhoria",
      },
      candidates: [
        {
          id: "b",
          title: "Gateway 502 payment outage",
          description: "cannot pay",
          status: "inbox",
          category: "blocker",
          program: "Jumhoria",
        },
        {
          id: "c",
          title: "Hire Flutter contractor",
          description: "staffing",
          status: "inbox",
          category: "inbox",
        },
      ],
    });
    assert.ok(r.likelyDuplicates.some((d) => d.id === "b"));
    assert.ok(!r.likelyDuplicates.some((d) => d.id === "c"));
  });

  it("drafts planning and decision content", () => {
    const p = heuristicPlanningDraft({
      titleHint: "Wallet release train",
      triageTitles: ["Blocker: signing"],
    });
    assert.match(p.title, /Wallet/);
    const d = heuristicDecisionDraft({ relatedTitle: "Vendor pick", options: ["A", "B"] });
    assert.match(d.body, /Options considered/);
  });

  it("ranks catalog gaps and priority queue", () => {
    const gaps = heuristicCatalogGapsTop([
      {
        id: "1",
        title: "No CI",
        priority: "medium",
        repositoryId: "r1",
        repositoryName: "A",
      },
      {
        id: "2",
        title: "Owner missing",
        priority: "critical",
        repositoryId: "r2",
        repositoryName: "B",
      },
    ]);
    assert.equal(gaps.topGaps[0]?.id, "2");
    const order = heuristicPriorityReorder([
      { id: "x", title: "Inbox", category: "inbox", status: "inbox", ageDays: 1 },
      {
        id: "y",
        title: "Blocker",
        category: "blocker",
        status: "inbox",
        escalated: true,
        ageDays: 2,
      },
    ]);
    assert.equal(order.orderedIds[0], "y");
  });
});

describe("llm redact and usage", () => {
  it("redacts bearer tokens", () => {
    const out = redactForLlm('Authorization: Bearer abc.def.ghi and "apiKey":"secret"');
    assert.ok(!out.includes("abc.def.ghi"));
    assert.ok(out.includes("[REDACTED]"));
  });

  it("enforces daily cap", () => {
    resetUsageForTests();
    consumeUsage("test-scope", 2);
    consumeUsage("test-scope", 2);
    assert.throws(() => consumeUsage("test-scope", 2), DailyCapExceededError);
  });
});

describe("llm cipher and presets", () => {
  it("round-trips secrets", () => {
    resetLlmEncryptionKeyCache();
    const key = resolveLlmEncryptionKey({ NODE_ENV: "development" });
    const cipher = encryptSecret("sk-or-test", key);
    assert.equal(decryptSecret(cipher, key), "sk-or-test");
  });

  it("includes openrouter and lmstudio presets", () => {
    assert.equal(isLlmProviderPreset("openrouter"), true);
    assert.equal(isLlmProviderPreset("lmstudio"), true);
    assert.equal(presetMeta("openrouter")?.apiKeyRequired, true);
    assert.equal(presetMeta("lmstudio")?.apiKeyRequired, false);
    assert.match(presetMeta("lmstudio")?.defaultModel ?? "", /gemma/);
  });
});
