CREATE TYPE "MasterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "DestinationType" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

ALTER TYPE "ActivityAction" ADD VALUE 'CITY_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CITY_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CITY_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'CITY_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_CITY_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_CITY_REMOVED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_CITY_REORDERED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE 'DESTINATION_IMAGE_DELETED';

CREATE TABLE "cities" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "countryName" VARCHAR(120) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalizedName" VARCHAR(160) NOT NULL,
  "airportCode" VARCHAR(3),
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destinations" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "countryName" VARCHAR(120) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalizedName" VARCHAR(200) NOT NULL,
  "destinationType" "DestinationType" NOT NULL,
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
  "inclusions" TEXT,
  "exclusions" TEXT,
  "paymentPolicies" TEXT,
  "cancellationPolicies" TEXT,
  "bookingTerms" TEXT,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destination_cities" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "destinationId" UUID NOT NULL,
  "cityId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "destination_cities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cities_companyId_countryCode_normalizedName_idx" ON "cities"("companyId", "countryCode", "normalizedName");
CREATE INDEX "cities_companyId_status_deletedAt_idx" ON "cities"("companyId", "status", "deletedAt");
CREATE INDEX "cities_companyId_airportCode_idx" ON "cities"("companyId", "airportCode");
CREATE INDEX "cities_createdById_idx" ON "cities"("createdById");
CREATE UNIQUE INDEX "cities_active_name_unique" ON "cities"("companyId", "countryCode", "normalizedName") WHERE "deletedAt" IS NULL;

CREATE INDEX "destinations_companyId_countryCode_normalizedName_idx" ON "destinations"("companyId", "countryCode", "normalizedName");
CREATE INDEX "destinations_companyId_destinationType_status_deletedAt_idx" ON "destinations"("companyId", "destinationType", "status", "deletedAt");
CREATE INDEX "destinations_companyId_createdAt_idx" ON "destinations"("companyId", "createdAt");
CREATE INDEX "destinations_createdById_idx" ON "destinations"("createdById");
CREATE UNIQUE INDEX "destinations_active_name_unique" ON "destinations"("companyId", "countryCode", "normalizedName") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "destination_cities_destinationId_cityId_key" ON "destination_cities"("destinationId", "cityId");
CREATE UNIQUE INDEX "destination_cities_destinationId_sequence_key" ON "destination_cities"("destinationId", "sequence");
CREATE INDEX "destination_cities_companyId_cityId_idx" ON "destination_cities"("companyId", "cityId");

ALTER TABLE "cities" ADD CONSTRAINT "cities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cities" ADD CONSTRAINT "cities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "destination_cities" ADD CONSTRAINT "destination_cities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_cities" ADD CONSTRAINT "destination_cities_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_cities" ADD CONSTRAINT "destination_cities_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
