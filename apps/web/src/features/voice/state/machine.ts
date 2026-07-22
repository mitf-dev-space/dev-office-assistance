export type VoiceUiState =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "finalizing-transcript"
  | "reasoning"
  | "tool-running"
  | "assistant-responding"
  | "awaiting-confirmation"
  | "failed"
  | "closed";

export type VoiceUiEvent =
  | { type: "START" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "PERMISSION_DENIED" }
  | { type: "CONNECTED" }
  | { type: "PARTIAL" }
  | { type: "FINALIZING" }
  | { type: "FINAL" }
  | { type: "REASONING" }
  | { type: "TOOL" }
  | { type: "ASSISTANT" }
  | { type: "DRAFT" }
  | { type: "ERROR" }
  | { type: "STOP" }
  | { type: "RESET" };

const transitions: Record<VoiceUiState, Partial<Record<VoiceUiEvent["type"], VoiceUiState>>> = {
  idle: { START: "requesting-permission" },
  "requesting-permission": {
    PERMISSION_GRANTED: "connecting",
    PERMISSION_DENIED: "failed",
    STOP: "closed",
  },
  connecting: { CONNECTED: "listening", ERROR: "failed", STOP: "closed" },
  listening: {
    PARTIAL: "user-speaking",
    FINALIZING: "finalizing-transcript",
    STOP: "closed",
    ERROR: "failed",
  },
  "user-speaking": {
    PARTIAL: "user-speaking",
    FINALIZING: "finalizing-transcript",
    FINAL: "reasoning",
    STOP: "closed",
    ERROR: "failed",
  },
  "finalizing-transcript": {
    FINAL: "reasoning",
    STOP: "closed",
    ERROR: "failed",
  },
  reasoning: {
    TOOL: "tool-running",
    ASSISTANT: "assistant-responding",
    DRAFT: "awaiting-confirmation",
    FINAL: "reasoning",
    PARTIAL: "user-speaking",
    STOP: "closed",
    ERROR: "failed",
  },
  "tool-running": {
    ASSISTANT: "assistant-responding",
    TOOL: "tool-running",
    DRAFT: "awaiting-confirmation",
    PARTIAL: "user-speaking",
    STOP: "closed",
    ERROR: "failed",
  },
  "assistant-responding": {
    DRAFT: "awaiting-confirmation",
    PARTIAL: "user-speaking",
    CONNECTED: "listening",
    STOP: "closed",
    ERROR: "failed",
  },
  "awaiting-confirmation": {
    PARTIAL: "user-speaking",
    ASSISTANT: "assistant-responding",
    STOP: "closed",
    ERROR: "failed",
  },
  failed: { RESET: "idle", START: "requesting-permission" },
  closed: { RESET: "idle", START: "requesting-permission" },
};

export function reduceVoiceState(state: VoiceUiState, event: VoiceUiEvent): VoiceUiState {
  if (event.type === "RESET") return "idle";
  const next = transitions[state]?.[event.type];
  if (next) return next;
  // After assistant done, return to listening without dedicated event
  if (state === "assistant-responding" && event.type === "FINAL") return "reasoning";
  if (
    (state === "assistant-responding" || state === "awaiting-confirmation") &&
    event.type === "CONNECTED"
  ) {
    return "listening";
  }
  return state;
}

export function applyPartialTranscript(
  currentPartial: string,
  incoming: { text: string; sequence: number },
  lastSequence: number,
): { partial: string; lastSequence: number; changed: boolean } {
  if (incoming.sequence < lastSequence) {
    return { partial: currentPartial, lastSequence, changed: false };
  }
  return {
    partial: incoming.text,
    lastSequence: incoming.sequence,
    changed: incoming.text !== currentPartial,
  };
}
