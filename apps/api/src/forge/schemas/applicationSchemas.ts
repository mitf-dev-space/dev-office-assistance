import { z } from "zod";

export const createForgeApplicationSchema = z.object({
  bankId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  repositoryProvider: z.enum(["github", "gitlab", "other"]),
  repositoryUrl: z.string().url(),
  projectSubpath: z.string().trim().max(500).optional(),
  defaultBranch: z.string().trim().min(1).max(200).default("main"),
  requiredFlutterVersion: z.string().trim().max(50).optional(),
  androidEnabled: z.boolean().optional().default(true),
  iosEnabled: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sharedDeliveryPath: z.union([z.string().trim().max(1000), z.null()]).optional(),
});

export const updateForgeApplicationSchema = createForgeApplicationSchema
  .partial()
  .omit({ bankId: true });

export type CreateForgeApplicationInput = z.infer<typeof createForgeApplicationSchema>;
export type UpdateForgeApplicationInput = z.infer<typeof updateForgeApplicationSchema>;
