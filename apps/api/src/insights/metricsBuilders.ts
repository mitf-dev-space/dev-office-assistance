import type { PrismaClient } from "@prisma/client";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
}

export async function buildWeeklyOpsMetrics(prisma: PrismaClient, periodEnd = new Date()) {
  const periodStart = daysAgo(7, periodEnd);
  const openStatuses = ["inbox", "in_progress", "snoozed"] as const;

  const [openCount, escalatedCount, overdueCount, byCategory, standupRows, expenses] =
    await Promise.all([
      prisma.triageItem.count({ where: { status: { in: [...openStatuses] } } }),
      prisma.triageItem.count({ where: { escalated: true, status: { in: [...openStatuses] } } }),
      prisma.triageItem.count({
        where: {
          status: { in: [...openStatuses] },
          dueAt: { lt: periodEnd },
        },
      }),
      prisma.triageItem.groupBy({
        by: ["category"],
        where: { status: { in: [...openStatuses] } },
        _count: { _all: true },
      }),
      prisma.standupCheckIn.findMany({
        where: { weekStart: { gte: startOfUtcDay(daysAgo(14, periodEnd)) } },
        include: { user: { select: { displayName: true, email: true } } },
        take: 50,
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: periodStart, lte: periodEnd } },
        select: { amount: true, currency: true },
      }),
    ]);

  const blockerNotes = standupRows.filter((r) => r.blockers.trim()).length;
  const expenseByCurrency: Record<string, number> = {};
  for (const e of expenses) {
    const cur = e.currency || "USD";
    expenseByCurrency[cur] = (expenseByCurrency[cur] ?? 0) + Number(e.amount);
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    triage: {
      openCount,
      escalatedCount,
      overdueCount,
      byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
    },
    standup: {
      checkInCount: standupRows.length,
      blockerNoteCount: blockerNotes,
    },
    expenses: {
      entryCount: expenses.length,
      totalsByCurrency: expenseByCurrency,
    },
  };
}

export async function buildCatalogHealthMetrics(prisma: PrismaClient, periodEnd = new Date()) {
  const periodStart = daysAgo(7, periodEnd);
  const [openGaps, repos, failedPipelines, latestScores] = await Promise.all([
    prisma.engineeringGap.count({ where: { status: "open" } }),
    prisma.repository.count(),
    prisma.pipelineRun.count({
      where: {
        status: { in: ["failed", "canceled"] },
        syncedAt: { gte: periodStart },
      },
    }),
    prisma.scorecardSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 200,
      select: { overallScore: true, repositoryId: true, capturedAt: true },
    }),
  ]);

  const seen = new Set<string>();
  const scores: number[] = [];
  for (const s of latestScores) {
    if (seen.has(s.repositoryId)) continue;
    seen.add(s.repositoryId);
    if (s.overallScore != null) scores.push(s.overallScore);
  }
  const avgScore =
    scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length;

  const staleRepos = await prisma.repository.count({
    where: {
      freshnessState: { in: ["stale", "never_synchronized"] },
    },
  });

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    openGapCount: openGaps,
    repositoryCount: repos,
    staleRepositoryCount: staleRepos,
    failedPipelines7d: failedPipelines,
    scorecardAverage: avgScore == null ? null : Math.round(avgScore * 10) / 10,
    scoredRepositoryCount: scores.length,
  };
}

export async function buildForgeBuildsMetrics(prisma: PrismaClient, periodEnd = new Date()) {
  const periodStart = daysAgo(7, periodEnd);
  const builds = await prisma.forgePlatformBuild.findMany({
    where: { queuedAtUtc: { gte: periodStart, lte: periodEnd } },
    select: {
      status: true,
      failureCategory: true,
      failureSummary: true,
      startedAtUtc: true,
      completedAtUtc: true,
      queuedAtUtc: true,
    },
  });

  const byStatus: Record<string, number> = {};
  const durations: number[] = [];
  const failureBuckets: Record<string, number> = {};
  let queued = 0;
  let succeeded = 0;
  let failed = 0;

  for (const b of builds) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    if (
      b.status === "Queued" ||
      b.status === "WaitingForCompatibleRunner" ||
      b.status === "Claimed" ||
      b.status === "InProgress" ||
      b.status === "Building"
    ) {
      queued += 1;
    }
    if (b.status === "Succeeded" || b.status === "SimulationCompleted") succeeded += 1;
    if (b.status === "Failed" || b.status === "Cancelled" || b.status === "TimedOut") {
      failed += 1;
      const key = b.failureCategory?.trim() || "unknown";
      failureBuckets[key] = (failureBuckets[key] ?? 0) + 1;
    }
    if (b.startedAtUtc && b.completedAtUtc) {
      durations.push(b.completedAtUtc.getTime() - b.startedAtUtc.getTime());
    }
  }

  durations.sort((a, b) => a - b);
  const medianDurationMs =
    durations.length === 0 ? null : durations[Math.floor(durations.length / 2)] ?? null;

  const totalFinished = succeeded + failed;
  const successRate = totalFinished === 0 ? null : succeeded / totalFinished;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalBuilds: builds.length,
    queueDepthApprox: queued,
    succeeded,
    failed,
    successRate: successRate == null ? null : Math.round(successRate * 1000) / 1000,
    medianDurationMs,
    byStatus,
    topFailureReasons: Object.entries(failureBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
  };
}

const OPEN_TRIAGE = ["inbox", "in_progress", "snoozed"] as const;

/** Rolling ~36h ops brief for the dashboard “what needs you today”. */
export async function buildMorningBriefMetrics(prisma: PrismaClient, periodEnd = new Date()) {
  const periodStart = daysAgo(2, periodEnd);
  const weekStart = startOfUtcDay(daysAgo(7, periodEnd));

  const [
    openCount,
    escalatedCount,
    overdueCount,
    blockerCount,
    standupRows,
    failedForge,
    staleRepos,
    topGaps,
    hotTriage,
  ] = await Promise.all([
    prisma.triageItem.count({ where: { status: { in: [...OPEN_TRIAGE] } } }),
    prisma.triageItem.count({ where: { escalated: true, status: { in: [...OPEN_TRIAGE] } } }),
    prisma.triageItem.count({
      where: { status: { in: [...OPEN_TRIAGE] }, dueAt: { lt: periodEnd } },
    }),
    prisma.triageItem.count({
      where: { category: "blocker", status: { in: [...OPEN_TRIAGE] } },
    }),
    prisma.standupCheckIn.findMany({
      where: { weekStart: { gte: weekStart } },
      select: { priorWork: true, nextWork: true, blockers: true, userId: true },
      take: 40,
    }),
    prisma.forgePlatformBuild.findMany({
      where: {
        status: { in: ["Failed", "TimedOut", "Cancelled"] },
        queuedAtUtc: { gte: periodStart },
      },
      take: 8,
      orderBy: { queuedAtUtc: "desc" },
      include: {
        buildRequest: {
          select: {
            id: true,
            gitReference: true,
            application: { select: { name: true } },
          },
        },
      },
    }),
    prisma.repository.count({
      where: { freshnessState: { in: ["stale", "never_synchronized"] } },
    }),
    prisma.engineeringGap.findMany({
      where: { status: "open" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        priority: true,
        repository: { select: { id: true, name: true } },
      },
    }),
    prisma.triageItem.findMany({
      where: {
        status: { in: [...OPEN_TRIAGE] },
        OR: [{ escalated: true }, { category: "blocker" }, { dueAt: { lt: periodEnd } }],
      },
      orderBy: [{ escalated: "desc" }, { dueAt: "asc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        escalated: true,
        dueAt: true,
        program: true,
        assignee: { select: { displayName: true } },
      },
    }),
  ]);

  const filledStandups = standupRows.filter(
    (r) => r.priorWork.trim() || r.nextWork.trim() || r.blockers.trim(),
  ).length;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    triage: {
      openCount,
      escalatedCount,
      overdueCount,
      blockerCount,
      hotItems: hotTriage.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status,
        escalated: t.escalated,
        dueAt: t.dueAt?.toISOString() ?? null,
        program: t.program,
        assigneeName: t.assignee.displayName,
        href: `/triage/${t.id}`,
      })),
    },
    standup: {
      checkInCount: standupRows.length,
      filledCheckInCount: filledStandups,
      emptyWeek: filledStandups === 0,
    },
    forge: {
      failedRecentCount: failedForge.length,
      failures: failedForge.map((b) => ({
        platformBuildId: b.id,
        buildRequestId: b.buildRequest.id,
        applicationName: b.buildRequest.application.name,
        gitReference: b.buildRequest.gitReference,
        status: b.status,
        failureCategory: b.failureCategory,
        failureSummary: b.failureSummary,
        href: `/forge/builds/${b.buildRequest.id}`,
      })),
    },
    catalog: {
      staleRepositoryCount: staleRepos,
      topGaps: topGaps.map((g) => ({
        id: g.id,
        title: g.title,
        priority: g.priority,
        repositoryId: g.repository.id,
        repositoryName: g.repository.name,
        href: `/catalog/repositories/${g.repository.id}`,
      })),
    },
  };
}

/** Cross-surface blocker / risk signals for Priority & risk views. */
export async function buildBlockerRadarMetrics(prisma: PrismaClient, periodEnd = new Date()) {
  const periodStart = daysAgo(7, periodEnd);
  const signals: Array<{
    id: string;
    source: string;
    severity: "critical" | "high" | "medium";
    title: string;
    whyHot: string;
    suggestedNextAction: string;
    href: string;
    triageItemId?: string;
  }> = [];

  const [escalated, blockers, overdue, failedForge, highGaps] = await Promise.all([
    prisma.triageItem.findMany({
      where: { escalated: true, status: { in: [...OPEN_TRIAGE] } },
      take: 15,
      orderBy: { updatedAt: "desc" },
      include: { assignee: { select: { displayName: true } } },
    }),
    prisma.triageItem.findMany({
      where: { category: "blocker", status: { in: [...OPEN_TRIAGE] }, escalated: false },
      take: 15,
      orderBy: { updatedAt: "desc" },
      include: { assignee: { select: { displayName: true } } },
    }),
    prisma.triageItem.findMany({
      where: {
        status: { in: [...OPEN_TRIAGE] },
        dueAt: { lt: periodEnd },
        escalated: false,
        category: { not: "blocker" },
      },
      take: 15,
      orderBy: { dueAt: "asc" },
      include: { assignee: { select: { displayName: true } } },
    }),
    prisma.forgePlatformBuild.findMany({
      where: {
        status: { in: ["Failed", "TimedOut"] },
        queuedAtUtc: { gte: periodStart },
      },
      take: 10,
      orderBy: { queuedAtUtc: "desc" },
      include: {
        buildRequest: {
          select: {
            id: true,
            application: { select: { name: true } },
          },
        },
      },
    }),
    prisma.engineeringGap.findMany({
      where: { status: "open", priority: { in: ["high", "critical", "urgent"] } },
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: { repository: { select: { id: true, name: true } } },
    }),
  ]);

  for (const t of escalated) {
    signals.push({
      id: `triage-esc-${t.id}`,
      source: "triage_escalated",
      severity: "critical",
      title: t.title,
      whyHot: `Escalated ${t.category} owned by ${t.assignee.displayName}.`,
      suggestedNextAction: `Unblock "${t.title}" with ${t.assignee.displayName} today — confirm impact and timebox.`,
      href: `/triage/${t.id}`,
      triageItemId: t.id,
    });
  }
  for (const t of blockers) {
    signals.push({
      id: `triage-blk-${t.id}`,
      source: "triage_blocker",
      severity: "high",
      title: t.title,
      whyHot: `Open blocker; status ${t.status}.`,
      suggestedNextAction: t.nextAction?.trim()
        ? t.nextAction.trim()
        : `Assign an unblock plan for "${t.title}".`,
      href: `/triage/${t.id}`,
      triageItemId: t.id,
    });
  }
  for (const t of overdue) {
    signals.push({
      id: `triage-od-${t.id}`,
      source: "triage_overdue",
      severity: "high",
      title: t.title,
      whyHot: `Overdue since ${t.dueAt?.toISOString().slice(0, 10) ?? "unknown"}.`,
      suggestedNextAction: `Close or renegotiate overdue "${t.title}" this week.`,
      href: `/triage/${t.id}`,
      triageItemId: t.id,
    });
  }
  for (const b of failedForge) {
    signals.push({
      id: `forge-${b.id}`,
      source: "forge_failure",
      severity: b.status === "TimedOut" ? "medium" : "high",
      title: `${b.buildRequest.application.name} · ${b.platform} ${b.status}`,
      whyHot: b.failureSummary?.slice(0, 160) || b.failureCategory || "Forge platform build failed.",
      suggestedNextAction: "Open the build, run Explain failure, fix the first hard error, re-queue.",
      href: `/forge/builds/${b.buildRequest.id}`,
    });
  }
  for (const g of highGaps) {
    signals.push({
      id: `gap-${g.id}`,
      source: "catalog_gap",
      severity: g.priority === "critical" ? "critical" : "medium",
      title: `${g.repository.name}: ${g.title}`,
      whyHot: `Open ${g.priority} engineering gap.`,
      suggestedNextAction: `Assign owner and remediate gap on ${g.repository.name}.`,
      href: `/catalog/repositories/${g.repository.id}`,
    });
  }

  const severityRank = { critical: 0, high: 1, medium: 2 };
  signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    signalCount: signals.length,
    bySource: signals.reduce<Record<string, number>>((acc, s) => {
      acc[s.source] = (acc[s.source] ?? 0) + 1;
      return acc;
    }, {}),
    signals: signals.slice(0, 40),
  };
}
