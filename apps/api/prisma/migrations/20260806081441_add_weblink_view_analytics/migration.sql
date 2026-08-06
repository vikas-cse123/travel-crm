-- CreateEnum
CREATE TYPE "WeblinkViewType" AS ENUM ('HOME', 'EXTERNAL');

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "publicToken" VARCHAR(64);

-- CreateTable
CREATE TABLE "quotation_weblink_views" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "ipAddress" VARCHAR(64) NOT NULL,
    "type" "WeblinkViewType" NOT NULL DEFAULT 'EXTERNAL',
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_weblink_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_weblink_views_companyId_quotationId_idx" ON "quotation_weblink_views"("companyId", "quotationId");

-- CreateIndex
CREATE INDEX "quotation_weblink_views_quotationId_lastViewedAt_idx" ON "quotation_weblink_views"("quotationId", "lastViewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_weblink_views_quotationId_ipAddress_key" ON "quotation_weblink_views"("quotationId", "ipAddress");

-- AddForeignKey
ALTER TABLE "quotation_weblink_views" ADD CONSTRAINT "quotation_weblink_views_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_weblink_views" ADD CONSTRAINT "quotation_weblink_views_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
