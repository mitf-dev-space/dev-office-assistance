import { z } from "zod";

export const createForgeBuildProfileSchema = z.object({
  applicationId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  flutterFlavor: z.string().trim().max(100).optional(),
  dartEntryPoint: z.string().trim().min(1).max(500).default("lib/main.dart"),
  environmentName: z.string().trim().max(100).optional(),
  androidArtifactType: z.enum(["apk", "aab"]).default("apk"),
  androidBuildMode: z.enum(["debug", "release", "profile"]).default("debug"),
  iosExportMethod: z.string().trim().max(100).optional(),
  timeoutMinutes: z.number().int().min(5).max(240).default(60),
  isActive: z.boolean().optional().default(true),
});

export const updateForgeBuildProfileSchema = createForgeBuildProfileSchema
  .partial()
  .omit({ applicationId: true });

export type CreateForgeBuildProfileInput = z.infer<typeof createForgeBuildProfileSchema>;
export type UpdateForgeBuildProfileInput = z.infer<typeof updateForgeBuildProfileSchema>;
