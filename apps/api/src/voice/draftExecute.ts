import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function executeVoiceDraft(
  kind: string,
  payload: Record<string, unknown>,
  actorUserId: string,
): Promise<Record<string, unknown>> {
  switch (kind) {
    case "triage_set_next_action": {
      const triageItemId = String(payload.triageItemId ?? "");
      const nextAction = String(payload.nextAction ?? "").trim();
      if (!triageItemId || !nextAction) throw new Error("invalid_payload");
      const updated = await prisma.triageItem.update({
        where: { id: triageItemId },
        data: { nextAction },
        select: { id: true, nextAction: true },
      });
      return { triageItemId: updated.id, nextAction: updated.nextAction };
    }
    case "triage_create": {
      const title = String(payload.title ?? "").trim();
      if (!title) throw new Error("invalid_payload");
      let assigneeDeveloperId =
        typeof payload.assigneeDeveloperId === "string" ? payload.assigneeDeveloperId : "";
      if (!assigneeDeveloperId) {
        const first = await prisma.developer.findFirst({
          orderBy: { displayName: "asc" },
          select: { id: true },
        });
        if (!first) throw new Error("no_assignee");
        assigneeDeveloperId = first.id;
      }
      const allowed = new Set(["blocker", "risk", "quality", "process", "other"]);
      const categoryRaw =
        typeof payload.category === "string" && allowed.has(payload.category)
          ? payload.category
          : "other";
      const created = await prisma.triageItem.create({
        data: {
          title,
          description: typeof payload.description === "string" ? payload.description : null,
          category: categoryRaw as "blocker" | "risk" | "quality" | "process" | "other",
          status: "inbox",
          createdById: actorUserId,
          assigneeDeveloperId,
        },
        select: { id: true, title: true },
      });
      return { triageItemId: created.id, title: created.title, href: `/triage/${created.id}` };
    }
    case "planning_create": {
      const title = String(payload.title ?? "").trim();
      if (!title) throw new Error("invalid_payload");
      const created = await prisma.planningItem.create({
        data: {
          title,
          description: typeof payload.description === "string" ? payload.description : null,
          department: typeof payload.department === "string" ? payload.department : null,
          program: typeof payload.program === "string" ? payload.program : null,
          status: "draft",
          createdById: actorUserId,
        },
        select: { id: true, title: true },
      });
      return { planningItemId: created.id, title: created.title, href: `/planning/${created.id}` };
    }
    case "decision_create": {
      const title = String(payload.title ?? "").trim();
      const body = String(payload.body ?? "").trim();
      if (!title || !body) throw new Error("invalid_payload");
      const decidedOn =
        typeof payload.decidedOn === "string" && payload.decidedOn
          ? new Date(payload.decidedOn)
          : new Date();
      const created = await prisma.teamDecision.create({
        data: {
          title,
          body,
          decidedOn,
          createdById: actorUserId,
        },
        select: { id: true, title: true },
      });
      return { decisionId: created.id, title: created.title, href: "/decisions" };
    }
    case "standup_upsert": {
      const weekStartRaw = String(payload.weekStart ?? "").trim();
      const weekStart = weekStartRaw ? new Date(weekStartRaw) : startOfWeek(new Date());
      const priorWork = String(payload.priorWork ?? "").slice(0, 4000);
      const nextWork = String(payload.nextWork ?? "").slice(0, 4000);
      const blockers = String(payload.blockers ?? "").slice(0, 4000);
      const row = await prisma.standupCheckIn.upsert({
        where: { userId_weekStart: { userId: actorUserId, weekStart } },
        create: {
          userId: actorUserId,
          weekStart,
          priorWork,
          nextWork,
          blockers,
        },
        update: { priorWork, nextWork, blockers },
        select: { id: true, weekStart: true },
      });
      return {
        standupId: row.id,
        weekStart: row.weekStart.toISOString().slice(0, 10),
      };
    }
    default:
      throw new Error("unsupported_kind");
  }
}

function startOfWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

export function payloadAsRecord(payload: Prisma.JsonValue): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}
