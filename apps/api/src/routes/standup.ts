import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { getWeekStartDate } from "../weekRange.js";
import {
  ageDaysFrom,
  buildStandupDraft,
  isCheckInFilled,
  promoteBlockerDefaults,
  suggestionFromPeerBlocker,
  suggestionFromTriage,
  weekBounds,
  type StandupSuggestion,
} from "../standup/helpers.js";

const upsertBody = z.object({
  weekStart: z.string().optional(),
  priorWork: z.string().max(16000).optional(),
  nextWork: z.string().max(16000).optional(),
  blockers: z.string().max(16000).optional(),
});

const promoteBody = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(8000).optional(),
  weekStart: z.string().optional(),
});

function weekLabel(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseWeekStart(raw: string | undefined): Date {
  let weekStart = getWeekStartDate();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      weekStart = getWeekStartDate(d);
    }
  }
  return weekStart;
}

function toCheckInDto(row: {
  id: string;
  userId: string;
  weekStart: Date;
  priorWork: string;
  nextWork: string;
  blockers: string;
  updatedAt: Date;
  user: { email: string; displayName: string | null };
}) {
  return {
    id: row.id,
    userId: row.userId,
    userDisplayName: row.user.displayName,
    userEmail: row.user.email,
    weekStart: row.weekStart.toISOString().slice(0, 10),
    priorWork: row.priorWork,
    nextWork: row.nextWork,
    blockers: row.blockers,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerStandupRoutes(app: FastifyInstance) {
  app.get("/api/standup", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const weekStart = parseWeekStart(q.weekStart);

    const users = await prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: { id: true, email: true, displayName: true },
    });

    const entries = await prisma.standupCheckIn.findMany({
      where: { weekStart },
      include: { user: { select: { email: true, displayName: true } } },
    });

    const byUser = new Map(entries.map((e) => [e.userId, e]));

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekLabel: `Week of ${weekLabel(weekStart)}`,
      entries: users.map((u) => {
        const row = byUser.get(u.id);
        if (row) {
          return toCheckInDto(row);
        }
        return {
          id: `placeholder-${u.id}`,
          userId: u.id,
          userDisplayName: u.displayName,
          userEmail: u.email,
          weekStart: weekStart.toISOString().slice(0, 10),
          priorWork: "",
          nextWork: "",
          blockers: "",
          updatedAt: new Date(0).toISOString(),
        };
      }),
    };
  });

  app.put("/api/standup", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = upsertBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const weekStart = parseWeekStart(b.weekStart);

    const row = await prisma.standupCheckIn.upsert({
      where: {
        userId_weekStart: { userId: me.id, weekStart },
      },
      create: {
        id: randomUUID(),
        userId: me.id,
        weekStart,
        priorWork: b.priorWork ?? "",
        nextWork: b.nextWork ?? "",
        blockers: b.blockers ?? "",
      },
      update: {
        ...(b.priorWork !== undefined ? { priorWork: b.priorWork } : {}),
        ...(b.nextWork !== undefined ? { nextWork: b.nextWork } : {}),
        ...(b.blockers !== undefined ? { blockers: b.blockers } : {}),
      },
      include: { user: { select: { email: true, displayName: true } } },
    });

    return toCheckInDto(row);
  });

  app.get("/api/standup/helpers", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const weekStart = parseWeekStart(q.weekStart);
    const { start, end } = weekBounds(weekStart);

    const [doneThisWeek, openNext, priorityQueue, peerCheckIns] = await Promise.all([
      prisma.triageItem.findMany({
        where: {
          status: "done",
          updatedAt: { gte: start, lt: end },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true },
      }),
      prisma.triageItem.findMany({
        where: {
          status: { in: ["inbox", "in_progress", "snoozed"] },
        },
        orderBy: [
          { nextAction: "desc" },
          { dueAt: "asc" },
          { updatedAt: "desc" },
        ],
        take: 30,
        select: {
          id: true,
          title: true,
          nextAction: true,
          category: true,
          escalated: true,
          status: true,
        },
      }),
      prisma.triageItem.findMany({
        where: {
          status: { notIn: ["done", "dropped"] },
          OR: [{ category: { in: ["blocker", "risk"] } }, { escalated: true }],
        },
        orderBy: [{ escalated: "desc" }, { createdAt: "asc" }],
        take: 20,
        select: { id: true, title: true },
      }),
      prisma.standupCheckIn.findMany({
        where: {
          weekStart,
          userId: { not: me.id },
          NOT: { blockers: "" },
        },
        include: { user: { select: { email: true, displayName: true } } },
      }),
    ]);

    const priorWork: StandupSuggestion[] = doneThisWeek.map((it) =>
      suggestionFromTriage(it, "triage_done"),
    );

    // Prefer items with nextAction, then open work; de-dupe by id.
    const withNext = openNext.filter((it) => it.nextAction?.trim());
    const withoutNext = openNext.filter((it) => !it.nextAction?.trim());
    const nextOrdered = [...withNext, ...withoutNext];
    const seenNext = new Set<string>();
    const nextWork: StandupSuggestion[] = [];
    for (const it of nextOrdered) {
      if (seenNext.has(it.id)) continue;
      seenNext.add(it.id);
      nextWork.push(suggestionFromTriage(it, "triage_open"));
    }

    const blockers: StandupSuggestion[] = [
      ...priorityQueue.map((it) => suggestionFromTriage(it, "priority_queue")),
      ...peerCheckIns.flatMap((row) =>
        suggestionFromPeerBlocker(
          row.userId,
          row.user.displayName,
          row.user.email,
          row.blockers,
        ),
      ),
    ];

    const draft = buildStandupDraft({ priorWork, nextWork, blockers });

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      suggestions: { priorWork, nextWork, blockers },
      draft,
    };
  });

  app.get("/api/standup/rollup", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const weekStart = parseWeekStart(q.weekStart);
    const { start, end } = weekBounds(weekStart);
    const now = new Date();

    const priorityWhere: Prisma.TriageItemWhereInput = {
      status: { notIn: ["done", "dropped"] },
      OR: [{ category: { in: ["blocker", "risk"] } }, { escalated: true }],
    };

    const [users, checkIns, priorityItems, closedThisWeek, missingNextActionCount] =
      await Promise.all([
        prisma.user.findMany({
          orderBy: [{ displayName: "asc" }, { email: "asc" }],
          select: { id: true, email: true, displayName: true },
        }),
        prisma.standupCheckIn.findMany({ where: { weekStart } }),
        prisma.triageItem.findMany({
          where: priorityWhere,
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.triageItem.count({
          where: {
            status: "done",
            updatedAt: { gte: start, lt: end },
          },
        }),
        prisma.triageItem.count({
          where: {
            status: { notIn: ["done", "dropped"] },
            AND: [
              {
                OR: [{ category: { in: ["blocker", "risk"] } }, { escalated: true }],
              },
              {
                OR: [{ nextAction: null }, { nextAction: "" }],
              },
            ],
          },
        }),
      ]);

    const byUser = new Map(checkIns.map((c) => [c.userId, c]));
    const checkInStatus = users.map((u) => {
      const row = byUser.get(u.id);
      const filled = row
        ? isCheckInFilled({
            priorWork: row.priorWork,
            nextWork: row.nextWork,
            blockers: row.blockers,
          })
        : false;
      return {
        userId: u.id,
        displayName: u.displayName,
        email: u.email,
        filled,
      };
    });

    const filledCount = checkInStatus.filter((c) => c.filled).length;
    const oldest = priorityItems[0]?.createdAt;
    const oldestAgeDays = oldest ? ageDaysFrom(oldest, now) : null;

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekLabel: `Week of ${weekLabel(weekStart)}`,
      checkIns: {
        totalUsers: users.length,
        filledCount,
        emptyCount: users.length - filledCount,
        byUser: checkInStatus,
      },
      priorityQueue: {
        count: priorityItems.length,
        oldestAgeDays,
        missingNextActionCount,
      },
      triageClosedThisWeek: closedThisWeek,
    };
  });

  app.post("/api/standup/promote-blocker", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = promoteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const title = b.title.trim();
    if (!title) {
      return reply.status(400).send({ error: "validation", message: "title_required" });
    }

    const assignee = await prisma.developer.findFirst({
      orderBy: { displayName: "asc" },
    });
    if (!assignee) {
      return reply.status(400).send({ error: "no_developers" });
    }

    const weekStart = parseWeekStart(b.weekStart);
    const defaults = promoteBlockerDefaults({
      title,
      notes: b.notes,
      weekLabel: weekLabel(weekStart),
    });

    const item = await prisma.triageItem.create({
      data: {
        id: randomUUID(),
        title: defaults.title,
        description: defaults.description,
        category: defaults.category,
        status: defaults.status,
        escalated: defaults.escalated,
        sourceType: defaults.sourceType,
        assigneeDeveloperId: assignee.id,
        createdById: me.id,
      },
    });

    return reply.status(201).send({
      triageItemId: item.id,
      title: item.title,
      category: item.category,
      escalated: item.escalated,
      status: item.status,
    });
  });
}
