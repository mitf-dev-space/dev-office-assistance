-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "incident_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reporter_developer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "incident_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAttachment" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentInvolvement" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentInvolvement_pkey" PRIMARY KEY ("id")
);

-- Migrate existing data from the legacy HrIncident tables (if present).
-- The legacy schema used a single employeeDeveloperId; we map it to the
-- reporter (reporterDeveloperId) and create an involvement row for the
-- employee. incidentDate (date) becomes incident_at (timestamp).
INSERT INTO "Incident" ("id", "incident_number", "title", "description", "reporter_developer_id", "created_by_id", "incident_at", "createdAt", "updatedAt")
SELECT
    "id",
    'INC-' || lpad(row_number() OVER (ORDER BY "createdAt")::text, 4, '0'),
    "title",
    "description",
    "reporterDeveloperId",
    "createdById",
    "incidentDate",
    "createdAt",
    "updatedAt"
FROM "HrIncident";

INSERT INTO "IncidentAttachment" ("id", "incident_id", "original_name", "mime_type", "size_bytes", "storage_key", "created_by_id", "createdAt")
SELECT "id", "incidentId", "originalName", "mimeType", "sizeBytes", "storageKey", "createdById", "createdAt"
FROM "HrIncidentAttachment";

-- Create involvement rows for the legacy single employee (skip if the employee
-- is the same as the reporter to avoid a self-involvement duplicate).
INSERT INTO "IncidentInvolvement" ("id", "incident_id", "developer_id", "createdAt")
SELECT gen_random_uuid(), h."id", h."employeeDeveloperId", h."createdAt"
FROM "HrIncident" h
WHERE h."employeeDeveloperId" IS NOT NULL
  AND h."employeeDeveloperId" <> h."reporterDeveloperId";

-- Drop legacy tables (data has been migrated above).
DROP TABLE "HrIncidentAttachment";
DROP TABLE "HrIncident";

-- CreateIndex
CREATE UNIQUE INDEX "Incident_incident_number_key" ON "Incident"("incident_number");

-- CreateIndex
CREATE INDEX "Incident_incident_number_idx" ON "Incident"("incident_number");

-- CreateIndex
CREATE INDEX "Incident_incident_at_idx" ON "Incident"("incident_at");

-- CreateIndex
CREATE INDEX "Incident_reporter_developer_id_idx" ON "Incident"("reporter_developer_id");

-- CreateIndex
CREATE INDEX "Incident_created_by_id_idx" ON "Incident"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentAttachment_storage_key_key" ON "IncidentAttachment"("storage_key");

-- CreateIndex
CREATE INDEX "IncidentAttachment_incident_id_idx" ON "IncidentAttachment"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentInvolvement_incident_id_developer_id_key" ON "IncidentInvolvement"("incident_id", "developer_id");

-- CreateIndex
CREATE INDEX "IncidentInvolvement_developer_id_idx" ON "IncidentInvolvement"("developer_id");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reporter_developer_id_fkey" FOREIGN KEY ("reporter_developer_id") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAttachment" ADD CONSTRAINT "IncidentAttachment_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAttachment" ADD CONSTRAINT "IncidentAttachment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvolvement" ADD CONSTRAINT "IncidentInvolvement_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvolvement" ADD CONSTRAINT "IncidentInvolvement_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
