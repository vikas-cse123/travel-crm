-- Phase 15: Booking commercial fields, travel-master references on booking
-- services, the customer refund ledger, and new booking activity actions.
--
-- Purely additive: every new column is nullable or carries a default, every
-- master foreign key is ON DELETE SET NULL, the refund ledger protects history
-- with ON DELETE RESTRICT to the booking, and enum additions extend existing
-- types. Existing rows stay valid. The unrelated query_follow_ups index rename
-- that `migrate diff` also emits is pre-existing drift and is excluded.

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'REVERSED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_REFUND_PROCESSED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_REFUND_REVERSED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_INVOICE_GENERATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_TAX_INVOICE_GENERATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_VOUCHER_GENERATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_SERVICE_CANCELLATION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'BOOKING_SUPPLIER_PAYABLE_CREATED';

-- AlterTable
ALTER TABLE "booking_counters" ADD COLUMN     "refundValue" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "booking_services" ADD COLUMN     "addOnServiceId" UUID,
ADD COLUMN     "airlineId" UUID,
ADD COLUMN     "cancellationCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cruiseId" UUID,
ADD COLUMN     "cruiseRoomTypeId" UUID,
ADD COLUMN     "hotelId" UUID,
ADD COLUMN     "hotelMealPlanId" UUID,
ADD COLUMN     "hotelRoomTypeId" UUID,
ADD COLUMN     "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sightseeingId" UUID,
ADD COLUMN     "vehicleId" UUID;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "netProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "netRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tcsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalRefunded" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalVendorOutstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalVendorPayable" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "booking_refunds" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingPaymentId" UUID,
    "refundNumber" VARCHAR(24) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "refundMethod" "PaymentMethod" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PROCESSED',
    "reason" VARCHAR(2000) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(2000),
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "reversalReason" VARCHAR(2000),

    CONSTRAINT "booking_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_refunds_companyId_bookingId_createdAt_idx" ON "booking_refunds"("companyId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_refunds_companyId_status_idx" ON "booking_refunds"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_refunds_companyId_refundNumber_key" ON "booking_refunds"("companyId", "refundNumber");

-- CreateIndex
CREATE INDEX "booking_services_hotelId_idx" ON "booking_services"("hotelId");

-- CreateIndex
CREATE INDEX "booking_services_hotelRoomTypeId_idx" ON "booking_services"("hotelRoomTypeId");

-- CreateIndex
CREATE INDEX "booking_services_hotelMealPlanId_idx" ON "booking_services"("hotelMealPlanId");

-- CreateIndex
CREATE INDEX "booking_services_airlineId_idx" ON "booking_services"("airlineId");

-- CreateIndex
CREATE INDEX "booking_services_cruiseId_idx" ON "booking_services"("cruiseId");

-- CreateIndex
CREATE INDEX "booking_services_cruiseRoomTypeId_idx" ON "booking_services"("cruiseRoomTypeId");

-- CreateIndex
CREATE INDEX "booking_services_vehicleId_idx" ON "booking_services"("vehicleId");

-- CreateIndex
CREATE INDEX "booking_services_sightseeingId_idx" ON "booking_services"("sightseeingId");

-- CreateIndex
CREATE INDEX "booking_services_addOnServiceId_idx" ON "booking_services"("addOnServiceId");

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_hotelRoomTypeId_fkey" FOREIGN KEY ("hotelRoomTypeId") REFERENCES "hotel_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_hotelMealPlanId_fkey" FOREIGN KEY ("hotelMealPlanId") REFERENCES "hotel_meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "cruises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_cruiseRoomTypeId_fkey" FOREIGN KEY ("cruiseRoomTypeId") REFERENCES "cruise_room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_sightseeingId_fkey" FOREIGN KEY ("sightseeingId") REFERENCES "sightseeings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_addOnServiceId_fkey" FOREIGN KEY ("addOnServiceId") REFERENCES "add_on_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "booking_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
