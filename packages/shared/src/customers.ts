import { z } from 'zod';

export const CUSTOMER_TYPES = ['INDIVIDUAL', 'CORPORATE', 'AGENT', 'GROUP'] as const;
export type CustomerTypeValue = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED', 'MERGED'] as const;
export type CustomerStatusValue = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_LIFECYCLE_STAGES = [
  'NEW',
  'PROSPECT',
  'QUALIFIED',
  'QUOTED',
  'BOOKED',
  'REPEAT',
  'ACTIVE_CUSTOMER',
  'REPEAT_CUSTOMER',
  'LAPSED',
  'VIP',
  'INACTIVE',
] as const;
export type CustomerLifecycleStageValue = (typeof CUSTOMER_LIFECYCLE_STAGES)[number];
export const CUSTOMER_ADDRESS_TYPES = ['HOME', 'WORK', 'OFFICE', 'BILLING', 'OTHER'] as const;
export type CustomerAddressTypeValue = (typeof CUSTOMER_ADDRESS_TYPES)[number];
export const CUSTOMER_NOTE_TYPES = [
  'GENERAL',
  'SALES',
  'SERVICE',
  'FINANCIAL',
  'PREFERENCE',
  'WARNING',
  'INTERNAL',
] as const;
export type CustomerNoteTypeValue = (typeof CUSTOMER_NOTE_TYPES)[number];
export const CUSTOMER_COMMUNICATION_TYPES = [
  'PHONE',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'MEETING',
  'OTHER',
] as const;
export type CustomerCommunicationTypeValue = (typeof CUSTOMER_COMMUNICATION_TYPES)[number];
export const CUSTOMER_COMMUNICATION_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'] as const;
export type CustomerCommunicationDirectionValue =
  (typeof CUSTOMER_COMMUNICATION_DIRECTIONS)[number];
export const CUSTOMER_DOCUMENT_TYPES = [
  'AGREEMENT',
  'CORPORATE_IDENTIFICATION',
  'CONSENT_FORM',
  'GENERAL_ATTACHMENT',
  'PASSPORT',
  'VISA',
  'IDENTITY_DOCUMENT',
  'PAN_CARD',
  'ADDRESS_PROOF',
  'PROFILE_PHOTO',
  'OTHER',
] as const;
export type CustomerDocumentTypeValue = (typeof CUSTOMER_DOCUMENT_TYPES)[number];

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const optionalEmail = z.string().trim().email().max(255).nullable().optional().or(z.literal(''));

export const customerAddressInputSchema = z.object({
  type: z.enum(CUSTOMER_ADDRESS_TYPES).default('HOME'),
  label: optionalText(80),
  line1: z.string().trim().min(1).max(255),
  line2: optionalText(255),
  city: z.string().trim().min(1).max(120),
  state: optionalText(120),
  postalCode: optionalText(24),
  country: z.string().trim().min(2).max(80),
  isPrimary: z.boolean().default(false),
});

const customerBaseSchema = z.object({
  type: z.enum(CUSTOMER_TYPES).default('INDIVIDUAL'),
  status: z.enum(CUSTOMER_STATUSES).exclude(['MERGED']).default('ACTIVE'),
  lifecycleStage: z.enum(CUSTOMER_LIFECYCLE_STAGES).default('PROSPECT'),
  displayName: z.string().trim().min(2).max(160),
  primaryPhone: optionalText(32),
  alternatePhone: optionalText(32),
  email: optionalEmail,
  dateOfBirth: optionalDate,
  anniversaryDate: optionalDate,
  companyName: optionalText(160),
  taxIdentification: optionalText(80),
  preferredContactMethod: z.enum(CUSTOMER_COMMUNICATION_TYPES).nullable().optional(),
  preferredCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('INR'),
  preferredLanguage: optionalText(40),
  travelPreferences: optionalText(4000),
  dietaryRequirements: optionalText(2000),
  specialRequirements: optionalText(2000),
  source: optionalText(80),
  assignedToId: z.string().uuid().nullable().optional(),
  addresses: z.array(customerAddressInputSchema).max(20).default([]),
  tagIds: z.array(z.string().uuid()).max(50).default([]),
  createAnyway: z.boolean().default(false),
});

export const customerInputSchema = customerBaseSchema.superRefine((value, context) => {
  if (!value.primaryPhone && !value.email)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primaryPhone'],
      message: 'A phone number or email address is required.',
    });
  if (value.type === 'CORPORATE' && !value.companyName)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['companyName'],
      message: 'Company name is required for corporate customers.',
    });
});

export const customerUpdateSchema = customerBaseSchema
  .omit({ addresses: true, tagIds: true, createAnyway: true })
  .partial();

export const customerDuplicateCheckSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(255).optional(),
  excludeCustomerId: z.string().uuid().optional(),
});

export const customerAssignmentSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
});

export const customerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED']),
});

export const customerTagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#64748b'),
  description: optionalText(500),
});

export const customerTagAssignmentSchema = z.object({ tagId: z.string().uuid() });

export const customerNoteInputSchema = z.object({
  type: z.enum(CUSTOMER_NOTE_TYPES).default('GENERAL'),
  content: z.string().trim().min(1).max(4000),
  isPinned: z.boolean().default(false),
});
export const customerNoteUpdateSchema = customerNoteInputSchema.partial();

export const customerCommunicationInputSchema = z.object({
  type: z.enum(CUSTOMER_COMMUNICATION_TYPES),
  direction: z.enum(CUSTOMER_COMMUNICATION_DIRECTIONS),
  subject: optionalText(200),
  summary: z.string().trim().min(1).max(4000),
  occurredAt: z.coerce.date().default(() => new Date()),
  leadId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  durationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
  outcome: optionalText(500),
  nextAction: optionalText(1000),
  nextActionAt: optionalDate,
});
export const customerCommunicationUpdateSchema = customerCommunicationInputSchema.partial();

export const customerDocumentUploadSchema = z.object({
  type: z.enum([
    'AGREEMENT',
    'CORPORATE_IDENTIFICATION',
    'CONSENT_FORM',
    'GENERAL_ATTACHMENT',
    'IDENTITY_DOCUMENT',
    'ADDRESS_PROOF',
    'OTHER',
  ]),
  name: z.string().trim().min(1).max(255),
  description: optionalText(1000),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.coerce.number().int().positive(),
  expiresAt: optionalDate,
});

export const customerMergeSchema = z.object({
  sourceCustomerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
  reason: optionalText(1000),
  fieldChoices: z.record(z.string(), z.enum(['source', 'target'])).default({}),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerDuplicateCheck = z.infer<typeof customerDuplicateCheckSchema>;
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;
export type CustomerTagInput = z.infer<typeof customerTagInputSchema>;
export type CustomerNoteInput = z.infer<typeof customerNoteInputSchema>;
export type CustomerCommunicationInput = z.infer<typeof customerCommunicationInputSchema>;
export type CustomerCommunicationUpdateInput = z.infer<typeof customerCommunicationUpdateSchema>;
export type CustomerDocumentUpload = z.infer<typeof customerDocumentUploadSchema>;
export type CustomerMergeInput = z.infer<typeof customerMergeSchema>;
