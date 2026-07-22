import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "./env.js";

const JWT_ALG = "HS256";

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  accessToken: string;
  /** Restricted JWT issued when the user must change password before full access. */
  requiresPasswordChange: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

function getJwtSecretKey(env: Env) {
  return new TextEncoder().encode(env.AUTH_JWT_SECRET);
}

export type SignTokenOptions = {
  expires?: string;
  /** When true, issues a short-lived password-change JWT (pwdChange claim). */
  passwordChange?: boolean;
};

export async function signUserAccessToken(
  env: Env,
  user: { id: string; email: string; displayName: string | null },
  options: SignTokenOptions = {},
): Promise<string> {
  const passwordChange = options.passwordChange === true;
  const expires = options.expires ?? (passwordChange ? "1h" : "7d");
  const claims: Record<string, unknown> = {
    email: user.email,
    name: user.displayName,
  };
  if (passwordChange) {
    claims.pwdChange = true;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(getJwtSecretKey(env));
}

function requestPath(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** Routes allowed while holding a pwdChange JWT. */
export function isPasswordChangeAllowedRoute(method: string, url: string): boolean {
  const path = requestPath(url);
  if (method === "GET" && path === "/api/me") return true;
  if (method === "POST" && path === "/api/auth/complete-password-change") {
    return true;
  }
  return false;
}

/** Browser WebSocket cannot set Authorization; voice audio allows ?token=. */
function isVoiceAudioWsPath(url: string): boolean {
  const path = requestPath(url);
  return /^\/api\/ai\/voice\/sessions\/[^/]+\/audio$/.test(path);
}

function extractBearerOrQueryToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const fromHeader = header.slice("Bearer ".length).trim();
    if (fromHeader) return fromHeader;
  }
  if (isVoiceAudioWsPath(request.url)) {
    const q = request.query as { token?: unknown };
    if (typeof q.token === "string" && q.token.trim()) {
      return q.token.trim();
    }
  }
  return null;
}

export function createAuthPlugin(env: Env) {
  const key = getJwtSecretKey(env);

  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const token = extractBearerOrQueryToken(request);
    if (!token) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: [JWT_ALG],
      });

      const sub = payload.sub;
      if (typeof sub !== "string" || !sub) {
        return reply.status(401).send({ error: "invalid_subject" });
      }

      const email = typeof payload.email === "string" ? payload.email : null;
      const name = typeof payload.name === "string" ? payload.name : null;
      const requiresPasswordChange = payload.pwdChange === true;

      if (
        requiresPasswordChange &&
        !isPasswordChangeAllowedRoute(request.method, request.url)
      ) {
        return reply.status(403).send({ error: "password_change_required" });
      }

      request.authUser = {
        id: sub,
        email,
        displayName: name,
        accessToken: token,
        requiresPasswordChange,
      };
    } catch {
      return reply.status(401).send({ error: "invalid_token" });
    }
  };
}
