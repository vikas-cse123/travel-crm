-- AlterTable
ALTER TABLE "hotel_room_type_month_prices" ADD COLUMN     "childWithoutBedPrice" DECIMAL(14,2),
ADD COLUMN     "extraBedPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "hotel_room_type_seasons" ADD COLUMN     "childWithoutBedPrice" DECIMAL(14,2),
ADD COLUMN     "extraBedPrice" DECIMAL(14,2);
