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
export const PRICING_MODES = [
  'TOTAL',
  'SECTION_WISE',
  'PER_PERSON',
  'PACKAGE_TOTAL',
  'ITEMIZED',
] as const;
export const QUOTATION_PRICING_MODES = ['TOTAL', 'SECTION_WISE'] as const;
export type QuotationPricingMode = (typeof QUOTATION_PRICING_MODES)[number];
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

export const SERVICE_DESCRIPTION_MAX_LENGTH = 20_000;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const arrayFromNullish = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null || value === undefined ? [] : value), z.array(schema));
/**
 * Rich-text fields store HTML, so formatting markup must not consume the
 * customer-facing character allowance. Keep a generous raw-payload guard,
 * while enforcing the business limit against the visible text only.
 */
const optionalRichText = (visibleMax: number, message?: string) =>
  z
    .string()
    .trim()
    .max(100_000, 'Rich-text HTML must be 100,000 characters or fewer.')
    .refine(
      (html) =>
        html
          .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, 'x')
          .trim().length <= visibleMax,
      { message: message ?? `Visible text must contain at most ${visibleMax} character(s)` },
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

/**
 * One image in a quotation-owned snapshot gallery.
 *
 * `url` keeps existing bookmark/legacy snapshots working. Master images use an
 * opaque `masterImageId` while a draft is being edited; the API replaces that
 * transient reference with its own immutable storage metadata before writing
 * the snapshot. `id` is the stable, customer-safe identity returned on reload
 * and is also what new rows store in the legacy-named `pdfImageUrl` column.
 */
export const quotationSnapshotImageSchema = z
  .object({
    id: optionalText(200),
    masterImageId: optionalText(200),
    url: z.string().trim().url().max(4000).nullable().optional(),
    thumbnailUrl: z.string().trim().url().max(4000).nullable().optional(),
    alt: optionalText(500),
  })
  .superRefine((image, ctx) => {
    if (!image.id && !image.masterImageId && !image.url) {
      ctx.addIssue({
        code: 'custom',
        message: 'An image must include a saved id, Master image id, or URL.',
      });
    }
  });

export type QuotationSnapshotImage = z.infer<typeof quotationSnapshotImageSchema>;

/** Stable selection value for PDF choice: saved id first, legacy URL second. */
export function quotationSnapshotImageIdentity(
  image: Pick<QuotationSnapshotImage, 'id' | 'masterImageId' | 'url'>,
): string | null {
  return image.id?.trim() || image.masterImageId?.trim() || image.url?.trim() || null;
}

/** Explicit PDF image when valid, otherwise the first saved image in order. */
export function resolveQuotationPdfImage<T extends QuotationSnapshotImage>(
  images: readonly T[] | null | undefined,
  selected: string | null | undefined,
): T | null {
  if (!images?.length) return null;
  return (
    images.find((image) => quotationSnapshotImageIdentity(image) === selected) ?? images[0] ?? null
  );
}

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
      z.array(quotationSnapshotImageSchema),
    ),
    /** False only for a legacy NULL snapshot; true also preserves an explicit empty gallery. */
    imageSnapshotPresent: z.boolean().optional(),
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
  description: optionalRichText(
    SERVICE_DESCRIPTION_MAX_LENGTH,
    'Description must be 20,000 characters or fewer.',
  ),
  dayNumber: z.coerce.number().int().min(1).max(500).nullable().optional(),
  city: optionalText(120),
  quantity: z.coerce.number().positive().max(100_000).default(1),
  internalCost: optionalMoney,
  sellingPrice: optionalMoney,
  taxCategory: optionalText(80),
  notes: optionalText(2000),
  // Ordered, quotation-owned snapshot. Legacy service rows normalize to [].
  images: z
    .preprocess(
      (value) => (value === null || value === undefined ? [] : value),
      z.array(quotationSnapshotImageSchema),
    )
    .optional(),
  imageSnapshotPresent: z.boolean().optional(),
  // One explicit PDF choice; renderers fall back to the first saved image.
  pdfImageUrl: optionalText(1000),
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
    itinerary: arrayFromNullish(quotationItinerarySchema).pipe(
      z.array(quotationItinerarySchema).max(500),
    ),
    hotels: arrayFromNullish(quotationHotelSchema).pipe(z.array(quotationHotelSchema).max(200)),
    services: arrayFromNullish(quotationServiceSchema).pipe(
      z.array(quotationServiceSchema).max(500),
    ),
    inclusions: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
    exclusions: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
    terms: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
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
export function joinNonEmpty(parts: Array<string | null | undefined>, separator = ' · '): string {
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
  segments: arrayFromNullish(flightSegmentSchema).pipe(z.array(flightSegmentSchema).max(20)),
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
    images: arrayFromNullish(flightImageSchema).pipe(z.array(flightImageSchema).max(10)),
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
  // Ordered gallery copied from the selected Sightseeing Master. The legacy
  // single imageUrl/imageDocumentId fields remain valid for old quotations and
  // custom uploads.
  images: z.preprocess(
    (value) => (value === null || value === undefined ? [] : value),
    z.array(quotationSnapshotImageSchema),
  ),
  imageSnapshotPresent: z.boolean().optional(),
  pdfImageUrl: optionalText(1000),
  // Per-activity transfer (PRIVATE/SHARED/NO_TRANSFER). Absent on legacy rows,
  // which fall back to the day-level dailyTransfer when displayed.
  dailyTransfer: z.enum(SIGHTSEEING_TRANSFER_MODES).nullish(),
  // Absent/null on every activity saved before this feature; read as [].
  pricingOptions: z.preprocess(
    (value) => (value === null || value === undefined ? [] : value),
    sightseeingPricingOptionsSchema,
  ),
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
  activities: arrayFromNullish(sightseeingActivitySchema).pipe(
    z.array(sightseeingActivitySchema).max(20),
  ),
});

export const sightseeingDetailsSchema = z.object({
  include: z.boolean().default(true),
  sectionTitle: optionalText(200),
  amount: optionalMoney,
  description: optionalText(8000),
  days: arrayFromNullish(sightseeingDaySchema).pipe(z.array(sightseeingDaySchema).max(60)),
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
    pricingMode: z.enum(PRICING_MODES).default('TOTAL'),
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
    // Weblink customization — quotation-specific FAQs and custom section order.
    faqs: arrayFromNullish(
      z.object({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(5000),
      }),
    ).pipe(
      z
        .array(
          z.object({
            question: z.string().trim().min(1).max(500),
            answer: z.string().trim().min(1).max(5000),
          }),
        )
        .max(50),
    ),
    weblinkSectionOrder: z.array(z.string().trim().min(1).max(80)).max(30).nullable().optional(),
    // Destination Expert — per-quotation expert config
    destinationExpertConfig: z
      .object({
        enabled: z.boolean().default(false),
        expertUserId: z.string().uuid().nullable().optional(),
        heading: optionalText(200),
        customIntroduction: optionalText(2000),
        whatsappNumber: z
          .string()
          .trim()
          .max(32)
          .nullable()
          .optional()
          .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid WhatsApp number'),
        callNumber: z
          .string()
          .trim()
          .max(32)
          .nullable()
          .optional()
          .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid phone number'),
        email: z
          .string()
          .trim()
          .max(255)
          .nullable()
          .optional()
          .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
        showWhatsapp: z.boolean().default(true),
        showCall: z.boolean().default(true),
        showEmail: z.boolean().default(true),
        showExperience: z.boolean().default(true),
        showTripsPlanned: z.boolean().default(true),
        showLanguages: z.boolean().default(true),
      })
      .nullable()
      .optional(),
    notes: optionalText(4000),
    internalNotes: optionalText(4000),
    itinerary: arrayFromNullish(quotationItinerarySchema).pipe(
      z.array(quotationItinerarySchema).max(500),
    ),
    hotels: arrayFromNullish(quotationHotelSchema).pipe(z.array(quotationHotelSchema).max(200)),
    services: arrayFromNullish(quotationServiceSchema).pipe(
      z.array(quotationServiceSchema).max(500),
    ),
    inclusions: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
    exclusions: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
    terms: arrayFromNullish(contentSchema).pipe(z.array(contentSchema).max(200)),
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
 * Weblink customization — reorderable sections for the public quotation page.
 * These ids map one-to-one to the actual sections rendered by PublicQuotationPage.
 * Do NOT add fictional sections here; the list must stay in sync with the renderer.
 */
export const WEBLINK_SECTION_IDS = [
  'services',
  'itinerary',
  'hotels',
  'flights',
  'transportation',
  'cruise',
  'addons',
  'visa',
  'policies',
  'destinationExpert',
  'faqs',
] as const;
export type WeblinkSectionId = (typeof WEBLINK_SECTION_IDS)[number];
export const DEFAULT_WEBLINK_SECTION_ORDER: WeblinkSectionId[] = [...WEBLINK_SECTION_IDS];

/**
 * Normalize a possibly-stale saved section order into a complete, deduped order.
 * Unknown ids are dropped; missing known ids are appended in default order so
 * new sections never disappear on old quotations.
 */
export function resolveWeblinkSectionOrder(
  saved: unknown,
  fallback: readonly string[] = DEFAULT_WEBLINK_SECTION_ORDER,
): string[] {
  const valid = new Set<string>(WEBLINK_SECTION_IDS as readonly string[]);
  if (!Array.isArray(saved) || saved.length === 0) return [...fallback];
  const normalized = (saved as unknown[])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0 && valid.has(value));
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of normalized) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  for (const id of fallback) {
    if (!seen.has(id as string) && valid.has(id as string)) {
      deduped.push(id as string);
    }
  }
  // Append any brand-new known ids not yet in fallback (future-proof).
  for (const id of WEBLINK_SECTION_IDS) {
    if (!deduped.includes(id)) deduped.push(id);
  }
  return deduped;
}

/**
 * Quotation PDFs follow the SAME single saved `weblinkSectionOrder` as the
 * public weblink — there is no separate per-PDF ordering. Visa has no
 * independent PDF renderer (both styles fold it into the add-on pages), so it
 * is not an independently placeable PDF section.
 */
export const QUOTATION_PDF_SECTION_IDS = [
  'flights',
  'hotels',
  'itinerary',
  'transportation',
  'cruise',
  'services',
  'addons',
  'policies',
  'destinationExpert',
  'faqs',
] as const;
export type QuotationPdfSectionId = (typeof QUOTATION_PDF_SECTION_IDS)[number];

/** Sequence used when no custom order is saved — preserves the legacy PDF layout. */
export const DEFAULT_QUOTATION_PDF_SECTION_ORDER: QuotationPdfSectionId[] = [
  ...QUOTATION_PDF_SECTION_IDS,
];

/**
 * Type guard for weblink section ids that are independently placeable PDF
 * sections. Excludes 'visa', which both PDF styles render inside the add-on
 * pages rather than as its own section.
 */
function isQuotationPdfSectionId(id: string): id is QuotationPdfSectionId {
  return (QUOTATION_PDF_SECTION_IDS as readonly string[]).includes(id);
}

/**
 * Resolve the PDF section order from the version's saved weblink order.
 * Falls back to the legacy PDF sequence when nothing (or something invalid)
 * is saved, so existing quotations keep their current layout.
 */
export function resolveQuotationPdfSectionOrder(saved: unknown): QuotationPdfSectionId[] {
  if (!Array.isArray(saved) || saved.length === 0) return [...DEFAULT_QUOTATION_PDF_SECTION_ORDER];
  // resolveWeblinkSectionOrder() also emits 'visa'; the guard filters it out.
  return resolveWeblinkSectionOrder(saved).filter(isQuotationPdfSectionId);
}

/**
 * Validate and normalize FAQs stored on a quotation version.
 * Invalid entries are dropped so a single bad row never breaks public rendering.
 */
export function normalizeFaqs(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
    if (!question || !answer) return [];
    return [{ question: question.slice(0, 500), answer: answer.slice(0, 5000) }];
  });
}

export const destinationExpertConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    expertUserId: z.string().uuid().nullable().optional(),
    heading: z.string().trim().max(200).nullable().optional(),
    customIntroduction: z.string().trim().max(2000).nullable().optional(),
    whatsappNumber: z
      .string()
      .trim()
      .max(32)
      .nullable()
      .optional()
      .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid WhatsApp number'),
    callNumber: z
      .string()
      .trim()
      .max(32)
      .nullable()
      .optional()
      .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v), 'Enter a valid phone number'),
    email: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional()
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
    showWhatsapp: z.boolean().default(true),
    showCall: z.boolean().default(true),
    showEmail: z.boolean().default(true),
    showExperience: z.boolean().default(true),
    showTripsPlanned: z.boolean().default(true),
    showLanguages: z.boolean().default(true),
  })
  .nullable()
  .optional();

export type DestinationExpertConfig = z.infer<typeof destinationExpertConfigSchema>;

export function normalizeDestinationExpertConfig(value: unknown): DestinationExpertConfig {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const enabled = row.enabled === true;
  if (!enabled)
    return {
      enabled: false,
      expertUserId: null,
      heading: null,
      customIntroduction: null,
      whatsappNumber: undefined,
      callNumber: undefined,
      email: undefined,
      showWhatsapp: true,
      showCall: true,
      showEmail: true,
      showExperience: true,
      showTripsPlanned: true,
      showLanguages: true,
    } as DestinationExpertConfig;
  const expertUserId =
    typeof row.expertUserId === 'string' && row.expertUserId.trim()
      ? row.expertUserId.trim()
      : null;
  const hasWhatsapp = 'whatsappNumber' in row;
  const hasCall = 'callNumber' in row || 'phoneNumber' in row;
  const hasEmail = 'email' in row;
  const whatsappNumber = hasWhatsapp
    ? typeof row.whatsappNumber === 'string' && row.whatsappNumber.trim()
      ? row.whatsappNumber.trim().slice(0, 32)
      : null
    : undefined;
  const rawCall = (row.callNumber as unknown) ?? (row as Record<string, unknown>).phoneNumber;
  const callNumber = hasCall
    ? typeof rawCall === 'string' && (rawCall as string).trim()
      ? (rawCall as string).trim().slice(0, 32)
      : null
    : undefined;
  const email = hasEmail
    ? typeof row.email === 'string' && row.email.trim()
      ? row.email.trim().slice(0, 255).toLowerCase()
      : null
    : undefined;
  return {
    enabled: true,
    expertUserId,
    heading: typeof row.heading === 'string' ? row.heading.trim().slice(0, 200) || null : null,
    customIntroduction:
      typeof row.customIntroduction === 'string'
        ? row.customIntroduction.trim().slice(0, 2000) || null
        : null,
    whatsappNumber,
    callNumber,
    email,
    showWhatsapp: row.showWhatsapp !== false,
    showCall: row.showCall !== false,
    showEmail: row.showEmail !== false,
    showExperience: row.showExperience !== false,
    showTripsPlanned: row.showTripsPlanned !== false,
    showLanguages: row.showLanguages !== false,
  } as DestinationExpertConfig;
}

/**
 * Resolve real fallback contacts for Destination Expert.
 * Shared priority used by frontend prefill and backend public rendering.
 * Never returns fake placeholders.
 */
export function resolveDestinationExpertFallbacks(params: {
  expert?: { whatsappNumber?: string | null; phone?: string | null; email?: string | null } | null;
  company?: { phone?: string | null; email?: string | null } | null;
}): { whatsappNumber: string | null; callNumber: string | null; email: string | null } {
  const expertWhatsapp = params.expert?.whatsappNumber?.trim() || null;
  const expertPhone = params.expert?.phone?.trim() || null;
  const companyPhone = params.company?.phone?.trim() || null;
  const expertEmail = params.expert?.email?.trim() || null;
  const companyEmail = params.company?.email?.trim() || null;
  const whatsappNumber = expertWhatsapp || expertPhone || companyPhone || null;
  const callNumber = expertPhone || companyPhone || null;
  const email = expertEmail || companyEmail || null;
  return { whatsappNumber, callNumber, email };
}

export function isDestinationExpertConfigValid(
  config: DestinationExpertConfig | null | undefined,
): boolean {
  if (!config?.enabled || !config.expertUserId) return false;
  return true;
}

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

// ---------------------------------------------------------------------------
// Pricing resolver — single source of truth for Total vs Section-wise pricing
// ---------------------------------------------------------------------------

export type PricingMode = 'TOTAL' | 'SECTION_WISE';

export function normalizePricingMode(value: unknown): PricingMode {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SECTION_WISE' || normalized === 'SECTION-WISE' || normalized === 'SECTIONWISE') return 'SECTION_WISE';
  if (normalized === 'TOTAL' || normalized === 'PACKAGE_TOTAL' || normalized === 'PER_PERSON') return 'TOTAL';
  if (normalized === 'ITEMIZED') return 'TOTAL';
  return 'TOTAL';
}

export interface SectionPrice {
  id: 'flight' | 'hotel' | 'cruise' | 'vehicle' | 'sightseeing' | 'addon' | 'visa';
  label: string;
  amount: number;
}

export interface PaxCounts {
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function paxForLabel(label: string, pax: PaxCounts): number | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'adult' || normalized === 'adults') return pax.adults;
  if (normalized === 'cwb' || normalized === 'child with bed' || normalized === 'child_with_bed') return pax.childrenWithBed;
  if (normalized === 'cwob' || normalized === 'child without bed' || normalized === 'child_without_bed') return pax.childrenWithoutBed;
  if (normalized === 'infant' || normalized === 'infants') return pax.infants;
  if (normalized === 'child' || normalized === 'children') return pax.childrenWithBed + pax.childrenWithoutBed;
  return null;
}

export function calculateSightseeingActivityTotal(
  pricingOptions: Array<{ label: string; price: number | string | null | undefined }> | null | undefined,
  pax: PaxCounts,
): number {
  if (!Array.isArray(pricingOptions) || !pricingOptions.length) return 0;
  let total = 0;
  for (const row of pricingOptions) {
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label) continue;
    const price = toNumber(row.price);
    if (price === 0 && row.price !== 0 && row.price !== '0') {
      // price 0 is valid, but if row.price was null/undefined treated as 0, skip if label has no price? Keep 0 as valid.
    }
    const quantity = paxForLabel(label, pax);
    if (quantity === null) {
      total += price;
    } else {
      total += price * quantity;
    }
  }
  return Math.round(total * 100) / 100;
}

export function calculateSightseeingSectionTotal(
  sightseeingDetails: unknown,
  pax: PaxCounts,
): number {
  if (!sightseeingDetails || typeof sightseeingDetails !== 'object') return 0;
  const details = sightseeingDetails as { days?: unknown; amount?: unknown };
  // If days not present, fallback to amount field
  if (!Array.isArray(details.days)) {
    return toNumber((details as { amount?: unknown }).amount);
  }
  let total = 0;
  for (const day of details.days as unknown[]) {
    if (!day || typeof day !== 'object') continue;
    const activities = (day as { activities?: unknown }).activities;
    if (!Array.isArray(activities)) continue;
    for (const activity of activities) {
      if (!activity || typeof activity !== 'object') continue;
      const pricingOptions = (activity as { pricingOptions?: unknown }).pricingOptions;
      total += calculateSightseeingActivityTotal(pricingOptions as never, pax);
    }
  }
  // If no priced activities but amount exists, use amount as fallback
  if (total === 0 && details.amount != null) {
    return toNumber(details.amount);
  }
  return Math.round(total * 100) / 100;
}

export interface QuotationPricing {
  pricingMode: PricingMode;
  packageTotal: number;
  /** Sum of every section amount (incl. visa). This is the authoritative
   *  total for SECTION_WISE pricing. */
  sectionTotal: number;
  currency: string;
  sections: SectionPrice[];
  allocatedAmount: number;
  remainingAmount: number;
  overallocatedAmount: number;
  isOverallocated: boolean;
  isExactlyAllocated: boolean;
}

export function resolveQuotationPricing(input: {
  version: {
    pricingMode?: unknown;
    finalAmount?: unknown;
    currency?: unknown;
    flightDetails?: unknown;
    hotelDetails?: unknown;
    hotels?: unknown;
    sightseeingDetails?: unknown;
    services?: unknown;
    includeVisa?: unknown;
    visaAmount?: unknown;
    visaServiceCharge?: unknown;
    visaGstPercent?: unknown;
    visaVfsCharge?: unknown;
  };
  quotation: {
    adults?: unknown;
    childrenWithBed?: unknown;
    childrenWithoutBed?: unknown;
    infants?: unknown;
    currency?: unknown;
  };
}): QuotationPricing {
  const pricingMode = normalizePricingMode(input.version.pricingMode);
  const currency =
    (typeof input.version.currency === 'string' && input.version.currency.trim()) ||
    (typeof input.quotation.currency === 'string' && input.quotation.currency.trim()) ||
    'INR';
  const packageTotal = Math.round(toNumber(input.version.finalAmount) * 100) / 100;

  const pax: PaxCounts = {
    adults: Math.max(0, Math.floor(toNumber(input.quotation.adults))),
    childrenWithBed: Math.max(0, Math.floor(toNumber(input.quotation.childrenWithBed))),
    childrenWithoutBed: Math.max(0, Math.floor(toNumber(input.quotation.childrenWithoutBed))),
    infants: Math.max(0, Math.floor(toNumber(input.quotation.infants))),
  };

  const flightAmount =
    (input.version.flightDetails as { include?: boolean; amount?: unknown } | null)?.include === false
      ? 0
      : toNumber((input.version.flightDetails as { amount?: unknown } | null)?.amount);
  // Each hotel stay stores its own quotation price in hotels[].sellingPrice.
  // The section-wise hotel amount is the SUM of every included stay's price,
  // never a single shared value — so selecting a second hotel cannot clobber
  // the first one's price. When no per-stay rows are supplied (legacy callers
  // that only carry hotelDetails.amount), fall back to the section amount.
  const hotelIncluded =
    (input.version.hotelDetails as { include?: boolean } | null)?.include !== false;
  const hotelRows = Array.isArray(input.version.hotels) ? (input.version.hotels as unknown[]) : [];
  const hotelAmount = !hotelIncluded
    ? 0
    : hotelRows.length > 0
      ? Math.round(
          hotelRows.reduce<number>((sum, row) => {
            if (!row || typeof row !== 'object') return sum;
            const r = row as { selected?: unknown; sellingPrice?: unknown };
            if (r.selected === false) return sum;
            return sum + toNumber(r.sellingPrice);
          }, 0) * 100,
        ) / 100
      : toNumber((input.version.hotelDetails as { amount?: unknown } | null)?.amount);

  const services = Array.isArray(input.version.services) ? (input.version.services as unknown[]) : [];

  const sumServices = (predicate: (row: Record<string, unknown>) => boolean): number => {
    let sum = 0;
    for (const row of services) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (!predicate(r)) continue;
      const quantity = toNumber(r.quantity ?? 1);
      const unitPrice = toNumber(r.unitSellingPrice ?? r.sellingPrice);
      const total = r.totalSellingPrice != null ? toNumber(r.totalSellingPrice) : quantity * unitPrice;
      sum += total;
    }
    return Math.round(sum * 100) / 100;
  };

  const cruiseAmount = sumServices((r) => r.serviceType === 'CRUISE');
  const vehicleAmount = sumServices((r) => r.serviceType === 'VEHICLE_TRANSFER');
  const sightseeingAmount = calculateSightseeingSectionTotal(input.version.sightseeingDetails, pax);
  const addonAmount = sumServices((r) => {
    if (r.addOnServiceId) return true;
    const t = String(r.serviceType ?? '');
    return ['OTHER_ADD_ON', 'TRAVEL_INSURANCE', 'RAIL', 'PASSPORT_ASSISTANCE', 'MEAL', 'GUIDE', 'GENERAL_ENQUIRY'].includes(t);
  });
  // Visa is a single dedicated section: base visa amount plus the service
  // charge, its GST, and the VFS charge — mirroring the builder's consolidated
  // visa total. Kept out of the sum when the visa section is excluded.
  const visaIncluded = input.version.includeVisa !== false;
  const visaAmountRaw = toNumber(input.version.visaAmount);
  const visaServiceCharge = toNumber(input.version.visaServiceCharge);
  const visaGstPercent = toNumber(input.version.visaGstPercent);
  const visaVfsCharge = toNumber(input.version.visaVfsCharge);
  const visaAmount = !visaIncluded
    ? 0
    : Math.round(
        (visaAmountRaw +
          visaServiceCharge +
          (visaServiceCharge * visaGstPercent) / 100 +
          visaVfsCharge) *
          100,
      ) / 100;

  const sections: SectionPrice[] = [
    { id: 'flight', label: 'Flights', amount: flightAmount },
    { id: 'hotel', label: 'Hotels', amount: hotelAmount },
    { id: 'cruise', label: 'Cruise', amount: cruiseAmount },
    { id: 'vehicle', label: 'Vehicle/Transportation', amount: vehicleAmount },
    { id: 'sightseeing', label: 'Sightseeing', amount: sightseeingAmount },
    { id: 'addon', label: 'Add-on Services', amount: addonAmount },
    { id: 'visa', label: 'Visa', amount: visaAmount },
  ];

  // allocated is the sum of all section amounts (incl. visa). For SECTION_WISE
  // pricing the sections ARE the price, so the section total is the quotation
  // total. For TOTAL pricing the authoritative total stays the package total.
  const allocatedAmount = Math.round(sections.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
  const sectionTotal = allocatedAmount;
  const remainingRaw = Math.round((packageTotal - allocatedAmount) * 100) / 100;
  const isOverallocated = remainingRaw < 0;
  const overallocatedAmount = isOverallocated ? Math.abs(remainingRaw) : 0;
  const remainingAmount = isOverallocated ? 0 : remainingRaw;
  const isExactlyAllocated = remainingRaw === 0;

  return {
    pricingMode,
    packageTotal,
    sectionTotal,
    currency: currency.toUpperCase(),
    sections,
    allocatedAmount,
    remainingAmount,
    overallocatedAmount,
    isOverallocated,
    isExactlyAllocated,
  };
}
