import { z } from 'zod';
import { SERVICE_TYPES } from './queries.js';

export const QUOTATION_TEMPLATE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const QUOTATION_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'ARCHIVED',
] as const;
export const QUOTATION_VERSION_STATUSES = ['DRAFT', 'FINALIZED', 'SUPERSEDED'] as const;
export const PRICING_MODES = ['PER_PERSON', 'PACKAGE_TOTAL', 'ITEMIZED'] as const;
export const MARKUP_MODES = ['NONE', 'FIXED', 'PERCENTAGE'] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const money = z.coerce.number().finite().min(0).max(999_999_999_999);
const optionalMoney = money.nullable().optional();
const sequence = z.coerce.number().int().min(1).max(500);

export const quotationItinerarySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(500),
  date: optionalDate,
  title: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(8000),
  meals: optionalText(500),
  overnightLocation: optionalText(120),
  activities: optionalText(2000),
  transfers: optionalText(2000),
  notes: optionalText(2000),
  sequence,
});

export const quotationHotelSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    hotelName: z.string().trim().min(1).max(200),
    category: optionalText(40),
    roomType: optionalText(100),
    mealPlan: optionalText(100),
    rooms: z.coerce.number().int().min(1).max(100).default(1),
    nights: z.coerce.number().int().min(1).max(365),
    checkInDate: optionalDate,
    checkOutDate: optionalDate,
    internalCost: optionalMoney,
    sellingPrice: optionalMoney,
    selected: z.boolean().default(true),
    notes: optionalText(2000),
    sequence,
  })
  .refine((v) => !v.checkInDate || !v.checkOutDate || v.checkInDate <= v.checkOutDate, {
    message: 'Check-out must be on or after check-in.',
    path: ['checkOutDate'],
  });

export const quotationServiceSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  name: z.string().trim().min(1).max(200),
  description: optionalText(4000),
  dayNumber: z.coerce.number().int().min(1).max(500).nullable().optional(),
  city: optionalText(120),
  quantity: z.coerce.number().positive().max(100_000).default(1),
  internalCost: optionalMoney,
  sellingPrice: optionalMoney,
  taxCategory: optionalText(80),
  notes: optionalText(2000),
  sequence,
});

const contentSchema = z.object({ content: z.string().trim().min(1).max(2000), sequence });

export const quotationTemplateInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: optionalText(4000),
    destinationSummary: z.string().trim().min(2).max(500),
    durationDays: z.coerce.number().int().min(1).max(365),
    durationNights: z.coerce.number().int().min(0).max(364),
    baseCurrency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase())
      .default('INR'),
    adultBasePrice: optionalMoney,
    childWithBedBasePrice: optionalMoney,
    childWithoutBedBasePrice: optionalMoney,
    infantBasePrice: optionalMoney,
    status: z.enum(QUOTATION_TEMPLATE_STATUSES).default('ACTIVE'),
    internalNotes: optionalText(4000),
    itinerary: z.array(quotationItinerarySchema).max(500).default([]),
    hotels: z.array(quotationHotelSchema).max(200).default([]),
    services: z.array(quotationServiceSchema).max(500).default([]),
    inclusions: z.array(contentSchema).max(200).default([]),
    exclusions: z.array(contentSchema).max(200).default([]),
    terms: z.array(contentSchema).max(200).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.durationNights >= value.durationDays)
      ctx.addIssue({
        code: 'custom',
        path: ['durationNights'],
        message: 'Nights must be fewer than days.',
      });
    for (const [name, rows] of Object.entries({
      itinerary: value.itinerary,
      hotels: value.hotels,
      services: value.services,
      inclusions: value.inclusions,
      exclusions: value.exclusions,
      terms: value.terms,
    })) {
      if (new Set(rows.map((row) => row.sequence)).size !== rows.length)
        ctx.addIssue({ code: 'custom', path: [name], message: 'Sequence values must be unique.' });
    }
  });

export const quotationTemplateUpdateSchema = quotationTemplateInputSchema
  .innerType()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const quotationVersionInputSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    introduction: optionalText(4000),
    destinationSummary: z.string().trim().min(2).max(500),
    travelStartDate: optionalDate,
    travelEndDate: optionalDate,
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase()),
    pricingMode: z.enum(PRICING_MODES).default('ITEMIZED'),
    markupMode: z.enum(MARKUP_MODES).default('NONE'),
    markupValue: money.default(0),
    taxRate: money.max(100).default(0),
    discountAmount: money.default(0),
    notes: optionalText(4000),
    internalNotes: optionalText(4000),
    itinerary: z.array(quotationItinerarySchema).max(500).default([]),
    hotels: z.array(quotationHotelSchema).max(200).default([]),
    services: z.array(quotationServiceSchema).max(500).default([]),
    inclusions: z.array(contentSchema).max(200).default([]),
    exclusions: z.array(contentSchema).max(200).default([]),
    terms: z.array(contentSchema).max(200).default([]),
  })
  .refine((v) => !v.travelStartDate || !v.travelEndDate || v.travelStartDate <= v.travelEndDate, {
    message: 'Travel end must be on or after travel start.',
    path: ['travelEndDate'],
  });

export const quotationVersionUpdateSchema = quotationVersionInputSchema
  .innerType()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const quotationInputSchema = z.object({
  queryId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  sourceVersionId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerEmail: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  customerPhone: z.string().trim().min(5).max(32).optional(),
  destinationSummary: z.string().trim().min(2).max(500).optional(),
  travelStartDate: optionalDate,
  travelEndDate: optionalDate,
  adults: z.coerce.number().int().min(1).max(200).optional(),
  childrenWithBed: z.coerce.number().int().min(0).max(100).optional(),
  childrenWithoutBed: z.coerce.number().int().min(0).max(100).optional(),
  infants: z.coerce.number().int().min(0).max(100).optional(),
  rooms: z.coerce.number().int().min(1).max(100).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .optional(),
  validUntil: optionalDate,
  version: quotationVersionInputSchema.innerType().partial().optional(),
});

export const quotationUpdateSchema = quotationInputSchema
  .omit({ queryId: true, templateId: true, sourceVersionId: true, version: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const quotationSendSchema = z.object({
  quotationVersionId: z.string().uuid(),
  recipientEmail: z.string().trim().email().max(255),
  cc: z.array(z.string().trim().email().max(255)).max(10).default([]),
  subject: optionalText(255),
  message: optionalText(4000),
  includePdf: z.boolean().default(true),
  includePublicLink: z.boolean().default(true),
});

export const publicLinkSchema = z.object({
  quotationVersionId: z.string().uuid().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const uploadRequestSchema = z.object({
  quotationVersionId: z.string().uuid().nullable().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  fileSize: z.coerce.number().int().positive(),
  documentType: z
    .enum(['SUPPORTING_ATTACHMENT', 'HOTEL_IMAGE', 'ITINERARY_IMAGE'])
    .default('SUPPORTING_ATTACHMENT'),
});

export const publicAcceptSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  confirmed: z.literal(true),
  note: optionalText(2000),
});

export const publicRejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  note: optionalText(2000),
});

export type QuotationTemplateInput = z.infer<typeof quotationTemplateInputSchema>;
export type QuotationTemplateUpdate = z.infer<typeof quotationTemplateUpdateSchema>;
export type QuotationInput = z.infer<typeof quotationInputSchema>;
export type QuotationUpdate = z.infer<typeof quotationUpdateSchema>;
export type QuotationVersionInput = z.infer<typeof quotationVersionInputSchema>;
export type QuotationVersionUpdate = z.infer<typeof quotationVersionUpdateSchema>;
export type QuotationSendInput = z.infer<typeof quotationSendSchema>;
