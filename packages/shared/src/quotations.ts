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

/**
 * "Tax Note on Total Price" dropdown (reference Summary & Pricing).
 *
 * The visible label IS the customer-facing note, so the selected label is what
 * gets stored — except for two control values:
 *  - the sentinel keeps the previously saved note (never persisted itself);
 *  - "Do not show" persists as null so the public card renders no tax line.
 */
export const QUOTATION_TAX_NOTE_SENTINEL = '-- No change (keep existing) --';
export const QUOTATION_TAX_NOTE_HIDDEN = 'Do not show';
export const QUOTATION_TAX_NOTE_OPTIONS = [
  QUOTATION_TAX_NOTE_SENTINEL,
  QUOTATION_TAX_NOTE_HIDDEN,
  'Inclusive of all taxes',
  'Inclusive of all taxes, excluding TCS',
  'Inclusive of GST and TCS',
  'Excluding all taxes',
  'Excluding GST and TCS',
] as const;

/**
 * Resolve a tax-note dropdown choice into the value to persist, given the
 * previously saved note. Returns `undefined` when the field must be left
 * unchanged (the sentinel), `null` to hide it, or the literal note text.
 */
export function resolveTaxNoteChoice(
  choice: string,
  previous: string | null | undefined,
): string | null | undefined {
  if (choice === QUOTATION_TAX_NOTE_SENTINEL) return previous ?? null;
  if (choice === QUOTATION_TAX_NOTE_HIDDEN) return null;
  return choice;
}

/** Whether a stored tax note should render publicly (never the control values). */
export function isPublicTaxNote(taxNote: string | null | undefined): taxNote is string {
  const value = taxNote?.trim();
  return Boolean(
    value && value !== QUOTATION_TAX_NOTE_SENTINEL && value !== QUOTATION_TAX_NOTE_HIDDEN,
  );
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const money = z.coerce.number().finite().min(0).max(999_999_999_999);
const optionalMoney = money.nullable().optional();
const sequence = z.coerce.number().int().min(1).max(500);
/**
 * Optional link to a travel master (Phase 14).
 *
 * Always optional: master selection is a convenience, never a requirement, and
 * every row must stay valid as pure free text. The snapshot columns beside
 * these references remain the authoritative rendered values.
 */
const optionalMasterId = z.string().uuid().nullable().optional();

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
    // Master references. These columns already existed on the hotel-option
    // tables; Phase 14 makes them reachable through the API.
    hotelId: optionalMasterId,
    hotelRoomTypeId: optionalMasterId,
    hotelMealPlanId: optionalMasterId,
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
  // Master references, each valid only for its matching service type. The
  // server enforces that pairing; see master-refs.service.ts.
  airlineId: optionalMasterId,
  cruiseId: optionalMasterId,
  cruiseRoomTypeId: optionalMasterId,
  vehicleId: optionalMasterId,
  sightseeingId: optionalMasterId,
  addOnServiceId: optionalMasterId,
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

export const FLIGHT_JOURNEY_TYPES = ['ROUND_TRIP', 'ONEWAY_OUTBOUND', 'ONEWAY_RETURN'] as const;

/**
 * User-facing label for a cabin-luggage option. The stored/API value stays
 * "10kg" for backward compatibility with existing quotations; it is displayed
 * as "10 kg+". Every other value renders unchanged.
 */
export function cabinLuggageLabel(value: string | null | undefined): string {
  return value === '10kg' ? '10 kg+' : (value ?? '');
}

/**
 * Calendar-night difference between a hotel's check-in and check-out dates.
 * Times are ignored (calendar-date comparison), so a stay from 10 Aug 14:00 to
 * 12 Aug 12:00 is 2 nights. Returns null when either date is missing/invalid or
 * when check-out is not strictly after check-in.
 */
export function hotelStayNights(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
): number | null {
  if (!checkIn || !checkOut) return null;
  const from = new Date(checkIn);
  const to = new Date(checkOut);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((day(to) - day(from)) / 86_400_000);
  return diff > 0 ? diff : null;
}

/** Reference "Flight" tab — one segment (leg/connection) of a journey. */
export const flightSegmentSchema = z
  .object({
    airlineId: z.string().uuid().nullable().optional(),
    airlineName: optionalText(200),
    flightNumber: optionalText(40),
    travelClass: optionalText(40),
    from: optionalText(120),
    to: optionalText(120),
    departureDate: optionalText(20),
    departureTime: optionalText(20),
    arrivalDate: optionalText(20),
    arrivalTime: optionalText(20),
    duration: optionalText(40),
    cabinLuggage: optionalText(40),
    checkInLuggage: optionalText(40),
    notes: optionalText(8000),
    connectionVia: optionalText(120),
  })
  .superRefine((segment, ctx) => {
    if (
      !segment.departureDate ||
      !segment.departureTime ||
      !segment.arrivalDate ||
      !segment.arrivalTime
    )
      return;
    const departure = new Date(`${segment.departureDate}T${segment.departureTime}`).getTime();
    const arrival = new Date(`${segment.arrivalDate}T${segment.arrivalTime}`).getTime();
    if (!Number.isNaN(departure) && !Number.isNaN(arrival) && arrival <= departure) {
      ctx.addIssue({
        code: 'custom',
        path: ['arrivalTime'],
        message: 'Arrival time must be after departure time.',
      });
    }
  });

export const flightJourneySchema = z.object({
  fromCity: optionalText(120),
  toCity: optionalText(120),
  travelClass: optionalText(40),
  segments: z.array(flightSegmentSchema).max(20).default([]),
});

export const flightDetailsSchema = z.object({
  include: z.boolean().default(true),
  sectionTitle: optionalText(200),
  amount: optionalMoney,
  journeyType: z.enum(FLIGHT_JOURNEY_TYPES).default('ROUND_TRIP'),
  outbound: flightJourneySchema.default({ segments: [] }),
  returnJourney: flightJourneySchema.default({ segments: [] }),
});

export const SIGHTSEEING_MEAL_MODES = ['NO_TRANSFER', 'INCLUDE_AT_HOTEL', 'WITH_TRANSFER'] as const;
export const SIGHTSEEING_TRANSFER_MODES = ['PRIVATE', 'SHARED', 'NO_TRANSFER'] as const;

/** Per-meal sightseeing preference: independent mode + optional transfer details. */
export const sightseeingMealPreferenceSchema = z.object({
  mode: z.enum(SIGHTSEEING_MEAL_MODES).default('NO_TRANSFER'),
  transferDetails: optionalText(300),
});

/** Per-meal preferences keyed by meal; absent entries mean "not configured". */
export const sightseeingMealPreferencesSchema = z
  .object({
    breakfast: sightseeingMealPreferenceSchema.optional(),
    lunch: sightseeingMealPreferenceSchema.optional(),
    dinner: sightseeingMealPreferenceSchema.optional(),
  })
  .default({});

/** Reference "Sightseeing" tab — one attraction/activity within a day. */
export const sightseeingActivitySchema = z.object({
  sightseeingId: z.string().uuid().nullable().optional(),
  name: optionalText(300),
  startTime: optionalText(20),
  duration: optionalText(40),
  city: optionalText(120),
  description: optionalText(8000),
  imageUrl: optionalText(1000),
  // Per-activity transfer (PRIVATE/SHARED/NO_TRANSFER). Absent on legacy rows,
  // which fall back to the day-level dailyTransfer when displayed.
  dailyTransfer: z.enum(SIGHTSEEING_TRANSFER_MODES).nullish(),
  sequence: z.number().int().min(1).max(500).nullable().optional(),
});

export const sightseeingDaySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(365),
  title: optionalText(300),
  // True once the user manually edits the day title, so automatic prefill and
  // primary-activity changes never overwrite it.
  titleTouched: z.boolean().optional(),
  city: optionalText(120),
  date: optionalText(20),
  meals: z
    .object({
      breakfast: z.boolean().default(false),
      lunch: z.boolean().default(false),
      dinner: z.boolean().default(false),
    })
    .default({ breakfast: false, lunch: false, dinner: false }),
  mealMode: z.enum(SIGHTSEEING_MEAL_MODES).default('INCLUDE_AT_HOTEL'),
  // Independent per-meal mode + transfer details. `mealMode` is retained for
  // legacy snapshots that predate per-meal preferences.
  mealPreferences: sightseeingMealPreferencesSchema,
  dailyTransfer: z.enum(SIGHTSEEING_TRANSFER_MODES).default('SHARED'),
  activities: z.array(sightseeingActivitySchema).max(20).default([]),
});

export const sightseeingDetailsSchema = z.object({
  include: z.boolean().default(true),
  sectionTitle: optionalText(200),
  amount: optionalMoney,
  description: optionalText(8000),
  days: z.array(sightseeingDaySchema).max(60).default([]),
});

export const hotelDetailsSchema = z.object({
  include: z.boolean().default(true),
  sectionTitle: optionalText(200).default('Your Hotels'),
  amount: optionalMoney,
  description: optionalText(8000),
});

/** Top-level Add-on Services section state (individual add-ons are service rows). */
export const addOnDetailsSchema = z.object({
  include: z.boolean().default(true),
  sectionTitle: optionalText(200).default('Additional Services'),
});

export const quotationVersionInputSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    introduction: optionalText(4000),
    weblinkHeading: optionalText(200),
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
    // Reference "Summary & Pricing" — per-passenger package pricing.
    perAdultPrice: optionalMoney,
    perChildWithBedPrice: optionalMoney,
    perChildWithoutBedPrice: optionalMoney,
    perInfantPrice: optionalMoney,
    taxNote: optionalText(200),
    netAmount: optionalMoney,
    initialPaymentAmount: optionalMoney,
    // Optional, but when present must be an absolute http(s) URL (any gateway).
    paymentLink: optionalText(500).refine(
      (value) => {
        const trimmed = value?.trim();
        if (!trimmed) return true;
        try {
          const url = new URL(trimmed);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Enter a valid URL starting with http:// or https://' },
    ),
    showServiceChargesSeparately: z.boolean().optional(),
    markServiceChargesOutside: z.boolean().optional(),
    hidePricing: z.boolean().optional(),
    showIndividualPricing: z.boolean().optional(),
    // Reference "Inclusions & Exclusions" — rich-text/HTML blocks.
    inclusionsHtml: optionalText(8000),
    exclusionsHtml: optionalText(8000),
    paymentPolicies: optionalText(8000),
    cancellationPolicies: optionalText(8000),
    bookingTerms: optionalText(8000),
    // Reference "Visa" — single dedicated section.
    includeVisa: z.boolean().optional(),
    visaSectionTitle: optionalText(200),
    visaAmount: optionalMoney,
    visaDestination: optionalText(120),
    visaType: optionalText(120),
    visaServiceCharge: optionalMoney,
    visaGstPercent: money.max(100).nullable().optional(),
    visaVfsCharge: optionalMoney,
    // Reference "Flight" — structured journeys/segments.
    flightDetails: flightDetailsSchema.nullable().optional(),
    // Reference "Hotel" — editable section heading, amount and description.
    hotelDetails: hotelDetailsSchema.nullable().optional(),
    // Reference "Add-on Services" — top-level include flag.
    addOnDetails: addOnDetailsSchema.nullable().optional(),
    // Reference "Sightseeing" — day-wise activity itinerary.
    sightseeingDetails: sightseeingDetailsSchema.nullable().optional(),
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
