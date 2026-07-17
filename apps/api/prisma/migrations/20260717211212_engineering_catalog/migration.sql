-- CreateEnum
CREATE TYPE "RepositoryProviderKind" AS ENUM ('gitlab', 'github', 'azure_devops', 'other');

-- CreateEnum
CREATE TYPE "RepositoryLifecycleState" AS ENUM ('proposed', 'preparing', 'active', 'maintenance', 'deprecated', 'archived', 'unavailable');

-- CreateEnum
CREATE TYPE "RepositoryConnectivityState" AS ENUM ('unknown', 'reachable', 'authentication_failed', 'permission_denied', 'not_found', 'network_error', 'tls_error', 'provider_error');

-- CreateEnum
CREATE TYPE "RepositoryFreshnessState" AS ENUM ('current', 'stale', 'never_synchronized', 'partially_synchronized', 'synchronization_failed');

-- CreateEnum
CREATE TYPE "SignalState" AS ENUM ('unknown', 'not_applicable', 'declared', 'detected', 'passing', 'failing', 'stale', 'inherited', 'manually_overridden', 'missing', 'configured');

-- CreateEnum
CREATE TYPE "BranchClassification" AS ENUM ('main', 'development', 'feature', 'release', 'hotfix', 'bank_specific', 'unknown');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('created', 'waiting', 'preparing', 'pending', 'running', 'success', 'failed', 'canceled', 'skipped', 'manual', 'scheduled', 'blocked', 'unknown');

-- CreateEnum
CREATE TYPE "JobClassification" AS ENUM ('build', 'unit_test', 'integration_test', 'end_to_end_test', 'static_analysis', 'lint', 'security_scan', 'dependency_scan', 'secret_scan', 'package', 'deploy', 'release', 'unknown');

-- CreateEnum
CREATE TYPE "ComponentDependencyKind" AS ENUM ('depends_on', 'provides_api_to', 'shared_core_for', 'deployed_with', 'replaces', 'supersedes', 'bank_variant_of');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('pending', 'leased', 'running', 'completed', 'failed', 'dead_letter', 'cancelled');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('uploaded', 'parsing', 'validating', 'preview', 'committing', 'completed', 'failed', 'rolled_back');

-- AlterTable
ALTER TABLE "ForgeApplication" ADD COLUMN     "catalog_application_id" TEXT,
ADD COLUMN     "repository_id" TEXT;

-- CreateTable
CREATE TABLE "CatalogTeam" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dev_team_slug" "DevTeam",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogTeamAssignment" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "developer_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSystem" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogApplication" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "application_type_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "component_type_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criticality" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentDependency" (
    "id" TEXT NOT NULL,
    "from_component_id" TEXT NOT NULL,
    "to_component_id" TEXT NOT NULL,
    "kind" "ComponentDependencyKind" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryConnection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_kind" "RepositoryProviderKind" NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_url" TEXT NOT NULL,
    "encrypted_token" TEXT,
    "tls_ca_file" TEXT,
    "webhook_secret" TEXT,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "team_id" TEXT,
    "component_id" TEXT,
    "name" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "normalized_project_path" TEXT NOT NULL,
    "provider_project_id" TEXT,
    "default_branch" TEXT,
    "reported_main_branch" TEXT,
    "reported_development_branch" TEXT,
    "reported_pipeline_state" TEXT,
    "reported_unit_test_state" "SignalState",
    "reported_static_analysis_state" "SignalState",
    "reported_source" TEXT,
    "reported_at" TIMESTAMP(3),
    "lifecycle_state" "RepositoryLifecycleState" NOT NULL DEFAULT 'proposed',
    "connectivity_state" "RepositoryConnectivityState" NOT NULL DEFAULT 'unknown',
    "freshness_state" "RepositoryFreshnessState" NOT NULL DEFAULT 'never_synchronized',
    "technical_owner_id" TEXT,
    "business_owner_note" TEXT,
    "criticality" TEXT,
    "production_impact" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryOriginHistory" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "normalized_project_path" TEXT NOT NULL,
    "provider_project_id" TEXT,
    "provider_kind" "RepositoryProviderKind" NOT NULL,
    "default_branch" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "migrated_by_user_id" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryOriginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryBranch" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "origin_history_id" TEXT,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_protected" BOOLEAN NOT NULL DEFAULT false,
    "classification" "BranchClassification" NOT NULL DEFAULT 'unknown',
    "latest_commit_sha" TEXT,
    "latest_commit_title" TEXT,
    "latest_commit_author" TEXT,
    "latest_commit_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryCommitSnapshot" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author_name" TEXT,
    "author_email" TEXT,
    "committed_at" TIMESTAMP(3) NOT NULL,
    "branch_name" TEXT,
    "web_url" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryCommitSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeRequestSnapshot" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "provider_mr_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "source_branch" TEXT NOT NULL,
    "target_branch" TEXT NOT NULL,
    "author_name" TEXT,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "web_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeRequestSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "provider_run_id" TEXT NOT NULL,
    "status" "PipelineStatus" NOT NULL DEFAULT 'unknown',
    "ref" TEXT,
    "sha" TEXT,
    "web_url" TEXT,
    "source" TEXT,
    "duration_seconds" INTEGER,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "pipeline_run_id" TEXT NOT NULL,
    "provider_job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT,
    "status" "PipelineStatus" NOT NULL DEFAULT 'unknown',
    "classification" "JobClassification" NOT NULL DEFAULT 'unknown',
    "duration_seconds" INTEGER,
    "coverage_percent" DOUBLE PRECISION,
    "web_url" TEXT,
    "allow_failure" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryCheckDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryCheckDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryCheckResult" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "check_definition_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "value" TEXT,
    "evidence_source" TEXT,
    "evidence_url" TEXT,
    "source_type" TEXT,
    "confidence" DOUBLE PRECISION,
    "detected_at" TIMESTAMP(3),
    "effective_at" TIMESTAMP(3),
    "stale_after" TIMESTAMP(3),
    "notes" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardPolicy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "component_type_id" TEXT,
    "weights" JSONB NOT NULL,
    "enforce_on_build" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardPolicyCheck" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "check_definition_id" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScorecardPolicyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardSnapshot" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "scores" JSONB NOT NULL,
    "overall_score" DOUBLE PRECISION,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScorecardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalOverride" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "signal_key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "base_url" TEXT,
    "monitoring_url" TEXT,
    "logging_url" TEXT,
    "runbook_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "environment_id" TEXT,
    "commit_sha" TEXT,
    "status" TEXT NOT NULL,
    "deployed_at" TIMESTAMP(3),
    "web_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankApplicationLink" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "forge_bank_id" TEXT,
    "bank_code" TEXT,
    "bank_name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankApplicationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedCoreRelationship" (
    "id" TEXT NOT NULL,
    "source_application_id" TEXT NOT NULL,
    "target_application_id" TEXT NOT NULL,
    "inherited_checks" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCoreRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryImportJob" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'uploaded',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryImportRow" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "match_status" TEXT NOT NULL DEFAULT 'pending',
    "repository_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportConflict" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "reported" TEXT,
    "detected" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT,
    "connection_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "items_synced" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringGap" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "check_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "owner_team_id" TEXT,
    "triage_item_id" TEXT,
    "planning_item_id" TEXT,
    "target_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAlert" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "resolved_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogTeam_slug_key" ON "CatalogTeam"("slug");

-- CreateIndex
CREATE INDEX "CatalogTeamAssignment_team_id_idx" ON "CatalogTeamAssignment"("team_id");

-- CreateIndex
CREATE INDEX "CatalogTeamAssignment_user_id_idx" ON "CatalogTeamAssignment"("user_id");

-- CreateIndex
CREATE INDEX "CatalogTeamAssignment_developer_id_idx" ON "CatalogTeamAssignment"("developer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationType_slug_key" ON "ApplicationType"("slug");

-- CreateIndex
CREATE INDEX "CatalogSystem_team_id_idx" ON "CatalogSystem"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSystem_team_id_slug_key" ON "CatalogSystem"("team_id", "slug");

-- CreateIndex
CREATE INDEX "CatalogApplication_system_id_idx" ON "CatalogApplication"("system_id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogApplication_system_id_slug_key" ON "CatalogApplication"("system_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentType_slug_key" ON "ComponentType"("slug");

-- CreateIndex
CREATE INDEX "Component_application_id_idx" ON "Component"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "Component_application_id_slug_key" ON "Component"("application_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentDependency_from_component_id_to_component_id_kind_key" ON "ComponentDependency"("from_component_id", "to_component_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryConnection_slug_key" ON "RepositoryConnection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_component_id_key" ON "Repository"("component_id");

-- CreateIndex
CREATE INDEX "Repository_team_id_idx" ON "Repository"("team_id");

-- CreateIndex
CREATE INDEX "Repository_lifecycle_state_idx" ON "Repository"("lifecycle_state");

-- CreateIndex
CREATE INDEX "Repository_freshness_state_idx" ON "Repository"("freshness_state");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_connection_id_normalized_project_path_key" ON "Repository"("connection_id", "normalized_project_path");

-- CreateIndex
CREATE INDEX "RepositoryOriginHistory_repository_id_idx" ON "RepositoryOriginHistory"("repository_id");

-- CreateIndex
CREATE INDEX "RepositoryBranch_repository_id_idx" ON "RepositoryBranch"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryBranch_repository_id_name_key" ON "RepositoryBranch"("repository_id", "name");

-- CreateIndex
CREATE INDEX "RepositoryCommitSnapshot_repository_id_committed_at_idx" ON "RepositoryCommitSnapshot"("repository_id", "committed_at");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryCommitSnapshot_repository_id_sha_key" ON "RepositoryCommitSnapshot"("repository_id", "sha");

-- CreateIndex
CREATE INDEX "MergeRequestSnapshot_repository_id_idx" ON "MergeRequestSnapshot"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "MergeRequestSnapshot_repository_id_provider_mr_id_key" ON "MergeRequestSnapshot"("repository_id", "provider_mr_id");

-- CreateIndex
CREATE INDEX "PipelineRun_repository_id_finished_at_idx" ON "PipelineRun"("repository_id", "finished_at");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_repository_id_provider_run_id_key" ON "PipelineRun"("repository_id", "provider_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJob_pipeline_run_id_provider_job_id_key" ON "PipelineJob"("pipeline_run_id", "provider_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryCheckDefinition_slug_key" ON "RepositoryCheckDefinition"("slug");

-- CreateIndex
CREATE INDEX "RepositoryCheckResult_repository_id_idx" ON "RepositoryCheckResult"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "ScorecardPolicy_slug_key" ON "ScorecardPolicy"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ScorecardPolicyCheck_policy_id_check_definition_id_key" ON "ScorecardPolicyCheck"("policy_id", "check_definition_id");

-- CreateIndex
CREATE INDEX "ScorecardSnapshot_repository_id_captured_at_idx" ON "ScorecardSnapshot"("repository_id", "captured_at");

-- CreateIndex
CREATE INDEX "SignalOverride_repository_id_idx" ON "SignalOverride"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_application_id_slug_key" ON "Environment"("application_id", "slug");

-- CreateIndex
CREATE INDEX "Deployment_repository_id_idx" ON "Deployment"("repository_id");

-- CreateIndex
CREATE INDEX "ExternalLink_repository_id_idx" ON "ExternalLink"("repository_id");

-- CreateIndex
CREATE INDEX "BankApplicationLink_application_id_idx" ON "BankApplicationLink"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "SharedCoreRelationship_source_application_id_target_applica_key" ON "SharedCoreRelationship"("source_application_id", "target_application_id");

-- CreateIndex
CREATE INDEX "RepositoryImportRow_import_job_id_idx" ON "RepositoryImportRow"("import_job_id");

-- CreateIndex
CREATE INDEX "ImportConflict_import_job_id_idx" ON "ImportConflict"("import_job_id");

-- CreateIndex
CREATE INDEX "SyncRun_repository_id_idx" ON "SyncRun"("repository_id");

-- CreateIndex
CREATE INDEX "SyncRun_started_at_idx" ON "SyncRun"("started_at");

-- CreateIndex
CREATE INDEX "SyncError_sync_run_id_idx" ON "SyncError"("sync_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_idempotency_key_key" ON "WebhookDelivery"("idempotency_key");

-- CreateIndex
CREATE INDEX "WebhookDelivery_connection_id_idx" ON "WebhookDelivery"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_idempotency_key_key" ON "BackgroundJob"("idempotency_key");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_scheduled_for_idx" ON "BackgroundJob"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_type_entity_id_idx" ON "AuditEvent"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EngineeringGap_repository_id_idx" ON "EngineeringGap"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringGap_repository_id_check_slug_status_key" ON "EngineeringGap"("repository_id", "check_slug", "status");

-- CreateIndex
CREATE INDEX "CatalogAlert_is_active_idx" ON "CatalogAlert"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAlert_fingerprint_key" ON "CatalogAlert"("fingerprint");

-- CreateIndex
CREATE INDEX "ForgeApplication_catalog_application_id_idx" ON "ForgeApplication"("catalog_application_id");

-- CreateIndex
CREATE INDEX "ForgeApplication_repository_id_idx" ON "ForgeApplication"("repository_id");

-- AddForeignKey
ALTER TABLE "ForgeApplication" ADD CONSTRAINT "ForgeApplication_catalog_application_id_fkey" FOREIGN KEY ("catalog_application_id") REFERENCES "CatalogApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeApplication" ADD CONSTRAINT "ForgeApplication_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTeamAssignment" ADD CONSTRAINT "CatalogTeamAssignment_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CatalogTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTeamAssignment" ADD CONSTRAINT "CatalogTeamAssignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTeamAssignment" ADD CONSTRAINT "CatalogTeamAssignment_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "Developer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSystem" ADD CONSTRAINT "CatalogSystem_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CatalogTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogApplication" ADD CONSTRAINT "CatalogApplication_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "CatalogSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogApplication" ADD CONSTRAINT "CatalogApplication_application_type_id_fkey" FOREIGN KEY ("application_type_id") REFERENCES "ApplicationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "CatalogApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_component_type_id_fkey" FOREIGN KEY ("component_type_id") REFERENCES "ComponentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentDependency" ADD CONSTRAINT "ComponentDependency_from_component_id_fkey" FOREIGN KEY ("from_component_id") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentDependency" ADD CONSTRAINT "ComponentDependency_to_component_id_fkey" FOREIGN KEY ("to_component_id") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "RepositoryConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CatalogTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_technical_owner_id_fkey" FOREIGN KEY ("technical_owner_id") REFERENCES "Developer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryOriginHistory" ADD CONSTRAINT "RepositoryOriginHistory_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryOriginHistory" ADD CONSTRAINT "RepositoryOriginHistory_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "RepositoryConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryOriginHistory" ADD CONSTRAINT "RepositoryOriginHistory_migrated_by_user_id_fkey" FOREIGN KEY ("migrated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryBranch" ADD CONSTRAINT "RepositoryBranch_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryCommitSnapshot" ADD CONSTRAINT "RepositoryCommitSnapshot_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeRequestSnapshot" ADD CONSTRAINT "MergeRequestSnapshot_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryCheckResult" ADD CONSTRAINT "RepositoryCheckResult_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryCheckResult" ADD CONSTRAINT "RepositoryCheckResult_check_definition_id_fkey" FOREIGN KEY ("check_definition_id") REFERENCES "RepositoryCheckDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardPolicy" ADD CONSTRAINT "ScorecardPolicy_component_type_id_fkey" FOREIGN KEY ("component_type_id") REFERENCES "ComponentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardPolicyCheck" ADD CONSTRAINT "ScorecardPolicyCheck_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "ScorecardPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardPolicyCheck" ADD CONSTRAINT "ScorecardPolicyCheck_check_definition_id_fkey" FOREIGN KEY ("check_definition_id") REFERENCES "RepositoryCheckDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardSnapshot" ADD CONSTRAINT "ScorecardSnapshot_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardSnapshot" ADD CONSTRAINT "ScorecardSnapshot_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "ScorecardPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOverride" ADD CONSTRAINT "SignalOverride_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOverride" ADD CONSTRAINT "SignalOverride_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "CatalogApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankApplicationLink" ADD CONSTRAINT "BankApplicationLink_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "CatalogApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankApplicationLink" ADD CONSTRAINT "BankApplicationLink_forge_bank_id_fkey" FOREIGN KEY ("forge_bank_id") REFERENCES "ForgeBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCoreRelationship" ADD CONSTRAINT "SharedCoreRelationship_source_application_id_fkey" FOREIGN KEY ("source_application_id") REFERENCES "CatalogApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCoreRelationship" ADD CONSTRAINT "SharedCoreRelationship_target_application_id_fkey" FOREIGN KEY ("target_application_id") REFERENCES "CatalogApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryImportJob" ADD CONSTRAINT "RepositoryImportJob_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryImportRow" ADD CONSTRAINT "RepositoryImportRow_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "RepositoryImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryImportRow" ADD CONSTRAINT "RepositoryImportRow_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportConflict" ADD CONSTRAINT "ImportConflict_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "RepositoryImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "RepositoryConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "RepositoryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGap" ADD CONSTRAINT "EngineeringGap_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGap" ADD CONSTRAINT "EngineeringGap_owner_team_id_fkey" FOREIGN KEY ("owner_team_id") REFERENCES "CatalogTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGap" ADD CONSTRAINT "EngineeringGap_triage_item_id_fkey" FOREIGN KEY ("triage_item_id") REFERENCES "TriageItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringGap" ADD CONSTRAINT "EngineeringGap_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "PlanningItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAlert" ADD CONSTRAINT "CatalogAlert_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
