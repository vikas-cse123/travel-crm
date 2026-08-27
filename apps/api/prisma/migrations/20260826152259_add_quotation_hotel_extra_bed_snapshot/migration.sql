-- AlterTable
ALTER TABLE "booking_services" ADD COLUMN     "baseRoomPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedQuantity" INTEGER,
ADD COLUMN     "extraBedPrice" DECIMAL(14,2),
ADD COLUMN     "extraBedQuantity" INTEGER,
ADD COLUMN     "pricingSource" VARCHAR(20);

-- AlterTable
ALTER TABLE "quotation_template_hotel_options" ADD COLUMN     "baseRoomPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedQuantity" INTEGER,
ADD COLUMN     "extraBedPrice" DECIMAL(14,2),
ADD COLUMN     "extraBedQuantity" INTEGER,
ADD COLUMN     "pricingSource" VARCHAR(20);

-- AlterTable
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN     "baseRoomPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedPrice" DECIMAL(14,2),
ADD COLUMN     "childWithoutBedQuantity" INTEGER,
ADD COLUMN     "extraBedPrice" DECIMAL(14,2),
ADD COLUMN     "extraBedQuantity" INTEGER,
ADD COLUMN     "pricingSource" VARCHAR(20);
