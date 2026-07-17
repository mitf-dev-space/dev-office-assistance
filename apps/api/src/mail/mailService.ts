import nodemailer from "nodemailer";
import type { Env } from "../env.js";

export function isSmtpConfigured(env: Env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function createTransport(env: Env) {
  if (!isSmtpConfigured(env)) {
    throw new Error("smtp_not_configured");
  }
  // Port 587 uses STARTTLS (secure=false). Port 465 uses implicit TLS (secure=true).
  const secure = env.SMTP_PORT === 465 ? true : env.SMTP_PORT === 587 ? false : env.SMTP_SECURE;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    requireTLS: env.SMTP_PORT === 587,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
}

export async function sendMail(
  env: Env,
  options: { to: string; subject: string; text: string; html?: string },
): Promise<void> {
  const transport = createTransport(env);
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, "<br>"),
  });
}
