import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { signUserAccessToken } from "../auth.js";
import { validateNewPassword } from "../auth/passwordUtil.js";
import { requireDbUser } from "../userService.js";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1).max(500),
});

const completePasswordSchema = z.object({
  newPassword: z.string().min(1).max(500),
});

export function registerAuthLoginRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const requiresPasswordChange = user.mustChangePassword;
    const token = await signUserAccessToken(
      env,
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      { passwordChange: requiresPasswordChange },
    );

    return {
      token,
      requiresPasswordChange,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  });
}

/** Authenticated routes for forced password change (pwdChange JWT allowed). */
export async function registerAuthPasswordChangeRoutes(
  app: FastifyInstance,
  _env: Env,
) {
  app.post("/api/auth/complete-password-change", async (request, reply) => {
    const auth = request.authUser;
    if (!auth?.requiresPasswordChange) {
      return reply.status(403).send({ error: "password_change_session_required" });
    }

    const me = await requireDbUser(auth, reply);
    if (!me) return;

    if (!me.mustChangePassword) {
      return reply.status(400).send({
        error: "password_change_not_required",
        message: "Password change is not required for this account.",
      });
    }

    const parsed = completePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "validation", details: parsed.error.flatten() });
    }

    const validationError = validateNewPassword(parsed.data.newPassword);
    if (validationError) {
      return reply.status(400).send({
        error: "invalid_password",
        message: validationError,
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return { ok: true };
  });
}
