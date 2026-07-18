-- Migrate legacy Forge roles to forge_mobile_lead
UPDATE "User" SET role = 'forge_mobile_lead' WHERE role IN ('forge_admin', 'forge_pm');

-- Shared delivery paths (bank default + application override)
ALTER TABLE "ForgeBank" ADD COLUMN IF NOT EXISTS "shared_delivery_path" TEXT;
ALTER TABLE "ForgeApplication" ADD COLUMN IF NOT EXISTS "shared_delivery_path" TEXT;

-- Build request publish / PM notify + delivery status
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "publish_to_shared_folder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "notify_email" TEXT;
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "shared_delivery_path" TEXT;
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "shared_delivery_file_name" TEXT;
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "shared_delivery_status" TEXT;
ALTER TABLE "ForgeBuildRequest" ADD COLUMN IF NOT EXISTS "shared_delivery_error" TEXT;
