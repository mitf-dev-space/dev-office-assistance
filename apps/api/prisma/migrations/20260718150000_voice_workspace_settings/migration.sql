-- Voice assistant toggles on the shared Workspace AI settings row (same API key).
ALTER TABLE "LlmWorkspaceSettings" ADD COLUMN IF NOT EXISTS "voice_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LlmWorkspaceSettings" ADD COLUMN IF NOT EXISTS "voice_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini';
ALTER TABLE "LlmWorkspaceSettings" ADD COLUMN IF NOT EXISTS "voice_deep_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o';
