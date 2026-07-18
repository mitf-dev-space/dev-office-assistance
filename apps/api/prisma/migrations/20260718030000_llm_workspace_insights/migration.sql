-- CreateEnum
CREATE TYPE "InsightSnapshotKind" AS ENUM ('weekly_ops', 'catalog_health', 'forge_builds');

-- CreateEnum
CREATE TYPE "InsightSnapshotStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "LlmWorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider_preset" TEXT NOT NULL DEFAULT 'lmstudio',
    "base_url" TEXT NOT NULL DEFAULT 'http://localhost:1234/v1',
    "model" TEXT NOT NULL DEFAULT 'local-model',
    "api_key_cipher" TEXT,
    "api_key_hint" VARCHAR(32),
    "assist_locale" TEXT NOT NULL DEFAULT 'en',
    "daily_cap" INTEGER NOT NULL DEFAULT 200,
    "last_tested_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "updated_by_id" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmWorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightSnapshot" (
    "id" TEXT NOT NULL,
    "kind" "InsightSnapshotKind" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "narrative" JSONB,
    "llm_used" BOOLEAN NOT NULL DEFAULT false,
    "status" "InsightSnapshotStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightSnapshot_kind_created_at_idx" ON "InsightSnapshot"("kind", "created_at");

-- CreateIndex
CREATE INDEX "InsightSnapshot_status_created_at_idx" ON "InsightSnapshot"("status", "created_at");

-- AddForeignKey
ALTER TABLE "LlmWorkspaceSettings" ADD CONSTRAINT "LlmWorkspaceSettings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
