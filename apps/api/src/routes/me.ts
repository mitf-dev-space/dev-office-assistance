import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { signUserAccessToken } from "../auth.js";
import { requireDbUser } from "../userService.js";

const patchProfileSchema = z
  .object({
    email: z.string().email().toLowerCase().trim().optional(),
    displayName: z.union([z.string().max(200), z.literal("")]).optional(),
    notifyEmailTriage: z.boolean().optional(),
    notifyEmailDigest: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.email !== undefined ||
      d.displayName !== undefined ||
      d.notifyEmailTriage !== undefined ||
      d.notifyEmailDigest !== undefined,
    { message: "no_fields" },
  );

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(500),
  newPassword: z.string().min(8).max(500),
});

export async function registerMeRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/me", async (request, reply) => {
    const auth = request.authUser;
    if (!auth) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) {
      return reply.status(401).send({ error: "user_not_found" });
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      notifyEmailTriage: user.notifyEmailTriage,
      notifyEmailDigest: user.notifyEmailDigest,
    };
  });

  app.patch("/api/me", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = patchProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: parsed.error.flatten() });
    }

    const nextEmail =
      parsed.data.email !== undefined ? parsed.data.email : me.email;
    const nextDisplayName =
      parsed.data.displayName !== undefined
        ? parsed.data.displayName === ""
          ? null
          : parsed.data.displayName
        : me.displayName;

    const nextNotifyTriage =
      parsed.data.notifyEmailTriage !== undefined
        ? parsed.data.notifyEmailTriage
        : me.notifyEmailTriage;
    const nextNotifyDigest =
      parsed.data.notifyEmailDigest !== undefined
        ? parsed.data.notifyEmailDigest
        : me.notifyEmailDigest;

    if (nextEmail !== me.email) {
      const taken = await prisma.user.findFirst({
        where: { email: nextEmail, NOT: { id: me.id } },
      });
      if (taken) {
        return reply.status(409).send({ error: "email_taken" });
      }
    }

    const updated = await prisma.user.update({
      where: { id: me.id },
      data: {
        email: nextEmail,
        displayName: nextDisplayName,
        notifyEmailTriage: nextNotifyTriage,
        notifyEmailDigest: nextNotifyDigest,
      },
    });

    const token = await signUserAccessToken(env, {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
    });

    return {
      token,
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
        notifyEmailTriage: updated.notifyEmailTriage,
        notifyEmailDigest: updated.notifyEmailDigest,
      },
    };
  });

  app.post("/api/me/password", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: parsed.error.flatten() });
    }

    if (me.mustChangePassword) {
      return reply.status(400).send({
        error: "password_change_required",
        message:
          "Complete the forced password change flow before using profile password change.",
      });
    }

    const { currentPassword, newPassword } = parsed.data;
    const ok = await bcrypt.compare(currentPassword, me.passwordHash);
    if (!ok) {
      return reply.status(400).send({ error: "invalid_current_password" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return { ok: true };
  });
}
