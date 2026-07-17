-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('microsoft_todo', 'clickup');

-- CreateEnum
CREATE TYPE "ExternalSyncState" AS ENUM ('idle', 'syncing', 'error', 'stale');

-- AlterEnum SourceType.clickup (idempotent)
DO $$ BEGIN
  ALTER TYPE "SourceType" ADD VALUE 'clickup';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "ExternalWorkItem" (
    "id" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "connection_key" TEXT NOT NULL,
    "workspace_id" TEXT,
    "space_id" TEXT,
    "folder_id" TEXT,
    "list_id" TEXT,
    "external_id" TEXT NOT NULL,
    "external_parent_id" TEXT,
    "external_url" TEXT,
    "title" TEXT NOT NULL,
    "external_status" TEXT,
    "external_priority" TEXT,
    "external_updated_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "sync_state" "ExternalSyncState" NOT NULL DEFAULT 'idle',
    "raw_metadata" JSONB,
    "triage_item_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "workspace_id" TEXT,
    "workspace_name" TEXT,
    "encrypted_token" TEXT NOT NULL,
    "token_hint" VARCHAR(16),
    "auto_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "webhook_id" TEXT,
    "webhook_secret" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickUpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpListMapping" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "space_name" TEXT,
    "folder_id" TEXT,
    "folder_name" TEXT,
    "list_id" TEXT NOT NULL,
    "list_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "import_category" "TriageCategory" NOT NULL DEFAULT 'other',
    "default_assignee_id" TEXT,
    "sync_status_to_triage" BOOLEAN NOT NULL DEFAULT true,
    "sync_due_to_triage" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickUpListMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpStatusMapping" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "clickup_status" TEXT NOT NULL,
    "triage_status" "TriageStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickUpStatusMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpPriorityMapping" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "clickup_priority" TEXT NOT NULL,
    "triage_category" "TriageCategory",
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickUpPriorityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpUserMapping" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "clickup_user_id" TEXT NOT NULL,
    "clickup_username" TEXT,
    "developer_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickUpUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSyncRun" (
    "id" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "connection_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "items_seen" INTEGER NOT NULL DEFAULT 0,
    "items_upserted" INTEGER NOT NULL DEFAULT 0,
    "items_linked" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "ExternalSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSyncError" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "external_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSyncError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickUpWebhookDelivery" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "processed_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickUpWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicrosoftTodoSyncSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "auto_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "connected_list_ids" JSONB NOT NULL DEFAULT '[]',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftTodoSyncSettings_pkey" PRIMARY KEY ("id")
);

-- Indexes & FKs
CREATE UNIQUE INDEX "ExternalWorkItem_provider_connection_key_external_id_key" ON "ExternalWorkItem"("provider", "connection_key", "external_id");
CREATE INDEX "ExternalWorkItem_triage_item_id_idx" ON "ExternalWorkItem"("triage_item_id");
CREATE INDEX "ExternalWorkItem_provider_list_id_idx" ON "ExternalWorkItem"("provider", "list_id");
CREATE INDEX "ExternalWorkItem_last_synced_at_idx" ON "ExternalWorkItem"("last_synced_at");

CREATE INDEX "ClickUpConnection_workspace_id_idx" ON "ClickUpConnection"("workspace_id");

CREATE UNIQUE INDEX "ClickUpListMapping_connection_id_list_id_key" ON "ClickUpListMapping"("connection_id", "list_id");
CREATE INDEX "ClickUpListMapping_connection_id_enabled_idx" ON "ClickUpListMapping"("connection_id", "enabled");

CREATE UNIQUE INDEX "ClickUpStatusMapping_connection_id_clickup_status_key" ON "ClickUpStatusMapping"("connection_id", "clickup_status");
CREATE UNIQUE INDEX "ClickUpPriorityMapping_connection_id_clickup_priority_key" ON "ClickUpPriorityMapping"("connection_id", "clickup_priority");
CREATE UNIQUE INDEX "ClickUpUserMapping_connection_id_clickup_user_id_key" ON "ClickUpUserMapping"("connection_id", "clickup_user_id");
CREATE INDEX "ClickUpUserMapping_developer_id_idx" ON "ClickUpUserMapping"("developer_id");

CREATE INDEX "ExternalSyncRun_provider_started_at_idx" ON "ExternalSyncRun"("provider", "started_at");
CREATE INDEX "ExternalSyncRun_connection_id_idx" ON "ExternalSyncRun"("connection_id");
CREATE INDEX "ExternalSyncError_sync_run_id_idx" ON "ExternalSyncError"("sync_run_id");

CREATE UNIQUE INDEX "ClickUpWebhookDelivery_idempotency_key_key" ON "ClickUpWebhookDelivery"("idempotency_key");
CREATE INDEX "ClickUpWebhookDelivery_connection_id_idx" ON "ClickUpWebhookDelivery"("connection_id");

ALTER TABLE "ExternalWorkItem" ADD CONSTRAINT "ExternalWorkItem_triage_item_id_fkey" FOREIGN KEY ("triage_item_id") REFERENCES "TriageItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickUpConnection" ADD CONSTRAINT "ClickUpConnection_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickUpConnection" ADD CONSTRAINT "ClickUpConnection_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickUpListMapping" ADD CONSTRAINT "ClickUpListMapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClickUpStatusMapping" ADD CONSTRAINT "ClickUpStatusMapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClickUpPriorityMapping" ADD CONSTRAINT "ClickUpPriorityMapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClickUpUserMapping" ADD CONSTRAINT "ClickUpUserMapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClickUpUserMapping" ADD CONSTRAINT "ClickUpUserMapping_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalSyncRun" ADD CONSTRAINT "ExternalSyncRun_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalSyncError" ADD CONSTRAINT "ExternalSyncError_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "ExternalSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClickUpWebhookDelivery" ADD CONSTRAINT "ClickUpWebhookDelivery_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ClickUpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Microsoft To Do rows into ExternalWorkItem
INSERT INTO "ExternalWorkItem" (
  "id",
  "provider",
  "connection_key",
  "list_id",
  "external_id",
  "external_url",
  "title",
  "external_status",
  "last_synced_at",
  "sync_state",
  "triage_item_id",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || t."id")::uuid::text,
  'microsoft_todo'::"ExternalProvider",
  'm365',
  t."graphTodoListId",
  t."graphTodoTaskId",
  t."graphWebLink",
  t."title",
  t."status"::text,
  t."lastTodoSyncedAt",
  'idle'::"ExternalSyncState",
  t."id",
  NOW(),
  NOW()
FROM "TriageItem" t
WHERE t."graphTodoListId" IS NOT NULL
  AND t."graphTodoTaskId" IS NOT NULL
ON CONFLICT ("provider", "connection_key", "external_id") DO NOTHING;

INSERT INTO "MicrosoftTodoSyncSettings" ("id", "auto_sync_enabled", "connected_list_ids", "updatedAt")
VALUES ('default', false, '[]', NOW())
ON CONFLICT ("id") DO NOTHING;
