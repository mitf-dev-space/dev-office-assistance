/**
 * E2E API test for lead password reset + forced change (OmniTest-style).
 * Run: node scripts/force-password-e2e.mjs
 * Requires: API on :4000 (npm run dev -w @office/api or full monorepo dev).
 */
const API = process.env.HELM_API_URL ?? "http://localhost:4000";
const LEAD = { email: "lead@local.dev", password: "lead" };
const ASSISTANT_EMAIL = "assistant@local.dev";
const ASSISTANT_SEED_PASSWORD = process.env.SEED_ASSISTANT_PASSWORD ?? "ChangeMe!Asst1";
const NEW_PASSWORD = "SecurePass99!";
const RESTORED_PASSWORD = ASSISTANT_SEED_PASSWORD;

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function api(path, { method = "GET", body, token } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (method !== "GET" && method !== "HEAD") {
    // Fastify rejects Content-Type: application/json with an empty body.
    headers["Content-Type"] = "application/json";
    payload = "{}";
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function login(email, password) {
  return api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

async function main() {
  console.log(`Force password E2E against ${API}`);

  const health = await fetch(`${API}/healthz`);
  assert(health.ok, "API healthz failed — is the API running on :4000?");

  const leadLogin = await login(LEAD.email, LEAD.password);
  assert(leadLogin.status === 200, `lead login: ${JSON.stringify(leadLogin.json)}`);
  assert(leadLogin.json.requiresPasswordChange !== true, "lead should not require password change");
  const leadToken = leadLogin.json.token;

  const users = await api("/api/users", { token: leadToken });
  assert(users.status === 200, "list users");
  const assistant = users.json.users.find((u) => u.email === ASSISTANT_EMAIL);
  assert(assistant, `missing ${ASSISTANT_EMAIL}`);

  // Non-lead cannot reset: first get a forge or use assistant after we know password.
  // Use lead to reset, then after forced change we'll verify assistant 403.

  const reset = await api(`/api/users/${assistant.id}/reset-password`, {
    method: "POST",
    token: leadToken,
  });
  assert(reset.status === 200, `reset: ${JSON.stringify(reset.json)}`);
  assert(reset.json.mustChangePassword === true, "mustChangePassword after reset");
  const tempPassword = reset.json.temporaryPassword;
  assert(tempPassword, "temporaryPassword missing in non-production response");
  console.log("Lead reset OK, temp password captured");

  const forceLogin = await login(ASSISTANT_EMAIL, tempPassword);
  assert(forceLogin.status === 200, "temp login");
  assert(forceLogin.json.requiresPasswordChange === true, "requiresPasswordChange");
  const pwdToken = forceLogin.json.token;

  const blockedUsers = await api("/api/users", { token: pwdToken });
  assert(blockedUsers.status === 403, `pwdChange token must not list users (got ${blockedUsers.status})`);

  const blockedMePatch = await api("/api/me", {
    method: "PATCH",
    token: pwdToken,
    body: { displayName: "Should Fail" },
  });
  assert(blockedMePatch.status === 403, "pwdChange token blocked from PATCH /api/me");

  const meOk = await api("/api/me", { token: pwdToken });
  assert(meOk.status === 200, "GET /api/me allowed with pwdChange token");
  assert(meOk.json.mustChangePassword === true, "me.mustChangePassword");

  const shortPw = await api("/api/auth/complete-password-change", {
    method: "POST",
    token: pwdToken,
    body: { newPassword: "short" },
  });
  assert(shortPw.status === 400, "short password rejected");

  const complete = await api("/api/auth/complete-password-change", {
    method: "POST",
    token: pwdToken,
    body: { newPassword: NEW_PASSWORD },
  });
  assert(complete.status === 200 && complete.json.ok === true, "complete password change");

  const fullLogin = await login(ASSISTANT_EMAIL, NEW_PASSWORD);
  assert(fullLogin.status === 200, "login with new password");
  assert(fullLogin.json.requiresPasswordChange !== true, "no forced change after complete");
  const assistantToken = fullLogin.json.token;

  const forbidReset = await api(`/api/users/${assistant.id}/reset-password`, {
    method: "POST",
    token: assistantToken,
  });
  assert(forbidReset.status === 403, "assistant cannot reset passwords");

  const selfChange = await api("/api/me/password", {
    method: "POST",
    token: assistantToken,
    body: {
      currentPassword: NEW_PASSWORD,
      newPassword: RESTORED_PASSWORD,
    },
  });
  assert(selfChange.status === 200 && selfChange.json.ok === true, "self change password");

  const restoredLogin = await login(ASSISTANT_EMAIL, RESTORED_PASSWORD);
  assert(restoredLogin.status === 200, "login with restored seed password");
  assert(restoredLogin.json.requiresPasswordChange !== true, "restored account is full session");

  console.log("\nAll force-password API E2E checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
