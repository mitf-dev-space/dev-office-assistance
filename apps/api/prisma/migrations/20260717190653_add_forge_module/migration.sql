-- CreateEnum
CREATE TYPE "ForgePlatform" AS ENUM ('Android', 'iOS');

-- CreateEnum
CREATE TYPE "ForgeBuildStatus" AS ENUM ('Draft', 'Queued', 'WaitingForCompatibleRunner', 'Claimed', 'PreparingWorkspace', 'CloningRepository', 'Building', 'Signing', 'CollectingArtifact', 'UploadingArtifact', 'Succeeded', 'Failed', 'Cancelled', 'TimedOut', 'PartiallySucceeded', 'InProgress', 'SimulationCompleted');

-- CreateEnum
CREATE TYPE "ForgeRunnerStatus" AS ENUM ('Online', 'Offline', 'Draining');

-- CreateEnum
CREATE TYPE "ForgeOperatingSystem" AS ENUM ('Windows', 'macOS', 'Linux');

-- AlterTable
ALTER TABLE "M365AppSettings" ALTER COLUMN "id" SET DEFAULT 'default';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ForgeBank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForgeBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeApplication" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repositoryProvider" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "repositoryCredentialRef" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "requiredFlutterVersion" TEXT,
    "androidEnabled" BOOLEAN NOT NULL DEFAULT true,
    "iosEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForgeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeBuildProfile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flutterFlavor" TEXT,
    "dartEntryPoint" TEXT NOT NULL DEFAULT 'lib/main.dart',
    "environmentName" TEXT,
    "androidArtifactType" TEXT NOT NULL DEFAULT 'apk',
    "androidBuildMode" TEXT NOT NULL DEFAULT 'release',
    "iosExportMethod" TEXT,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForgeBuildProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeBuildRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "buildProfileId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "gitReferenceType" TEXT NOT NULL DEFAULT 'branch',
    "gitReference" TEXT NOT NULL,
    "resolvedCommitSha" TEXT,
    "requestNote" TEXT,
    "overallStatus" "ForgeBuildStatus" NOT NULL DEFAULT 'Queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAtUtc" TIMESTAMP(3),
    "completedAtUtc" TIMESTAMP(3),

    CONSTRAINT "ForgeBuildRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgePlatformBuild" (
    "id" TEXT NOT NULL,
    "buildRequestId" TEXT NOT NULL,
    "platform" "ForgePlatform" NOT NULL,
    "status" "ForgeBuildStatus" NOT NULL DEFAULT 'Queued',
    "runnerId" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "simulationOnly" BOOLEAN NOT NULL DEFAULT false,
    "queuedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAtUtc" TIMESTAMP(3),
    "completedAtUtc" TIMESTAMP(3),
    "failureCategory" TEXT,
    "failureSummary" TEXT,

    CONSTRAINT "ForgePlatformBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeArtifact" (
    "id" TEXT NOT NULL,
    "platformBuildId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "checksumSha256" TEXT,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAtUtc" TIMESTAMP(3),

    CONSTRAINT "ForgeArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeRunner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operatingSystem" "ForgeOperatingSystem" NOT NULL,
    "architecture" TEXT NOT NULL,
    "supportedPlatforms" "ForgePlatform"[],
    "capabilities" JSONB NOT NULL,
    "status" "ForgeRunnerStatus" NOT NULL DEFAULT 'Offline',
    "tokenHash" TEXT,
    "tokenHint" TEXT,
    "lastHeartbeatAtUtc" TIMESTAMP(3),
    "maximumConcurrentJobs" INTEGER NOT NULL DEFAULT 1,
    "currentJobCount" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForgeRunner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForgeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForgeBank_code_key" ON "ForgeBank"("code");

-- CreateIndex
CREATE INDEX "ForgeApplication_bankId_idx" ON "ForgeApplication"("bankId");

-- CreateIndex
CREATE INDEX "ForgeBuildProfile_applicationId_idx" ON "ForgeBuildProfile"("applicationId");

-- CreateIndex
CREATE INDEX "ForgeBuildRequest_applicationId_idx" ON "ForgeBuildRequest"("applicationId");

-- CreateIndex
CREATE INDEX "ForgeBuildRequest_requestedById_idx" ON "ForgeBuildRequest"("requestedById");

-- CreateIndex
CREATE INDEX "ForgeBuildRequest_overallStatus_idx" ON "ForgeBuildRequest"("overallStatus");

-- CreateIndex
CREATE INDEX "ForgePlatformBuild_buildRequestId_idx" ON "ForgePlatformBuild"("buildRequestId");

-- CreateIndex
CREATE INDEX "ForgePlatformBuild_status_idx" ON "ForgePlatformBuild"("status");

-- CreateIndex
CREATE INDEX "ForgePlatformBuild_runnerId_idx" ON "ForgePlatformBuild"("runnerId");

-- CreateIndex
CREATE INDEX "ForgeArtifact_platformBuildId_idx" ON "ForgeArtifact"("platformBuildId");

-- CreateIndex
CREATE UNIQUE INDEX "ForgeRunner_name_key" ON "ForgeRunner"("name");

-- CreateIndex
CREATE INDEX "ForgeAuditLog_createdAt_idx" ON "ForgeAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ForgeAuditLog_entityType_entityId_idx" ON "ForgeAuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ForgeApplication" ADD CONSTRAINT "ForgeApplication_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "ForgeBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeBuildProfile" ADD CONSTRAINT "ForgeBuildProfile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ForgeApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeBuildRequest" ADD CONSTRAINT "ForgeBuildRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ForgeApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeBuildRequest" ADD CONSTRAINT "ForgeBuildRequest_buildProfileId_fkey" FOREIGN KEY ("buildProfileId") REFERENCES "ForgeBuildProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeBuildRequest" ADD CONSTRAINT "ForgeBuildRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgePlatformBuild" ADD CONSTRAINT "ForgePlatformBuild_buildRequestId_fkey" FOREIGN KEY ("buildRequestId") REFERENCES "ForgeBuildRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgePlatformBuild" ADD CONSTRAINT "ForgePlatformBuild_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "ForgeRunner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgeArtifact" ADD CONSTRAINT "ForgeArtifact_platformBuildId_fkey" FOREIGN KEY ("platformBuildId") REFERENCES "ForgePlatformBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
