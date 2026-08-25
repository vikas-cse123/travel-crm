-- AlterTable
ALTER TABLE "quotation_versions" ADD COLUMN     "pricingDisplayOrder" JSON,
ADD COLUMN     "pricingHeading" VARCHAR(120) NOT NULL DEFAULT 'Price Breakdown',
ADD COLUMN     "pricingSubheading" VARCHAR(200);

-- RenameIndex
ALTER INDEX "hotel_meal_plan_month_prices_companyId_hotelMealPlanId_month_ke" RENAME TO "hotel_meal_plan_month_prices_companyId_hotelMealPlanId_mont_key";

-- RenameIndex
ALTER INDEX "hotel_room_type_month_prices_companyId_hotelRoomTypeId_month_ke" RENAME TO "hotel_room_type_month_prices_companyId_hotelRoomTypeId_mont_key";
