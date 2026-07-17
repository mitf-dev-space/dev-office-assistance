import { z } from "zod";

export const createForgeRunnerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  operatingSystem: z.enum(["Windows", "macOS", "Linux"]),
  architecture: z.string().trim().min(1).max(50).default("x64"),
  supportedPlatforms: z.array(z.enum(["Android", "iOS"])).min(1),
  maximumConcurrentJobs: z.number().int().min(1).max(8).default(1),
});

export type CreateForgeRunnerInput = z.infer<typeof createForgeRunnerSchema>;

export const workerProgressSchema = z.object({
  status: z.enum([
    "PreparingWorkspace",
    "CloningRepository",
    "Building",
    "Signing",
    "CollectingArtifact",
    "UploadingArtifact",
  ]),
  message: z.string().max(2000).optional(),
});

export const workerFailSchema = z.object({
  failureCategory: z.string().trim().min(1).max(100),
  failureSummary: z.string().trim().min(1).max(4000),
});
