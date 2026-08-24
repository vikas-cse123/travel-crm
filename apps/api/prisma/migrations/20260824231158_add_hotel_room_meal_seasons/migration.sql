/*
  Warnings:

  - Made the column `currency` on table `cruises` required. This step will fail if there are existing NULL values in that column.
  - Made the column `currency` on table `hotels` required. This step will fail if there are existing NULL values in that column.
  - Made the column `currency` on table `vehicles` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "cruises" ALTER COLUMN "currency" SET NOT NULL;

-- AlterTable
ALTER TABLE "hotels" ALTER COLUMN "currency" SET NOT NULL;

-- AlterTable
ALTER TABLE "sightseeings" ALTER COLUMN "pricing" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "currency" SET NOT NULL;

-- CreateTable
CREATE TABLE "hotel_room_type_seasons" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "hotelRoomTypeId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_room_type_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_meal_plan_seasons" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "hotelMealPlanId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_meal_plan_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_room_type_seasons_companyId_hotelRoomTypeId_idx" ON "hotel_room_type_seasons"("companyId", "hotelRoomTypeId");

-- CreateIndex
CREATE INDEX "hotel_room_type_seasons_hotelRoomTypeId_startDate_endDate_idx" ON "hotel_room_type_seasons"("hotelRoomTypeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "hotel_meal_plan_seasons_companyId_hotelMealPlanId_idx" ON "hotel_meal_plan_seasons"("companyId", "hotelMealPlanId");

-- CreateIndex
CREATE INDEX "hotel_meal_plan_seasons_hotelMealPlanId_startDate_endDate_idx" ON "hotel_meal_plan_seasons"("hotelMealPlanId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "hotel_room_type_seasons" ADD CONSTRAINT "hotel_room_type_seasons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_type_seasons" ADD CONSTRAINT "hotel_room_type_seasons_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_type_seasons" ADD CONSTRAINT "hotel_room_type_seasons_hotelRoomTypeId_fkey" FOREIGN KEY ("hotelRoomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_seasons" ADD CONSTRAINT "hotel_meal_plan_seasons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_seasons" ADD CONSTRAINT "hotel_meal_plan_seasons_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_seasons" ADD CONSTRAINT "hotel_meal_plan_seasons_hotelMealPlanId_fkey" FOREIGN KEY ("hotelMealPlanId") REFERENCES "hotel_meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
