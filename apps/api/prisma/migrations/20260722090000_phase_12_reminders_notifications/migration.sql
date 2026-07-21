CREATE TYPE "ReminderType" AS ENUM ('CUSTOM', 'LEAD_FOLLOW_UP', 'CUSTOMER_FOLLOW_UP', 'QUOTATION_FOLLOW_UP', 'QUOTATION_EXPIRY', 'BOOKING_FOLLOW_UP', 'BOOKING_TRAVEL', 'CUSTOMER_PAYMENT_DUE', 'CUSTOMER_PAYMENT_OVERDUE', 'PASSPORT_EXPIRY', 'VISA_PENDING', 'DOCUMENT_PENDING', 'SERVICE_CONFIRMATION', 'VENDOR_PAYMENT_DUE', 'VENDOR_PAYMENT_OVERDUE', 'SUPPLIER_CONFIRMATION', 'OTHER');
CREATE TYPE "ReminderSource" AS ENUM ('MANUAL', 'LEAD_STAGE_RULE', 'BOOKING_RULE', 'PAYMENT_RULE', 'QUOTATION_RULE', 'DOCUMENT_RULE', 'VENDOR_RULE', 'SYSTEM');
CREATE TYPE "ReminderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ReminderRuleType" AS ENUM ('LEAD_STAGE', 'BOOKING_TRAVEL', 'CUSTOMER_PAYMENT', 'BOOKING_DOCUMENT', 'VISA', 'SERVICE_CONFIRMATION', 'QUOTATION_EXPIRY', 'VENDOR_PAYABLE', 'VENDOR_CONTRACT');
CREATE TYPE "ReminderDelayUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS');
CREATE TYPE "ReminderAssignToMode" AS ENUM ('ENTITY_ASSIGNEE', 'ENTITY_CREATOR', 'LEAD_ASSIGNEE', 'LEAD_CREATOR', 'BOOKING_ASSIGNEE', 'VENDOR_ASSIGNEE', 'FIXED_USER');
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
CREATE TYPE "NotificationCategory" AS ENUM ('REMINDER', 'REMINDER_OVERDUE', 'ESCALATION', 'BOOKING', 'PAYMENT', 'QUOTATION', 'DOCUMENT', 'VENDOR', 'SYSTEM');
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "NotificationDigestMode" AS ENUM ('IMMEDIATE', 'DAILY', 'NONE');
CREATE TYPE "ReminderExecutionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

ALTER TYPE "FollowUpStatus" ADD VALUE 'SNOOZED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_COMPLETED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_SNOOZED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_CANCELLED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_REASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_RULE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_RULE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_RULE_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_RULE_RESET';
ALTER TYPE "ActivityAction" ADD VALUE 'REMINDER_WORKER_PROCESSED';
ALTER TYPE "ActivityAction" ADD VALUE 'NOTIFICATION_READ';
ALTER TYPE "ActivityAction" ADD VALUE 'NOTIFICATION_UNREAD';
ALTER TYPE "ActivityAction" ADD VALUE 'NOTIFICATION_ARCHIVED';
ALTER TYPE "ActivityAction" ADD VALUE 'NOTIFICATIONS_READ_ALL';
ALTER TYPE "ActivityAction" ADD VALUE 'NOTIFICATION_PREFERENCES_UPDATED';

ALTER TABLE "query_follow_ups" DROP CONSTRAINT "query_follow_ups_queryId_fkey";
ALTER TABLE "query_follow_ups"
  ADD COLUMN "bookingId" UUID,
  ADD COLUMN "bookingPaymentScheduleId" UUID,
  ADD COLUMN "bookingServiceId" UUID,
  ADD COLUMN "bookingTravellerId" UUID,
  ADD COLUMN "cancelledById" UUID,
  ADD COLUMN "completedById" UUID,
  ADD COLUMN "completionOutcome" VARCHAR(500),
  ADD COLUMN "customerId" UUID,
  ADD COLUMN "deduplicationKey" VARCHAR(255),
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "originalDueAt" TIMESTAMP(3),
  ADD COLUMN "quotationId" UUID,
  ADD COLUMN "reminderPriority" "ReminderPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "reminderRuleId" UUID,
  ADD COLUMN "reminderType" "ReminderType" NOT NULL DEFAULT 'LEAD_FOLLOW_UP',
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "source" "ReminderSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "title" VARCHAR(200) NOT NULL DEFAULT 'Follow-up',
  ADD COLUMN "vendorId" UUID,
  ADD COLUMN "vendorPayableId" UUID,
  ALTER COLUMN "queryId" DROP NOT NULL;

UPDATE "query_follow_ups" f
SET "title" = CONCAT('Follow up ', q."queryNumber", ' · ', q."customerName"),
    "customerId" = q."customerId"
FROM "queries" q
WHERE f."queryId" = q."id";

CREATE TABLE "reminder_rules" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "createdById" UUID NOT NULL,
  "fixedUserId" UUID, "name" VARCHAR(160) NOT NULL, "description" VARCHAR(1000),
  "ruleType" "ReminderRuleType" NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "leadStage" "LeadStage",
  "reminderType" "ReminderType" NOT NULL, "reminderPriority" "ReminderPriority" NOT NULL DEFAULT 'MEDIUM',
  "delayValue" INTEGER NOT NULL DEFAULT 1, "delayUnit" "ReminderDelayUnit" NOT NULL DEFAULT 'DAYS',
  "dueTime" VARCHAR(5) NOT NULL DEFAULT '10:00', "assignToMode" "ReminderAssignToMode" NOT NULL DEFAULT 'ENTITY_ASSIGNEE',
  "titleTemplate" VARCHAR(300) NOT NULL, "descriptionTemplate" VARCHAR(2000),
  "channels" "NotificationDeliveryChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"NotificationDeliveryChannel"[],
  "escalationEnabled" BOOLEAN NOT NULL DEFAULT false, "escalationAfterValue" INTEGER,
  "escalationAfterUnit" "ReminderDelayUnit", "escalationRoleName" VARCHAR(80), "configuration" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "recipientUserId" UUID NOT NULL, "reminderId" UUID,
  "category" "NotificationCategory" NOT NULL, "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD', "title" VARCHAR(200) NOT NULL,
  "message" VARCHAR(2000) NOT NULL, "actionUrl" VARCHAR(500), "entityType" VARCHAR(80), "entityId" UUID,
  "deduplicationKey" VARCHAR(255), "metadata" JSONB, "readAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "userId" UUID NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true, "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "reminderAlerts" BOOLEAN NOT NULL DEFAULT true, "overdueAlerts" BOOLEAN NOT NULL DEFAULT true,
  "escalationAlerts" BOOLEAN NOT NULL DEFAULT true, "bookingAlerts" BOOLEAN NOT NULL DEFAULT true,
  "paymentAlerts" BOOLEAN NOT NULL DEFAULT true, "quotationAlerts" BOOLEAN NOT NULL DEFAULT true,
  "documentAlerts" BOOLEAN NOT NULL DEFAULT true, "vendorAlerts" BOOLEAN NOT NULL DEFAULT true,
  "digestMode" "NotificationDigestMode" NOT NULL DEFAULT 'IMMEDIATE', "quietHoursStart" VARCHAR(5),
  "quietHoursEnd" VARCHAR(5), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "notificationId" UUID NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL, "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientAddress" VARCHAR(255), "attempts" INTEGER NOT NULL DEFAULT 0, "providerMessageId" VARCHAR(255),
  "lastError" VARCHAR(2000), "nextAttemptAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_executions" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "ruleId" UUID, "entityType" VARCHAR(80) NOT NULL,
  "entityId" UUID NOT NULL, "triggerKey" VARCHAR(255) NOT NULL,
  "status" "ReminderExecutionStatus" NOT NULL DEFAULT 'PENDING', "reminderId" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0, "errorMessage" VARCHAR(2000),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminder_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_escalations" (
  "id" UUID NOT NULL, "companyId" UUID NOT NULL, "reminderId" UUID NOT NULL,
  "escalatedToUserId" UUID NOT NULL, "escalationLevel" INTEGER NOT NULL DEFAULT 1,
  "reason" VARCHAR(1000) NOT NULL, "deduplicationKey" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_escalations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reminder_rules_companyId_name_key" ON "reminder_rules"("companyId", "name");
CREATE INDEX "reminder_rules_companyId_ruleType_isEnabled_deletedAt_idx" ON "reminder_rules"("companyId", "ruleType", "isEnabled", "deletedAt");
CREATE UNIQUE INDEX "notifications_companyId_recipientUserId_deduplicationKey_key" ON "notifications"("companyId", "recipientUserId", "deduplicationKey");
CREATE INDEX "notifications_companyId_recipientUserId_status_createdAt_idx" ON "notifications"("companyId", "recipientUserId", "status", "createdAt");
CREATE INDEX "notifications_companyId_category_createdAt_idx" ON "notifications"("companyId", "category", "createdAt");
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");
CREATE INDEX "notification_preferences_companyId_userId_idx" ON "notification_preferences"("companyId", "userId");
CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key" ON "notification_deliveries"("notificationId", "channel");
CREATE INDEX "notification_deliveries_companyId_status_nextAttemptAt_idx" ON "notification_deliveries"("companyId", "status", "nextAttemptAt");
CREATE UNIQUE INDEX "reminder_executions_companyId_triggerKey_key" ON "reminder_executions"("companyId", "triggerKey");
CREATE INDEX "reminder_executions_companyId_status_startedAt_idx" ON "reminder_executions"("companyId", "status", "startedAt");
CREATE UNIQUE INDEX "reminder_escalations_companyId_deduplicationKey_key" ON "reminder_escalations"("companyId", "deduplicationKey");
CREATE INDEX "reminder_escalations_companyId_reminderId_createdAt_idx" ON "reminder_escalations"("companyId", "reminderId", "createdAt");
CREATE UNIQUE INDEX "query_follow_ups_companyId_deduplicationKey_key" ON "query_follow_ups"("companyId", "deduplicationKey");
CREATE INDEX "query_follow_ups_companyId_bookingId_reminderType_scheduledAt_idx" ON "query_follow_ups"("companyId", "bookingId", "reminderType", "scheduledAt");
CREATE INDEX "query_follow_ups_companyId_reminderType_source_scheduledAt_idx" ON "query_follow_ups"("companyId", "reminderType", "source", "scheduledAt");

ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_bookingPaymentScheduleId_fkey" FOREIGN KEY ("bookingPaymentScheduleId") REFERENCES "booking_payment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_bookingTravellerId_fkey" FOREIGN KEY ("bookingTravellerId") REFERENCES "booking_travellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_bookingServiceId_fkey" FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_vendorPayableId_fkey" FOREIGN KEY ("vendorPayableId") REFERENCES "vendor_payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_fixedUserId_fkey" FOREIGN KEY ("fixedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_reminderRuleId_fkey" FOREIGN KEY ("reminderRuleId") REFERENCES "reminder_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "query_follow_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_executions" ADD CONSTRAINT "reminder_executions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_executions" ADD CONSTRAINT "reminder_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "reminder_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_escalations" ADD CONSTRAINT "reminder_escalations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_escalations" ADD CONSTRAINT "reminder_escalations_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "query_follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_escalations" ADD CONSTRAINT "reminder_escalations_escalatedToUserId_fkey" FOREIGN KEY ("escalatedToUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
