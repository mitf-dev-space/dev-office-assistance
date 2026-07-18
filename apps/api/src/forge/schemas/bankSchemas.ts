import { z } from "zod";

const sharedDeliveryPathField = z
  .union([z.string().trim().max(1000), z.null()])
  .optional();

export const createForgeBankSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "code must be alphanumeric, dash, or underscore"),
  isActive: z.boolean().optional().default(true),
  sharedDeliveryPath: sharedDeliveryPathField,
});

export const updateForgeBankSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  isActive: z.boolean().optional(),
  sharedDeliveryPath: sharedDeliveryPathField,
});

export type CreateForgeBankInput = z.infer<typeof createForgeBankSchema>;
export type UpdateForgeBankInput = z.infer<typeof updateForgeBankSchema>;
