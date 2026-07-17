import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ParsedListQuery } from "../../lib/listQuery.js";
import type {
  CreateForgeApplicationInput,
  UpdateForgeApplicationInput,
} from "../schemas/applicationSchemas.js";

function buildApplicationWhere(pq: ParsedListQuery): Prisma.ForgeApplicationWhereInput {
  if (!pq.q) return {};
  return {
    OR: [
      { name: { contains: pq.q, mode: "insensitive" } },
      { description: { contains: pq.q, mode: "insensitive" } },
      { repositoryUrl: { contains: pq.q, mode: "insensitive" } },
      { bank: { name: { contains: pq.q, mode: "insensitive" } } },
    ],
  };
}

export async function listForgeApplications(pq: ParsedListQuery) {
  const where = buildApplicationWhere(pq);
  const [rows, total] = await Promise.all([
    prisma.forgeApplication.findMany({
      where,
      skip: pq.skip,
      take: pq.limit,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        bank: { select: { id: true, name: true, code: true, isActive: true } },
        _count: { select: { buildProfiles: true, buildRequests: true } },
      },
    }),
    prisma.forgeApplication.count({ where }),
  ]);
  return { rows, total };
}

export async function listActiveForgeCatalog() {
  return prisma.forgeApplication.findMany({
    where: { isActive: true, bank: { isActive: true } },
    orderBy: { name: "asc" },
    include: {
      bank: { select: { id: true, name: true, code: true } },
      buildProfiles: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
}

export async function getForgeApplicationById(id: string) {
  return prisma.forgeApplication.findUnique({
    where: { id },
    include: { bank: true },
  });
}

export async function createForgeApplication(input: CreateForgeApplicationInput) {
  return prisma.forgeApplication.create({
    data: {
      bankId: input.bankId,
      name: input.name,
      description: input.description,
      repositoryProvider: input.repositoryProvider,
      repositoryUrl: input.repositoryUrl,
      projectSubpath: input.projectSubpath?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || null,
      defaultBranch: input.defaultBranch ?? "main",
      requiredFlutterVersion: input.requiredFlutterVersion,
      androidEnabled: input.androidEnabled ?? true,
      iosEnabled: input.iosEnabled ?? false,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateForgeApplication(id: string, input: UpdateForgeApplicationInput) {
  return prisma.forgeApplication.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.repositoryProvider !== undefined
        ? { repositoryProvider: input.repositoryProvider }
        : {}),
      ...(input.repositoryUrl !== undefined ? { repositoryUrl: input.repositoryUrl } : {}),
      ...(input.projectSubpath !== undefined
        ? {
            projectSubpath:
              input.projectSubpath?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || null,
          }
        : {}),
      ...(input.defaultBranch !== undefined ? { defaultBranch: input.defaultBranch } : {}),
      ...(input.requiredFlutterVersion !== undefined
        ? { requiredFlutterVersion: input.requiredFlutterVersion }
        : {}),
      ...(input.androidEnabled !== undefined ? { androidEnabled: input.androidEnabled } : {}),
      ...(input.iosEnabled !== undefined ? { iosEnabled: input.iosEnabled } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}
