import { z } from 'zod';

export const REMINDER_TYPES = [
  'CUSTOM',
  'LEAD_FOLLOW_UP',
  'CUSTOMER_FOLLOW_UP',
  'QUOTATION_FOLLOW_UP',
  'QUOTATION_EXPIRY',
  'BOOKING_FOLLOW_UP',
  'BOOKING_TRAVEL',
  'CUSTOMER_PAYMENT_DUE',
  'CUSTOMER_PAYMENT_OVERDUE',
  'PASSPORT_EXPIRY',
  'VISA_PENDING',
  'DOCUMENT_PENDING',
  'SERVICE_CONFIRMATION',
  'VENDOR_PAYMENT_DUE',
  'VENDOR_PAYMENT_OVERDUE',
  'SUPPLIER_CONFIRMATION',
  'OTHER',
] as const;

export const REMINDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const REMINDER_STATUSES = [
  'ACTIVE',
  'OVERDUE',
  'SNOOZED',
  'COMPLETED',
  'CANCELLED',
] as const;
export const REMINDER_SOURCES = [
  'MANUAL',
  'LEAD_STAGE_RULE',
  'BOOKING_RULE',
  'PAYMENT_RULE',
  'QUOTATION_RULE',
  'DOCUMENT_RULE',
  'VENDOR_RULE',
  'SYSTEM',
] as const;
export const REMINDER_RULE_TYPES = [
  'LEAD_STAGE',
  'BOOKING_TRAVEL',
  'CUSTOMER_PAYMENT',
  'BOOKING_DOCUMENT',
  'VISA',
  'SERVICE_CONFIRMATION',
  'QUOTATION_EXPIRY',
  'VENDOR_PAYABLE',
  'VENDOR_CONTRACT',
] as const;
export const REMINDER_DELAY_UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS'] as const;
export const REMINDER_ASSIGNMENT_MODES = [
  'ENTITY_ASSIGNEE',
  'ENTITY_CREATOR',
  'LEAD_ASSIGNEE',
  'LEAD_CREATOR',
  'BOOKING_ASSIGNEE',
  'VENDOR_ASSIGNEE',
  'FIXED_USER',
] as const;
export const NOTIFICATION_CATEGORIES = [
  'REMINDER',
  'REMINDER_OVERDUE',
  'ESCALATION',
  'BOOKING',
  'PAYMENT',
  'QUOTATION',
  'DOCUMENT',
  'VENDOR',
  'SYSTEM',
] as const;
export const NOTIFICATION_SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;
export const NOTIFICATION_STATUSES = ['UNREAD', 'READ', 'ARCHIVED'] as const;
export const NOTIFICATION_DIGEST_MODES = ['IMMEDIATE', 'DAILY', 'NONE'] as const;
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;

const nullableId = z.string().uuid().nullish();

export const reminderInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullish(),
  dueAt: z.coerce.date(),
  assignedToId: z.string().uuid(),
  reminderType: z.enum(REMINDER_TYPES).default('CUSTOM'),
  priority: z.enum(REMINDER_PRIORITIES).default('MEDIUM'),
  queryId: nullableId,
  customerId: nullableId,
  quotationId: nullableId,
  bookingId: nullableId,
  bookingPaymentScheduleId: nullableId,
  bookingTravellerId: nullableId,
  bookingServiceId: nullableId,
  vendorId: nullableId,
  vendorPayableId: nullableId,
});

export const reminderUpdateSchema = reminderInputSchema.partial();
export const reminderCompleteSchema = z.object({
  outcome: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});
export const reminderSnoozeSchema = z.object({
  until: z.coerce.date(),
  reason: z.string().trim().max(1000).nullish(),
});
export const reminderCancelSchema = z.object({ reason: z.string().trim().min(2).max(1000) });
export const reminderAssignmentSchema = z.object({ assignedToId: z.string().uuid() });

const reminderRuleBaseSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).nullish(),
  ruleType: z.enum(REMINDER_RULE_TYPES),
  isEnabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
  leadStage: z.string().trim().max(80).nullish(),
  reminderType: z.enum(REMINDER_TYPES),
  priority: z.enum(REMINDER_PRIORITIES).default('MEDIUM'),
  delayValue: z.coerce.number().int().min(0).max(3650).default(1),
  delayUnit: z.enum(REMINDER_DELAY_UNITS).default('DAYS'),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('10:00'),
  assignToMode: z.enum(REMINDER_ASSIGNMENT_MODES).default('ENTITY_ASSIGNEE'),
  fixedUserId: nullableId,
  titleTemplate: z.string().trim().min(2).max(300),
  descriptionTemplate: z.string().trim().max(2000).nullish(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).default(['IN_APP']),
  escalationEnabled: z.boolean().default(false),
  escalationAfterValue: z.coerce.number().int().positive().max(3650).nullish(),
  escalationAfterUnit: z.enum(REMINDER_DELAY_UNITS).nullish(),
  escalationRoleName: z.string().trim().max(80).nullish(),
  configuration: z.record(z.unknown()).nullish(),
});

export const reminderRuleInputSchema = reminderRuleBaseSchema.superRefine((value, context) => {
  if (value.assignToMode === 'FIXED_USER' && !value.fixedUserId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedUserId'],
      message: 'Select a user for fixed-user assignment.',
    });
  }
});

export const reminderRuleUpdateSchema = reminderRuleBaseSchema.partial();

export const notificationPreferenceSchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  reminderAlerts: z.boolean(),
  overdueAlerts: z.boolean(),
  escalationAlerts: z.boolean(),
  bookingAlerts: z.boolean(),
  paymentAlerts: z.boolean(),
  quotationAlerts: z.boolean(),
  documentAlerts: z.boolean(),
  vendorAlerts: z.boolean(),
  digestMode: z.enum(NOTIFICATION_DIGEST_MODES),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
});

export type ReminderType = (typeof REMINDER_TYPES)[number];
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
export type ReminderSource = (typeof REMINDER_SOURCES)[number];
export type ReminderRuleType = (typeof REMINDER_RULE_TYPES)[number];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type ReminderInput = z.infer<typeof reminderInputSchema>;
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;
export type ReminderCompleteInput = z.infer<typeof reminderCompleteSchema>;
export type ReminderSnoozeInput = z.infer<typeof reminderSnoozeSchema>;
export type ReminderRuleInput = z.infer<typeof reminderRuleInputSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

export interface ReminderSummary {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: ReminderStatus;
  priority: ReminderPriority;
  reminderType: ReminderType;
  source: ReminderSource;
  assignedTo: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
  linkedEntity: { type: string; id: string; label: string; href: string } | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}
