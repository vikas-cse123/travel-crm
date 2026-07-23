-- Phase 18: company settings & document branding.
--
-- Purely additive: new ActivityAction enum values, new Company columns (all
-- nullable or defaulted), and a new company_bank_accounts table (encrypted
-- account number, one per company). Existing rows stay valid. The unrelated
-- query_follow_ups index rename that `migrate diff` also emits is pre-existing
-- drift and is deliberately excluded.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_PROFILE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_BRANDING_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_LOGO_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_LOGO_REMOVED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_TAX_SETTINGS_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_PREFERENCES_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_DEFAULT_TERMS_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'COMPANY_BANK_ACCOUNT_UPDATED';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultBookingTerms" TEXT,
ADD COLUMN     "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN     "defaultQuotationTerms" TEXT,
ADD COLUMN     "logoBucket" VARCHAR(255),
ADD COLUMN     "logoConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "logoFileSize" INTEGER,
ADD COLUMN     "logoMimeType" VARCHAR(120),
ADD COLUMN     "logoStorageProvider" "StorageProvider",
ADD COLUMN     "pendingLogoObjectKey" VARCHAR(1000),
ADD COLUMN     "taxRegistrationNumber" VARCHAR(40);

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountHolderName" VARCHAR(200) NOT NULL,
    "bankName" VARCHAR(200) NOT NULL,
    "branchName" VARCHAR(200),
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountNumberLast4" VARCHAR(4) NOT NULL,
    "encryptionKeyVersion" VARCHAR(30) NOT NULL,
    "ifscCode" VARCHAR(20),
    "swiftCode" VARCHAR(20),
    "accountType" VARCHAR(40),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_bank_accounts_companyId_key" ON "company_bank_accounts"("companyId");

-- CreateIndex
CREATE INDEX "company_bank_accounts_companyId_idx" ON "company_bank_accounts"("companyId");

-- AddForeignKey
ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
