#!/usr/bin/env node
/**
 * Local Anthropic-compatible gateway for Claude Desktop → OpenRouter.
 *
 * Claude Desktop only accepts Anthropic-looking model IDs. This proxy exposes
 * those IDs, then rewrites them to real OpenRouter models before forwarding.
 *
 * Usage:
 *   set OPENROUTER_API_KEY=sk-or-v1-...
 *   node server.mjs
 *
 * Then in Claude Desktop → Developer → Configure Third-Party Inference:
 *   Gateway base URL:  http://127.0.0.1:8787
 *   Gateway API key:   local
 *   Auth scheme:       bearer
 *   Model IDs:         claude-sonnet-5, claude-haiku-5, claude-opus-5
 *                      (also accepts claude-*-4-5 for older Desktop builds)
 */

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotEnv(join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.OPENROUTER_API_KEY || "";

const HAIKU = process.env.MODEL_HAIKU || "deepseek/deepseek-chat";
const SONNET = process.env.MODEL_SONNET || "moonshotai/kimi-k3";
const OPUS = process.env.MODEL_OPUS || "google/gemini-2.5-pro";

/** Claude Desktop picker ID → OpenRouter model slug */
const MODEL_MAP = {
  // Claude 4.5 picker IDs (older Desktop builds)
  "claude-haiku-4-5": HAIKU,
  "claude-sonnet-4-5": SONNET,
  "claude-opus-4-5": OPUS,
  // Claude 5 picker IDs (Sonnet 5 / Opus 5 Desktop builds)
  "claude-haiku-5": HAIKU,
  "claude-sonnet-5": SONNET,
  "claude-opus-5": OPUS,
  // Dated IDs Claude Desktop sometimes emits internally
  "claude-haiku-4-5-20251001": HAIKU,
  "claude-sonnet-4-5-20250929": SONNET,
  "claude-opus-4-5-20251101": OPUS,
};

const LABELS = {
  "claude-haiku-4-5": "Haiku -> DeepSeek Chat",
  "claude-sonnet-4-5": "Sonnet -> Kimi K3",
  "claude-opus-4-5": "Opus -> Gemini 2.5 Pro",
  "claude-haiku-5": "Haiku 5 -> DeepSeek Chat",
  "claude-sonnet-5": "Sonnet 5 -> Kimi K3",
  "claude-opus-5": "Opus 5 -> Gemini 2.5 Pro",
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // File wins over inherited shell env (stale keys caused 401s).
    process.env[key] = val;
  }
}

function resolveUpstreamModel(requested) {
  if (!requested) return MODEL_MAP["claude-sonnet-4-5"];
  if (MODEL_MAP[requested]) return MODEL_MAP[requested];
  // Bare tier aliases
  if (requested === "haiku") return MODEL_MAP["claude-haiku-4-5"];
  if (requested === "sonnet") return MODEL_MAP["claude-sonnet-4-5"];
  if (requested === "opus") return MODEL_MAP["claude-opus-4-5"];
  // Already an OpenRouter-style id — pass through (won't be pickable in Desktop)
  if (requested.includes("/")) return requested;
  // Prefix match for dated Claude IDs
  for (const [alias, target] of Object.entries(MODEL_MAP)) {
    if (requested.startsWith(alias)) return target;
  }
  console.warn(`[proxy] unknown model "${requested}", defaulting to sonnet map`);
  return MODEL_MAP["claude-sonnet-4-5"];
}

function modelsPayload() {
  const ids = [
    "claude-haiku-5",
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-haiku-4-5",
    "claude-sonnet-4-5",
    "claude-opus-4-5",
  ];
  const data = ids.map((id) => ({
    id,
    display_name: LABELS[id] || id,
    type: "model",
    created_at: "2025-01-01T00:00:00Z",
    // Helps some Desktop builds treat these as Claude-family entries
    anthropic_family_tier: id.includes("haiku")
      ? "haiku"
      : id.includes("opus")
        ? "opus"
        : "sonnet",
    is_family_default: true,
  }));
  return { data, object: "list" };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

async function proxyMessages(req, res, bodyBuf) {
  if (!API_KEY) {
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "api_error",
        message: "OPENROUTER_API_KEY is not set. Add it to .env next to server.mjs",
      },
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
  } catch {
    sendJson(res, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: "Invalid JSON body" },
    });
    return;
  }

  const requested = payload.model;
  const upstreamModel = resolveUpstreamModel(requested);
  payload.model = upstreamModel;

  console.log(`[proxy] ${requested || "(none)"} → ${upstreamModel}`);

  const upstreamRes = await fetch(`${UPSTREAM}/v1/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
      "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
      "http-referer": process.env.HTTP_REFERER || "http://localhost",
      "x-title": process.env.X_TITLE || "Claude Desktop OpenRouter Proxy",
    },
    body: JSON.stringify(payload),
  });

  const contentType = upstreamRes.headers.get("content-type") || "";
  const isStream =
    payload.stream === true || contentType.includes("text/event-stream");

  if (isStream && upstreamRes.body) {
    res.writeHead(upstreamRes.status, {
      "content-type": contentType || "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Rewrite model field in SSE data lines when present
      buffer = buffer.replace(
        /"model"\s*:\s*"[^"]*"/g,
        `"model":"${requested || upstreamModel}"`,
      );
      res.write(buffer);
      buffer = "";
    }
    res.end();
    return;
  }

  const text = await upstreamRes.text();
  let out = text;
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && json.model) {
      json.model = requested || json.model;
      out = JSON.stringify(json);
    }
  } catch {
    // leave as-is
  }

  res.writeHead(upstreamRes.status, {
    "content-type": contentType || "application/json",
    "content-length": Buffer.byteLength(out),
  });
  res.end(out);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "GET" && (path === "/" || path === "/health")) {
      sendJson(res, 200, {
        ok: true,
        upstream: UPSTREAM,
        hasKey: Boolean(API_KEY),
        models: MODEL_MAP,
      });
      return;
    }

    if (req.method === "GET" && (path === "/v1/models" || path === "/models")) {
      sendJson(res, 200, modelsPayload());
      return;
    }

    if (req.method === "POST" && (path === "/v1/messages" || path === "/messages")) {
      const body = await readBody(req);
      await proxyMessages(req, res, body);
      return;
    }

    sendJson(res, 404, {
      type: "error",
      error: { type: "not_found_error", message: `No route for ${req.method} ${path}` },
    });
  } catch (err) {
    console.error("[proxy] error", err);
    if (!res.headersSent) {
      sendJson(res, 502, {
        type: "error",
        error: {
          type: "api_error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    } else {
      res.end();
    }
  }
});

// Keep the process alive on unexpected errors; the watch.ps1 loop covers hard exits.
process.on("uncaughtException", (err) => {
  console.error("[proxy] uncaughtException (kept alive)", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[proxy] unhandledRejection (kept alive)", err);
});

server.on("error", (err) => {
  console.error("[proxy] server error", err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Claude Desktop → OpenRouter proxy on http://127.0.0.1:${PORT}`);
  console.log(`Upstream: ${UPSTREAM}`);
  console.log(`API key: ${API_KEY ? "set" : "MISSING — create .env from .env.example"}`);
  console.log("Model map:");
  for (const [from, to] of Object.entries(MODEL_MAP)) {
    if (from.includes("2025")) continue;
    console.log(`  ${from}  →  ${to}`);
  }
  console.log("\nClaude Desktop Gateway settings:");
  console.log(`  Base URL:  http://127.0.0.1:${PORT}`);
  console.log("  API key:   local");
  console.log("  Auth:      bearer");
  console.log("  Models:    claude-sonnet-5, claude-haiku-5, claude-opus-5");
  console.log("             (+ claude-*-4-5 aliases for older Desktop)");
});
