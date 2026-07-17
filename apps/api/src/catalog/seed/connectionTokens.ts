import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../env.js";
import { encryptToken } from "../lib/tokenCrypto.js";

export async function seedConnectionTokensFromEnv(prisma: PrismaClient, env: Env): Promise<void> {
  const secret = env.CATALOG_TOKEN_ENCRYPTION_KEY;
  if (!secret) return;

  const pairs: Array<{ slug: string; token: string }> = [];
  if (env.GITHUB_ACCESS_TOKEN) {
    pairs.push({ slug: env.GITHUB_CONNECTION_NAME, token: env.GITHUB_ACCESS_TOKEN });
  }
  if (env.GITLAB_ACCESS_TOKEN) {
    pairs.push({ slug: env.GITLAB_CONNECTION_NAME, token: env.GITLAB_ACCESS_TOKEN });
  }

  for (const { slug, token } of pairs) {
    const connection = await prisma.repositoryConnection.findUnique({ where: { slug } });
    if (!connection) continue;
    const encrypted = encryptToken(token, secret);
    await prisma.repositoryConnection.update({
      where: { id: connection.id },
      data: { encryptedToken: encrypted },
    });
  }
}
