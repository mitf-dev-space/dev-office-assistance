import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ParsedListQuery } from "../../lib/listQuery.js";
import type {
  CreateForgeBuildProfileInput,
  UpdateForgeBuildProfileInput,
} from "../schemas/buildProfileSchemas.js";

function buildProfileWhere(
  pq: ParsedListQuery,
  applicationId?: string,
): Prisma.ForgeBuildProfileWhereInput {
  const and: Prisma.ForgeBuildProfileWhereInput[] = [];
  if (applicationId) and.push({ applicationId });
  if (pq.q) {
    and.push({
      OR: [
        { name: { contains: pq.q, mode: "insensitive" } },
        { description: { contains: pq.q, mode: "insensitive" } },
        { flutterFlavor: { contains: pq.q, mode: "insensitive" } },
        { application: { name: { contains: pq.q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listForgeBuildProfiles(pq: ParsedListQuery, applicationId?: string) {
  const where = buildProfileWhere(pq, applicationId);
  const [rows, total] = await Promise.all([
    prisma.forgeBuildProfile.findMany({
      where,
      skip: pq.skip,
      take: pq.limit,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        application: {
          select: { id: true, name: true, bankId: true },
        },
      },
    }),
    prisma.forgeBuildProfile.count({ where }),
  ]);
  return { rows, total };
}

export async function getForgeBuildProfileById(id: string) {
  return prisma.forgeBuildProfile.findUnique({
    where: { id },
    include: { application: { include: { bank: true } } },
  });
}

export async function createForgeBuildProfile(input: CreateForgeBuildProfileInput) {
  return prisma.forgeBuildProfile.create({
    data: {
      applicationId: input.applicationId,
      name: input.name,
      description: input.description,
      flutterFlavor: input.flutterFlavor,
      dartEntryPoint: input.dartEntryPoint ?? "lib/main.dart",
      environmentName: input.environmentName,
      androidArtifactType: input.androidArtifactType ?? "apk",
      androidBuildMode: input.androidBuildMode ?? "debug",
      iosExportMethod: input.iosExportMethod,
      timeoutMinutes: input.timeoutMinutes ?? 60,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateForgeBuildProfile(id: string, input: UpdateForgeBuildProfileInput) {
  return prisma.forgeBuildProfile.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.flutterFlavor !== undefined ? { flutterFlavor: input.flutterFlavor } : {}),
      ...(input.dartEntryPoint !== undefined ? { dartEntryPoint: input.dartEntryPoint } : {}),
      ...(input.environmentName !== undefined ? { environmentName: input.environmentName } : {}),
      ...(input.androidArtifactType !== undefined
        ? { androidArtifactType: input.androidArtifactType }
        : {}),
      ...(input.androidBuildMode !== undefined ? { androidBuildMode: input.androidBuildMode } : {}),
      ...(input.iosExportMethod !== undefined ? { iosExportMethod: input.iosExportMethod } : {}),
      ...(input.timeoutMinutes !== undefined ? { timeoutMinutes: input.timeoutMinutes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}
