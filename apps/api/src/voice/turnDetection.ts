export type TurnDetectorConfig = {
  silenceFinalizeMs: number;
  maxUtteranceMs: number;
};

export type TurnDetectorState = {
  speaking: boolean;
  lastVoiceAt: number;
  utteranceStartedAt: number | null;
  /** Ignore finalize until this timestamp (ms) — prevents mic-noise re-trigger loops. */
  cooldownUntil: number;
};

export function createTurnDetectorState(): TurnDetectorState {
  return { speaking: false, lastVoiceAt: 0, utteranceStartedAt: null, cooldownUntil: 0 };
}

/** PCM16 mono energy gate — returns true when chunk looks like speech. */
export function pcm16HasVoice(pcm16: Buffer, threshold = 200): boolean {
  if (pcm16.length < 2) return false;
  const sampleCount = Math.floor(pcm16.length / 2);
  let acc = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = pcm16.readInt16LE(i * 2);
    acc += s * s;
  }
  const rms = Math.sqrt(acc / sampleCount);
  return rms > threshold;
}

export type TurnSignal = "none" | "speech" | "finalize_silence" | "finalize_max_duration";

export function observeAudioChunk(
  state: TurnDetectorState,
  pcm16: Buffer,
  nowMs: number,
  cfg: TurnDetectorConfig,
): TurnSignal {
  if (nowMs < state.cooldownUntil) {
    return "none";
  }
  const voice = pcm16HasVoice(pcm16);
  if (voice) {
    if (!state.speaking) {
      state.speaking = true;
      state.utteranceStartedAt = nowMs;
    }
    state.lastVoiceAt = nowMs;
    if (
      state.utteranceStartedAt != null &&
      nowMs - state.utteranceStartedAt >= cfg.maxUtteranceMs
    ) {
      return "finalize_max_duration";
    }
    return "speech";
  }
  if (state.speaking && state.lastVoiceAt > 0 && nowMs - state.lastVoiceAt >= cfg.silenceFinalizeMs) {
    return "finalize_silence";
  }
  return "none";
}

export function resetAfterFinalize(state: TurnDetectorState, cooldownMs = 2500): void {
  state.speaking = false;
  state.lastVoiceAt = 0;
  state.utteranceStartedAt = null;
  state.cooldownUntil = Date.now() + cooldownMs;
}
