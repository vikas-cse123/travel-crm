-- CreateTable
CREATE TABLE "hotel_month_prices" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "month" SMALLINT NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_month_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_room_type_month_prices" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "hotelRoomTypeId" UUID NOT NULL,
    "month" SMALLINT NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_room_type_month_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_meal_plan_month_prices" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "hotelMealPlanId" UUID NOT NULL,
    "month" SMALLINT NOT NULL,
    "price" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_meal_plan_month_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_month_prices_companyId_hotelId_idx" ON "hotel_month_prices"("companyId", "hotelId");

-- CreateIndex
CREATE INDEX "hotel_room_type_month_prices_companyId_hotelRoomTypeId_idx" ON "hotel_room_type_month_prices"("companyId", "hotelRoomTypeId");

-- CreateIndex
CREATE INDEX "hotel_meal_plan_month_prices_companyId_hotelMealPlanId_idx" ON "hotel_meal_plan_month_prices"("companyId", "hotelMealPlanId");

-- AddForeignKey
ALTER TABLE "hotel_month_prices" ADD CONSTRAINT "hotel_month_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_month_prices" ADD CONSTRAINT "hotel_month_prices_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_type_month_prices" ADD CONSTRAINT "hotel_room_type_month_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_type_month_prices" ADD CONSTRAINT "hotel_room_type_month_prices_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_type_month_prices" ADD CONSTRAINT "hotel_room_type_month_prices_hotelRoomTypeId_fkey" FOREIGN KEY ("hotelRoomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_month_prices" ADD CONSTRAINT "hotel_meal_plan_month_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_month_prices" ADD CONSTRAINT "hotel_meal_plan_month_prices_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_meal_plan_month_prices" ADD CONSTRAINT "hotel_meal_plan_month_prices_hotelMealPlanId_fkey" FOREIGN KEY ("hotelMealPlanId") REFERENCES "hotel_meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
