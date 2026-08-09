import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { generateInvitationToken, hashInvitationToken, roundedSubmissionTime } from "./tokens.js";
import type { SurveyEligibilityRule } from "@office/types";

/** Pure answer-set validation (also unit-tested in validate.test.ts). */
export function validateAnswers(
  questions: Array<{ id: string }>,
  answers: Record<string, string>,
): { ok: true } | { ok: false; code: "answers" } {
  const answerKeys = Object.keys(answers);
  if (answerKeys.length !== questions.length) return { ok: false, code: "answers" };
  const questionIds = new Set(questions.map((q) => q.id));
  for (const [questionId, value] of Object.entries(answers)) {
    if (!questionIds.has(questionId)) return { ok: false, code: "answers" };
    if (value !== "yes" && value !== "no") return { ok: false, code: "answers" };
  }
  return { ok: true };
}

/**
 * Resolves an eligibility rule to the concrete list of eligible developer ids.
 * - all: every Developer record (the roster is the employee model).
 * - department: developers who hold a TeamMembership in that DevTeam.
 * - specific: the listed developer ids (deduplicated).
 */
export async function resolveEligibleDeveloperIds(
  rule: SurveyEligibilityRule,
): Promise<string[]> {
  switch (rule.kind) {
    case "all": {
      const rows = await prisma.developer.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }
    case "department": {
      const rows = await prisma.teamMembership.findMany({
        where: { team: rule.team },
        select: { developerId: true },
      });
      return [...new Set(rows.map((r) => r.developerId))];
    }
    case "specific": {
      return [...new Set(rule.developerIds)];
    }
  }
}

/**
 * Generates one cryptographically secure invitation per eligible employee and
 * stores only the token hashes. Returns a map of developerId -> raw token so the
 * caller can show the tokens exactly once (e.g. in the publish response).
 */
export async function generateInvitationsForSurvey(
  surveyId: string,
  developerIds: string[],
  expiresAt?: Date | null,
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  const rows = developerIds.map((developerId) => {
    const token = generateInvitationToken();
    tokens.set(developerId, token);
    return {
      surveyId,
      developerId,
      tokenHash: hashInvitationToken(token),
      expiresAt: expiresAt ?? null,
    };
  });
  if (rows.length) {
    await prisma.surveyInvitation.createMany({ data: rows });
  }
  return tokens;
}

export type InvitationStatus =
  | { ok: true }
  | { ok: false; code: "invalid" }
  | { ok: false; code: "used" }
  | { ok: false; code: "expired" }
  | { ok: false; code: "not_open" };

/**
 * Application-level check on an invitation (before the atomic submission).
 * The authoritative one-time-use guarantee is the atomic update below.
 */
export async function checkInvitation(
  surveyId: string,
  rawToken: string,
  now: Date = new Date(),
): Promise<InvitationStatus> {
  const inv = await prisma.surveyInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(rawToken) },
    include: { survey: true },
  });
  if (!inv) return { ok: false, code: "invalid" };
  if (inv.surveyId !== surveyId) return { ok: false, code: "invalid" };
  if (inv.used) return { ok: false, code: "used" };
  if (inv.expiresAt && inv.expiresAt < now) return { ok: false, code: "expired" };
  if (inv.survey.status !== "published") return { ok: false, code: "not_open" };
  if (inv.survey.closesAt && inv.survey.closesAt < now) {
    return { ok: false, code: "not_open" };
  }
  return { ok: true };
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "used" | "expired" | "not_open" | "answers" };

/**
 * Atomically submits an anonymous response and consumes the invitation.
 *
 * One-vote-per-employee is enforced by:
 * 1. A database-level unique constraint on (surveyId, developerId) for
 *    invitations — an employee can never hold two active invitations.
 * 2. A conditional atomic UPDATE ... WHERE used = false that marks the
 *    invitation used. If two simultaneous requests race, exactly one update
 *    affects a row; the loser updates 0 rows and is rejected.
 * 3. Responses are created in the same transaction as the consumption.
 *
 * The response row deliberately has NO employee or invitation reference —
 * anonymity is guaranteed at the application level.
 */
export async function submitAnonymousResponse(args: {
  surveyId: string;
  rawToken: string;
  answers: Record<string, "yes" | "no">;
}): Promise<SubmitResult> {
  const { surveyId, rawToken, answers } = args;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const inv = await tx.surveyInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(rawToken) },
      include: { survey: { include: { questions: { orderBy: { position: "asc" } } } } },
    });
    if (!inv || inv.surveyId !== surveyId) return { ok: false, code: "invalid" };
    if (inv.used) return { ok: false, code: "used" };
    if (inv.expiresAt && inv.expiresAt < now) return { ok: false, code: "expired" };
    if (inv.survey.status !== "published") return { ok: false, code: "not_open" };
    if (inv.survey.closesAt && inv.survey.closesAt < now) {
      return { ok: false, code: "not_open" };
    }

    const questions = inv.survey.questions;
    // Every question must be answered exactly once; no unknown/duplicate answers.
    const validation = validateAnswers(questions, answers);
    if (!validation.ok) return { ok: false, code: "answers" };

    // Atomic claim: only one concurrent request can flip used=false -> true.
    const claim = await tx.surveyInvitation.updateMany({
      where: { id: inv.id, used: false },
      data: { used: true, usedAt: now },
    });
    if (claim.count !== 1) return { ok: false, code: "used" };

    await tx.anonymousSurveyResponse.create({
      data: {
        surveyId,
        submittedAt: roundedSubmissionTime(now),
        answers: {
          create: questions.map((q) => ({
            questionId: q.id,
            value: answers[q.id],
          })),
        },
      },
    });
    return { ok: true };
  });
}

/** Regenerates an unused invitation's token (invalidating the previous one). */
export async function regenerateInvitationToken(
  invitationId: string,
): Promise<{ rawToken: string } | null> {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.surveyInvitation.findUnique({ where: { id: invitationId } });
    if (!inv) return null;
    if (inv.used) return null; // never regenerate a used invitation
    const rawToken = generateInvitationToken();
    await tx.surveyInvitation.update({
      where: { id: invitationId },
      data: { tokenHash: hashInvitationToken(rawToken) },
    });
    return { rawToken };
  });
}

/** Aggregated results. Responses are stored with no employee linkage. */
export async function computeSurveyResults(
  surveyId: string,
): Promise<{
  survey: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    publishedAt: Date | null;
    closedAt: Date | null;
    showResultsAfterClose: boolean;
    minResponsesToShow: number;
  };
  eligibleCount: number;
  usedInvitationCount: number;
  responseCount: number;
  questions: Array<{
    id: string;
    position: number;
    text: string;
    yes: number;
    no: number;
    total: number;
  }>;
}> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  if (!survey) {
    throw new Error("not_found");
  }

  const [eligibleCount, usedInvitationCount, responseCount, answerGroups] = await Promise.all([
    prisma.surveyInvitation.count({ where: { surveyId } }),
    prisma.surveyInvitation.count({ where: { surveyId, used: true } }),
    prisma.anonymousSurveyResponse.count({ where: { surveyId } }),
    prisma.anonymousSurveyAnswer.groupBy({
      by: ["questionId", "value"],
      where: { question: { surveyId } },
      _count: { _all: true },
    }),
  ]);

  const byQuestion = new Map<string, { yes: number; no: number }>();
  for (const row of answerGroups) {
    const entry = byQuestion.get(row.questionId) ?? { yes: 0, no: 0 };
    if (row.value === "yes") entry.yes += row._count._all;
    else if (row.value === "no") entry.no += row._count._all;
    byQuestion.set(row.questionId, entry);
  }

  const questions = survey.questions.map((q) => {
    const counts = byQuestion.get(q.id) ?? { yes: 0, no: 0 };
    const total = counts.yes + counts.no;
    return {
      id: q.id,
      position: q.position,
      text: q.text,
      yes: counts.yes,
      no: counts.no,
      total,
    };
  });

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      publishedAt: survey.publishedAt,
      closedAt: survey.closedAt,
      showResultsAfterClose: survey.showResultsAfterClose,
      minResponsesToShow: survey.minResponsesToShow,
    },
    eligibleCount,
    usedInvitationCount,
    responseCount,
    questions,
  };
}
