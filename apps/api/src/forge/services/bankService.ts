import { prisma } from "../../db.js";
import type { CreateForgeBankInput, UpdateForgeBankInput } from "../schemas/bankSchemas.js";

export async function listForgeBanks() {
  return prisma.forgeBank.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { applications: true } } },
  });
}

export async function createForgeBank(input: CreateForgeBankInput) {
  return prisma.forgeBank.create({
    data: {
      name: input.name,
      code: input.code.toUpperCase(),
      isActive: input.isActive ?? true,
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
    },
  });
}

export async function getForgeBankById(id: string) {
  return prisma.forgeBank.findUnique({ where: { id } });
}
