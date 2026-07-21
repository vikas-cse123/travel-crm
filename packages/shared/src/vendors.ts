import { z } from 'zod';
import { PAYMENT_METHODS, SERVICE_CONFIRMATION_STATUSES } from './bookings.js';
import { SERVICE_TYPES } from './queries.js';

export const VENDOR_TYPES = [
  'HOTEL',
  'AIRLINE',
  'TRANSPORT',
  'DMC',
  'CRUISE',
  'SIGHTSEEING',
  'VISA',
  'INSURANCE',
  'GUIDE',
  'RAIL',
  'RESTAURANT',
  'ACTIVITY_PROVIDER',
  'OTHER',
] as const;
export const VENDOR_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const VENDOR_CONTRACT_TYPES = [
  'NET_RATE',
  'COMMISSION_BASED',
  'FIXED_CONTRACT',
  'ON_REQUEST',
  'NO_CONTRACT',
] as const;
export const VENDOR_PAYMENT_TERMS = [
  'IMMEDIATE',
  'ADVANCE',
  'NET_7',
  'NET_15',
  'NET_30',
  'NET_45',
  'NET_60',
  'CUSTOM',
] as const;
export const VENDOR_PAYMENT_STATUSES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED',
] as const;
export const VENDOR_SERVICE_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const VENDOR_NOTE_TYPES = [
  'GENERAL',
  'CONTRACT',
  'SERVICE',
  'PAYMENT',
  'PERFORMANCE',
  'WARNING',
] as const;
export const VENDOR_DOCUMENT_TYPES = [
  'RATE_CONTRACT',
  'SUPPLIER_AGREEMENT',
  'GST_CERTIFICATE',
  'PAN_DOCUMENT',
  'BANK_PROOF',
  'CANCELLED_CHEQUE',
  'SERVICE_BROCHURE',
  'RATE_SHEET',
  'INSURANCE_CERTIFICATE',
  'INVOICE',
  'PAYMENT_RECEIPT',
  'OTHER',
] as const;

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableDate = z.coerce.date().nullable().optional();
const money = z.coerce.number().finite().min(0).max(999_999_999_999);
const positiveMoney = z.coerce.number().finite().positive().max(999_999_999_999);
const currency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const vendorDuplicateSchema = z.object({
  name: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  gstNumber: z.string().trim().max(32).optional(),
  panNumber: z.string().trim().max(20).optional(),
  excludeVendorId: z.string().uuid().optional(),
});

const vendorInputBaseSchema = z.object({
  name: z.string().trim().min(2).max(200),
  vendorType: z.enum(VENDOR_TYPES),
  contactPerson: nullableText(160),
  primaryPhone: nullableText(32),
  primaryEmail: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  address: nullableText(1000),
  city: nullableText(120),
  state: nullableText(120),
  country: nullableText(80),
  postalCode: nullableText(24),
  coverageAreas: nullableText(2000),
  servicesOffered: nullableText(2000),
  contractType: z.enum(VENDOR_CONTRACT_TYPES).default('NET_RATE'),
  contractStartDate: nullableDate,
  contractEndDate: nullableDate,
  paymentTerm: z.enum(VENDOR_PAYMENT_TERMS).default('NET_30'),
  customPaymentTermDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  taxRegistrationNumber: nullableText(80),
  gstNumber: nullableText(32),
  panNumber: nullableText(20),
  status: z.enum(VENDOR_STATUSES).default('ACTIVE'),
  rating: z.coerce.number().min(0).max(5).nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  createAnyway: z.boolean().default(false),
});
export const vendorInputSchema = vendorInputBaseSchema
  .refine(
    (v) => !v.contractStartDate || !v.contractEndDate || v.contractStartDate <= v.contractEndDate,
    { path: ['contractEndDate'], message: 'Contract end must be on or after the start date.' },
  )
  .refine((v) => v.paymentTerm !== 'CUSTOM' || Boolean(v.customPaymentTermDays), {
    path: ['customPaymentTermDays'],
    message: 'Enter custom payment-term days.',
  });
export const vendorUpdateSchema = vendorInputBaseSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required.');

export const vendorContactInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  designation: nullableText(120),
  phone: nullableText(32),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  whatsappPhone: nullableText(32),
  isPrimary: z.boolean().default(false),
  notes: nullableText(1000),
});

const vendorServiceBaseSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  name: z.string().trim().min(2).max(200),
  description: nullableText(2000),
  destination: nullableText(160),
  city: nullableText(120),
  coverageArea: nullableText(500),
  currency: currency.default('INR'),
  baseCost: money.nullable().optional(),
  sellingReferencePrice: money.nullable().optional(),
  taxPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  commissionPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  minimumQuantity: z.coerce.number().int().positive().nullable().optional(),
  maximumQuantity: z.coerce.number().int().positive().nullable().optional(),
  validFrom: nullableDate,
  validUntil: nullableDate,
  status: z.enum(VENDOR_SERVICE_STATUSES).default('ACTIVE'),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: nullableText(2000),
});
export const vendorServiceInputSchema = vendorServiceBaseSchema.refine(
  (v) => !v.validFrom || !v.validUntil || v.validFrom <= v.validUntil,
  { path: ['validUntil'], message: 'Valid-until must be on or after valid-from.' },
);
export const vendorServiceUpdateSchema = vendorServiceBaseSchema.partial();

const vendorRateBaseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  currency: currency.default('INR'),
  rateType: z.string().trim().min(1).max(40).default('NET_RATE'),
  netRate: positiveMoney,
  taxAmount: money.nullable().optional(),
  commissionAmount: money.nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date(),
  seasonName: nullableText(120),
  weekdayRules: z.record(z.string(), z.unknown()).nullable().optional(),
  minimumQuantity: z.coerce.number().int().positive().nullable().optional(),
  minimumNights: z.coerce.number().int().positive().nullable().optional(),
  cancellationPolicy: nullableText(4000),
  notes: nullableText(2000),
});
export const vendorRateInputSchema = vendorRateBaseSchema.refine(
  (v) => v.effectiveFrom <= v.effectiveUntil,
  { path: ['effectiveUntil'], message: 'Effective-until must be on or after effective-from.' },
);
export const vendorRateUpdateSchema = vendorRateBaseSchema.partial();

export const vendorPayableInputSchema = z.object({
  bookingId: z.string().uuid(),
  bookingServiceId: z.string().uuid().nullable().optional(),
  bookingCostId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(2).max(1000),
  currency: currency.default('INR'),
  originalAmount: positiveMoney,
  dueDate: nullableDate,
  supplierInvoiceNumber: nullableText(160),
  supplierInvoiceDate: nullableDate,
  notes: nullableText(2000),
});

export const vendorPaymentInputSchema = z.object({
  amount: positiveMoney,
  currency: currency.default('INR'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paidAt: z.coerce.date(),
  referenceNumber: nullableText(255),
  bankName: nullableText(200),
  notes: nullableText(2000),
  allocations: z
    .array(z.object({ payableId: z.string().uuid(), amount: positiveMoney }))
    .min(1)
    .max(100),
});

export const vendorBankAccountInputSchema = z.object({
  accountHolderName: z.string().trim().min(2).max(200),
  bankName: z.string().trim().min(2).max(200),
  accountNumber: z.string().trim().min(4).max(64),
  ifscCode: nullableText(20),
  swiftCode: nullableText(20),
  branchName: nullableText(160),
  accountType: nullableText(40),
  currency: currency.nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const vendorDocumentUploadSchema = z.object({
  documentType: z.enum(VENDOR_DOCUMENT_TYPES),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
  fileSize: z.coerce.number().int().positive(),
  vendorServiceId: z.string().uuid().nullable().optional(),
  expiresAt: nullableDate,
});

export const vendorNoteInputSchema = z.object({
  noteType: z.enum(VENDOR_NOTE_TYPES).default('GENERAL'),
  content: z.string().trim().min(1).max(4000),
  isPinned: z.boolean().default(false),
});

export const vendorBookingLinkSchema = z.object({
  vendorId: z.string().uuid().nullable(),
  vendorServiceId: z.string().uuid().nullable().optional(),
  vendorRateId: z.string().uuid().nullable().optional(),
  supplierConfirmationNumber: nullableText(255),
  supplierReference: nullableText(255),
  confirmationStatus: z.enum(SERVICE_CONFIRMATION_STATUSES).optional(),
  internalCostSnapshot: money.optional(),
  paymentDueAt: nullableDate,
  cancellationDeadline: nullableDate,
});

export type VendorInput = z.infer<typeof vendorInputSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
export type VendorContactInput = z.infer<typeof vendorContactInputSchema>;
export type VendorServiceInput = z.infer<typeof vendorServiceInputSchema>;
export type VendorRateInput = z.infer<typeof vendorRateInputSchema>;
export type VendorPayableInput = z.infer<typeof vendorPayableInputSchema>;
export type VendorPaymentInput = z.infer<typeof vendorPaymentInputSchema>;
export type VendorBankAccountInput = z.infer<typeof vendorBankAccountInputSchema>;
export type VendorDocumentUpload = z.infer<typeof vendorDocumentUploadSchema>;
export type VendorNoteInput = z.infer<typeof vendorNoteInputSchema>;
export type VendorBookingLink = z.infer<typeof vendorBookingLinkSchema>;
