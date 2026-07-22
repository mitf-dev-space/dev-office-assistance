const VOICE_ROLES = new Set(["lead", "assistant"]);

export function canUseVoiceAssistant(role: string): boolean {
  return VOICE_ROLES.has(role);
}
