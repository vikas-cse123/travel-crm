-- AlterTable
ALTER TABLE "quotation_template_hotel_options" ADD COLUMN     "mealPlanLines" JSONB,
ADD COLUMN     "roomLines" JSONB;

-- AlterTable
ALTER TABLE "quotation_version_hotel_options" ADD COLUMN     "mealPlanLines" JSONB,
ADD COLUMN     "roomLines" JSONB;
