import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveAccessToken } from "../../../auth/authToken";
import {
  applyPartialTranscript,
  reduceVoiceState,
  type VoiceUiState,
} from "../state/machine";

export type TranscriptFinalItem = { id: string; text: string; at: number };
export type ToolActivity = { id: string; name: string; result?: unknown };
export type VoiceDraft = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  status: string;
};

function apiBase(): string {
  const env = (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL;
  return (env ?? "").replace(/\/+$/, "");
}

function wsUrl(path: string, token: string): string {
  const base = apiBase();
  if (base) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = path;
    u.search = `token=${encodeURIComponent(token)}`;
    return u.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}?token=${encodeURIComponent(token)}`;
}

function describeMicError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Microphone unavailable. Use the text box below, or open http://localhost:5174 in Chrome/Edge and allow the mic.";
  }
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission denied. Click the lock icon in the address bar → allow microphone, or use the text box below.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone found. Plug one in, or use the text box below.";
    case "NotReadableError":
    case "TrackStartError":
      return "Microphone is busy or could not start (another app may be using it). Close other apps or use the text box below.";
    case "SecurityError":
      return "Browser blocked microphone access on this page. Open http://localhost:5174 in a normal Chrome/Edge window (not an embedded preview).";
    default:
      return `${err.message || "Could not start microphone"}. Use the text box below, or retry in Chrome/Edge with mic permission.`;
  }
}

export function useVoiceSession() {
  const [state, setState] = useState<VoiceUiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [finals, setFinals] = useState<TranscriptFinalItem[]>([]);
  const [assistant, setAssistant] = useState("");
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [drafts, setDrafts] = useState<VoiceDraft[]>([]);
  const [muted, setMuted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<{
    enabled: boolean;
    allowed: boolean;
    speechReady: boolean;
    languageNote: string;
  } | null>(null);

  const pcSeq = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const pausePcmRef = useRef(false);
  const partialRef = useRef("");

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    partialRef.current = partial;
  }, [partial]);

  const stopTracks = useCallback(() => {
    try {
      workletRef.current?.port.close();
    } catch {
      /* ignore */
    }
    workletRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    pausePcmRef.current = false;
  }, []);

  const hardClose = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    stopTracks();
    setState((s) => reduceVoiceState(s, { type: "STOP" }));
  }, [stopTracks]);

  const refreshStatus = useCallback(async () => {
    const token = getActiveAccessToken();
    if (!token) return;
    const res = await fetch(`${apiBase()}/api/ai/voice/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      enabled: boolean;
      allowed: boolean;
      speechReady: boolean;
      languageNote: string;
    };
    setStatusInfo(data);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => () => hardClose(), [hardClose]);

  const attachMicrophone = useCallback(
    async (ws: WebSocket, sampleRate: number) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("mediaDevices unavailable"), { name: "SecurityError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await ctx.audioWorklet.addModule("/voice/pcm-capture-processor.js");
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const worklet = new AudioWorkletNode(ctx, "pcm-capture");
      workletRef.current = worklet;
      const targetRate = sampleRate || 16000;
      worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (pausePcmRef.current || mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
        const input = ev.data;
        if (!input?.length) return;
        const ratio = ctx.sampleRate / targetRate;
        const outLen = Math.floor(input.length / ratio);
        if (outLen <= 0) return;
        const pcm = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const sample = input[Math.floor(i * ratio)] ?? 0;
          const s = Math.max(-1, Math.min(1, sample));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(pcm.buffer);
      };
      source.connect(worklet);
      // Worklet must be in the graph; keep destination silent.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      worklet.connect(silent);
      silent.connect(ctx.destination);
    },
    [],
  );

  const start = useCallback(async () => {
    setError(null);
    setMicWarning(null);
    setPartial("");
    setAssistant("");
    setTools([]);
    setFinals([]);
    setDrafts([]);
    pcSeq.current = 0;
    setState((s) => reduceVoiceState(s, { type: "START" }));
    const token = getActiveAccessToken();
    if (!token) {
      setError("Not signed in");
      setState("failed");
      return;
    }
    try {
      setState((s) => reduceVoiceState(s, { type: "PERMISSION_GRANTED" }));

      const created = await fetch(`${apiBase()}/api/ai/voice/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        // Fastify rejects Content-Type: application/json with an empty body (400).
        body: "{}",
      });
      if (!created.ok) {
        const body = (await created.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `session_${created.status}`);
      }
      const session = (await created.json()) as {
        sessionId: string;
        sampleRate: number;
        wsPath: string;
      };
      setSessionId(session.sessionId);

      const ws = new WebSocket(wsUrl(session.wsPath, token));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("websocket_failed"));
      });
      setState((s) => reduceVoiceState(s, { type: "CONNECTED" }));

      ws.onmessage = (msg) => {
        if (typeof msg.data !== "string") return;
        let ev: {
          type: string;
          text?: string;
          sequence?: number;
          name?: string;
          toolCallId?: string;
          result?: unknown;
          draft?: VoiceDraft;
          message?: string;
          code?: string;
        };
        try {
          ev = JSON.parse(msg.data) as typeof ev;
        } catch {
          return;
        }
        if (ev.type === "transcript.partial" && ev.text != null) {
          const next = applyPartialTranscript(
            partialRef.current,
            { text: ev.text, sequence: ev.sequence ?? 0 },
            pcSeq.current,
          );
          pcSeq.current = next.lastSequence;
          if (next.changed) setPartial(next.partial);
          setState((s) => reduceVoiceState(s, { type: "PARTIAL" }));
        } else if (ev.type === "transcript.final" && ev.text) {
          setFinals((f) => [...f, { id: crypto.randomUUID(), text: ev.text!, at: Date.now() }]);
          setPartial("");
          setState((s) => reduceVoiceState(s, { type: "FINAL" }));
        } else if (ev.type === "assistant.delta" && ev.text) {
          setAssistant((a) => a + ev.text);
          setState((s) => reduceVoiceState(s, { type: "ASSISTANT" }));
        } else if (ev.type === "assistant.started") {
          pausePcmRef.current = true;
          setAssistant("");
          setTools([]);
          setState((s) => reduceVoiceState(s, { type: "REASONING" }));
        } else if (ev.type === "assistant.done") {
          pausePcmRef.current = false;
          setState((s) => reduceVoiceState(s, { type: "CONNECTED" }));
        } else if (ev.type === "tool.running") {
          const id = ev.toolCallId ?? crypto.randomUUID();
          setTools((t) => {
            if (t.some((x) => x.id === id)) {
              return t.map((x) => (x.id === id ? { ...x, name: ev.name ?? x.name } : x));
            }
            return [...t, { id, name: ev.name ?? "tool" }];
          });
          setState((s) => reduceVoiceState(s, { type: "TOOL" }));
        } else if (ev.type === "tool.result") {
          setTools((t) =>
            t.map((x) => (x.id === ev.toolCallId ? { ...x, result: ev.result } : x)),
          );
        } else if (ev.type === "draft.created" && ev.draft) {
          setDrafts((d) => [...d, ev.draft!]);
          setState((s) => reduceVoiceState(s, { type: "DRAFT" }));
        } else if (ev.type === "error") {
          setError(ev.message ?? ev.code ?? "error");
          setState((s) => reduceVoiceState(s, { type: "ERROR" }));
        }
      };

      try {
        await attachMicrophone(ws, session.sampleRate);
        setMicWarning(null);
      } catch (micErr) {
        stopTracks();
        setMicWarning(describeMicError(micErr));
      }
    } catch (err) {
      stopTracks();
      wsRef.current?.close();
      wsRef.current = null;
      setError(err instanceof Error ? err.message : "Failed to start voice session");
      setState("failed");
    }
  }, [attachMicrophone, stopTracks]);

  const stop = useCallback(async () => {
    const token = getActiveAccessToken();
    const id = sessionId;
    hardClose();
    setMicWarning(null);
    if (token && id) {
      await fetch(`${apiBase()}/api/ai/voice/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    setSessionId(null);
  }, [hardClose, sessionId]);

  const sendNow = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "control.send_now" }));
    setState((s) => reduceVoiceState(s, { type: "FINALIZING" }));
  }, []);

  const sendUserText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify({ type: "control.user_text", text: trimmed }));
    setState((s) => reduceVoiceState(s, { type: "FINALIZING" }));
    return true;
  }, []);

  const cancelUtterance = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "control.cancel" }));
    setPartial("");
  }, []);

  const confirmDraft = useCallback(
    async (draftId: string) => {
      const token = getActiveAccessToken();
      if (!token || !sessionId) return;
      const res = await fetch(
        `${apiBase()}/api/ai/voice/sessions/${sessionId}/drafts/${draftId}/confirm`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setError("Draft confirmation failed");
        return;
      }
      setDrafts((d) => d.map((x) => (x.id === draftId ? { ...x, status: "approved" } : x)));
    },
    [sessionId],
  );

  const cancelDraft = useCallback(
    async (draftId: string) => {
      const token = getActiveAccessToken();
      if (!token || !sessionId) return;
      await fetch(
        `${apiBase()}/api/ai/voice/sessions/${sessionId}/drafts/${draftId}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      setDrafts((d) => d.map((x) => (x.id === draftId ? { ...x, status: "rejected" } : x)));
    },
    [sessionId],
  );

  return {
    state,
    error,
    micWarning,
    partial,
    finals,
    assistant,
    tools,
    drafts,
    muted,
    setMuted,
    sessionId,
    statusInfo,
    start,
    stop,
    sendNow,
    sendUserText,
    cancelUtterance,
    confirmDraft,
    cancelDraft,
    refreshStatus,
  };
}
