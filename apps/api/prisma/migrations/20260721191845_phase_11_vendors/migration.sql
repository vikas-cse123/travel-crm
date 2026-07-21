-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('HOTEL', 'AIRLINE', 'TRANSPORT', 'DMC', 'CRUISE', 'SIGHTSEEING', 'VISA', 'INSURANCE', 'GUIDE', 'RAIL', 'RESTAURANT', 'ACTIVITY_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VendorContractType" AS ENUM ('NET_RATE', 'COMMISSION_BASED', 'FIXED_CONTRACT', 'ON_REQUEST', 'NO_CONTRACT');

-- CreateEnum
CREATE TYPE "VendorPaymentTerm" AS ENUM ('IMMEDIATE', 'ADVANCE', 'NET_7', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VendorPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "VendorServiceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VendorNoteType" AS ENUM ('GENERAL', 'CONTRACT', 'SERVICE', 'PAYMENT', 'PERFORMANCE', 'WARNING');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('RATE_CONTRACT', 'SUPPLIER_AGREEMENT', 'GST_CERTIFICATE', 'PAN_DOCUMENT', 'BANK_PROOF', 'CANCELLED_CHEQUE', 'SERVICE_BROCHURE', 'RATE_SHEET', 'INSURANCE_CERTIFICATE', 'INVOICE', 'PAYMENT_RECEIPT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_CONTACT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_CONTACT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_SERVICE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_SERVICE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_SERVICE_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_RATE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_RATE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_LINKED_TO_BOOKING_SERVICE';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_PAYABLE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_PAYABLE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_PAYMENT_RECORDED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_PAYMENT_REVERSED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_DOCUMENT_UPLOADED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_DOCUMENT_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_NOTE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'VENDOR_RATING_UPDATED';

-- AlterTable
ALTER TABLE "booking_costs" ADD COLUMN     "vendorId" UUID;

-- AlterTable
ALTER TABLE "booking_services" ADD COLUMN     "supplierConfirmationNumber" VARCHAR(255),
ADD COLUMN     "vendorId" UUID,
ADD COLUMN     "vendorNameSnapshot" VARCHAR(200),
ADD COLUMN     "vendorServiceId" UUID,
ADD COLUMN     "vendorServiceSnapshot" VARCHAR(200);

-- CreateTable
CREATE TABLE "vendor_counters" (
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "vendorValue" INTEGER NOT NULL DEFAULT 0,
    "payableValue" INTEGER NOT NULL DEFAULT 0,
    "paymentValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_counters_pkey" PRIMARY KEY ("companyId","year")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorCode" VARCHAR(24) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "vendorType" "VendorType" NOT NULL,
    "contactPerson" VARCHAR(160),
    "primaryPhone" VARCHAR(32),
    "normalizedPhone" VARCHAR(24),
    "primaryEmail" VARCHAR(255),
    "normalizedEmail" VARCHAR(255),
    "address" VARCHAR(1000),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "country" VARCHAR(80),
    "postalCode" VARCHAR(24),
    "coverageAreas" VARCHAR(2000),
    "servicesOffered" VARCHAR(2000),
    "contractType" "VendorContractType" NOT NULL DEFAULT 'NET_RATE',
    "contractStartDate" DATE,
    "contractEndDate" DATE,
    "paymentTerm" "VendorPaymentTerm" NOT NULL DEFAULT 'NET_30',
    "customPaymentTermDays" INTEGER,
    "taxRegistrationNumber" VARCHAR(80),
    "gstNumber" VARCHAR(32),
    "panNumber" VARCHAR(20),
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "rating" DECIMAL(3,2),
    "confirmationRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "totalBusiness" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOutstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "averageBookingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contacts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "designation" VARCHAR(120),
    "phone" VARCHAR(32),
    "normalizedPhone" VARCHAR(24),
    "email" VARCHAR(255),
    "normalizedEmail" VARCHAR(255),
    "whatsappPhone" VARCHAR(32),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "destination" VARCHAR(160),
    "city" VARCHAR(120),
    "coverageArea" VARCHAR(500),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "baseCost" DECIMAL(14,2),
    "sellingReferencePrice" DECIMAL(14,2),
    "taxPercentage" DECIMAL(7,4),
    "commissionPercentage" DECIMAL(7,4),
    "minimumQuantity" INTEGER,
    "maximumQuantity" INTEGER,
    "validFrom" DATE,
    "validUntil" DATE,
    "status" "VendorServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_rates" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorServiceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "rateType" VARCHAR(40) NOT NULL DEFAULT 'NET_RATE',
    "netRate" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2),
    "commissionAmount" DECIMAL(14,2),
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE NOT NULL,
    "seasonName" VARCHAR(120),
    "weekdayRules" JSONB,
    "minimumQuantity" INTEGER,
    "minimumNights" INTEGER,
    "cancellationPolicy" VARCHAR(4000),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "vendorServiceId" UUID,
    "documentType" "VendorDocumentType" NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "uploadStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "noteType" "VendorNoteType" NOT NULL DEFAULT 'GENERAL',
    "content" VARCHAR(4000) NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payables" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingServiceId" UUID,
    "bookingCostId" UUID,
    "payableNumber" VARCHAR(28) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(14,2) NOT NULL,
    "dueDate" DATE,
    "paymentStatus" "VendorPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "supplierInvoiceNumber" VARCHAR(160),
    "supplierInvoiceDate" DATE,
    "notes" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "paymentNumber" VARCHAR(28) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentRecordStatus" NOT NULL DEFAULT 'CLEARED',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "referenceNumber" VARCHAR(255),
    "bankName" VARCHAR(200),
    "notes" VARCHAR(2000),
    "receiptDocumentId" UUID,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "reversalReason" VARCHAR(2000),

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payment_allocations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorPaymentId" UUID NOT NULL,
    "vendorPayableId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bank_accounts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "accountHolderName" VARCHAR(200) NOT NULL,
    "bankName" VARCHAR(200) NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountNumberLast4" VARCHAR(4) NOT NULL,
    "encryptionKeyVersion" VARCHAR(30) NOT NULL,
    "ifscCode" VARCHAR(20),
    "swiftCode" VARCHAR(20),
    "branchName" VARCHAR(160),
    "accountType" VARCHAR(40),
    "currency" VARCHAR(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_companyId_normalizedPhone_deletedAt_idx" ON "vendors"("companyId", "normalizedPhone", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_companyId_normalizedEmail_deletedAt_idx" ON "vendors"("companyId", "normalizedEmail", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_companyId_normalizedName_city_deletedAt_idx" ON "vendors"("companyId", "normalizedName", "city", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_companyId_vendorType_status_deletedAt_idx" ON "vendors"("companyId", "vendorType", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_companyId_totalOutstanding_idx" ON "vendors"("companyId", "totalOutstanding");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_companyId_vendorCode_key" ON "vendors"("companyId", "vendorCode");

-- CreateIndex
CREATE INDEX "vendor_contacts_companyId_vendorId_deletedAt_idx" ON "vendor_contacts"("companyId", "vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "vendor_services_companyId_vendorId_status_deletedAt_idx" ON "vendor_services"("companyId", "vendorId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "vendor_services_companyId_serviceType_city_idx" ON "vendor_services"("companyId", "serviceType", "city");

-- CreateIndex
CREATE INDEX "vendor_rates_companyId_vendorServiceId_effectiveFrom_effect_idx" ON "vendor_rates"("companyId", "vendorServiceId", "effectiveFrom", "effectiveUntil");

-- CreateIndex
CREATE INDEX "vendor_documents_companyId_vendorId_deletedAt_idx" ON "vendor_documents"("companyId", "vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "vendor_notes_companyId_vendorId_deletedAt_idx" ON "vendor_notes"("companyId", "vendorId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payables_bookingCostId_key" ON "vendor_payables"("bookingCostId");

-- CreateIndex
CREATE INDEX "vendor_payables_companyId_vendorId_paymentStatus_dueDate_idx" ON "vendor_payables"("companyId", "vendorId", "paymentStatus", "dueDate");

-- CreateIndex
CREATE INDEX "vendor_payables_companyId_bookingId_idx" ON "vendor_payables"("companyId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payables_companyId_payableNumber_key" ON "vendor_payables"("companyId", "payableNumber");

-- CreateIndex
CREATE INDEX "vendor_payments_companyId_vendorId_paidAt_idx" ON "vendor_payments"("companyId", "vendorId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payments_companyId_paymentNumber_key" ON "vendor_payments"("companyId", "paymentNumber");

-- CreateIndex
CREATE INDEX "vendor_payment_allocations_companyId_vendorPayableId_idx" ON "vendor_payment_allocations"("companyId", "vendorPayableId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payment_allocations_vendorPaymentId_vendorPayableId_key" ON "vendor_payment_allocations"("vendorPaymentId", "vendorPayableId");

-- CreateIndex
CREATE INDEX "vendor_bank_accounts_companyId_vendorId_deletedAt_idx" ON "vendor_bank_accounts"("companyId", "vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_costs_companyId_vendorId_deletedAt_idx" ON "booking_costs"("companyId", "vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_services_companyId_vendorId_deletedAt_idx" ON "booking_services"("companyId", "vendorId", "deletedAt");

-- AddForeignKey
ALTER TABLE "vendor_counters" ADD CONSTRAINT "vendor_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_vendorServiceId_fkey" FOREIGN KEY ("vendorServiceId") REFERENCES "vendor_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendorServiceId_fkey" FOREIGN KEY ("vendorServiceId") REFERENCES "vendor_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_notes" ADD CONSTRAINT "vendor_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_notes" ADD CONSTRAINT "vendor_notes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_notes" ADD CONSTRAINT "vendor_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_bookingServiceId_fkey" FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_bookingCostId_fkey" FOREIGN KEY ("bookingCostId") REFERENCES "booking_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendorPaymentId_fkey" FOREIGN KEY ("vendorPaymentId") REFERENCES "vendor_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendorPayableId_fkey" FOREIGN KEY ("vendorPayableId") REFERENCES "vendor_payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_vendorServiceId_fkey" FOREIGN KEY ("vendorServiceId") REFERENCES "vendor_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_costs" ADD CONSTRAINT "booking_costs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
