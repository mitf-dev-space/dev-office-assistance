-- AlterEnum InsightSnapshotKind (Postgres <16 has no IF NOT EXISTS on ADD VALUE)
DO $$ BEGIN
  ALTER TYPE "InsightSnapshotKind" ADD VALUE 'morning_brief';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "InsightSnapshotKind" ADD VALUE 'blocker_radar';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AiActionProposal" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "created_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiActionProposal_status_created_at_idx" ON "AiActionProposal"("status", "created_at");
CREATE INDEX IF NOT EXISTS "AiActionProposal_kind_created_at_idx" ON "AiActionProposal"("kind", "created_at");

DO $$ BEGIN
  ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiActionProposal" ADD CONSTRAINT "AiActionProposal_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
