import { z } from "zod";

export const createForgeBuildRequestSchema = z.object({
  applicationId: z.string().uuid(),
  buildProfileId: z.string().uuid(),
  gitReferenceType: z.enum(["branch", "tag", "commit"]).default("branch"),
  gitReference: z.string().trim().min(1).max(500),
  requestNote: z.string().trim().max(2000).optional(),
  platforms: z.array(z.enum(["Android", "iOS"])).min(1),
});

export type CreateForgeBuildRequestInput = z.infer<typeof createForgeBuildRequestSchema>;
