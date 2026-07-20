-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'SOCIAL_MEDIA', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'GOOGLE_ADS', 'WHATSAPP', 'PHONE_CALL', 'REFERRAL', 'WALK_IN', 'REPEAT_CUSTOMER', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('FRESH', 'HOT', 'WARM', 'COLD', 'PROSPECT');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'QUOTATION_REQUIRED', 'QUOTATION_SENT', 'IN_NEGOTIATION', 'READY_TO_BOOK', 'BOOKING_CONFIRMED', 'FOLLOW_UP', 'AMENDMENT', 'LOST', 'CANCELLED', 'INVALID', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "QueryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('FLIGHT', 'HOTEL', 'CRUISE', 'VEHICLE_TRANSFER', 'SIGHTSEEING', 'VISA', 'TRAVEL_INSURANCE', 'RAIL', 'PASSPORT_ASSISTANCE', 'OTHER_ADD_ON', 'GENERAL_ENQUIRY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_STAGE_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_ASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_NOTE_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_NOTE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_NOTE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_COMPLETED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_CANCELLED';

-- CreateTable
CREATE TABLE "query_counters" (
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "query_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "queries" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryNumber" VARCHAR(24) NOT NULL,
    "customerName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "normalizedPhone" VARCHAR(24) NOT NULL,
    "alternatePhone" VARCHAR(32),
    "email" VARCHAR(255),
    "dateOfBirth" DATE,
    "leadSource" "LeadSource" NOT NULL,
    "leadType" "LeadType" NOT NULL DEFAULT 'FRESH',
    "leadStage" "LeadStage" NOT NULL DEFAULT 'NEW_LEAD',
    "priority" "QueryPriority" NOT NULL DEFAULT 'MEDIUM',
    "departureCountry" VARCHAR(80),
    "departureCity" VARCHAR(100),
    "travelStartDate" DATE,
    "travelEndDate" DATE,
    "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "childrenWithBed" INTEGER NOT NULL DEFAULT 0,
    "childrenWithoutBed" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "extraBeds" INTEGER NOT NULL DEFAULT 0,
    "travellerSummary" VARCHAR(255) NOT NULL,
    "expectedAmount" DECIMAL(14,2),
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "expectedMargin" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "tripType" VARCHAR(40),
    "quotationRequired" BOOLEAN NOT NULL DEFAULT false,
    "bookingStatusPlaceholder" VARCHAR(80),
    "webLinkPlaceholder" VARCHAR(500),
    "supplierCostingNotes" VARCHAR(2000),
    "assignedToId" UUID,
    "createdById" UUID NOT NULL,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "lostReason" VARCHAR(500),
    "convertedAt" TIMESTAMP(3),
    "internalRemarks" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "query_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_stage_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "previousStage" "LeadStage",
    "newStage" "LeadStage" NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_assignment_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "previousAssigneeId" UUID,
    "newAssigneeId" UUID,
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_follow_ups" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "assignedToId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" VARCHAR(1000),
    "notes" VARCHAR(2000),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "query_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_services" (
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_services_pkey" PRIMARY KEY ("queryId","serviceType")
);

-- CreateTable
CREATE TABLE "query_itineraries" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "queryId" UUID NOT NULL,
    "country" VARCHAR(80) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "nights" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "arrivalDate" DATE,
    "departureDate" DATE,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "query_itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queries_companyId_normalizedPhone_idx" ON "queries"("companyId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "queries_companyId_leadStage_deletedAt_idx" ON "queries"("companyId", "leadStage", "deletedAt");

-- CreateIndex
CREATE INDEX "queries_companyId_leadType_deletedAt_idx" ON "queries"("companyId", "leadType", "deletedAt");

-- CreateIndex
CREATE INDEX "queries_companyId_priority_deletedAt_idx" ON "queries"("companyId", "priority", "deletedAt");

-- CreateIndex
CREATE INDEX "queries_companyId_assignedToId_deletedAt_idx" ON "queries"("companyId", "assignedToId", "deletedAt");

-- CreateIndex
CREATE INDEX "queries_companyId_nextFollowUpAt_idx" ON "queries"("companyId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "queries_companyId_travelStartDate_idx" ON "queries"("companyId", "travelStartDate");

-- CreateIndex
CREATE INDEX "queries_companyId_createdAt_idx" ON "queries"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "queries_companyId_queryNumber_key" ON "queries"("companyId", "queryNumber");

-- CreateIndex
CREATE INDEX "query_notes_companyId_queryId_createdAt_idx" ON "query_notes"("companyId", "queryId", "createdAt");

-- CreateIndex
CREATE INDEX "query_stage_history_companyId_queryId_createdAt_idx" ON "query_stage_history"("companyId", "queryId", "createdAt");

-- CreateIndex
CREATE INDEX "query_assignment_history_companyId_queryId_createdAt_idx" ON "query_assignment_history"("companyId", "queryId", "createdAt");

-- CreateIndex
CREATE INDEX "query_follow_ups_companyId_queryId_scheduledAt_idx" ON "query_follow_ups"("companyId", "queryId", "scheduledAt");

-- CreateIndex
CREATE INDEX "query_follow_ups_companyId_assignedToId_status_scheduledAt_idx" ON "query_follow_ups"("companyId", "assignedToId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "query_services_companyId_serviceType_idx" ON "query_services"("companyId", "serviceType");

-- CreateIndex
CREATE INDEX "query_itineraries_companyId_destination_idx" ON "query_itineraries"("companyId", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "query_itineraries_queryId_sequence_key" ON "query_itineraries"("queryId", "sequence");

-- AddForeignKey
ALTER TABLE "query_counters" ADD CONSTRAINT "query_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_notes" ADD CONSTRAINT "query_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_notes" ADD CONSTRAINT "query_notes_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_notes" ADD CONSTRAINT "query_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_stage_history" ADD CONSTRAINT "query_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_stage_history" ADD CONSTRAINT "query_stage_history_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_stage_history" ADD CONSTRAINT "query_stage_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_assignment_history" ADD CONSTRAINT "query_assignment_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_assignment_history" ADD CONSTRAINT "query_assignment_history_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_assignment_history" ADD CONSTRAINT "query_assignment_history_previousAssigneeId_fkey" FOREIGN KEY ("previousAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_assignment_history" ADD CONSTRAINT "query_assignment_history_newAssigneeId_fkey" FOREIGN KEY ("newAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_assignment_history" ADD CONSTRAINT "query_assignment_history_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_services" ADD CONSTRAINT "query_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_services" ADD CONSTRAINT "query_services_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_itineraries" ADD CONSTRAINT "query_itineraries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_itineraries" ADD CONSTRAINT "query_itineraries_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
