import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { parseListQuery, withPageMeta } from "../lib/listQuery.js";
import type { Env } from "../env.js";
import { deleteStoredFile, pathForKey, storeMultipartFile } from "../upload/storage.js";

function uploadRoot(env: Env): string {
  return resolve(process.cwd(), env.UPLOAD_DIR);
}

const createBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(8000).nullable().optional(),
  amount: z.coerce.number().positive().max(1_000_000_000),
  currency: z.string().min(1).max(8).default("USD"),
  department: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  expenseDate: z.string(),
});

const patchBody = createBody.partial();

function expenseToDto(
  e: {
    id: string;
    title: string;
    description: string | null;
    amount: Prisma.Decimal;
    currency: string;
    department: string;
    category: string;
    expenseDate: Date;
    receiptKey: string | null;
    receiptName: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    amount: e.amount.toString(),
    currency: e.currency,
    department: e.department,
    category: e.category,
    expenseDate: e.expenseDate.toISOString(),
    hasReceipt: Boolean(e.receiptKey),
    receiptName: e.receiptName,
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export async function registerExpensesRoutes(app: FastifyInstance, env: Env) {
  const root = uploadRoot(env);

  app.get("/api/expenses/summary", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if (from && Number.isNaN(from.getTime())) {
      return reply.status(400).send({ error: "invalid_from" });
    }
    if (to && Number.isNaN(to.getTime())) {
      return reply.status(400).send({ error: "invalid_to" });
    }
    const where: Prisma.ExpenseWhereInput = {};
    if (from && to) {
      where.expenseDate = { gte: from, lte: to };
    } else if (from) {
      where.expenseDate = { gte: from };
    } else if (to) {
      where.expenseDate = { lte: to };
    }

    const byDept = await prisma.expense.groupBy({
      by: ["department"],
      where,
      _sum: { amount: true },
    });

    return {
      byDepartment: byDept.map((r) => ({
        department: r.department,
        total: r._sum.amount?.toString() ?? "0",
      })),
    };
  });

  app.get("/api/expenses", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const q = request.query as Record<string, string | undefined>;
    const pq = parseListQuery(q);
    const and: Prisma.ExpenseWhereInput[] = [];
    if (q.department) and.push({ department: q.department });
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ error: "invalid_from" });
      }
      and.push({ expenseDate: { gte: d } });
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ error: "invalid_to" });
      }
      and.push({ expenseDate: { lte: d } });
    }
    if (pq.q) {
      and.push({
        OR: [
          { title: { contains: pq.q, mode: "insensitive" } },
          { description: { contains: pq.q, mode: "insensitive" } },
          { department: { contains: pq.q, mode: "insensitive" } },
          { category: { contains: pq.q, mode: "insensitive" } },
        ],
      });
    }
    const where: Prisma.ExpenseWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip: pq.skip,
        take: pq.limit,
        orderBy: [{ expenseDate: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.expense.count({ where }),
    ]);
    return withPageMeta(
      { expenses: rows.map((e) => expenseToDto(e)) },
      pq.page,
      pq.limit,
      total,
    );
  });

  app.get("/api/expenses/:id/receipt", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const e = await prisma.expense.findUnique({ where: { id } });
    if (!e || !e.receiptKey) {
      return reply.status(404).send({ error: "not_found" });
    }
    const name = e.receiptName ?? "receipt";
    const abs = pathForKey(root, e.receiptKey);
    const mime = "application/octet-stream";
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    return reply.type(mime).send(createReadStream(abs));
  });

  app.get("/api/expenses/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const e = await prisma.expense.findUnique({ where: { id } });
    if (!e) return reply.status(404).send({ error: "not_found" });
    return expenseToDto(e);
  });

  app.post("/api/expenses", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const expenseDate = new Date(b.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) {
      return reply.status(400).send({ error: "invalid_expenseDate" });
    }
    const e = await prisma.expense.create({
      data: {
        title: b.title,
        description: b.description ?? null,
        amount: b.amount,
        currency: b.currency,
        department: b.department,
        category: b.category,
        expenseDate,
        createdById: me.id,
      },
    });
    return reply.status(201).send(expenseToDto(e));
  });

  app.patch("/api/expenses/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let expenseDate: Date | undefined;
    if (b.expenseDate !== undefined) {
      expenseDate = new Date(b.expenseDate);
      if (Number.isNaN(expenseDate.getTime())) {
        return reply.status(400).send({ error: "invalid_expenseDate" });
      }
    }
    const e = await prisma.expense.update({
      where: { id },
      data: {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.amount !== undefined ? { amount: b.amount } : {}),
        ...(b.currency !== undefined ? { currency: b.currency } : {}),
        ...(b.department !== undefined ? { department: b.department } : {}),
        ...(b.category !== undefined ? { category: b.category } : {}),
        ...(expenseDate !== undefined ? { expenseDate } : {}),
      },
    });
    return expenseToDto(e);
  });

  app.delete("/api/expenses/:id", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    if (existing.receiptKey) {
      await deleteStoredFile(root, existing.receiptKey);
    }
    await prisma.expense.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.post("/api/expenses/:id/receipt", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { id } = request.params as { id: string };
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "missing_file" });
    }
    let stored;
    try {
      stored = await storeMultipartFile(root, data, env.MAX_UPLOAD_BYTES);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "file_too_large") {
        return reply.status(413).send({ error: "file_too_large" });
      }
      if (msg === "unsupported_mime") {
        return reply.status(400).send({ error: "unsupported_mime" });
      }
      throw e;
    }
    if (existing.receiptKey) {
      await deleteStoredFile(root, existing.receiptKey);
    }
    const e = await prisma.expense.update({
      where: { id },
      data: { receiptKey: stored.storageKey, receiptName: stored.originalName },
    });
    return reply.status(201).send({
      hasReceipt: true,
      receiptName: e.receiptName,
      id: e.id,
    });
  });
}
