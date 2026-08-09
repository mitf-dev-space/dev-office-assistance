import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { checkInvitation, submitAnonymousResponse } from "../surveys/service.js";
import { hashInvitationToken } from "../surveys/tokens.js";

const submitBody = z.object({
  answers: z.record(z.string(), z.enum(["yes", "no"])),
});

/**
 * Public survey endpoints. Only the invitation-based response endpoint is
 * publicly accessible; everything else is behind auth. Voting requires a valid,
 * unused, unexpired invitation token for a published survey.
 */
export async function registerPublicSurveyRoutes(app: FastifyInstance) {
  // Resolve a token to its survey id (used by the voting page). Returns validity
  // without leaking any employee or invitation data.
  app.get("/api/public/surveys/resolve/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const inv = await prisma.surveyInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      select: { surveyId: true, used: true, expiresAt: true, survey: { select: { status: true, closesAt: true } } },
    });
    if (!inv) return { valid: false, code: "invalid" };
    if (inv.used) return { valid: false, code: "used" };
    if (inv.expiresAt && inv.expiresAt < new Date()) return { valid: false, code: "expired" };
    if (inv.survey.status !== "published") return { valid: false, code: "not_open" };
    if (inv.survey.closesAt && inv.survey.closesAt < new Date()) {
      return { valid: false, code: "not_open" };
    }
    return { valid: true, surveyId: inv.surveyId };
  });

  // Public survey info (no results, no employee data). Voting still requires a token.
  app.get("/api/public/surveys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    if (!survey) return reply.status(404).send({ error: "not_found" });
    return {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      closesAt: survey.closesAt?.toISOString() ?? null,
      status: survey.status,
      questions: survey.questions.map((q) => ({ id: q.id, position: q.position, text: q.text })),
    };
  });

  // Validate an invitation token (used by the voting page to decide what to show).
  app.get("/api/public/surveys/:id/invitation/:token", async (request, reply) => {
    const { id, token } = request.params as { id: string; token: string };
    const status = await checkInvitation(id, token);
    if (!status.ok) {
      return reply.status(200).send({ valid: false, code: status.code });
    }
    return reply.status(200).send({ valid: true });
  });

  // Submit an anonymous response using a single-use invitation token.
  app.post("/api/public/surveys/:id/respond/:token", async (request, reply) => {
    const { id, token } = request.params as { id: string; token: string };
    const parsed = submitBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const result = await submitAnonymousResponse({
      surveyId: id,
      rawToken: token,
      answers: parsed.data.answers,
    });
    if (!result.ok) {
      const code = result.code;
      const status = code === "answers" ? 400 : 409;
      return reply.status(status).send({ error: code });
    }
    return reply.status(201).send({ ok: true });
  });
}
