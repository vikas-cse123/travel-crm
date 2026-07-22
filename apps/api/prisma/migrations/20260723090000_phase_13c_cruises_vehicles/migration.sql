-- Phase 13C: Cruise and Vehicle masters.
-- Purely additive: two new tables plus one child table and new enum values.
-- No existing table, column or constraint is modified or dropped.

-- New activity actions ------------------------------------------------------
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_RESTORED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CRUISE_IMAGE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_RESTORED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VEHICLE_IMAGE_DELETED';

-- Cruises -------------------------------------------------------------------
CREATE TABLE "cruises" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "description" TEXT,
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

    CONSTRAINT "cruises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cruise_room_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "cruiseId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cruise_room_types_pkey" PRIMARY KEY ("id")
);

-- Vehicles ------------------------------------------------------------------
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "vehicleType" VARCHAR(120) NOT NULL,
    "capacity" INTEGER,
    "description" TEXT,
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

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- Indexes -------------------------------------------------------------------
CREATE UNIQUE INDEX "cruises_companyId_normalizedName_key" ON "cruises"("companyId", "normalizedName");
CREATE INDEX "cruises_companyId_status_deletedAt_idx" ON "cruises"("companyId", "status", "deletedAt");
CREATE INDEX "cruises_companyId_normalizedName_idx" ON "cruises"("companyId", "normalizedName");
CREATE INDEX "cruises_createdById_idx" ON "cruises"("createdById");
CREATE INDEX "cruises_updatedById_idx" ON "cruises"("updatedById");

CREATE INDEX "cruise_room_types_companyId_cruiseId_idx" ON "cruise_room_types"("companyId", "cruiseId");
CREATE INDEX "cruise_room_types_cruiseId_sortOrder_idx" ON "cruise_room_types"("cruiseId", "sortOrder");

CREATE UNIQUE INDEX "vehicles_companyId_normalizedName_key" ON "vehicles"("companyId", "normalizedName");
CREATE INDEX "vehicles_companyId_status_deletedAt_idx" ON "vehicles"("companyId", "status", "deletedAt");
CREATE INDEX "vehicles_companyId_vehicleType_idx" ON "vehicles"("companyId", "vehicleType");
CREATE INDEX "vehicles_companyId_normalizedName_idx" ON "vehicles"("companyId", "normalizedName");
CREATE INDEX "vehicles_createdById_idx" ON "vehicles"("createdById");
CREATE INDEX "vehicles_updatedById_idx" ON "vehicles"("updatedById");

-- Foreign keys --------------------------------------------------------------
ALTER TABLE "cruises" ADD CONSTRAINT "cruises_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cruises" ADD CONSTRAINT "cruises_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cruises" ADD CONSTRAINT "cruises_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cruise_room_types" ADD CONSTRAINT "cruise_room_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cruise_room_types" ADD CONSTRAINT "cruise_room_types_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "cruises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
