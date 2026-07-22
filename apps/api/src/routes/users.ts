import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { requireDbUser } from "../userService.js";
import { generateTemporaryPassword } from "../auth/passwordUtil.js";
import { isSmtpConfigured, sendMail } from "../mail/mailService.js";
import { renderHelmEmail } from "../mail/helmEmailLayout.js";

function shouldExposeTemporaryPassword(env: Env): boolean {
  return env.NODE_ENV !== "production" || env.SMTP_DEV_LOG;
}

export async function registerUsersRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/users", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const users = await prisma.user.findMany({
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
      },
    });
    return { users };
  });

  app.post("/api/users/:userId/reset-password", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;

    if (me.role !== "lead") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { userId } = request.params as { userId: string };
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash, mustChangePassword: true },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
      },
    });

    let emailSent = false;
    if (isSmtpConfigured(env)) {
      const appUrl = env.APP_PUBLIC_URL?.trim() || "http://localhost:5174";
      const rendered = renderHelmEmail({
        preheader: "Your Helm password was reset",
        eyebrow: "Security",
        title: "Temporary password",
        intro:
          "A lead reset your Helm sign-in password. Use the temporary password below to sign in, then choose a new password.",
        tone: "neutral",
        rows: [
          { label: "Email", value: updated.email },
          { label: "Temporary password", value: temporaryPassword },
        ],
        cta: { label: "Sign in to Helm", href: appUrl },
        footerNote:
          "You will be asked to set a new password before using the rest of the app.",
      });
      try {
        await sendMail(env, {
          to: updated.email,
          subject: "Helm — temporary password",
          text: rendered.text,
          html: rendered.html,
        });
        emailSent = true;
      } catch (err) {
        request.log.warn({ err, userId: updated.id }, "password_reset_email_failed");
      }
    }

    if (env.SMTP_DEV_LOG || env.NODE_ENV !== "production") {
      request.log.info(
        `[SMTP_DEV_LOG] admin_password_reset email to ${updated.email} — temporary password: ${temporaryPassword}`,
      );
    }

    return {
      ...updated,
      emailSent,
      ...(shouldExposeTemporaryPassword(env)
        ? { temporaryPassword }
        : {}),
    };
  });
}
