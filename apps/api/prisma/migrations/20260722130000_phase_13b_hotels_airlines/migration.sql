CREATE TYPE "HotelMealPlanType" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE', 'CUSTOM');

ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_DEFAULT_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_IMAGE_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_IMAGE_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_IMAGE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_ROOM_TYPE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_ROOM_TYPE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_ROOM_TYPE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_MEAL_PLAN_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_MEAL_PLAN_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'HOTEL_MEAL_PLAN_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_LOGO_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_LOGO_REPLACED';
ALTER TYPE "ActivityAction" ADD VALUE 'AIRLINE_LOGO_DELETED';

CREATE TABLE "hotels" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "destinationId" UUID NOT NULL,
  "cityId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalizedName" VARCHAR(200) NOT NULL,
  "starCategory" INTEGER,
  "starRating" DECIMAL(2,1),
  "propertyType" VARCHAR(80),
  "address" VARCHAR(1000),
  "landmark" VARCHAR(200),
  "postalCode" VARCHAR(20),
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "contactName" VARCHAR(160),
  "phone" VARCHAR(40),
  "email" VARCHAR(255),
  "website" VARCHAR(255),
  "reviewLink" VARCHAR(500),
  "checkInTime" VARCHAR(5),
  "checkOutTime" VARCHAR(5),
  "description" TEXT,
  "amenities" TEXT,
  "internalNotes" TEXT,
  "externalCode" VARCHAR(80),
  "isDefaultForCity" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hotel_room_types" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "hotelId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(40),
  "description" VARCHAR(2000),
  "maxAdults" INTEGER,
  "maxChildren" INTEGER,
  "maxOccupancy" INTEGER,
  "bedType" VARCHAR(80),
  "numberOfBeds" INTEGER,
  "roomSize" VARCHAR(60),
  "viewType" VARCHAR(80),
  "baseCost" DECIMAL(14,2),
  "sellingPrice" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "taxPercentage" DECIMAL(5,2),
  "internalNotes" VARCHAR(2000),
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hotel_room_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hotel_meal_plans" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "hotelId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(40),
  "type" "HotelMealPlanType" NOT NULL DEFAULT 'CUSTOM',
  "description" VARCHAR(2000),
  "baseCost" DECIMAL(14,2),
  "sellingPrice" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "internalNotes" VARCHAR(2000),
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hotel_meal_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "airlines" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalizedName" VARCHAR(200) NOT NULL,
  "iataCode" VARCHAR(2),
  "icaoCode" VARCHAR(3),
  "countryCode" CHAR(2),
  "countryName" VARCHAR(120),
  "website" VARCHAR(255),
  "internalNotes" TEXT,
  "logoStorageProvider" "StorageProvider",
  "logoBucket" VARCHAR(255),
  "logoObjectKey" VARCHAR(1000),
  "logoFileName" VARCHAR(255),
  "logoMimeType" VARCHAR(120),
  "logoFileSize" INTEGER,
  "logoConfirmedAt" TIMESTAMP(3),
  "pendingLogoObjectKey" VARCHAR(1000),
  "pendingLogoFileName" VARCHAR(255),
  "pendingLogoMimeType" VARCHAR(120),
  "pendingLogoFileSize" INTEGER,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "airlines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quotation_template_hotel_options" ADD COLUMN "hotelId" UUID;
ALTER TABLE "quotation_template_hotel_options" ADD COLUMN "hotelRoomTypeId" UUID;
ALTER TABLE "quotation_template_hotel_options" ADD COLUMN "hotelMealPlanId" UUID;
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN "hotelId" UUID;
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN "hotelRoomTypeId" UUID;
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN "hotelMealPlanId" UUID;

CREATE INDEX "hotels_companyId_cityId_normalizedName_idx" ON "hotels"("companyId", "cityId", "normalizedName");
CREATE INDEX "hotels_companyId_destinationId_idx" ON "hotels"("companyId", "destinationId");
CREATE INDEX "hotels_companyId_status_deletedAt_idx" ON "hotels"("companyId", "status", "deletedAt");
CREATE INDEX "hotels_companyId_cityId_isDefaultForCity_idx" ON "hotels"("companyId", "cityId", "isDefaultForCity");
CREATE INDEX "hotels_createdById_idx" ON "hotels"("createdById");
CREATE UNIQUE INDEX "hotels_active_name_unique" ON "hotels"("companyId", "cityId", "normalizedName") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "hotels_default_per_city_unique" ON "hotels"("companyId", "cityId") WHERE "isDefaultForCity" = true AND "deletedAt" IS NULL;

CREATE INDEX "hotel_room_types_companyId_hotelId_idx" ON "hotel_room_types"("companyId", "hotelId");
CREATE INDEX "hotel_room_types_hotelId_sortOrder_idx" ON "hotel_room_types"("hotelId", "sortOrder");

CREATE INDEX "hotel_meal_plans_companyId_hotelId_idx" ON "hotel_meal_plans"("companyId", "hotelId");
CREATE INDEX "hotel_meal_plans_hotelId_sortOrder_idx" ON "hotel_meal_plans"("hotelId", "sortOrder");

CREATE INDEX "airlines_companyId_normalizedName_idx" ON "airlines"("companyId", "normalizedName");
CREATE INDEX "airlines_companyId_status_deletedAt_idx" ON "airlines"("companyId", "status", "deletedAt");
CREATE INDEX "airlines_companyId_countryCode_idx" ON "airlines"("companyId", "countryCode");
CREATE INDEX "airlines_createdById_idx" ON "airlines"("createdById");
CREATE UNIQUE INDEX "airlines_active_name_unique" ON "airlines"("companyId", "normalizedName") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "airlines_active_iata_unique" ON "airlines"("companyId", "iataCode") WHERE "iataCode" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "airlines_active_icao_unique" ON "airlines"("companyId", "icaoCode") WHERE "icaoCode" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX "quotation_template_hotel_options_hotelId_idx" ON "quotation_template_hotel_options"("hotelId");
CREATE INDEX "quotation_version_hotel_options_hotelId_idx" ON "quotation_version_hotel_options"("hotelId");

ALTER TABLE "hotels" ADD CONSTRAINT "hotels_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hotel_meal_plans" ADD CONSTRAINT "hotel_meal_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotel_meal_plans" ADD CONSTRAINT "hotel_meal_plans_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "airlines" ADD CONSTRAINT "airlines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "airlines" ADD CONSTRAINT "airlines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotation_template_hotel_options" ADD CONSTRAINT "quotation_template_hotel_options_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_hotel_options" ADD CONSTRAINT "quotation_template_hotel_options_hotelRoomTypeId_fkey" FOREIGN KEY ("hotelRoomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_template_hotel_options" ADD CONSTRAINT "quotation_template_hotel_options_hotelMealPlanId_fkey" FOREIGN KEY ("hotelMealPlanId") REFERENCES "hotel_meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_hotel_options" ADD CONSTRAINT "quotation_version_hotel_options_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_hotel_options" ADD CONSTRAINT "quotation_version_hotel_options_hotelRoomTypeId_fkey" FOREIGN KEY ("hotelRoomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_version_hotel_options" ADD CONSTRAINT "quotation_version_hotel_options_hotelMealPlanId_fkey" FOREIGN KEY ("hotelMealPlanId") REFERENCES "hotel_meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
