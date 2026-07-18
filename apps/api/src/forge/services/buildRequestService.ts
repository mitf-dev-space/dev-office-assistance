import type { ForgeBuildStatus, ForgePlatform, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ParsedListQuery } from "../../lib/listQuery.js";
import type { CreateForgeBuildRequestInput } from "../schemas/buildRequestSchemas.js";
import { resolveApplicationSharedPath } from "../sharedDeliveryPath.js";
import { refreshBuildRequestOverallStatus } from "./platformBuildService.js";

export type ForgeBuildListFilters = {
  status?: string;
};

function buildBuildRequestWhere(
  pq: ParsedListQuery,
  filters: ForgeBuildListFilters,
): Prisma.ForgeBuildRequestWhereInput {
  const and: Prisma.ForgeBuildRequestWhereInput[] = [];
  if (filters.status?.trim()) {
    and.push({ overallStatus: filters.status.trim() as ForgeBuildStatus });
  }
  if (pq.q) {
    and.push({
      OR: [
        { gitReference: { contains: pq.q, mode: "insensitive" } },
        { application: { name: { contains: pq.q, mode: "insensitive" } } },
        { application: { bank: { name: { contains: pq.q, mode: "insensitive" } } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listForgeBuildRequests(
  pq: ParsedListQuery,
  filters: ForgeBuildListFilters = {},
) {
  const where = buildBuildRequestWhere(pq, filters);
  const [rows, total] = await Promise.all([
    prisma.forgeBuildRequest.findMany({
      where,
      skip: pq.skip,
      take: pq.limit,
      orderBy: { createdAt: "desc" },
      include: {
        application: { include: { bank: true } },
        requestedBy: { select: { id: true, email: true, displayName: true } },
      },
    }),
    prisma.forgeBuildRequest.count({ where }),
  ]);
  return { rows, total };
}

export async function getForgeBuildRequestDetail(id: string) {
  return prisma.forgeBuildRequest.findUnique({
    where: { id },
    include: {
      application: { include: { bank: true } },
      buildProfile: true,
      requestedBy: { select: { id: true, email: true, displayName: true } },
      platformBuilds: {
        include: {
          runner: { select: { id: true, name: true, operatingSystem: true } },
          artifacts: true,
        },
        orderBy: { platform: "asc" },
      },
    },
  });
}

export async function createForgeBuildRequest(
  requestedById: string,
  input: CreateForgeBuildRequestInput,
) {
  const application = await prisma.forgeApplication.findFirst({
    where: { id: input.applicationId, isActive: true, bank: { isActive: true } },
    include: { bank: true },
  });
  if (!application) {
    throw new Error("application_not_found");
  }

  const profile = await prisma.forgeBuildProfile.findFirst({
    where: { id: input.buildProfileId, applicationId: input.applicationId, isActive: true },
  });
  if (!profile) {
    throw new Error("profile_not_found");
  }

  const publishToSharedFolder = Boolean(input.publishToSharedFolder);
  const notifyEmail = input.notifyEmail?.trim() || null;
  if (publishToSharedFolder) {
    if (!notifyEmail) throw new Error("notify_email_required");
    let sharedRoot: string | null = null;
    try {
      sharedRoot = resolveApplicationSharedPath({
        applicationPath: application.sharedDeliveryPath,
        bankPath: application.bank.sharedDeliveryPath,
      });
    } catch {
      throw new Error("invalid_shared_delivery_path");
    }
    if (!sharedRoot) throw new Error("shared_delivery_path_required");
  }

  const platforms: ForgePlatform[] = [];
  for (const p of input.platforms) {
    if (p === "Android" && !application.androidEnabled) {
      throw new Error("android_not_enabled");
    }
    if (p === "iOS" && !application.iosEnabled) {
      throw new Error("ios_not_enabled");
    }
    platforms.push(p);
  }

  const request = await prisma.forgeBuildRequest.create({
    data: {
      applicationId: input.applicationId,
      buildProfileId: input.buildProfileId,
      requestedById,
      gitReferenceType: input.gitReferenceType,
      gitReference: input.gitReference,
      requestNote: input.requestNote,
      publishToSharedFolder,
      notifyEmail: publishToSharedFolder ? notifyEmail : null,
      sharedDeliveryStatus: publishToSharedFolder ? "pending" : null,
      overallStatus: "Queued",
      platformBuilds: {
        create: platforms.map((platform) => ({
          platform,
          status: "Queued",
        })),
      },
    },
    include: {
      application: { include: { bank: true } },
      platformBuilds: true,
    },
  });

  await refreshBuildRequestOverallStatus(request.id);
  return getForgeBuildRequestDetail(request.id);
}
