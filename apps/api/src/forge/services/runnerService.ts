import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ForgePlatform, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ParsedListQuery } from "../../lib/listQuery.js";
import type { CreateForgeRunnerInput } from "../schemas/runnerSchemas.js";

export function generateRunnerToken(): string {
  return randomBytes(32).toString("hex");
}

function buildRunnerWhere(pq: ParsedListQuery): Prisma.ForgeRunnerWhereInput {
  if (!pq.q) return {};
  return {
    name: { contains: pq.q, mode: "insensitive" },
  };
}

export async function listForgeRunners(pq: ParsedListQuery) {
  const where = buildRunnerWhere(pq);
  const [rows, total] = await Promise.all([
    prisma.forgeRunner.findMany({
      where,
      skip: pq.skip,
      take: pq.limit,
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.forgeRunner.count({ where }),
  ]);
  return { rows, total };
}

export async function createForgeRunner(input: CreateForgeRunnerInput) {
  const token = generateRunnerToken();
  const tokenHash = await bcrypt.hash(token, 10);
  const tokenHint = token.slice(0, 12);

  const runner = await prisma.forgeRunner.create({
    data: {
      name: input.name,
      operatingSystem: input.operatingSystem,
      architecture: input.architecture ?? "x64",
      supportedPlatforms: input.supportedPlatforms as ForgePlatform[],
      capabilities: {
        flutter: true,
        androidSdk: input.supportedPlatforms.includes("Android"),
        xcode: input.supportedPlatforms.includes("iOS"),
      },
      status: "Offline",
      tokenHash,
      tokenHint,
      maximumConcurrentJobs: input.maximumConcurrentJobs ?? 1,
    },
  });

  return { runner, token };
}

export async function touchRunnerHeartbeat(runnerId: string) {
  return prisma.forgeRunner.update({
    where: { id: runnerId },
    data: {
      status: "Online",
      lastHeartbeatAtUtc: new Date(),
    },
  });
}
