import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ParsedListQuery } from "../../lib/listQuery.js";
import type { CreateForgeBankInput, UpdateForgeBankInput } from "../schemas/bankSchemas.js";
import { normalizeSharedDeliveryPath } from "../sharedDeliveryPath.js";

function buildBankWhere(pq: ParsedListQuery): Prisma.ForgeBankWhereInput {
  if (!pq.q) return {};
  return {
    OR: [
      { name: { contains: pq.q, mode: "insensitive" } },
      { code: { contains: pq.q, mode: "insensitive" } },
    ],
  };
}

export async function listForgeBanks(pq: ParsedListQuery) {
  const where = buildBankWhere(pq);
  const [rows, total] = await Promise.all([
    prisma.forgeBank.findMany({
      where,
      skip: pq.skip,
      take: pq.limit,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { applications: true } } },
    }),
    prisma.forgeBank.count({ where }),
  ]);
  return { rows, total };
}

export async function createForgeBank(input: CreateForgeBankInput) {
  return prisma.forgeBank.create({
    data: {
      name: input.name,
      code: input.code.toUpperCase(),
      isActive: input.isActive ?? true,
      sharedDeliveryPath:
        input.sharedDeliveryPath === undefined
          ? undefined
          : normalizeSharedDeliveryPath(input.sharedDeliveryPath),
    },
  });
}

export async function updateForgeBank(id: string, input: UpdateForgeBankInput) {
  return prisma.forgeBank.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code.toUpperCase() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sharedDeliveryPath !== undefined
        ? { sharedDeliveryPath: normalizeSharedDeliveryPath(input.sharedDeliveryPath) }
        : {}),
    },
  });
}

export async function getForgeBankById(id: string) {
  return prisma.forgeBank.findUnique({ where: { id } });
}
