-- Complete the Phase 10 relationship projections and customer operations.
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_COMMUNICATION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CUSTOMER_COMMUNICATION_DELETED';
ALTER TYPE "CustomerAddressType" ADD VALUE 'OFFICE';
ALTER TYPE "CustomerCommunicationDirection" ADD VALUE 'INTERNAL';
ALTER TYPE "CustomerDocumentType" ADD VALUE 'AGREEMENT';
ALTER TYPE "CustomerDocumentType" ADD VALUE 'CORPORATE_IDENTIFICATION';
ALTER TYPE "CustomerDocumentType" ADD VALUE 'CONSENT_FORM';
ALTER TYPE "CustomerDocumentType" ADD VALUE 'GENERAL_ATTACHMENT';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'NEW';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'QUALIFIED';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'QUOTED';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'BOOKED';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'REPEAT';
ALTER TYPE "CustomerLifecycleStage" ADD VALUE 'INACTIVE';
ALTER TYPE "CustomerNoteType" ADD VALUE 'SALES';
ALTER TYPE "CustomerNoteType" ADD VALUE 'SERVICE';
ALTER TYPE "CustomerNoteType" ADD VALUE 'FINANCIAL';
ALTER TYPE "CustomerStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "CustomerType" ADD VALUE 'AGENT';
ALTER TYPE "CustomerType" ADD VALUE 'GROUP';

DROP INDEX "customer_communications_companyId_customerId_occurredAt_idx";

ALTER TABLE "customer_communications"
  ADD COLUMN "bookingId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "leadId" UUID,
  ADD COLUMN "nextAction" VARCHAR(1000),
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "outcome" VARCHAR(500),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "customer_communications" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "customer_communications" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "customer_tag_assignments" ADD COLUMN "assignedById" UUID;
ALTER TABLE "customer_tags"
  ADD COLUMN "createdById" UUID,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "normalizedName" VARCHAR(60);

UPDATE "customer_tags"
SET "normalizedName" = lower(regexp_replace(trim("name"), '\s+', ' ', 'g'))
WHERE "normalizedName" IS NULL;

ALTER TABLE "customers"
  ADD COLUMN "completedBookingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customerSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isRepeatCustomer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isVip" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN "lastEnquiryAt" TIMESTAMP(3),
  ADD COLUMN "lifetimeGrossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

CREATE INDEX "customer_communications_companyId_customerId_occurredAt_del_idx"
  ON "customer_communications"("companyId", "customerId", "occurredAt", "deletedAt");
CREATE INDEX "customer_communications_companyId_leadId_idx"
  ON "customer_communications"("companyId", "leadId");
CREATE INDEX "customer_communications_companyId_bookingId_idx"
  ON "customer_communications"("companyId", "bookingId");
CREATE UNIQUE INDEX "customer_tags_companyId_normalizedName_key"
  ON "customer_tags"("companyId", "normalizedName");
CREATE INDEX "customers_companyId_isRepeatCustomer_isVip_deletedAt_idx"
  ON "customers"("companyId", "isRepeatCustomer", "isVip", "deletedAt");

ALTER TABLE "customer_communications"
  ADD CONSTRAINT "customer_communications_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_communications"
  ADD CONSTRAINT "customer_communications_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
