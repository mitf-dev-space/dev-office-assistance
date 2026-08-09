import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";
import type { Env } from "../env.js";
import type { SurveyStatus, SurveyResultsDto } from "@office/types";
import {
  computeSurveyResults,
  generateInvitationsForSurvey,
  regenerateInvitationToken,
  resolveEligibleDeveloperIds,
} from "../surveys/service.js";
import { buildSurveyResultsPdf } from "../surveys/pdf.js";

const SURVEY_MAX_QUESTIONS = 10;
const SURVEY_MIN_QUESTIONS = 1;

const questionZ = z.object({
  text: z.string().min(1).max(2000),
});

const eligibilityZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({
    kind: z.literal("department"),
    team: z.enum(["backend", "qa", "frontend_web", "frontend_mobile"]),
  }),
  z.object({ kind: z.literal("specific"), developerIds: z.array(z.string().min(1)).max(2000) }),
]);

const createBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(20000).nullable().optional(),
  questions: z
    .array(questionZ)
    .min(SURVEY_MIN_QUESTIONS)
    .max(SURVEY_MAX_QUESTIONS),
  eligibility: eligibilityZ,
  closesAt: z.string().nullable().optional(),
  showResultsAfterClose: z.boolean().optional(),
  minResponsesToShow: z.number().int().min(0).max(10000).optional(),
});

const patchBody = createBody.partial();

type SurveyRow = Prisma.SurveyGetPayload<{
  include: {
    questions: true;
    invitations: true;
    eligibility: true;
    _count: { select: { responses: true } };
  };
}>;

function participationPercent(responseCount: number, eligibleCount: number): number {
  if (eligibleCount <= 0) return 0;
  return Math.round((responseCount / eligibleCount) * 100);
}

function surveyToDto(row: SurveyRow) {
  const eligibleCount = row.eligibility.length;
  const usedInvitationCount = row.invitations.filter((i) => i.used).length;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    closesAt: row.closesAt?.toISOString() ?? null,
    showResultsAfterClose: row.showResultsAfterClose,
    minResponsesToShow: row.minResponsesToShow,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    questions: [...row.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({ id: q.id, position: q.position, text: q.text })),
    eligibleCount,
    invitationCount: row.invitations.length,
    usedInvitationCount,
    responseCount: row._count.responses,
    participationPercent: participationPercent(row._count.responses, eligibleCount),
  };
}

const surveyInclude = {
  questions: true,
  invitations: true,
  eligibility: true,
  _count: { select: { responses: true } },
} satisfies Prisma.SurveyInclude;

async function loadSurveyOr404(id: string) {
  const row = await prisma.survey.findUnique({
    where: { id },
    include: surveyInclude,
  });
  return row;
}

export async function registerSurveyRoutes(app: FastifyInstance, _env: Env) {
  // --- List ---

  app.get("/api/surveys", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(q, { maxLimit: 100 });
    const statuses = (q.status ?? "").split(",").filter(Boolean) as SurveyStatus[];
    const where: Prisma.SurveyWhereInput = {};
    if (statuses.length) where.status = { in: statuses };
    if (pq.q) {
      where.OR = [
        { title: { contains: pq.q, mode: "insensitive" } },
        { description: { contains: pq.q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.survey.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ createdAt: "desc" }],
        include: surveyInclude,
      }),
      prisma.survey.count({ where }),
    ]);
    return withPageMeta(
      { surveys: rows.map((r) => surveyToDto(r)) },
      pq.page,
      pq.limit,
      total,
    );
  });

  // --- Create (draft) ---

  app.post("/api/surveys", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const eligible = await resolveEligibleDeveloperIds(b.eligibility);

    const row = await prisma.survey.create({
      data: {
        title: b.title,
        description: b.description ?? null,
        status: "draft",
        closesAt: b.closesAt ? new Date(b.closesAt) : null,
        showResultsAfterClose: b.showResultsAfterClose ?? false,
        minResponsesToShow: b.minResponsesToShow ?? 5,
        createdById: me.id,
        questions: {
          create: b.questions.map((q, i) => ({ position: i + 1, text: q.text })),
        },
        // Track eligible employees at draft time; invitations (with tokens) are
        // generated only at publish.
        eligibility: {
          create: eligible.map((developerId) => ({ developerId })),
        },
      },
      include: surveyInclude,
    });
    return reply.status(201).send(surveyToDto(row));
  });

  // --- Get one ---

  app.get("/api/surveys/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const row = await loadSurveyOr404(id);
    if (!row) return reply.status(404).send({ error: "not_found" });
    return surveyToDto(row);
  });

  // --- Edit (draft only) ---

  app.patch("/api/surveys/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.status !== "draft") {
      return reply.status(409).send({ error: "not_editable" });
    }
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;

    let eligible: string[] | undefined;
    if (b.eligibility) {
      eligible = await resolveEligibleDeveloperIds(b.eligibility);
    }

    const row = await prisma.$transaction(async (tx) => {
      if (b.questions) {
        await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
        await tx.surveyQuestion.createMany({
          data: b.questions.map((qq, i) => ({ surveyId: id, position: i + 1, text: qq.text })),
        });
      }
      if (eligible !== undefined) {
        await tx.surveyEligibility.deleteMany({ where: { surveyId: id } });
        await tx.surveyEligibility.createMany({
          data: eligible.map((developerId) => ({ surveyId: id, developerId })),
        });
      }
      return tx.survey.update({
        where: { id },
        data: {
          ...(b.title !== undefined ? { title: b.title } : {}),
          ...(b.description !== undefined ? { description: b.description } : {}),
          ...(b.closesAt !== undefined
            ? { closesAt: b.closesAt ? new Date(b.closesAt) : null }
            : {}),
          ...(b.showResultsAfterClose !== undefined
            ? { showResultsAfterClose: b.showResultsAfterClose }
            : {}),
          ...(b.minResponsesToShow !== undefined
            ? { minResponsesToShow: b.minResponsesToShow }
            : {}),
        },
        include: surveyInclude,
      });
    });
    return surveyToDto(row);
  });

  // --- Publish ---

  app.post("/api/surveys/:id/publish", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({
      where: { id },
      include: { questions: true, eligibility: true },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.status !== "draft") {
      return reply.status(409).send({ error: "not_draft" });
    }
    if (existing.questions.length < SURVEY_MIN_QUESTIONS) {
      return reply.status(400).send({ error: "too_few_questions" });
    }
    const eligibleIds = existing.eligibility.map((e) => e.developerId);
    if (!eligibleIds.length) {
      return reply.status(400).send({ error: "no_eligible_employees" });
    }

    // Generate fresh cryptographically secure tokens for every eligible employee.
    const tokens = await generateInvitationsForSurvey(
      existing.id,
      eligibleIds,
      existing.closesAt,
    );

    const row = await prisma.survey.update({
      where: { id },
      data: {
        status: "published",
        publishedAt: new Date(),
        questions: {
          // Freeze question wording/order (no-op update; keeps values identical).
          update: existing.questions.map((qq) => ({
            where: { id: qq.id },
            data: { text: qq.text, position: qq.position },
          })),
        },
      },
      include: surveyInclude,
    });

    // Return tokens exactly once so the manager can distribute them.
    const dto = surveyToDto(row);
    const developers = await prisma.developer.findMany({
      where: { id: { in: row.invitations.map((i) => i.developerId) } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(developers.map((d) => [d.id, d.displayName]));
    return reply.status(200).send({
      ...dto,
      invitations: row.invitations.map((inv) => ({
        id: inv.id,
        developerId: inv.developerId,
        developerName: nameById.get(inv.developerId) ?? "",
        used: inv.used,
        token: tokens.get(inv.developerId) ?? null,
      })),
    });
  });

  // --- Close ---

  app.post("/api/surveys/:id/close", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.status !== "published") {
      return reply.status(409).send({ error: "not_published" });
    }
    const row = await prisma.survey.update({
      where: { id },
      data: { status: "closed", closedAt: new Date() },
      include: surveyInclude,
    });
    return surveyToDto(row);
  });

  // --- Archive ---

  app.post("/api/surveys/:id/archive", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.status !== "closed") {
      return reply.status(409).send({ error: "not_closed" });
    }
    const row = await prisma.survey.update({
      where: { id },
      data: { status: "archived" },
      include: surveyInclude,
    });
    return surveyToDto(row);
  });

  // --- Duplicate into a new draft ---

  app.post("/api/surveys/:id/duplicate", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({
      where: { id },
      include: { questions: true, eligibility: true },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    const row = await prisma.survey.create({
      data: {
        title: `${existing.title} (copy)`,
        description: existing.description,
        status: "draft",
        closesAt: null,
        showResultsAfterClose: existing.showResultsAfterClose,
        minResponsesToShow: existing.minResponsesToShow,
        createdById: me.id,
        questions: {
          create: [...existing.questions]
            .sort((a, b) => a.position - b.position)
            .map((qq) => ({ position: qq.position, text: qq.text })),
        },
        eligibility: {
          create: existing.eligibility.map((e) => ({ developerId: e.developerId })),
        },
      },
      include: surveyInclude,
    });
    return reply.status(201).send(surveyToDto(row));
  });

  // --- Delete (draft only) ---

  app.delete("/api/surveys/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.status !== "draft") {
      return reply.status(409).send({ error: "not_draft" });
    }
    await prisma.survey.delete({ where: { id } });
    return reply.status(204).send();
  });

  // --- Invitations management ---

  app.get("/api/surveys/:id/invitations", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const survey = await prisma.survey.findUnique({ where: { id } });
    if (!survey) return reply.status(404).send({ error: "not_found" });

    const rows = await prisma.surveyInvitation.findMany({
      where: { surveyId: id },
      include: { developer: { select: { displayName: true, workEmail: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      invitations: rows.map((inv) => ({
        id: inv.id,
        developerId: inv.developerId,
        developerName: inv.developer.displayName,
        workEmail: inv.developer.workEmail,
        used: inv.used,
        usedAt: inv.usedAt?.toISOString() ?? null,
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      })),
    };
  });

  app.post("/api/surveys/:id/invitations/:invitationId/regenerate", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id, invitationId } = request.params as { id: string; invitationId: string };
    const survey = await prisma.survey.findUnique({ where: { id } });
    if (!survey) return reply.status(404).send({ error: "not_found" });
    const result = await regenerateInvitationToken(invitationId);
    if (!result) return reply.status(409).send({ error: "cannot_regenerate" });
    return { token: result.rawToken };
  });

  // Generate current, copyable voting links for every unused invitation.
  // Each call regenerates the token (invalidating the previous one) so a fresh
  // usable link is always available. Raw tokens are never persisted or listed.
  app.get("/api/surveys/:id/invitations/links", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const survey = await prisma.survey.findUnique({ where: { id } });
    if (!survey) return reply.status(404).send({ error: "not_found" });

    const rows = await prisma.surveyInvitation.findMany({
      where: { surveyId: id },
      include: { developer: { select: { displayName: true, workEmail: true } } },
      orderBy: { createdAt: "asc" },
    });

    const links = [];
    for (const inv of rows) {
      if (inv.used) {
        links.push({
          id: inv.id,
          developerId: inv.developerId,
          developerName: inv.developer.displayName,
          workEmail: inv.developer.workEmail,
          used: true,
          url: null,
        });
      } else {
        const result = await regenerateInvitationToken(inv.id);
        if (!result) continue;
        links.push({
          id: inv.id,
          developerId: inv.developerId,
          developerName: inv.developer.displayName,
          workEmail: inv.developer.workEmail,
          used: false,
          url: result.rawToken,
        });
      }
    }
    return { links };
  });

  // --- Results ---

  app.get("/api/surveys/:id/results", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };

    let data;
    try {
      data = await computeSurveyResults(id);
    } catch {
      return reply.status(404).send({ error: "not_found" });
    }

    const revealed =
      data.survey.status === "closed" || data.survey.status === "archived"
        ? data.responseCount >= data.survey.minResponsesToShow
        : true;

    const dto: SurveyResultsDto = {
      surveyId: data.survey.id,
      title: data.survey.title,
      description: data.survey.description,
      status: data.survey.status as SurveyStatus,
      publishedAt: data.survey.publishedAt?.toISOString() ?? null,
      closedAt: data.survey.closedAt?.toISOString() ?? null,
      eligibleCount: data.eligibleCount,
      responseCount: data.responseCount,
      participationPercent: participationPercent(data.responseCount, data.eligibleCount),
      revealed,
      questionResults: data.questions.map((qq) => {
        const total = qq.total;
        return {
          questionId: qq.id,
          position: qq.position,
          text: qq.text,
          yes: qq.yes,
          no: qq.no,
          total,
          yesPercent: total > 0 ? Math.round((qq.yes / total) * 100) : 0,
          noPercent: total > 0 ? Math.round((qq.no / total) * 100) : 0,
        };
      }),
    };
    return dto;
  });

  // --- Results PDF export ---

  app.get("/api/surveys/:id/results/pdf", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };

    let data;
    try {
      data = await computeSurveyResults(id);
    } catch {
      return reply.status(404).send({ error: "not_found" });
    }

    const dto: SurveyResultsDto = {
      surveyId: data.survey.id,
      title: data.survey.title,
      description: data.survey.description,
      status: data.survey.status as SurveyStatus,
      publishedAt: data.survey.publishedAt?.toISOString() ?? null,
      closedAt: data.survey.closedAt?.toISOString() ?? null,
      eligibleCount: data.eligibleCount,
      responseCount: data.responseCount,
      participationPercent: participationPercent(data.responseCount, data.eligibleCount),
      revealed: true,
      questionResults: data.questions.map((qq) => {
        const total = qq.total;
        return {
          questionId: qq.id,
          position: qq.position,
          text: qq.text,
          yes: qq.yes,
          no: qq.no,
          total,
          yesPercent: total > 0 ? Math.round((qq.yes / total) * 100) : 0,
          noPercent: total > 0 ? Math.round((qq.no / total) * 100) : 0,
        };
      }),
    };

    const pdf = await buildSurveyResultsPdf(dto);
    const slug = dto.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "survey";
    const filename = `survey-results-${slug}.pdf`;
    reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .type("application/pdf");
    return reply.send(pdf);
  });

  // --- Results CSV export (anonymous answers only) ---

  app.get("/api/surveys/:id/results/csv", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };

    const survey = await prisma.survey.findUnique({
      where: { id },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    if (!survey) return reply.status(404).send({ error: "not_found" });

    const responses = await prisma.anonymousSurveyResponse.findMany({
      where: { surveyId: id },
      include: { answers: true },
    });
    const byResponse = new Map<string, Map<string, string>>();
    for (const r of responses) {
      const m = new Map<string, string>();
      for (const a of r.answers) m.set(a.questionId, a.value);
      byResponse.set(r.id, m);
    }

    const questionCols = [...survey.questions].sort((a, b) => a.position - b.position);
    const header = questionCols.map((qq, i) => `Q${i + 1}`).join(",");
    const lines = responses.map((r) => {
      const m = byResponse.get(r.id)!;
      return questionCols.map((qq) => m.get(qq.id) ?? "").join(",");
    });

    const csv = `survey,${csvEscape(survey.title)}\n${header}\n${lines.join("\n")}\n`;
    const slug = survey.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "survey";
    const filename = `survey-results-${slug}.csv`;
    reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .type("text/csv; charset=utf-8");
    return reply.send(csv);
  });
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}
