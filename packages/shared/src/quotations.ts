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

/** Remove one or more stale leading "Day N:" prefixes from an itinerary title. */
export function stripItineraryDayPrefixes(value: string | null | undefined): string {
  let title = (value ?? '').replace(/\s+/g, ' ').trim();
  while (/^day\s+\d+\s*:?\s*/i.test(title)) title = title.replace(/^day\s+\d+\s*:?\s*/i, '').trim();
  return title;
}

/** Format an itinerary title with exactly one prefix for its current position. */
export function formatItineraryDayTitle(
  dayNumber: number,
  value: string | null | undefined,
): string {
  const title = stripItineraryDayPrefixes(value);
  return title ? `Day ${dayNumber}: ${title}` : `Day ${dayNumber}`;
}

export interface ItineraryImageActivityRef {
  imageDocumentId?: string | null;
  imageUrl?: string | null;
  sightseeingId?: string | null;
}

export interface ItineraryImageResolver<T> {
  document?: (imageDocumentId: string) => T | null | undefined;
  snapshot: (imageUrl: string) => T | null | undefined;
  sightseeing: (sightseeingId: string) => T | null | undefined;
  destination?: T | null;
}

/** Canonical activity image precedence: saved snapshot, then sightseeing master. */
export function resolveItineraryActivityImage<T>(
  activity: ItineraryImageActivityRef,
  resolver: ItineraryImageResolver<T>,
): T | null {
  const imageDocumentId = activity.imageDocumentId?.trim();
  if (imageDocumentId && resolver.document) {
    const document = resolver.document(imageDocumentId);
    if (document != null) return document;
  }
  const imageUrl = activity.imageUrl?.trim();
  if (imageUrl) {
    const snapshot = resolver.snapshot(imageUrl);
    if (snapshot != null) return snapshot;
  }
  const sightseeingId = activity.sightseeingId?.trim();
  if (sightseeingId) {
    const sightseeing = resolver.sightseeing(sightseeingId);
    if (sightseeing != null) return sightseeing;
  }
  return null;
}

/** Canonical day image: snapshot, master, destination hero, then no image. */
export function resolveItineraryDayImage<T>(
  activities: readonly ItineraryImageActivityRef[],
  resolver: ItineraryImageResolver<T>,
): T | null {
  if (resolver.document) {
    for (const activity of activities) {
      const imageDocumentId = activity.imageDocumentId?.trim();
      if (!imageDocumentId) continue;
      const document = resolver.document(imageDocumentId);
      if (document != null) return document;
    }
  }
  for (const activity of activities) {
    const imageUrl = activity.imageUrl?.trim();
    if (!imageUrl) continue;
    const snapshot = resolver.snapshot(imageUrl);
    if (snapshot != null) return snapshot;
  }
  for (const activity of activities) {
    const sightseeingId = activity.sightseeingId?.trim();
    if (!sightseeingId) continue;
    const sightseeing = resolver.sightseeing(sightseeingId);
    if (sightseeing != null) return sightseeing;
  }
  return resolver.destination ?? null;
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
/**
 * Rich-text fields store HTML, so formatting markup must not consume the
 * customer-facing character allowance. Keep a generous raw-payload guard,
 * while enforcing the business limit against the visible text only.
 */
const optionalRichText = (visibleMax: number) =>
  z
    .string()
    .trim()
    .max(100_000)
    .refine(
      (html) =>
        html
          .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, 'x')
          .trim().length <= visibleMax,
      { message: `Visible text must contain at most ${visibleMax} character(s)` },
    )
    .nullable()
    .optional();
const optionalDate = z.coerce.date().nullable().optional();
/** Optional wall-clock HH:mm (24h). Blank is normalised to null so an unset
 * time is stored consistently and can be "shown as nothing" downstream. */
const optionalTime = z
  .string()
  .trim()
  .refine((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a HH:MM time.')
  .transform((value) => (value ? value : null))
  .nullable()
  .optional();
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
    city: z.string().trim().max(120).nullable().optional(),
    hotelName: z.string().trim().max(200).nullable().optional(),
    category: optionalText(40),
    roomType: optionalText(100),
    mealPlan: optionalText(100),
    rooms: z.preprocess(
      (value) => (value === '' ? null : value),
      z.coerce.number().int().min(1).max(100).nullable().optional(),
    ),
    nights: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? null : value),
      z.coerce.number().int().min(1).max(365).nullable().optional(),
    ),
    checkInDate: optionalDate,
    checkOutDate: optionalDate,
    // Optional per-stay wall-clock times (HH:mm). Left blank shows no time.
    checkInTime: optionalTime,
    checkOutTime: optionalTime,
    showCheckInTime: z.boolean().nullable().optional(),
    showCheckOutTime: z.boolean().nullable().optional(),
    internalCost: optionalMoney,
    sellingPrice: optionalMoney,
    selected: z.boolean().default(true),
    notes: optionalText(2000),
    sequence,
    // Per-stay images for bookmark snapshots. When a hotel is bookmarked,
    // its images are stored here instead of in the section-level hotelDetails.
    // This allows multiple stays to have independent images. Older quotations
    // store NULL (or omit) the column, so null/undefined are normalized to an
    // empty array at the shared boundary — never a validation failure.
    images: z.preprocess(
      (value) => (value === null || value === undefined ? [] : value),
      z
        .array(
          z.object({
            url: z.string().url(),
            thumbnailUrl: optionalText(1000),
            alt: optionalText(500),
          }),
        )
        .max(12),
    ),
    /**
     * The image (a URL from `images`) chosen as this stay's single PDF photo
     * via "Use in PDF". Absent, or pointing at a removed image, the PDF falls
     * back to the first image in the stay's saved order.
     */
    pdfImageUrl: optionalText(1000),
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

/**
 * Join only the non-empty parts of a display string. Empty/whitespace-only
 * values are dropped entirely so optional fields (e.g. hotel room type or meal
 * plan) never render empty placeholders or dangling separators such as
 * "Deluxe ·" or "· Breakfast".
 */
export function joinNonEmpty(
  parts: Array<string | null | undefined>,
  separator = ' · ',
): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(separator);
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

export const flightImageSchema = z.object({
  documentId: z.string().uuid(),
  fileName: optionalText(255),
  description: optionalText(500),
  /** Legacy field retained so existing quotation snapshots remain readable. */
  heading: optionalText(200),
});

export const flightDetailsSchema = z
  .object({
    include: z.boolean().default(true),
    sectionTitle: optionalText(200),
    amount: optionalMoney,
    entryMode: z.enum(['MANUAL', 'IMAGE']).default('MANUAL'),
    imageDocumentId: z.string().uuid().nullable().optional(),
    imageFileName: optionalText(255),
    images: z.array(flightImageSchema).max(10).default([]),
    journeyType: z.enum(FLIGHT_JOURNEY_TYPES).default('ROUND_TRIP'),
    outbound: flightJourneySchema.default({ segments: [] }),
    returnJourney: flightJourneySchema.default({ segments: [] }),
  })
  .superRefine((details, ctx) => {
    if (
      details.include &&
      details.entryMode === 'IMAGE' &&
      !details.imageDocumentId &&
      details.images.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['images'],
        message: 'Upload at least one flight image.',
      });
    }
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

/**
 * Default price rows the builder offers on every activity. They are only UI
 * seeds — nothing distinguishes them from a user-added row once saved, and an
 * untouched one is never persisted.
 */
export const SIGHTSEEING_DEFAULT_PRICE_LABELS = ['Adult', 'Child', 'Senior'] as const;

/** Max pricing rows on a single activity. */
const SIGHTSEEING_PRICE_OPTIONS_MAX = 20;

/**
 * How a pricing row may arrive: the builder's number inputs hand back strings
 * (or null once cleared), while a saved snapshot round-trips real numbers.
 */
const rawSightseeingPriceOptionSchema = z.object({
  label: z.string().max(60).nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
});

const isBlankPriceValue = (value: unknown) =>
  value == null || (typeof value === 'string' && value.trim() === '');

/** Parsed price, or null when the input was left empty. */
const parsePriceValue = (value: unknown): number | null => {
  if (isBlankPriceValue(value)) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Informational per-activity pricing — Adult/Child/Senior and any custom row
 * all live in this one array.
 *
 * Rows are validated at their original index so the builder can attach inline
 * errors, then normalised on the way out: labels trimmed, untouched rows
 * dropped. An empty default therefore never persists as `{ label: 'Child',
 * price: 0 }`. These prices are display-only and never feed quotation totals.
 */
export const sightseeingPricingOptionsSchema = z
  .array(rawSightseeingPriceOptionSchema)
  .max(SIGHTSEEING_PRICE_OPTIONS_MAX)
  .optional()
  .superRefine((rows, ctx) => {
    if (!rows) return;
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const label = (row.label ?? '').trim();
      const price = parsePriceValue(row.price);
      // A row the user never filled in is dropped below, not reported.
      if (!label && price === null) return;
      if (!label)
        ctx.addIssue({
          code: 'custom',
          message: 'Add a label for this price.',
          path: [index, 'label'],
        });
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 999_999_999_999))
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a price of 0 or more.',
          path: [index, 'price'],
        });
      const key = label.toLowerCase();
      if (!key) return;
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          message: `"${label}" is already priced on this activity.`,
          path: [index, 'label'],
        });
      seen.add(key);
    });
  })
  .transform((rows) =>
    (rows ?? [])
      .map((row) => ({ label: (row.label ?? '').trim(), price: parsePriceValue(row.price) }))
      // Persist only meaningful rows — a real label with a real price.
      .filter(
        (row): row is { label: string; price: number } => Boolean(row.label) && row.price !== null,
      ),
  );

/** Reference "Sightseeing" tab — one attraction/activity within a day. */
export const sightseeingActivitySchema = z.object({
  sightseeingId: z.string().uuid().nullable().optional(),
  imageDocumentId: z.string().uuid().nullable().optional(),
  name: optionalText(300),
  startTime: optionalText(20),
  // Per-activity customer-output control. Legacy snapshots default to visible.
  showTime: z.boolean().default(true),
  duration: optionalText(40),
  city: optionalText(120),
  description: optionalRichText(8000),
  imageUrl: optionalText(1000),
  // Per-activity transfer (PRIVATE/SHARED/NO_TRANSFER). Absent on legacy rows,
  // which fall back to the day-level dailyTransfer when displayed.
  dailyTransfer: z.enum(SIGHTSEEING_TRANSFER_MODES).nullish(),
  // Absent on every activity saved before this feature; read as [].
  pricingOptions: sightseeingPricingOptionsSchema,
  sequence: z.number().int().min(1).max(500).nullable().optional(),
});

export type SightseeingPriceOption = { label: string; price: number };

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
  /**
   * Images copied from a Live Search bookmark snapshot when a hotel was
   * imported via a bookmark code. Stored as plain URLs (thumbnail/original)
   * and never fetched from SearchAPI.
   */
  images: z.preprocess(
    (value) => (value === null || value === undefined ? [] : value),
    z
      .array(
        z.object({
          url: z.string().url(),
          /**
           * The bookmark card's fallback URL for the same provider image (the
           * `thumbnail` candidate). Kept verbatim from the bookmark so renderers
           * can fall back exactly like the carousel when `url` fails to load.
           */
          thumbnailUrl: optionalText(1000),
          alt: optionalText(500),
        }),
      )
      .max(12),
  ),
  /**
   * The image (a URL from `images`) chosen as the single hotel photo for the
   * PDF via "Use in PDF". Absent, or pointing at a removed image, the PDF falls
   * back to the first image in the saved order.
   */
  pdfImageUrl: optionalText(1000),
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
    // Weblink "Quick Navigation" section index (default shown; sticky opt-in).
    showQuickNav: z.boolean().optional(),
    quickNavSticky: z.boolean().optional(),
    // Reference "Inclusions & Exclusions" — rich-text/HTML blocks. Rich text
    // is stored with markup, so it legitimately exceeds 8000 characters. The
    // 50,000 ceiling is the project's rich-HTML limit (see optionalRichText in
    // masters.ts) and matches the DB columns widened to TEXT.
    inclusionsHtml: optionalText(50_000),
    exclusionsHtml: optionalText(50_000),
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

/**
 * Weblink display settings — cosmetic flags editable directly from the
 * quotation detail view (no full edit). Unlike a version edit, this is allowed
 * on finalized versions too, since it changes only how the shared link is
 * presented, never the quoted content or pricing.
 */
export const quotationWeblinkSettingsSchema = z
  .object({
    showQuickNav: z.boolean().optional(),
    quickNavSticky: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one setting must be supplied.');
export type QuotationWeblinkSettings = z.infer<typeof quotationWeblinkSettingsSchema>;

/**
 * Public weblink visitor telemetry. Sent by the customer-facing page (no auth):
 * an initial snapshot on load and a final beacon with scroll/time on leave.
 * Every field is optional and bounded — the server adds IP, User-Agent parsing
 * and approximate geolocation. Never carries personally identifying data.
 */
export const quotationTrackSchema = z.object({
  platform: z.string().max(60).optional(),
  language: z.string().max(20).optional(),
  languages: z.string().max(500).optional(),
  clientTimezone: z.string().max(60).optional(),
  screenWidth: z.coerce.number().int().min(0).max(100000).optional(),
  screenHeight: z.coerce.number().int().min(0).max(100000).optional(),
  screenAvailWidth: z.coerce.number().int().min(0).max(100000).optional(),
  screenAvailHeight: z.coerce.number().int().min(0).max(100000).optional(),
  viewportWidth: z.coerce.number().int().min(0).max(100000).optional(),
  viewportHeight: z.coerce.number().int().min(0).max(100000).optional(),
  pixelRatio: z.coerce.number().min(0).max(16).optional(),
  colorDepth: z.coerce.number().int().min(0).max(64).optional(),
  orientation: z.string().max(24).optional(),
  cpuCores: z.coerce.number().int().min(0).max(1024).optional(),
  deviceMemory: z.coerce.number().min(0).max(1024).optional(),
  connectionType: z.string().max(20).optional(),
  connectionDownlink: z.coerce.number().min(0).max(100000).optional(),
  connectionRtt: z.coerce.number().int().min(0).max(600000).optional(),
  online: z.coerce.boolean().optional(),
  referrer: z.string().max(2000).optional(),
  landingUrl: z.string().max(2000).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  visitorId: z.string().max(60).optional(),
  maxScrollDepth: z.coerce.number().int().min(0).max(100).optional(),
  timeOnPageSeconds: z.coerce.number().int().min(0).max(86400).optional(),
  ctaClicks: z.coerce.number().int().min(0).max(100000).optional(),
});
export type QuotationTrackInput = z.infer<typeof quotationTrackSchema>;

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
