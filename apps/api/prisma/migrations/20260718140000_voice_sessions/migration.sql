-- Voice assistant sessions and draft linkage
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "speech_session_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "provider" TEXT NOT NULL DEFAULT 'parakeet',
    "correlation_id" TEXT,
    "error_category" TEXT,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceSession_user_id_started_at_idx" ON "VoiceSession"("user_id", "started_at");
CREATE INDEX "VoiceSession_status_started_at_idx" ON "VoiceSession"("status", "started_at");

ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiActionProposal" ADD COLUMN "voice_session_id" TEXT;

CREATE INDEX "AiActionProposal_voice_session_id_idx" ON "AiActionProposal"("voice_session_id");

ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_voice_session_id_fkey" FOREIGN KEY ("voice_session_id") REFERENCES "VoiceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
