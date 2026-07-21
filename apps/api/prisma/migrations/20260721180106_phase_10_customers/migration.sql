-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'MERGED');

-- CreateEnum
CREATE TYPE "CustomerLifecycleStage" AS ENUM ('PROSPECT', 'ACTIVE_CUSTOMER', 'REPEAT_CUSTOMER', 'LAPSED', 'VIP');

-- CreateEnum
CREATE TYPE "CustomerAddressType" AS ENUM ('HOME', 'WORK', 'BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerNoteType" AS ENUM ('GENERAL', 'PREFERENCE', 'WARNING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CustomerCommunicationType" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerCommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('PASSPORT', 'VISA', 'IDENTITY_DOCUMENT', 'PAN_CARD', 'ADDRESS_PROOF', 'PROFILE_PHOTO', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_ASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_TAG_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_TAG_REMOVED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_NOTE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_NOTE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_NOTE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_COMMUNICATION_RECORDED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_DOCUMENT_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_DOCUMENT_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_MERGED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "customerId" UUID;

-- AlterTable
ALTER TABLE "queries" ADD COLUMN     "customerId" UUID;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "customerId" UUID;

-- CreateTable
CREATE TABLE "customer_counters" (
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customer_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerNumber" VARCHAR(24) NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "lifecycleStage" "CustomerLifecycleStage" NOT NULL DEFAULT 'PROSPECT',
    "displayName" VARCHAR(160) NOT NULL,
    "normalizedName" VARCHAR(160) NOT NULL,
    "primaryPhone" VARCHAR(32),
    "normalizedPhone" VARCHAR(24),
    "alternatePhone" VARCHAR(32),
    "email" VARCHAR(255),
    "normalizedEmail" VARCHAR(255),
    "dateOfBirth" DATE,
    "anniversaryDate" DATE,
    "companyName" VARCHAR(160),
    "taxIdentification" VARCHAR(80),
    "preferredContactMethod" "CustomerCommunicationType",
    "preferredCurrency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "preferredLanguage" VARCHAR(40),
    "travelPreferences" VARCHAR(4000),
    "dietaryRequirements" VARCHAR(2000),
    "specialRequirements" VARCHAR(2000),
    "source" VARCHAR(80),
    "assignedToId" UUID,
    "createdById" UUID NOT NULL,
    "mergedIntoId" UUID,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "quotationCount" INTEGER NOT NULL DEFAULT 0,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "totalBookedValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOutstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastInteractionAt" TIMESTAMP(3),
    "lastBookingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "CustomerAddressType" NOT NULL DEFAULT 'HOME',
    "label" VARCHAR(80),
    "line1" VARCHAR(255) NOT NULL,
    "line2" VARCHAR(255),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(120),
    "postalCode" VARCHAR(24),
    "country" VARCHAR(80) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tags" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#64748b',
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tag_assignments" (
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_tag_assignments_pkey" PRIMARY KEY ("customerId","tagId")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "type" "CustomerNoteType" NOT NULL DEFAULT 'GENERAL',
    "content" VARCHAR(4000) NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_communications" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "type" "CustomerCommunicationType" NOT NULL,
    "direction" "CustomerCommunicationDirection" NOT NULL,
    "subject" VARCHAR(200),
    "summary" VARCHAR(4000) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "type" "CustomerDocumentType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "objectKey" VARCHAR(1000) NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_merge_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceCustomerId" UUID NOT NULL,
    "targetCustomerId" UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "sourceSnapshot" JSONB NOT NULL,
    "targetSnapshot" JSONB NOT NULL,
    "relationshipMoves" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_merge_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_companyId_normalizedPhone_deletedAt_idx" ON "customers"("companyId", "normalizedPhone", "deletedAt");

-- CreateIndex
CREATE INDEX "customers_companyId_normalizedEmail_deletedAt_idx" ON "customers"("companyId", "normalizedEmail", "deletedAt");

-- CreateIndex
CREATE INDEX "customers_companyId_normalizedName_deletedAt_idx" ON "customers"("companyId", "normalizedName", "deletedAt");

-- CreateIndex
CREATE INDEX "customers_companyId_assignedToId_deletedAt_idx" ON "customers"("companyId", "assignedToId", "deletedAt");

-- CreateIndex
CREATE INDEX "customers_companyId_status_lifecycleStage_deletedAt_idx" ON "customers"("companyId", "status", "lifecycleStage", "deletedAt");

-- CreateIndex
CREATE INDEX "customers_companyId_createdAt_idx" ON "customers"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_customerNumber_key" ON "customers"("companyId", "customerNumber");

-- CreateIndex
CREATE INDEX "customer_addresses_companyId_customerId_deletedAt_idx" ON "customer_addresses"("companyId", "customerId", "deletedAt");

-- CreateIndex
CREATE INDEX "customer_tags_companyId_createdAt_idx" ON "customer_tags"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tags_companyId_name_key" ON "customer_tags"("companyId", "name");

-- CreateIndex
CREATE INDEX "customer_tag_assignments_companyId_tagId_idx" ON "customer_tag_assignments"("companyId", "tagId");

-- CreateIndex
CREATE INDEX "customer_notes_companyId_customerId_createdAt_idx" ON "customer_notes"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_communications_companyId_customerId_occurredAt_idx" ON "customer_communications"("companyId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "customer_documents_companyId_customerId_deletedAt_idx" ON "customer_documents"("companyId", "customerId", "deletedAt");

-- CreateIndex
CREATE INDEX "customer_merge_history_companyId_sourceCustomerId_createdAt_idx" ON "customer_merge_history"("companyId", "sourceCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_merge_history_companyId_targetCustomerId_createdAt_idx" ON "customer_merge_history"("companyId", "targetCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_customerId_deletedAt_idx" ON "bookings"("companyId", "customerId", "deletedAt");

-- CreateIndex
CREATE INDEX "queries_companyId_customerId_deletedAt_idx" ON "queries"("companyId", "customerId", "deletedAt");

-- CreateIndex
CREATE INDEX "quotations_companyId_customerId_deletedAt_idx" ON "quotations"("companyId", "customerId", "deletedAt");

-- AddForeignKey
ALTER TABLE "customer_counters" ADD CONSTRAINT "customer_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "customer_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_merge_history" ADD CONSTRAINT "customer_merge_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_merge_history" ADD CONSTRAINT "customer_merge_history_sourceCustomerId_fkey" FOREIGN KEY ("sourceCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_merge_history" ADD CONSTRAINT "customer_merge_history_targetCustomerId_fkey" FOREIGN KEY ("targetCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_merge_history" ADD CONSTRAINT "customer_merge_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
