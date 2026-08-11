-- AlterTable
ALTER TABLE "quotation_template_hotel_options" ADD COLUMN     "checkInTime" VARCHAR(5),
ADD COLUMN     "checkOutTime" VARCHAR(5);

-- AlterTable
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN     "checkInTime" VARCHAR(5),
ADD COLUMN     "checkOutTime" VARCHAR(5);
