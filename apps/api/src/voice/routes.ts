import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import websocket from "@fastify/websocket";
import { jwtVerify } from "jose";
import WebSocket from "ws";
import type { Env } from "../env.js";
import { prisma } from "../db.js";
import { requireDbUser } from "../userService.js";
import { canUseVoiceAssistant } from "./authz.js";
import { addVoiceSpendUsd, estimateOpenRouterCostUsd, getVoiceSpendUsd } from "./budget.js";
import { executeVoiceDraft, payloadAsRecord } from "./draftExecute.js";
import { resolveVoiceReasoningConfig } from "../llm/workspaceSettings.js";
import { buildVoiceSystemPrompt } from "./prompts.js";
import { createVoiceReasoningProvider } from "./reasoning/index.js";
import { SpeechServiceClient, SpeechServiceError } from "./speechClient.js";
import {
  releaseVoiceSessionSlot,
  assertCanCreateVoiceSession,
  syncVoiceSessionActiveCount,
} from "./sessionLimits.js";
import {
  createTurnDetectorState,
  observeAudioChunk,
  resetAfterFinalize,
} from "./turnDetection.js";
import { runVoiceTool, voiceToolDefinitions } from "./tools.js";

async function verifyBearerOrQuery(
  env: Env,
  authorization: string | undefined,
  queryToken: string | undefined,
): Promise<{ id: string; email: string | null; displayName: string | null } | null> {
  const raw =
    authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : (queryToken?.trim() ?? "");
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, new TextEncoder().encode(env.AUTH_JWT_SECRET));
    const id = typeof payload.sub === "string" ? payload.sub : "";
    if (!id) return null;
    return {
      id,
      email: typeof payload.email === "string" ? payload.email : null,
      displayName: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

function isVoiceKillSwitched(env: Env): boolean {
  if (env.VOICE_ASSISTANT_KILL_SWITCH) return true;
  // Legacy env: explicit false forces off
  if (env.VOICE_ASSISTANT_ENABLED === false) return true;
  return false;
}

export async function registerVoiceRoutes(app: FastifyInstance, env: Env) {
  await app.register(websocket);

  const speech = new SpeechServiceClient(env);

  app.get("/api/ai/voice/status", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const voiceCfg = isVoiceKillSwitched(env)
      ? null
      : await resolveVoiceReasoningConfig(prisma, env);
    const enabled = Boolean(voiceCfg?.voiceEnabled);
    const ready = enabled ? await speech.readiness() : { ready: false, detail: "disabled" };
    return {
      enabled,
      killSwitch: isVoiceKillSwitched(env),
      allowed: canUseVoiceAssistant(me.role),
      speechReady: ready.ready,
      speechDetail: ready.detail,
      provider: env.SPEECH_PROVIDER,
      reasoningProvider: voiceCfg?.providerPreset ?? env.AI_REASONING_PROVIDER,
      voiceModel: voiceCfg?.model ?? null,
      configuredFrom: "workspace_ai_settings",
      language: "en",
      languageNote: "English-only STT (Parakeet Unified EN). Arabic is not supported.",
      dailySpendUsd: getVoiceSpendUsd(me.id),
      dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
    };
  });

  app.post("/api/ai/voice/sessions", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    if (isVoiceKillSwitched(env)) {
      return reply.code(503).send({ error: "voice_disabled", detail: "kill_switch" });
    }
    const voiceCfg = await resolveVoiceReasoningConfig(prisma, env);
    if (!voiceCfg?.voiceEnabled) {
      return reply.code(503).send({
        error: "voice_disabled",
        detail: "Enable Voice assistant under Apps → Workspace AI",
      });
    }
    if (!canUseVoiceAssistant(me.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (getVoiceSpendUsd(me.id) >= env.AI_DAILY_BUDGET_USD) {
      return reply.code(429).send({ error: "budget_exhausted" });
    }

    // One concurrent session per user: close any leftover active rows (no WS / crashed client).
    await prisma.voiceSession.updateMany({
      where: { userId: me.id, status: "active" },
      data: { status: "closed", endedAt: new Date() },
    });
    syncVoiceSessionActiveCount(me.id, 0);

    const limit = assertCanCreateVoiceSession(me.id, {
      maxPerMinute: env.VOICE_MAX_SESSIONS_PER_MINUTE,
      maxConcurrent: env.VOICE_MAX_CONCURRENT_PER_USER,
    });
    if (!limit.ok) {
      return reply.code(429).send({ error: limit.error });
    }

    const correlationId = randomUUID();
    try {
      const created = await speech.createSession();
      const session = await prisma.voiceSession.create({
        data: {
          userId: me.id,
          speechSessionId: created.sessionId,
          status: "active",
          provider: created.engine,
          correlationId,
        },
      });
      await prisma.auditEvent.create({
        data: {
          actorUserId: me.id,
          action: "voice.session.create",
          entityType: "VoiceSession",
          entityId: session.id,
          metadata: { speechSessionId: created.sessionId, correlationId },
        },
      });
      return {
        sessionId: session.id,
        sampleRate: created.sampleRate,
        engine: created.engine,
        wsPath: `/api/ai/voice/sessions/${session.id}/audio`,
        silenceFinalizeMs: env.VOICE_SILENCE_FINALIZE_MS,
        maxUtteranceMs: env.VOICE_MAX_UTTERANCE_MS,
      };
    } catch (err) {
      releaseVoiceSessionSlot(me.id);
      if (err instanceof SpeechServiceError) {
        return reply.code(502).send({ error: "speech_unavailable", detail: err.body.slice(0, 200) });
      }
      request.log.error({ err }, "voice session create failed");
      return reply.code(502).send({ error: "speech_unavailable" });
    }
  });

  app.delete("/api/ai/voice/sessions/:sessionId", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { sessionId } = request.params as { sessionId: string };
    const session = await prisma.voiceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== me.id) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (session.speechSessionId) {
      await speech.deleteSession(session.speechSessionId);
    }
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: { status: "closed", endedAt: new Date() },
    });
    releaseVoiceSessionSlot(me.id);
    return { status: "closed", sessionId };
  });

  app.post("/api/ai/voice/sessions/:sessionId/drafts/:draftId/confirm", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { sessionId, draftId } = request.params as { sessionId: string; draftId: string };
    const session = await prisma.voiceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== me.id) {
      return reply.code(404).send({ error: "not_found" });
    }
    const draft = await prisma.aiActionProposal.findUnique({ where: { id: draftId } });
    if (!draft || draft.voiceSessionId !== sessionId || draft.createdById !== me.id) {
      return reply.code(404).send({ error: "draft_not_found" });
    }
    if (draft.status !== "pending") {
      return reply.code(409).send({ error: "draft_not_pending", status: draft.status });
    }
    try {
      const result = await executeVoiceDraft(
        draft.kind,
        payloadAsRecord(draft.payload),
        me.id,
      );
      const updated = await prisma.aiActionProposal.update({
        where: { id: draftId },
        data: {
          status: "approved",
          result: result as Prisma.InputJsonValue,
          reviewedById: me.id,
          reviewedAt: new Date(),
        },
      });
      await prisma.auditEvent.create({
        data: {
          actorUserId: me.id,
          action: "voice.draft.confirm",
          entityType: "AiActionProposal",
          entityId: draftId,
          metadata: { sessionId, kind: draft.kind },
        },
      });
      return { draft: updated, result };
    } catch (err) {
      request.log.error({ err }, "voice draft confirm failed");
      return reply.code(500).send({
        error: "execution_failed",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  app.post("/api/ai/voice/sessions/:sessionId/drafts/:draftId/cancel", async (request, reply) => {
    const auth = request.authUser;
    const me = await requireDbUser(auth, reply);
    if (!me) return;
    const { sessionId, draftId } = request.params as { sessionId: string; draftId: string };
    const draft = await prisma.aiActionProposal.findUnique({ where: { id: draftId } });
    if (!draft || draft.voiceSessionId !== sessionId || draft.createdById !== me.id) {
      return reply.code(404).send({ error: "draft_not_found" });
    }
    if (draft.status !== "pending") {
      return reply.code(409).send({ error: "draft_not_pending" });
    }
    const updated = await prisma.aiActionProposal.update({
      where: { id: draftId },
      data: { status: "rejected", reviewedById: me.id, reviewedAt: new Date() },
    });
    return { draft: updated };
  });

  app.get(
    "/api/ai/voice/sessions/:sessionId/audio",
    { websocket: true },
    async (socket, request) => {
      if (isVoiceKillSwitched(env)) {
        socket.close(4403, "disabled");
        return;
      }
      const voiceCfg = await resolveVoiceReasoningConfig(prisma, env);
      if (!voiceCfg?.voiceEnabled) {
        socket.close(4403, "disabled");
        return;
      }
      const { sessionId } = request.params as { sessionId: string };
      const q = request.query as { token?: string };
      const identity = await verifyBearerOrQuery(
        env,
        request.headers.authorization,
        q.token,
      );
      if (!identity) {
        socket.close(4401, "unauthorized");
        return;
      }
      const me = await prisma.user.findUnique({ where: { id: identity.id } });
      if (!me || !canUseVoiceAssistant(me.role)) {
        socket.close(4403, "forbidden");
        return;
      }
      const session = await prisma.voiceSession.findUnique({ where: { id: sessionId } });
      if (!session || session.userId !== me.id || session.status !== "active") {
        socket.close(4404, "not_found");
        return;
      }
      if (!session.speechSessionId) {
        socket.close(4500, "no_speech_session");
        return;
      }

      const turn = createTurnDetectorState();
      const turnCfg = {
        silenceFinalizeMs: env.VOICE_SILENCE_FINALIZE_MS,
        maxUtteranceMs: env.VOICE_MAX_UTTERANCE_MS,
      };
      let lastPartialSeq = 0;
      let reasoningBusy = false;
      let closed = false;
      let pendingFinalize = false;
      /** Prevents silence detector from spamming control.finalize before STT returns. */
      let finalizeInFlight = false;

      const upstream = new WebSocket(speech.audioWsUrl(session.speechSessionId));

      const sendJson = (payload: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(payload));
        }
      };

      const runReasoning = async (finalText: string) => {
        if (reasoningBusy || !finalText.trim()) return;
        reasoningBusy = true;
        finalizeInFlight = false;
        sendJson({ type: "assistant.started", sessionId });
        try {
          if (getVoiceSpendUsd(me.id) >= env.AI_DAILY_BUDGET_USD) {
            sendJson({ type: "error", code: "budget_exhausted", message: "Daily AI budget exhausted" });
            return;
          }
          const systemPrompt = buildVoiceSystemPrompt({
            role: me.role,
            displayName: me.displayName,
          });
          const resolved = await createVoiceReasoningProvider(prisma, env);
          if ("error" in resolved) {
            sendJson({
              type: "error",
              code: resolved.error,
              message: "Voice reasoning is not configured. Check Apps → Workspace AI.",
              sessionId,
            });
            return;
          }
          const { provider: reasoning, model } = resolved;
          let assistantText = "";
          for await (const ev of reasoning.stream({
            systemPrompt,
            userText: finalText,
            tools: voiceToolDefinitions,
            maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
            model,
            correlationId: session.correlationId ?? session.id,
          })) {
            if (ev.type === "assistant.delta") {
              assistantText += ev.text;
              sendJson({ type: "assistant.delta", text: ev.text, sessionId });
            } else if (ev.type === "tool.call") {
              sendJson({
                type: "tool.running",
                toolCallId: ev.id,
                name: ev.name,
                sessionId,
              });
              const result = await runVoiceTool(
                {
                  prisma,
                  userId: me.id,
                  role: me.role,
                  voiceSessionId: session.id,
                },
                ev.name,
                ev.arguments,
              );
              await prisma.voiceSession.update({
                where: { id: session.id },
                data: { toolCallCount: { increment: 1 } },
              });
              await prisma.auditEvent.create({
                data: {
                  actorUserId: me.id,
                  action: "voice.tool.call",
                  entityType: "VoiceSession",
                  entityId: session.id,
                  metadata: { tool: ev.name, toolCallId: ev.id },
                },
              });
              sendJson({
                type: "tool.result",
                toolCallId: ev.id,
                name: ev.name,
                result,
                sessionId,
              });
              if (
                ev.name === "create_action_draft" &&
                result &&
                typeof result === "object" &&
                "draft" in result
              ) {
                sendJson({
                  type: "draft.created",
                  draft: (result as { draft: unknown }).draft,
                  sessionId,
                });
              }
            } else if (ev.type === "assistant.done") {
              const cost = estimateOpenRouterCostUsd({
                inputTokens: ev.inputTokens,
                outputTokens: ev.outputTokens,
              });
              addVoiceSpendUsd(me.id, cost);
              await prisma.voiceSession.update({
                where: { id: session.id },
                data: {
                  inputTokens: { increment: ev.inputTokens },
                  outputTokens: { increment: ev.outputTokens },
                  estimatedCostUsd: { increment: cost },
                },
              });
              sendJson({
                type: "assistant.done",
                text: ev.text || assistantText,
                sessionId,
                usage: { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, cost },
              });
            } else if (ev.type === "error") {
              sendJson({ type: "error", code: ev.code, message: ev.message, sessionId });
            }
          }
        } finally {
          reasoningBusy = false;
          resetAfterFinalize(turn);
        }
      };

      upstream.on("message", (data, isBinary) => {
        if (isBinary) return;
        try {
          const ev = JSON.parse(String(data)) as {
            type: string;
            sequence?: number;
            text?: string;
          };
          if (ev.type === "transcript.partial") {
            const seq = ev.sequence ?? 0;
            if (seq < lastPartialSeq) return;
            lastPartialSeq = seq;
            sendJson(ev);
          } else if (ev.type === "transcript.final") {
            finalizeInFlight = false;
            sendJson(ev);
            void runReasoning(ev.text ?? "");
          } else {
            sendJson(ev);
          }
        } catch {
          /* ignore malformed upstream */
        }
      });

      upstream.on("close", () => {
        if (!closed) {
          sendJson({ type: "session.closed", reason: "speech_disconnect", sessionId });
          socket.close();
        }
      });

      upstream.on("error", () => {
        sendJson({ type: "error", code: "speech_ws_error", message: "Speech service disconnected" });
      });

      const flushFinalize = () => {
        if (reasoningBusy || finalizeInFlight) return;
        if (upstream.readyState === WebSocket.OPEN) {
          pendingFinalize = false;
          finalizeInFlight = true;
          upstream.send(JSON.stringify({ type: "control.finalize" }));
        } else {
          pendingFinalize = true;
        }
      };

      socket.on("message", (raw, isBinary) => {
        if (closed) return;
        // Text frames may arrive as Buffer; only treat true binary as audio PCM.
        if (isBinary) {
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
          if (buf.byteLength > env.VOICE_MAX_CHUNK_BYTES) {
            sendJson({ type: "error", code: "chunk_too_large", message: "Audio chunk too large" });
            return;
          }
          // Drop mic PCM while reasoning so fake/Parakeet STT cannot keep auto-firing.
          if (reasoningBusy) return;
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(buf);
          }
          const signal = observeAudioChunk(turn, buf, Date.now(), turnCfg);
          if (
            (signal === "finalize_silence" || signal === "finalize_max_duration") &&
            !reasoningBusy
          ) {
            flushFinalize();
          }
          return;
        }
        try {
          const ctrl = JSON.parse(String(raw)) as { type?: string; text?: string };
          if (ctrl.type === "control.finalize" || ctrl.type === "control.send_now") {
            flushFinalize();
          } else if (ctrl.type === "control.user_text") {
            // Keyboard / no-mic path: skip STT and reason on typed English text.
            const text = typeof ctrl.text === "string" ? ctrl.text.trim() : "";
            if (text) {
              sendJson({
                type: "transcript.final",
                text,
                sequence: ++lastPartialSeq,
                session_id: session.speechSessionId,
              });
              void runReasoning(text);
            }
          } else if (ctrl.type === "control.cancel") {
            if (upstream.readyState === WebSocket.OPEN) {
              upstream.send(JSON.stringify({ type: "control.cancel" }));
            }
            resetAfterFinalize(turn);
            sendJson({ type: "utterance.cancelled", sessionId });
          }
        } catch {
          /* ignore */
        }
      });

      upstream.on("open", () => {
        sendJson({ type: "session.ready", sessionId });
        if (pendingFinalize) flushFinalize();
      });

      socket.on("close", async () => {
        closed = true;
        try {
          upstream.close();
        } catch {
          /* ignore */
        }
        await prisma.voiceSession
          .update({
            where: { id: sessionId },
            data: { status: "closed", endedAt: new Date() },
          })
          .catch(() => undefined);
        if (session.speechSessionId) {
          await speech.deleteSession(session.speechSessionId);
        }
        releaseVoiceSessionSlot(me.id);
      });
    },
  );
}
