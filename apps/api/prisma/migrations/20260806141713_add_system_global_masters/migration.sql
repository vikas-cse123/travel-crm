-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'SYSTEM_COMPANY_BOOTSTRAPPED';
ALTER TYPE "ActivityAction" ADD VALUE 'SYSTEM_ADMIN_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'MASTER_HIDDEN_FOR_TENANT';
ALTER TYPE "ActivityAction" ADD VALUE 'MASTER_RESTORED_FOR_TENANT';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "company_hidden_masters" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "masterType" VARCHAR(40) NOT NULL,
    "masterId" UUID NOT NULL,
    "hiddenByUserId" UUID,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "company_hidden_masters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_hidden_masters_tenantId_masterType_idx" ON "company_hidden_masters"("tenantId", "masterType");

-- CreateIndex
CREATE INDEX "company_hidden_masters_masterType_masterId_idx" ON "company_hidden_masters"("masterType", "masterId");

-- CreateIndex
CREATE INDEX "company_hidden_masters_hiddenByUserId_idx" ON "company_hidden_masters"("hiddenByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "company_hidden_masters_tenantId_masterType_masterId_key" ON "company_hidden_masters"("tenantId", "masterType", "masterId");

-- AddForeignKey
ALTER TABLE "company_hidden_masters" ADD CONSTRAINT "company_hidden_masters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hidden_masters" ADD CONSTRAINT "company_hidden_masters_hiddenByUserId_fkey" FOREIGN KEY ("hiddenByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
