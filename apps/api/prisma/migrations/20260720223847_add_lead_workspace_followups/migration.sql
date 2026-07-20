-- CreateEnum
CREATE TYPE "FollowUpOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'BUSY', 'SWITCHED_OFF', 'CALL_BACK_LATER', 'INTERESTED', 'NOT_INTERESTED', 'QUOTATION_REQUESTED', 'NEGOTIATING', 'READY_TO_BOOK', 'BOOKING_CONFIRMED', 'WRONG_NUMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'MEETING', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_CONTACT_RECORDED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_RESCHEDULED';
ALTER TYPE "ActivityAction" ADD VALUE 'QUERY_FOLLOW_UP_DELETED';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "query_follow_ups" ADD COLUMN     "cancellationReason" VARCHAR(1000),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completionNotes" VARCHAR(2000),
ADD COLUMN     "outcomeType" "FollowUpOutcome";

-- AlterTable
ALTER TABLE "query_notes" ADD COLUMN     "contactMethod" "ContactMethod",
ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "isCustomerContact" BOOLEAN NOT NULL DEFAULT false;
