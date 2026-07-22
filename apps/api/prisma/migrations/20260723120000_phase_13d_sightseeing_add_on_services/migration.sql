-- Phase 13D: Sightseeing and Add-On Services masters.
-- Purely additive: two new tables plus new enum values. Nothing existing is
-- modified or dropped.

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_RESTORED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_REORDERED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SIGHTSEEING_IMAGE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADD_ON_SERVICE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADD_ON_SERVICE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADD_ON_SERVICE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADD_ON_SERVICE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADD_ON_SERVICE_RESTORED';

CREATE TABLE "sightseeings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "cityId" UUID NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "normalizedTitle" VARCHAR(250) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "estimatedHours" DECIMAL(5,2),
    "suggestedStartTime" VARCHAR(5),
    "description" TEXT,
    "remarks" TEXT,
    "imageStorageProvider" "StorageProvider",
    "imageBucket" VARCHAR(255),
    "imageObjectKey" VARCHAR(1000),
    "imageFileName" VARCHAR(255),
    "imageMimeType" VARCHAR(120),
    "imageFileSize" INTEGER,
    "imageConfirmedAt" TIMESTAMP(3),
    "pendingImageObjectKey" VARCHAR(1000),
    "pendingImageFileName" VARCHAR(255),
    "pendingImageMimeType" VARCHAR(120),
    "pendingImageFileSize" INTEGER,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sightseeings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "add_on_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "add_on_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sightseeings_companyId_cityId_normalizedTitle_key" ON "sightseeings"("companyId", "cityId", "normalizedTitle");
CREATE INDEX "sightseeings_companyId_status_deletedAt_idx" ON "sightseeings"("companyId", "status", "deletedAt");
CREATE INDEX "sightseeings_companyId_destinationId_cityId_sequence_idx" ON "sightseeings"("companyId", "destinationId", "cityId", "sequence");
CREATE INDEX "sightseeings_companyId_cityId_sequence_idx" ON "sightseeings"("companyId", "cityId", "sequence");
CREATE INDEX "sightseeings_companyId_normalizedTitle_idx" ON "sightseeings"("companyId", "normalizedTitle");
CREATE INDEX "sightseeings_destinationId_idx" ON "sightseeings"("destinationId");
CREATE INDEX "sightseeings_cityId_idx" ON "sightseeings"("cityId");
CREATE INDEX "sightseeings_createdById_idx" ON "sightseeings"("createdById");
CREATE INDEX "sightseeings_updatedById_idx" ON "sightseeings"("updatedById");

CREATE UNIQUE INDEX "add_on_services_companyId_normalizedName_key" ON "add_on_services"("companyId", "normalizedName");
CREATE INDEX "add_on_services_companyId_status_deletedAt_idx" ON "add_on_services"("companyId", "status", "deletedAt");
CREATE INDEX "add_on_services_companyId_normalizedName_idx" ON "add_on_services"("companyId", "normalizedName");
CREATE INDEX "add_on_services_createdById_idx" ON "add_on_services"("createdById");
CREATE INDEX "add_on_services_updatedById_idx" ON "add_on_services"("updatedById");

ALTER TABLE "sightseeings" ADD CONSTRAINT "sightseeings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sightseeings" ADD CONSTRAINT "sightseeings_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sightseeings" ADD CONSTRAINT "sightseeings_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sightseeings" ADD CONSTRAINT "sightseeings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sightseeings" ADD CONSTRAINT "sightseeings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "add_on_services" ADD CONSTRAINT "add_on_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "add_on_services" ADD CONSTRAINT "add_on_services_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "add_on_services" ADD CONSTRAINT "add_on_services_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
