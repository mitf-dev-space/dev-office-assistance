/**
 * Minimal fake speech service for local E2E when Python/FastAPI is unavailable.
 * Protocol-compatible with services/speech (fake engine).
 *
 *   node services/speech/fake_server.mjs
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8000);
const SCRIPT = [
  "Review today's standups",
  "Review today's standups and identify",
  "Review today's standups and identify blocked projects",
];

const sessions = new Map();

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    return json(res, 200, { status: "ok", service: "helm-speech-fake", check: "live" });
  }
  if (req.method === "GET" && url.pathname === "/readyz") {
    return json(res, 200, {
      status: "ok",
      service: "helm-speech-fake",
      check: "ready",
      engine: "fake",
      active_sessions: sessions.size,
    });
  }
  if (req.method === "POST" && url.pathname === "/sessions") {
    const id = randomUUID();
    sessions.set(id, { bytes: 0, index: 0, seq: 0 });
    return json(res, 200, { session_id: id, sample_rate: 16000, engine: "fake" });
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/sessions/")) {
    const id = url.pathname.split("/")[2];
    sessions.delete(id);
    return json(res, 200, { status: "closed", session_id: id });
  }
  json(res, 404, { error: "not_found" });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/sessions\/([^/]+)\/audio$/);
  if (!m) {
    socket.destroy();
    return;
  }
  const sessionId = m[1];
  if (!sessions.has(sessionId)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const state = sessions.get(sessionId);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const ctrl = JSON.parse(String(data));
          if (ctrl.type === "control.finalize") {
            state.seq += 1;
            const text = SCRIPT[Math.min(state.index, SCRIPT.length - 1)] || SCRIPT[SCRIPT.length - 1];
            ws.send(
              JSON.stringify({
                type: "transcript.final",
                session_id: sessionId,
                text,
                sequence: state.seq,
                ts: Date.now() / 1000,
                confidence: 0.9,
              }),
            );
          }
        } catch {
          /* ignore */
        }
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      state.bytes += buf.length;
      // crude energy: non-zero bytes
      let energy = 0;
      for (let i = 0; i < Math.min(buf.length, 200); i++) energy += buf[i];
      if (energy < 50) return;
      const threshold = 12_800 * (state.index + 1);
      if (state.bytes >= threshold && state.index < SCRIPT.length) {
        state.seq += 1;
        const text = SCRIPT[state.index];
        state.index += 1;
        ws.send(
          JSON.stringify({
            type: "transcript.partial",
            session_id: sessionId,
            text,
            sequence: state.seq,
            ts: Date.now() / 1000,
            confidence: 0.7,
          }),
        );
      }
    });
    ws.on("close", () => {
      sessions.delete(sessionId);
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`helm-speech-fake listening on :${PORT}`);
});
