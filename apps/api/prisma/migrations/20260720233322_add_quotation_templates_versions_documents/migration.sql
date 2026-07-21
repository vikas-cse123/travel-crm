-- CreateEnum
CREATE TYPE "QuotationTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuotationVersionStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('PER_PERSON', 'PACKAGE_TOTAL', 'ITEMIZED');

-- CreateEnum
CREATE TYPE "MarkupMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('S3', 'MEMORY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTATION_PDF', 'SUPPORTING_ATTACHMENT', 'COMPANY_LOGO', 'HOTEL_IMAGE', 'ITINERARY_IMAGE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_DUPLICATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_ACTIVATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_DEACTIVATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_TEMPLATE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_VERSION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_VERSION_FINALIZED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_PDF_GENERATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_SENT';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_VIEWED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_ACCEPTED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_REJECTED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_PUBLIC_LINK_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_PUBLIC_LINK_REVOKED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_DOCUMENT_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUOTATION_DOCUMENT_DELETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'MEAL';
ALTER TYPE "ServiceType" ADD VALUE 'GUIDE';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" VARCHAR(1000),
ADD COLUMN     "logoObjectKey" VARCHAR(1000),
ADD COLUMN     "primaryColor" VARCHAR(7) NOT NULL DEFAULT '#2563eb',
ADD COLUMN     "website" VARCHAR(255);

-- CreateTable
CREATE TABLE "quotation_counters" (
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quotationValue" INTEGER NOT NULL DEFAULT 0,
    "templateValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "quotation_templates" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateCode" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(4000),
    "destinationSummary" VARCHAR(500) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "durationNights" INTEGER NOT NULL,
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "adultBasePrice" DECIMAL(14,2),
    "childWithBedBasePrice" DECIMAL(14,2),
    "childWithoutBedBasePrice" DECIMAL(14,2),
    "infantBasePrice" DECIMAL(14,2),
    "status" "QuotationTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "internalNotes" VARCHAR(4000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_itinerary_days" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "meals" VARCHAR(500),
    "overnightLocation" VARCHAR(120),
    "activities" VARCHAR(2000),
    "transfers" VARCHAR(2000),
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_template_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_hotel_options" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "hotelName" VARCHAR(200) NOT NULL,
    "category" VARCHAR(40),
    "roomType" VARCHAR(100),
    "mealPlan" VARCHAR(100),
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "nights" INTEGER NOT NULL,
    "checkInDate" DATE,
    "checkOutDate" DATE,
    "internalCost" DECIMAL(14,2),
    "sellingPrice" DECIMAL(14,2),
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_template_hotel_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000),
    "dayNumber" INTEGER,
    "city" VARCHAR(120),
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "internalCost" DECIMAL(14,2),
    "sellingPrice" DECIMAL(14,2),
    "taxCategory" VARCHAR(80),
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_template_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_inclusions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_template_inclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_exclusions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_template_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_template_terms" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_template_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationNumber" VARCHAR(24) NOT NULL,
    "queryId" UUID NOT NULL,
    "sourceTemplateId" UUID,
    "createdById" UUID NOT NULL,
    "currentVersionId" UUID,
    "acceptedVersionId" UUID,
    "publicVersionId" UUID,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" VARCHAR(120) NOT NULL,
    "customerEmail" VARCHAR(255),
    "customerPhone" VARCHAR(32) NOT NULL,
    "destinationSummary" VARCHAR(500) NOT NULL,
    "travelStartDate" DATE,
    "travelEndDate" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "childrenWithBed" INTEGER NOT NULL DEFAULT 0,
    "childrenWithoutBed" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "validUntil" DATE,
    "publicTokenHash" VARCHAR(64),
    "publicTokenExpiresAt" TIMESTAMP(3),
    "firstSentAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_versions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "introduction" VARCHAR(4000),
    "destinationSummary" VARCHAR(500) NOT NULL,
    "travelStartDate" DATE,
    "travelEndDate" DATE,
    "currency" VARCHAR(3) NOT NULL,
    "subtotalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotalSellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "markupMode" "MarkupMode" NOT NULL DEFAULT 'NONE',
    "markupValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalMarkup" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginPercentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ITEMIZED',
    "notes" VARCHAR(4000),
    "internalNotes" VARCHAR(4000),
    "status" "QuotationVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_itinerary_days" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE,
    "title" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "meals" VARCHAR(500),
    "overnightLocation" VARCHAR(120),
    "activities" VARCHAR(2000),
    "transfers" VARCHAR(2000),
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_version_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_hotel_options" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "hotelName" VARCHAR(200) NOT NULL,
    "category" VARCHAR(40),
    "roomType" VARCHAR(100),
    "mealPlan" VARCHAR(100),
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "nights" INTEGER NOT NULL,
    "checkInDate" DATE,
    "checkOutDate" DATE,
    "internalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_version_hotel_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000),
    "dayNumber" INTEGER,
    "city" VARCHAR(120),
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitSellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalSellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxCategory" VARCHAR(80),
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_version_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_inclusions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_version_inclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_exclusions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_version_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_version_terms" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "quotation_version_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "quotationVersionId" UUID,
    "storageProvider" "StorageProvider" NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "documentType" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "generatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_email_logs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "quotationVersionId" UUID NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "cc" VARCHAR(1000),
    "subject" VARCHAR(255) NOT NULL,
    "providerMessageId" VARCHAR(255),
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentById" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failureReason" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_templates_companyId_status_deletedAt_idx" ON "quotation_templates"("companyId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "quotation_templates_companyId_destinationSummary_idx" ON "quotation_templates"("companyId", "destinationSummary");

-- CreateIndex
CREATE INDEX "quotation_templates_companyId_createdById_idx" ON "quotation_templates"("companyId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_templates_companyId_templateCode_key" ON "quotation_templates"("companyId", "templateCode");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_templates_companyId_name_key" ON "quotation_templates"("companyId", "name");

-- CreateIndex
CREATE INDEX "quotation_template_itinerary_days_companyId_templateId_idx" ON "quotation_template_itinerary_days"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_itinerary_days_templateId_sequence_key" ON "quotation_template_itinerary_days"("templateId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_template_hotel_options_companyId_templateId_idx" ON "quotation_template_hotel_options"("companyId", "templateId");

-- CreateIndex
CREATE INDEX "quotation_template_hotel_options_companyId_city_idx" ON "quotation_template_hotel_options"("companyId", "city");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_hotel_options_templateId_sequence_key" ON "quotation_template_hotel_options"("templateId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_template_services_companyId_templateId_idx" ON "quotation_template_services"("companyId", "templateId");

-- CreateIndex
CREATE INDEX "quotation_template_services_companyId_serviceType_idx" ON "quotation_template_services"("companyId", "serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_services_templateId_sequence_key" ON "quotation_template_services"("templateId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_template_inclusions_companyId_templateId_idx" ON "quotation_template_inclusions"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_inclusions_templateId_sequence_key" ON "quotation_template_inclusions"("templateId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_template_exclusions_companyId_templateId_idx" ON "quotation_template_exclusions"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_exclusions_templateId_sequence_key" ON "quotation_template_exclusions"("templateId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_template_terms_companyId_templateId_idx" ON "quotation_template_terms"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_template_terms_templateId_sequence_key" ON "quotation_template_terms"("templateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_publicTokenHash_key" ON "quotations"("publicTokenHash");

-- CreateIndex
CREATE INDEX "quotations_companyId_queryId_deletedAt_idx" ON "quotations"("companyId", "queryId", "deletedAt");

-- CreateIndex
CREATE INDEX "quotations_companyId_status_deletedAt_idx" ON "quotations"("companyId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "quotations_companyId_createdById_deletedAt_idx" ON "quotations"("companyId", "createdById", "deletedAt");

-- CreateIndex
CREATE INDEX "quotations_companyId_validUntil_idx" ON "quotations"("companyId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_quotationNumber_key" ON "quotations"("companyId", "quotationNumber");

-- CreateIndex
CREATE INDEX "quotation_versions_companyId_quotationId_idx" ON "quotation_versions"("companyId", "quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_versions_quotationId_versionNumber_key" ON "quotation_versions"("quotationId", "versionNumber");

-- CreateIndex
CREATE INDEX "quotation_version_itinerary_days_companyId_quotationVersion_idx" ON "quotation_version_itinerary_days"("companyId", "quotationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_itinerary_days_quotationVersionId_sequenc_key" ON "quotation_version_itinerary_days"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_version_hotel_options_companyId_quotationVersionI_idx" ON "quotation_version_hotel_options"("companyId", "quotationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_hotel_options_quotationVersionId_sequence_key" ON "quotation_version_hotel_options"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_version_services_companyId_quotationVersionId_idx" ON "quotation_version_services"("companyId", "quotationVersionId");

-- CreateIndex
CREATE INDEX "quotation_version_services_companyId_serviceType_idx" ON "quotation_version_services"("companyId", "serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_services_quotationVersionId_sequence_key" ON "quotation_version_services"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_version_inclusions_companyId_quotationVersionId_idx" ON "quotation_version_inclusions"("companyId", "quotationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_inclusions_quotationVersionId_sequence_key" ON "quotation_version_inclusions"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_version_exclusions_companyId_quotationVersionId_idx" ON "quotation_version_exclusions"("companyId", "quotationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_exclusions_quotationVersionId_sequence_key" ON "quotation_version_exclusions"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_version_terms_companyId_quotationVersionId_idx" ON "quotation_version_terms"("companyId", "quotationVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_version_terms_quotationVersionId_sequence_key" ON "quotation_version_terms"("quotationVersionId", "sequence");

-- CreateIndex
CREATE INDEX "quotation_documents_companyId_quotationId_deletedAt_idx" ON "quotation_documents"("companyId", "quotationId", "deletedAt");

-- CreateIndex
CREATE INDEX "quotation_documents_companyId_quotationVersionId_documentTy_idx" ON "quotation_documents"("companyId", "quotationVersionId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_documents_companyId_objectKey_key" ON "quotation_documents"("companyId", "objectKey");

-- CreateIndex
CREATE INDEX "quotation_email_logs_companyId_quotationId_createdAt_idx" ON "quotation_email_logs"("companyId", "quotationId", "createdAt");

-- AddForeignKey
ALTER TABLE "quotation_counters" ADD CONSTRAINT "quotation_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_templates" ADD CONSTRAINT "quotation_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_templates" ADD CONSTRAINT "quotation_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_itinerary_days" ADD CONSTRAINT "quotation_template_itinerary_days_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_itinerary_days" ADD CONSTRAINT "quotation_template_itinerary_days_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_hotel_options" ADD CONSTRAINT "quotation_template_hotel_options_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_hotel_options" ADD CONSTRAINT "quotation_template_hotel_options_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_services" ADD CONSTRAINT "quotation_template_services_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_inclusions" ADD CONSTRAINT "quotation_template_inclusions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_inclusions" ADD CONSTRAINT "quotation_template_inclusions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_exclusions" ADD CONSTRAINT "quotation_template_exclusions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_exclusions" ADD CONSTRAINT "quotation_template_exclusions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_terms" ADD CONSTRAINT "quotation_template_terms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_template_terms" ADD CONSTRAINT "quotation_template_terms_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quotation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "quotation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_itinerary_days" ADD CONSTRAINT "quotation_version_itinerary_days_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_itinerary_days" ADD CONSTRAINT "quotation_version_itinerary_days_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_hotel_options" ADD CONSTRAINT "quotation_version_hotel_options_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_hotel_options" ADD CONSTRAINT "quotation_version_hotel_options_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_services" ADD CONSTRAINT "quotation_version_services_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_inclusions" ADD CONSTRAINT "quotation_version_inclusions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_inclusions" ADD CONSTRAINT "quotation_version_inclusions_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_exclusions" ADD CONSTRAINT "quotation_version_exclusions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_exclusions" ADD CONSTRAINT "quotation_version_exclusions_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_terms" ADD CONSTRAINT "quotation_version_terms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_version_terms" ADD CONSTRAINT "quotation_version_terms_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_email_logs" ADD CONSTRAINT "quotation_email_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_email_logs" ADD CONSTRAINT "quotation_email_logs_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_email_logs" ADD CONSTRAINT "quotation_email_logs_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_email_logs" ADD CONSTRAINT "quotation_email_logs_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
