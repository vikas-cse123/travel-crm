-- AlterTable
ALTER TABLE "queries" ADD COLUMN     "childrenWithBedAges" JSONB,
ADD COLUMN     "childrenWithoutBedAges" JSONB,
ADD COLUMN     "infantAges" JSONB;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "childrenWithBedAges" JSONB,
ADD COLUMN     "childrenWithoutBedAges" JSONB,
ADD COLUMN     "infantAges" JSONB;
