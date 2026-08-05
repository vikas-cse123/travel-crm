-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "gstMode" VARCHAR(16),
ADD COLUMN     "gstRate" INTEGER,
ADD COLUMN     "placeOfSupply" VARCHAR(80),
ADD COLUMN     "tcsExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" VARCHAR(200);

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultGstMode" VARCHAR(16) NOT NULL DEFAULT 'ADDITIVE',
ADD COLUMN     "defaultGstRate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "booking_reminders" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "assignedToId" UUID,
    "daysBefore" INTEGER NOT NULL,
    "dueTime" VARCHAR(5) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "booking_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_reminders_companyId_bookingId_deletedAt_idx" ON "booking_reminders"("companyId", "bookingId", "deletedAt");

-- CreateIndex
CREATE INDEX "booking_reminders_companyId_status_scheduledAt_idx" ON "booking_reminders"("companyId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_reminders_bookingId_daysBefore_key" ON "booking_reminders"("bookingId", "daysBefore");

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "query_follow_ups_companyId_bookingId_reminderType_scheduledAt_i" RENAME TO "query_follow_ups_companyId_bookingId_reminderType_scheduled_idx";
