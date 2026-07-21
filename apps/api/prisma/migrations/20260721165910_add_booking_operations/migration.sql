-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'ON_HOLD', 'TRAVEL_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ALL_SERVICES_CONFIRMED', 'DOCUMENTS_PENDING', 'READY_FOR_TRAVEL', 'TRAVEL_IN_PROGRESS', 'COMPLETED', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TravellerType" AS ENUM ('ADULT', 'CHILD_WITH_BED', 'CHILD_WITHOUT_BED', 'INFANT');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('NOT_REQUIRED', 'NOT_STARTED', 'DOCUMENTS_PENDING', 'APPLIED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceConfirmationStatus" AS ENUM ('PENDING', 'REQUESTED', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'PAYMENT_LINK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('RECEIVED', 'PENDING_CLEARANCE', 'CLEARED', 'FAILED', 'REVERSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BookingCostStatus" AS ENUM ('ESTIMATED', 'PAYABLE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingCostCategory" AS ENUM ('HOTEL', 'FLIGHT', 'TRANSFER', 'SIGHTSEEING', 'VISA', 'INSURANCE', 'GUIDE', 'MEALS', 'TAX', 'COMMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingDocumentType" AS ENUM ('PASSPORT', 'VISA', 'IDENTITY_DOCUMENT', 'FLIGHT_TICKET', 'HOTEL_VOUCHER', 'TRANSFER_VOUCHER', 'INSURANCE', 'INVOICE', 'PAYMENT_RECEIPT', 'BOOKING_CONFIRMATION', 'SUPPLIER_CONFIRMATION', 'ITINERARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL', 'CUSTOMER_VISIBLE');

-- CreateEnum
CREATE TYPE "BookingNoteType" AS ENUM ('GENERAL', 'CUSTOMER_COMMUNICATION', 'SUPPLIER_COMMUNICATION', 'OPERATIONAL', 'FINANCIAL');

-- CreateEnum
CREATE TYPE "BookingEmailType" AS ENUM ('CONFIRMATION', 'PAYMENT_REMINDER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_CONVERTED_FROM_QUOTATION';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_ASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_CANCELLED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_COMPLETED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_TRAVELLER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_TRAVELLER_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_TRAVELLER_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_SERVICE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_SERVICE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_SERVICE_CONFIRMED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_PAYMENT_SCHEDULE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_PAYMENT_SCHEDULE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_PAYMENT_RECEIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_PAYMENT_REVERSED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_COST_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_COST_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_COST_PAID';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_DOCUMENT_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_DOCUMENT_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_CONFIRMATION_GENERATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_CONFIRMATION_SENT';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_PAYMENT_REMINDER_SENT';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_NOTE_CREATED';

-- CreateTable
CREATE TABLE "booking_counters" (
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "bookingValue" INTEGER NOT NULL DEFAULT 0,
    "paymentValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "booking_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingNumber" VARCHAR(24) NOT NULL,
    "queryId" UUID,
    "quotationId" UUID,
    "quotationVersionId" UUID,
    "customerName" VARCHAR(120) NOT NULL,
    "customerEmail" VARCHAR(255),
    "customerPhone" VARCHAR(32) NOT NULL,
    "destinationSummary" VARCHAR(500) NOT NULL,
    "travelStartDate" DATE,
    "travelEndDate" DATE,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "childrenWithBed" INTEGER NOT NULL DEFAULT 0,
    "childrenWithoutBed" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "totalSellingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCustomerPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCustomerOutstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profitMarginPercentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "bookedById" UUID NOT NULL,
    "assignedToId" UUID,
    "sourceTitle" VARCHAR(200),
    "sourceTerms" JSONB,
    "manualCreationReason" VARCHAR(2000),
    "acceptedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(2000),
    "internalNotes" VARCHAR(4000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_travellers" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "travellerType" "TravellerType" NOT NULL,
    "title" VARCHAR(20) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "middleName" VARCHAR(100),
    "lastName" VARCHAR(100) NOT NULL,
    "gender" VARCHAR(30),
    "dateOfBirth" DATE,
    "nationality" VARCHAR(80),
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "passportNumberEncrypted" TEXT,
    "passportKeyVersion" VARCHAR(30),
    "passportCountry" VARCHAR(80),
    "passportIssuedAt" DATE,
    "passportExpiresAt" DATE,
    "visaStatus" "VisaStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "specialRequirements" VARCHAR(2000),
    "isPrimaryTraveller" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_travellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000),
    "city" VARCHAR(120),
    "serviceDate" DATE,
    "startDate" DATE,
    "endDate" DATE,
    "confirmationStatus" "ServiceConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationNumber" VARCHAR(255),
    "supplierName" VARCHAR(200),
    "supplierReference" VARCHAR(255),
    "customerSellingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "internalCostSnapshot" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentDueAt" TIMESTAMP(3),
    "cancellationDeadline" TIMESTAMP(3),
    "notes" VARCHAR(2000),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_itinerary_days" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE,
    "title" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "description" VARCHAR(8000) NOT NULL,
    "meals" VARCHAR(500),
    "overnightLocation" VARCHAR(120),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_payment_schedules" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_payments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "paymentScheduleId" UUID,
    "paymentNumber" VARCHAR(24) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentRecordStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "referenceNumber" VARCHAR(255),
    "bankName" VARCHAR(200),
    "notes" VARCHAR(2000),
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "reversalReason" VARCHAR(2000),

    CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_costs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingServiceId" UUID,
    "costCategory" "BookingCostCategory" NOT NULL,
    "supplierName" VARCHAR(200) NOT NULL,
    "supplierReference" VARCHAR(255),
    "description" VARCHAR(1000) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "costStatus" "BookingCostStatus" NOT NULL DEFAULT 'ESTIMATED',
    "dueDate" DATE,
    "paidAt" TIMESTAMP(3),
    "paymentReference" VARCHAR(255),
    "notes" VARCHAR(2000),
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "travellerId" UUID,
    "bookingServiceId" UUID,
    "paymentId" UUID,
    "documentType" "BookingDocumentType" NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "uploadStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "expiresAt" TIMESTAMP(3),
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "noteType" "BookingNoteType" NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "previousStatus" "BookingStatus",
    "newStatus" "BookingStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_assignment_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "previousAssigneeId" UUID,
    "newAssigneeId" UUID,
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_email_logs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "emailType" "BookingEmailType" NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "providerMessageId" VARCHAR(255),
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" VARCHAR(2000),
    "sentById" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_quotationId_key" ON "bookings"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_quotationVersionId_key" ON "bookings"("quotationVersionId");

-- CreateIndex
CREATE INDEX "bookings_companyId_queryId_deletedAt_idx" ON "bookings"("companyId", "queryId", "deletedAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_bookingStatus_deletedAt_idx" ON "bookings"("companyId", "bookingStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_operationalStatus_deletedAt_idx" ON "bookings"("companyId", "operationalStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_paymentStatus_deletedAt_idx" ON "bookings"("companyId", "paymentStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_assignedToId_deletedAt_idx" ON "bookings"("companyId", "assignedToId", "deletedAt");

-- CreateIndex
CREATE INDEX "bookings_companyId_travelStartDate_idx" ON "bookings"("companyId", "travelStartDate");

-- CreateIndex
CREATE INDEX "bookings_companyId_createdAt_idx" ON "bookings"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_companyId_bookingNumber_key" ON "bookings"("companyId", "bookingNumber");

-- CreateIndex
CREATE INDEX "booking_travellers_companyId_bookingId_deletedAt_idx" ON "booking_travellers"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_travellers_companyId_passportExpiresAt_idx" ON "booking_travellers"("companyId", "passportExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_travellers_bookingId_sequence_key" ON "booking_travellers"("bookingId", "sequence");

-- CreateIndex
CREATE INDEX "booking_services_companyId_bookingId_deletedAt_idx" ON "booking_services"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_services_companyId_confirmationStatus_idx" ON "booking_services"("companyId", "confirmationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "booking_services_bookingId_sequence_key" ON "booking_services"("bookingId", "sequence");

-- CreateIndex
CREATE INDEX "booking_itinerary_days_companyId_bookingId_idx" ON "booking_itinerary_days"("companyId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_itinerary_days_bookingId_sequence_key" ON "booking_itinerary_days"("bookingId", "sequence");

-- CreateIndex
CREATE INDEX "booking_payment_schedules_companyId_bookingId_deletedAt_idx" ON "booking_payment_schedules"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_payment_schedules_companyId_dueDate_status_idx" ON "booking_payment_schedules"("companyId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_payment_schedules_bookingId_installmentNumber_key" ON "booking_payment_schedules"("bookingId", "installmentNumber");

-- CreateIndex
CREATE INDEX "booking_payments_companyId_bookingId_createdAt_idx" ON "booking_payments"("companyId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_payments_companyId_paymentScheduleId_idx" ON "booking_payments"("companyId", "paymentScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_payments_companyId_paymentNumber_key" ON "booking_payments"("companyId", "paymentNumber");

-- CreateIndex
CREATE INDEX "booking_costs_companyId_bookingId_deletedAt_idx" ON "booking_costs"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_costs_companyId_dueDate_costStatus_idx" ON "booking_costs"("companyId", "dueDate", "costStatus");

-- CreateIndex
CREATE INDEX "booking_documents_companyId_bookingId_deletedAt_idx" ON "booking_documents"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_documents_companyId_travellerId_deletedAt_idx" ON "booking_documents"("companyId", "travellerId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_documents_companyId_bookingServiceId_deletedAt_idx" ON "booking_documents"("companyId", "bookingServiceId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_documents_companyId_paymentId_deletedAt_idx" ON "booking_documents"("companyId", "paymentId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_documents_companyId_objectKey_key" ON "booking_documents"("companyId", "objectKey");

-- CreateIndex
CREATE INDEX "booking_notes_companyId_bookingId_createdAt_idx" ON "booking_notes"("companyId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_status_history_companyId_bookingId_createdAt_idx" ON "booking_status_history"("companyId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_assignment_history_companyId_bookingId_createdAt_idx" ON "booking_assignment_history"("companyId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_email_logs_companyId_bookingId_createdAt_idx" ON "booking_email_logs"("companyId", "bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "booking_counters" ADD CONSTRAINT "booking_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_travellers" ADD CONSTRAINT "booking_travellers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_travellers" ADD CONSTRAINT "booking_travellers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_travellers" ADD CONSTRAINT "booking_travellers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_itinerary_days" ADD CONSTRAINT "booking_itinerary_days_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_itinerary_days" ADD CONSTRAINT "booking_itinerary_days_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payment_schedules" ADD CONSTRAINT "booking_payment_schedules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payment_schedules" ADD CONSTRAINT "booking_payment_schedules_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payment_schedules" ADD CONSTRAINT "booking_payment_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_paymentScheduleId_fkey" FOREIGN KEY ("paymentScheduleId") REFERENCES "booking_payment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_costs" ADD CONSTRAINT "booking_costs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_costs" ADD CONSTRAINT "booking_costs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_costs" ADD CONSTRAINT "booking_costs_bookingServiceId_fkey" FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_costs" ADD CONSTRAINT "booking_costs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "booking_travellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_bookingServiceId_fkey" FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "booking_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_history" ADD CONSTRAINT "booking_assignment_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_history" ADD CONSTRAINT "booking_assignment_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_history" ADD CONSTRAINT "booking_assignment_history_previousAssigneeId_fkey" FOREIGN KEY ("previousAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_history" ADD CONSTRAINT "booking_assignment_history_newAssigneeId_fkey" FOREIGN KEY ("newAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_history" ADD CONSTRAINT "booking_assignment_history_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_email_logs" ADD CONSTRAINT "booking_email_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_email_logs" ADD CONSTRAINT "booking_email_logs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_email_logs" ADD CONSTRAINT "booking_email_logs_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
