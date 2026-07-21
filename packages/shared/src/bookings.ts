import { z } from 'zod';
import { SERVICE_TYPES } from './queries.js';

export const BOOKING_STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PARTIALLY_CONFIRMED',
  'ON_HOLD',
  'TRAVEL_IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;
export type BookingStatusValue = (typeof BOOKING_STATUSES)[number];
export const OPERATIONAL_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'ALL_SERVICES_CONFIRMED',
  'DOCUMENTS_PENDING',
  'READY_FOR_TRAVEL',
  'TRAVEL_IN_PROGRESS',
  'COMPLETED',
  'ACTION_REQUIRED',
] as const;
export type OperationalStatusValue = (typeof OPERATIONAL_STATUSES)[number];
export const BOOKING_PAYMENT_STATUSES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type BookingPaymentStatusValue = (typeof BOOKING_PAYMENT_STATUSES)[number];
export const TRAVELLER_TYPES = ['ADULT', 'CHILD_WITH_BED', 'CHILD_WITHOUT_BED', 'INFANT'] as const;
export type TravellerTypeValue = (typeof TRAVELLER_TYPES)[number];
export const VISA_STATUSES = [
  'NOT_REQUIRED',
  'NOT_STARTED',
  'DOCUMENTS_PENDING',
  'APPLIED',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type VisaStatusValue = (typeof VISA_STATUSES)[number];
export const SERVICE_CONFIRMATION_STATUSES = [
  'PENDING',
  'REQUESTED',
  'CONFIRMED',
  'WAITLISTED',
  'CANCELLED',
  'FAILED',
] as const;
export type ServiceConfirmationStatusValue = (typeof SERVICE_CONFIRMATION_STATUSES)[number];
export const PAYMENT_SCHEDULE_STATUSES = [
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;
export type PaymentScheduleStatusValue = (typeof PAYMENT_SCHEDULE_STATUSES)[number];
export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CARD',
  'CHEQUE',
  'PAYMENT_LINK',
  'OTHER',
] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_RECORD_STATUSES = [
  'RECEIVED',
  'PENDING_CLEARANCE',
  'CLEARED',
  'FAILED',
  'REVERSED',
  'REFUNDED',
] as const;
export type PaymentRecordStatusValue = (typeof PAYMENT_RECORD_STATUSES)[number];
export const BOOKING_COST_STATUSES = [
  'ESTIMATED',
  'PAYABLE',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;
export type BookingCostStatusValue = (typeof BOOKING_COST_STATUSES)[number];
export const BOOKING_COST_CATEGORIES = [
  'HOTEL',
  'FLIGHT',
  'TRANSFER',
  'SIGHTSEEING',
  'VISA',
  'INSURANCE',
  'GUIDE',
  'MEALS',
  'TAX',
  'COMMISSION',
  'OTHER',
] as const;
export type BookingCostCategoryValue = (typeof BOOKING_COST_CATEGORIES)[number];
export const BOOKING_DOCUMENT_TYPES = [
  'PASSPORT',
  'VISA',
  'IDENTITY_DOCUMENT',
  'FLIGHT_TICKET',
  'HOTEL_VOUCHER',
  'TRANSFER_VOUCHER',
  'INSURANCE',
  'INVOICE',
  'PAYMENT_RECEIPT',
  'BOOKING_CONFIRMATION',
  'SUPPLIER_CONFIRMATION',
  'ITINERARY',
  'OTHER',
] as const;
export type BookingDocumentTypeValue = (typeof BOOKING_DOCUMENT_TYPES)[number];
export const DOCUMENT_VISIBILITIES = ['INTERNAL', 'CUSTOMER_VISIBLE'] as const;
export const BOOKING_NOTE_TYPES = [
  'GENERAL',
  'CUSTOMER_COMMUNICATION',
  'SUPPLIER_COMMUNICATION',
  'OPERATIONAL',
  'FINANCIAL',
] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const money = z.coerce.number().finite().min(0).max(999_999_999_999);
const positiveMoney = z.coerce.number().finite().positive().max(999_999_999_999);
const currency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const bookingItineraryInputSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(500),
  date: optionalDate,
  title: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(8000),
  meals: optionalText(500),
  overnightLocation: optionalText(120),
  sequence: z.coerce.number().int().min(1).max(500),
});

export const bookingServiceInputSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    name: z.string().trim().min(1).max(200),
    description: optionalText(4000),
    city: optionalText(120),
    serviceDate: optionalDate,
    startDate: optionalDate,
    endDate: optionalDate,
    confirmationStatus: z.enum(SERVICE_CONFIRMATION_STATUSES).default('PENDING'),
    confirmationNumber: optionalText(255),
    supplierName: optionalText(200),
    supplierReference: optionalText(255),
    customerSellingAmount: money.default(0),
    internalCostSnapshot: money.default(0),
    paymentDueAt: optionalDate,
    cancellationDeadline: optionalDate,
    notes: optionalText(2000),
    sequence: z.coerce.number().int().min(1).max(500),
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'Service end date must be on or after the start date.',
  });

export const bookingPaymentScheduleInputSchema = z.object({
  installmentNumber: z.coerce.number().int().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  amount: positiveMoney,
  dueDate: z.coerce.date(),
  notes: optionalText(2000),
});

export const bookingManualInputSchema = z
  .object({
    queryId: z.string().uuid().nullable().optional(),
    customerName: z.string().trim().min(2).max(120),
    customerEmail: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
    customerPhone: z.string().trim().min(5).max(32),
    destinationSummary: z.string().trim().min(2).max(500),
    travelStartDate: optionalDate,
    travelEndDate: optionalDate,
    rooms: z.coerce.number().int().min(1).max(100).default(1),
    adults: z.coerce.number().int().min(1).max(200).default(1),
    childrenWithBed: z.coerce.number().int().min(0).max(100).default(0),
    childrenWithoutBed: z.coerce.number().int().min(0).max(100).default(0),
    infants: z.coerce.number().int().min(0).max(100).default(0),
    currency: currency.default('INR'),
    totalSellingAmount: money,
    assignedToId: z.string().uuid().nullable().optional(),
    manualCreationReason: z.string().trim().min(3).max(2000),
    internalNotes: optionalText(4000),
    services: z.array(bookingServiceInputSchema).max(500).default([]),
    itinerary: z.array(bookingItineraryInputSchema).max(500).default([]),
    paymentSchedule: z.array(bookingPaymentScheduleInputSchema).max(100).default([]),
  })
  .refine(
    (value) =>
      !value.travelStartDate ||
      !value.travelEndDate ||
      value.travelStartDate <= value.travelEndDate,
    { path: ['travelEndDate'], message: 'Travel end must be on or after travel start.' },
  );

export const quotationConversionInputSchema = z.object({
  quotationVersionId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  initialOperationalNotes: optionalText(4000),
  paymentSchedule: z.array(bookingPaymentScheduleInputSchema).max(100).default([]),
});

export const bookingUpdateSchema = z
  .object({
    customerName: z.string().trim().min(2).max(120).optional(),
    customerEmail: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
    customerPhone: z.string().trim().min(5).max(32).optional(),
    destinationSummary: z.string().trim().min(2).max(500).optional(),
    travelStartDate: optionalDate,
    travelEndDate: optionalDate,
    rooms: z.coerce.number().int().min(1).max(100).optional(),
    adults: z.coerce.number().int().min(1).max(200).optional(),
    childrenWithBed: z.coerce.number().int().min(0).max(100).optional(),
    childrenWithoutBed: z.coerce.number().int().min(0).max(100).optional(),
    infants: z.coerce.number().int().min(0).max(100).optional(),
    operationalStatus: z.enum(OPERATIONAL_STATUSES).optional(),
    internalNotes: optionalText(4000),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const bookingStatusInputSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  reason: optionalText(2000),
});
export const bookingAssignmentInputSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
});

export const travellerInputSchema = z.object({
  travellerType: z.enum(TRAVELLER_TYPES),
  title: z.string().trim().min(1).max(20),
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalText(100),
  lastName: z.string().trim().min(1).max(100),
  gender: optionalText(30),
  dateOfBirth: optionalDate,
  nationality: optionalText(80),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  phone: optionalText(32),
  passportNumber: optionalText(30),
  passportCountry: optionalText(80),
  passportIssuedAt: optionalDate,
  passportExpiresAt: optionalDate,
  visaStatus: z.enum(VISA_STATUSES).default('NOT_STARTED'),
  specialRequirements: optionalText(2000),
  isPrimaryTraveller: z.boolean().default(false),
  sequence: z.coerce.number().int().min(1).max(500),
});
export const travellerUpdateSchema = travellerInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingServiceUpdateSchema = bookingServiceInputSchema
  .innerType()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingServiceStatusSchema = z.object({
  confirmationStatus: z.enum(SERVICE_CONFIRMATION_STATUSES),
  confirmationNumber: optionalText(255),
  supplierReference: optionalText(255),
});
export const bookingItineraryUpdateSchema = bookingItineraryInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingItineraryReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});
export const bookingPaymentScheduleUpdateSchema = bookingPaymentScheduleInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const bookingPaymentInputSchema = z.object({
  paymentScheduleId: z.string().uuid().nullable().optional(),
  amount: positiveMoney,
  currency,
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(['RECEIVED', 'PENDING_CLEARANCE', 'CLEARED']).default('RECEIVED'),
  receivedAt: z.coerce.date(),
  referenceNumber: optionalText(255),
  bankName: optionalText(200),
  notes: optionalText(2000),
});
export const bookingPaymentUpdateSchema = bookingPaymentInputSchema
  .omit({ amount: true, currency: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingPaymentReversalSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const bookingCostInputSchema = z.object({
  bookingServiceId: z.string().uuid().nullable().optional(),
  costCategory: z.enum(BOOKING_COST_CATEGORIES),
  supplierName: z.string().trim().min(1).max(200),
  supplierReference: optionalText(255),
  description: z.string().trim().min(1).max(1000),
  amount: positiveMoney,
  currency,
  costStatus: z.enum(BOOKING_COST_STATUSES).default('ESTIMATED'),
  dueDate: optionalDate,
  paidAt: optionalDate,
  paymentReference: optionalText(255),
  notes: optionalText(2000),
});
export const bookingCostUpdateSchema = bookingCostInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingCostStatusSchema = z.object({
  costStatus: z.enum(BOOKING_COST_STATUSES),
  paidAt: optionalDate,
  paymentReference: optionalText(255),
});

export const bookingDocumentUploadSchema = z.object({
  travellerId: z.string().uuid().nullable().optional(),
  bookingServiceId: z.string().uuid().nullable().optional(),
  paymentId: z.string().uuid().nullable().optional(),
  documentType: z.enum(BOOKING_DOCUMENT_TYPES),
  visibility: z.enum(DOCUMENT_VISIBILITIES).default('INTERNAL'),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  fileSize: z.coerce.number().int().positive(),
});

export const bookingNoteInputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  noteType: z.enum(BOOKING_NOTE_TYPES).default('GENERAL'),
});
export const bookingNoteUpdateSchema = bookingNoteInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const bookingEmailInputSchema = z.object({
  recipientEmail: z.string().trim().email().max(255),
  subject: optionalText(255),
  message: optionalText(4000),
});

export type BookingManualInput = z.infer<typeof bookingManualInputSchema>;
export type QuotationConversionInput = z.infer<typeof quotationConversionInputSchema>;
export type BookingUpdate = z.infer<typeof bookingUpdateSchema>;
export type TravellerInput = z.infer<typeof travellerInputSchema>;
export type BookingServiceInput = z.infer<typeof bookingServiceInputSchema>;
export type BookingItineraryInput = z.infer<typeof bookingItineraryInputSchema>;
export type BookingPaymentScheduleInput = z.infer<typeof bookingPaymentScheduleInputSchema>;
export type BookingPaymentInput = z.infer<typeof bookingPaymentInputSchema>;
export type BookingCostInput = z.infer<typeof bookingCostInputSchema>;
export type BookingDocumentUpload = z.infer<typeof bookingDocumentUploadSchema>;
export type BookingNoteInput = z.infer<typeof bookingNoteInputSchema>;
export type BookingEmailInput = z.infer<typeof bookingEmailInputSchema>;
