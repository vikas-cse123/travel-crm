-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "publicSlug" VARCHAR(60);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_publicSlug_key" ON "quotations"("publicSlug");
