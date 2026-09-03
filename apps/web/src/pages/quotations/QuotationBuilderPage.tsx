import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch, type FieldPath, type UseFormReturn } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  ChevronDown,
  ImageIcon,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PERMISSIONS,
  QUOTATION_TAX_NOTE_OPTIONS,
  QUOTATION_TAX_NOTE_SENTINEL,
  SETTINGS_CURRENCIES,
  calculateCruiseRoomLinesTotal,
  calculateFlightTotal,
  calculateHotelRowTotal,
  getFlightPerTravelerBreakdown,
  cabinLuggageLabel,
  formatItineraryDayTitle,
  hotelStayNights,
  labelForLookup,
  normalizePricingMode,
  quotationVersionInputSchema,
  quotationSnapshotImageIdentity,
  resolveCruiseRoomLines,
  resolveHotelMealPlanLines,
  resolveHotelRoomLines,
  resolveQuotationPricing,
  resolveTaxNoteChoice,
  validateQuotationPricing,
  DEFAULT_WEBLINK_SECTION_ORDER,
  resolveWeblinkSectionOrder,
  normalizePublicSlug,
  isReservedPublicSlug,
  type LiveSearchBookmark,
  type QuotationCruiseRoomLine,
  type QuotationVersionInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { MasterSelect } from '@/components/ui/MasterSelect';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import {
  SightseeingSection,
  emptySightseeingActivity,
  emptySightseeingDay,
  withSightseeingPricingRows,
} from './SightseeingSection';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  quotationDocumentInlineUrl,
  uploadQuotationAttachment,
  useQuotation,
  useUpdateQuotationVersion,
  useUpdateQuotationWeblinkName,
  useUpdateQuotationWeblinkSettings,
  type QuotationVersion,
} from '@/features/quotations/quotations.api';
import { useSettings } from '@/features/settings/settings.api';
import { useDestinationExpertPresets } from '@/features/destination-expert/destination-expert.api';
import {
  cruiseImageUrl,
  hotelImageUrl,
  useAddOnServices,
  useAirlines,
  useCreateAirline,
  useCruise,
  useCruises,
  useDestinations,
  useHotel,
  useHotels,
  useSightseeingList,
  useVehicles,
  vehicleImageUrl,
  type MasterImageMeta,
  type Airline,
  type Destination,
  type Page,
  type Sightseeing,
} from '@/features/masters/masters.api';
import { useUsers } from '@/features/users/users.api';
import { useFaqs } from '@/features/masters/masters.api';
import {
  CLEARED_SERVICE_MASTERS,
  HotelMasterFields,
  ServiceMasterFields,
  type HotelRowPatch,
  type ServiceRowPatch,
} from '@/features/quotations/MasterFields';
import {
  BookmarkLoadField,
  HotelBookmarkListField,
  flightBookmarkSegmentAirlines,
  flightBookmarkToDetails,
  hotelBookmarkToDetails,
  normalizeAirlineName,
  resolveFlightSegmentAirlines,
} from '@/features/quotations/BookmarkImport';

const field =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm h-[38px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring transition-colors';
const fieldMuted = 'w-full rounded-lg bg-muted/60 border border-border/50 px-3 py-2 text-sm font-medium text-foreground h-[38px]';
const calculatedCard = 'rounded-lg bg-muted/50 border border-border/40 px-3 py-2.5';
const calculatedLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const calculatedValue = 'text-sm font-semibold text-foreground';
const subsectionHeading = 'text-xs font-semibold uppercase tracking-widest text-brand-700';
const subsectionHeadingMuted = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

type QuotationImage = NonNullable<QuotationVersionInput['services'][number]['images']>[number];

/** Copy ordered, opaque Master image ids immediately (no preview network wait). */
export function masterGallerySnapshot(
  images: MasterImageMeta[] | null | undefined,
  alt: string,
): QuotationImage[] {
  return (images ?? []).map((image, index) => ({
    masterImageId: image.id,
    alt: `${alt} image ${index + 1}`,
  }));
}

/**
 * `undefined` deliberately asks the API to import a linked Master gallery when
 * talking to an older response shape that did not expose ordered image ids.
 */
function masterGalleryPresence(master: { images?: unknown } | null | undefined) {
  if (!master) return false;
  return Array.isArray(master.images) ? true : undefined;
}

/** Best-effort signed previews; opaque refs above remain the source of truth. */
async function importMasterGalleryPreviews(
  masterId: string,
  snapshot: QuotationImage[],
  download: (id: string, imageId?: string) => Promise<{ url: string }>,
): Promise<QuotationImage[]> {
  return Promise.all(
    snapshot.map(async (image) => {
      let url: string | undefined;
      try {
        url = (await download(masterId, image.masterImageId ?? image.id ?? undefined)).url;
      } catch {
        // The opaque Master image id is enough for the API to snapshot it.
        // Preview URL failures must not drop otherwise valid images.
      }
      return {
        ...image,
        ...(url ? { url } : {}),
      };
    }),
  );
}

/** Add finished preview URLs without restoring removed images or stale order. */
export function mergeMasterGalleryPreviews(
  current: QuotationImage[] | null | undefined,
  previewed: QuotationImage[],
): QuotationImage[] {
  const urls = new Map(
    previewed.flatMap((image) => {
      const identity = quotationSnapshotImageIdentity(image);
      return identity && image.url ? [[identity, image.url] as const] : [];
    }),
  );
  return (current ?? []).map((image) => {
    const identity = quotationSnapshotImageIdentity(image);
    const url = identity ? urls.get(identity) : undefined;
    return url ? { ...image, url } : image;
  });
}

/**
 * Register options for money inputs: an empty field coerces to 0 instead of NaN,
 * which would otherwise fail `money.finite()` validation and silently block save.
 */
const MONEY_FIELD = {
  setValueAs: (value: unknown) => {
    if (value === '' || value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  },
} as const;

/** Tab model. `types` maps a tab to the service rows it owns (Hotel/Inclusions/Summary have their own UI). */
type ServiceType = QuotationVersionInput['services'][number]['serviceType'];
interface TabDef {
  key: string;
  label: string;
  types?: ServiceType[];
}
const ADDON_TYPES: ServiceType[] = [
  'TRAVEL_INSURANCE',
  'RAIL',
  'PASSPORT_ASSISTANCE',
  'MEAL',
  'GUIDE',
  'OTHER_ADD_ON',
  'GENERAL_ENQUIRY',
];
const CLASS_OPTIONS = ['Economy', 'Premium Economy', 'Business', 'First'];
const CABIN_LUGGAGE_OPTIONS = ['7kg', '10kg', 'No Cabin Baggage'];
const CHECKIN_LUGGAGE_OPTIONS = ['0kg', '15kg', '20kg', '23kg', '25kg', '30kg', '40kg+', '46kg'];
// Alternative combinations remain fully supported by the data model and save path.
// Keep this false to hide only the Hotel Options UI until the feature is needed again.
const SHOW_HOTEL_OPTIONS = false;

// Visa is temporarily hidden from the quotation builder UI. Set this back to
// true to restore the Visa tab and panel; all Visa backend/schema/data paths
// are untouched and existing quotations keep their saved Visa values.
const SHOW_VISA_QUOTATION_TAB = false;

/** "Xh Ym" flight duration from date+time strings, or '' if incomputable/negative. */
const computeDuration = (
  depDate?: string | null,
  depTime?: string | null,
  arrDate?: string | null,
  arrTime?: string | null,
) => {
  if (!depDate || !depTime || !arrDate || !arrTime) return '';
  const dep = new Date(`${depDate}T${depTime}`).getTime();
  const arr = new Date(`${arrDate}T${arrTime}`).getTime();
  if (Number.isNaN(dep) || Number.isNaN(arr)) return '';
  const minutes = Math.round((arr - dep) / 60000);
  if (minutes < 0) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const flightTimesAreChronological = (
  depDate?: string | null,
  depTime?: string | null,
  arrDate?: string | null,
  arrTime?: string | null,
) => {
  if (!depDate || !depTime || !arrDate || !arrTime) return true;
  const departure = new Date(`${depDate}T${depTime}`).getTime();
  const arrival = new Date(`${arrDate}T${arrTime}`).getTime();
  return Number.isNaN(departure) || Number.isNaN(arrival) || arrival > departure;
};

const hasInvalidFlightTiming = (details: QuotationVersionInput['flightDetails']) =>
  [details?.outbound, details?.returnJourney].some((journey) =>
    (journey?.segments ?? []).some(
      (segment) =>
        !flightTimesAreChronological(
          segment.departureDate,
          segment.departureTime,
          segment.arrivalDate,
          segment.arrivalTime,
        ),
    ),
  );

const FLIGHT_JOURNEY_TYPE_LABELS: Record<string, string> = {
  ROUND_TRIP: 'Round Trip (Outbound + Return)',
  ONEWAY_OUTBOUND: 'One Way - Outbound Only',
  ONEWAY_RETURN: 'One Way - Return Only',
};
type FlightSegmentInput = NonNullable<
  QuotationVersionInput['flightDetails']
>['outbound']['segments'][number];
const emptySegment = (): FlightSegmentInput => ({
  airlineId: null,
  airlineName: null,
  flightNumber: null,
  travelClass: 'Economy',
  from: null,
  to: null,
  departureDate: null,
  departureTime: '10:00',
  arrivalDate: null,
  arrivalTime: '13:00',
  duration: null,
  cabinLuggage: '7kg',
  checkInLuggage: '20kg',
  notes: null,
  connectionVia: null,
});
const defaultFlightDetails = (): NonNullable<QuotationVersionInput['flightDetails']> => ({
  include: true,
  sectionTitle: 'Flight Details',
  amount: 0,
  pricingBasis: 'FIXED_TOTAL',
  perTraveler: { adult: null, childWithBed: null, childWithoutBed: null, infant: null },
  entryMode: 'MANUAL',
  imageDocumentId: null,
  imageFileName: null,
  images: [],
  journeyType: 'ROUND_TRIP',
  outbound: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [emptySegment()] },
  returnJourney: {
    fromCity: null,
    toCity: null,
    travelClass: 'Economy',
    segments: [emptySegment()],
  },
});
const defaultHotelDetails = (): NonNullable<QuotationVersionInput['hotelDetails']> => ({
  include: true,
  sectionTitle: 'Your Hotels',
  amount: 0,
  description: null,
  images: [],
});

interface VehicleDraft {
  include: boolean;
  sectionTitle: string;
  amount: number;
  vehicleType: string;
  vehicleId: string;
  vehicleModel: string;
  usage: string;
  description: string;
  images: QuotationImage[];
  imageSnapshotPresent: boolean | undefined;
  pdfImageUrl: string | null;
  // What `amount` represents: days / hours / transfers / vehicles / fixed total.
  pricingBasis: string;
  // Days / hours / transfers / vehicle count — the multiplier of the unit rate.
  quantity: number;
}

const VEHICLE_PRICING_BASES: Array<[string, string]> = [
  ['PER_DAY', 'Per Day'],
  ['PER_HOUR', 'Per Hour'],
  ['PER_TRANSFER', 'Per Transfer'],
  ['PER_VEHICLE', 'Per Vehicle'],
  ['FIXED', 'Fixed Total'],
];

const defaultVehicleDraft = (): VehicleDraft => ({
  include: true,
  sectionTitle: 'Transportation',
  amount: 0,
  vehicleType: '',
  vehicleId: '',
  vehicleModel: '',
  usage: '',
  description: '',
  images: [],
  imageSnapshotPresent: false,
  pdfImageUrl: null,
  pricingBasis: 'PER_DAY',
  quantity: 1,
});

const hotelSectionTitle = (value: string | null | undefined) => {
  const title = value?.trim();
  return !title || title === 'Accommodation Details' ? 'Your Hotels' : title;
};

const TABS: TabDef[] = [
  { key: 'pricingMethod', label: 'Pricing Method' },
  { key: 'flight', label: 'Flight' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'cruise', label: 'Cruise', types: ['CRUISE'] },
  { key: 'vehicle', label: 'Vehicle', types: ['VEHICLE_TRANSFER'] },
  ...(SHOW_VISA_QUOTATION_TAB ? [{ key: 'visa', label: 'Visa' }] : []),
  { key: 'addon', label: 'Add-on Services', types: ADDON_TYPES },
  { key: 'inclusions', label: 'Inclusions & Exclusions' },
  { key: 'destinationExpert', label: 'Destination Expert' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'summary', label: 'Summary & Pricing' },
  { key: 'pricingBreakdown', label: 'Pricing Breakdown' },
  { key: 'setting', label: 'Settings' },
];

const WEBLINK_SECTION_LABELS: Record<string, string> = {
  services: 'Services Include',
  destinationExpert: 'Destination Expert',
  itinerary: 'Itinerary',
  hotels: 'Hotels',
  flights: 'Flight Details',
  transportation: 'Transportation',
  cruise: 'Cruise',
  addons: 'Additional Services',
  visa: 'Visa',
  policies: 'Policies',
  faqs: 'FAQs',
};

/**
 * Lead-requested services → quotation tab keys. The Lead's selected services are
 * the source of truth for which quotation tabs show the red `*` and which
 * Include-in-Quotation checkboxes default to checked on a NEW quotation.
 * Every service tab is mapped here so no service (Add-on, Cruise, …) is missed.
 */
const SERVICE_TAB_TYPES: Record<string, ServiceType[]> = {
  flight: ['FLIGHT'],
  hotel: ['HOTEL'],
  sightseeing: ['SIGHTSEEING'],
  cruise: ['CRUISE'],
  vehicle: ['VEHICLE_TRANSFER'],
  addon: ADDON_TYPES,
};

/** Map a Lead service type to its quotation tab key, or null. */
export function serviceTypeToTabKey(serviceType: string): string | null {
  for (const [key, types] of Object.entries(SERVICE_TAB_TYPES)) {
    if ((types as string[]).includes(serviceType)) return key;
  }
  return null;
}

/** Set of tab keys requested by the Lead (the tab shows a red `*`). */
export function leadRequestedTabs(
  query: { services?: Array<{ serviceType: string }> } | undefined,
): Set<string> {
  const requested = new Set<string>();
  for (const row of query?.services ?? []) {
    const tab = serviceTypeToTabKey(row.serviceType);
    if (tab) requested.add(tab);
  }
  return requested;
}

const defaults: QuotationVersionInput = {
  title: '',
  introduction: null,
  destinationSummary: '',
  travelStartDate: null,
  travelEndDate: null,
  currency: 'INR',
  pricingMode: 'PER_PERSON',
  pricingHeading: 'Price Breakdown',
  pricingSubheading: null,
  pricingDisplayOrder: undefined,
  markupMode: 'NONE',
  markupValue: 0,
  taxRate: 0,
  discountAmount: 0,
  perAdultPrice: 0,
  perChildWithBedPrice: 0,
  perChildWithoutBedPrice: 0,
  perInfantPrice: 0,
  taxNote: null,
  netAmount: 0,
  initialPaymentAmount: 0,
  paymentLink: null,
  customCharges: [],
  showServiceChargesSeparately: false,
  markServiceChargesOutside: false,
  hidePricing: false,
  showIndividualPricing: false,
  showQuickNav: true,
  quickNavSticky: true,
  inclusionsHtml: null,
  exclusionsHtml: null,
  paymentPolicies: null,
  cancellationPolicies: null,
  bookingTerms: null,
  includeVisa: true,
  visaSectionTitle: null,
  visaAmount: 0,
  visaDestination: null,
  visaType: null,
  visaServiceCharge: 0,
  visaGstPercent: 0,
  visaVfsCharge: 0,
  flightDetails: defaultFlightDetails(),
  hotelDetails: defaultHotelDetails(),
  addOnDetails: { include: true, sectionTitle: 'Additional Services' },
  sightseeingDetails: {
    include: true,
    sectionTitle: 'Sightseeing & Experiences',
    amount: 0,
    description: null,
    days: [emptySightseeingDay(1)],
  },
  notes: null,
  internalNotes: null,
  faqs: [],
  weblinkSectionOrder: null,
  destinationExpertConfig: null,
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
};
const arrayOrEmpty = <T,>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];
const objectOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const normalizeImageSnapshot = <T extends object>(row: T) => {
  const raw = row as T & { images?: QuotationImage[] | null; imageSnapshotPresent?: boolean };
  return {
    ...row,
    images: arrayOrEmpty(raw.images),
    imageSnapshotPresent: raw.imageSnapshotPresent ?? Array.isArray(raw.images),
  };
};

export function normalizeQuotationVersionForBuilder(version: QuotationVersion): QuotationVersion {
  const raw = version as QuotationVersion & Record<string, unknown>;
  const flight = objectOrNull(raw.flightDetails);
  const outbound = objectOrNull(flight?.outbound);
  const returnJourney = objectOrNull(flight?.returnJourney);
  const hotelDetails = objectOrNull(raw.hotelDetails);
  const sightseeing = objectOrNull(raw.sightseeingDetails);
  const addOnDetails = objectOrNull(raw.addOnDetails);

  return {
    ...version,
    introduction: typeof raw.introduction === 'string' ? raw.introduction : null,
    weblinkHeading: typeof raw.weblinkHeading === 'string' ? raw.weblinkHeading : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    internalNotes: typeof raw.internalNotes === 'string' ? raw.internalNotes : null,
    inclusionsHtml: typeof raw.inclusionsHtml === 'string' ? raw.inclusionsHtml : null,
    exclusionsHtml: typeof raw.exclusionsHtml === 'string' ? raw.exclusionsHtml : null,
    paymentPolicies: typeof raw.paymentPolicies === 'string' ? raw.paymentPolicies : null,
    cancellationPolicies:
      typeof raw.cancellationPolicies === 'string' ? raw.cancellationPolicies : null,
    bookingTerms: typeof raw.bookingTerms === 'string' ? raw.bookingTerms : null,
    flightDetails: flight
      ? ({
          ...flight,
          images: arrayOrEmpty(
            flight.images as
              NonNullable<QuotationVersionInput['flightDetails']>['images'] | null | undefined,
          ),
          outbound: {
            ...outbound,
            segments: arrayOrEmpty(
              outbound?.segments as
                | NonNullable<QuotationVersionInput['flightDetails']>['outbound']['segments']
                | null
                | undefined,
            ),
          },
          returnJourney: {
            ...returnJourney,
            segments: arrayOrEmpty(
              returnJourney?.segments as
                | NonNullable<QuotationVersionInput['flightDetails']>['returnJourney']['segments']
                | null
                | undefined,
            ),
          },
        } as QuotationVersion['flightDetails'])
      : null,
    hotelDetails: hotelDetails
      ? ({
          ...hotelDetails,
          images: arrayOrEmpty(
            hotelDetails.images as
              NonNullable<QuotationVersionInput['hotelDetails']>['images'] | null | undefined,
          ),
        } as QuotationVersion['hotelDetails'])
      : null,
    addOnDetails: addOnDetails
      ? ({
          include: addOnDetails.include !== false,
          sectionTitle:
            typeof addOnDetails.sectionTitle === 'string' ? addOnDetails.sectionTitle : null,
        } as QuotationVersion['addOnDetails'])
      : null,
    sightseeingDetails: sightseeing
      ? ({
          ...sightseeing,
          days: arrayOrEmpty(
            sightseeing.days as
              NonNullable<QuotationVersionInput['sightseeingDetails']>['days'] | null | undefined,
          ).map((day) => ({
            ...day,
            activities: arrayOrEmpty(day.activities).map((activity) => ({
              ...activity,
              images: arrayOrEmpty(activity.images),
              pricingOptions: arrayOrEmpty(activity.pricingOptions),
            })),
          })),
        } as QuotationVersion['sightseeingDetails'])
      : null,
    itinerary: arrayOrEmpty(raw.itinerary as QuotationVersion['itinerary'] | null | undefined),
    hotels: arrayOrEmpty(raw.hotels as QuotationVersion['hotels'] | null | undefined).map(
      normalizeImageSnapshot,
    ),
    services: arrayOrEmpty(raw.services as QuotationVersion['services'] | null | undefined).map(
      normalizeImageSnapshot,
    ),
    inclusions: arrayOrEmpty(raw.inclusions as QuotationVersion['inclusions'] | null | undefined),
    exclusions: arrayOrEmpty(raw.exclusions as QuotationVersion['exclusions'] | null | undefined),
    terms: arrayOrEmpty(raw.terms as QuotationVersion['terms'] | null | undefined),
    faqs: arrayOrEmpty(raw.faqs as QuotationVersion['faqs'] | null | undefined),
    weblinkSectionOrder: Array.isArray(raw.weblinkSectionOrder)
      ? (raw.weblinkSectionOrder as string[])
      : null,
    destinationExpertConfig: objectOrNull(raw.destinationExpertConfig)
      ? (raw.destinationExpertConfig as QuotationVersion['destinationExpertConfig'])
      : null,
  } as QuotationVersion;
}
const parseCheckInToDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yyyy = Number(dmy[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const ymd = raw.slice(0, 10).split('-').map(Number);
    const d = new Date(Date.UTC(ymd[0]!, ymd[1]! - 1, ymd[2]!));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toDate = (value: string | Date | null | undefined) => {
  const date = parseCheckInToDate(value);
  if (!date) return '';
  // Normalize to YYYY-MM-DD via UTC to avoid timezone shift
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  // If input was already YYYY-MM-DD we still return same; for Date we use UTC date
  // For legacy local handling, use UTC date components for consistency with pricing
  if (value instanceof Date) {
    // Use local date components for Date inputs that were constructed as local dates (from <input type=date>)
    // but parseCheckInToDate already treated YYYY-MM-DD as UTC, Date objects as UTC already.
    // Return YYYY-MM-DD
    return `${yyyy}-${mm}-${dd}`;
  }
  return `${yyyy}-${mm}-${dd}`;
};
const nullable = (value: string) => (value === '' ? null : Number(value));

/** A hotel's price for a travel date: the matching season rate, else the base price. */
export const hotelRateForDate = (
  master: {
    price?: number | null;
    seasons?: Array<{ startDate: string; endDate: string; price: number | null }>;
  },
  travelDate: string | Date | null | undefined,
): number | null => {
  const checkIn = parseCheckInToDate(travelDate);
  if (checkIn) {
    const d = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate());
    const match = (master.seasons ?? []).find((season) => {
      if (season.price == null) return false;
      const s = parseCheckInToDate(season.startDate);
      const e = parseCheckInToDate(season.endDate);
      if (!s || !e) return false;
      const sd = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
      const ed = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
      return d >= sd && d <= ed;
    });
    if (match) return Number(match.price);
  }
  const base = master.price;
  return base != null && Number(base) > 0 ? Number(base) : null;
};

/**
 * Resolve applicable master pricing for a room type on a given check-in date.
 * Precedence: Season (date within range) > Month (calendar month) > Base sellingPrice.
 * Returns null when no price found. Manual override protection is handled by caller.
 */
export const resolveRoomPricingForDate = (
  roomType: {
    sellingPrice?: number | null;
    extraBedPrice?: number | null;
    childWithoutBedPrice?: number | null;
    currency?: string | null;
    seasons?: Array<{ startDate: string | Date; endDate: string | Date; price: number | null; extraBedPrice?: number | null; childWithoutBedPrice?: number | null; currency: string; name: string }>;
    monthPrices?: Array<{ month: number; price: number | null; extraBedPrice?: number | null; childWithoutBedPrice?: number | null; currency: string }>;
  } | null | undefined,
  travelDate: string | Date | null | undefined,
): { baseRoomPrice: number | null; extraBedPrice: number | null; childWithoutBedPrice: number | null; pricingSource: 'SEASON' | 'MONTH' | 'BASE' | null } | null => {
  if (!roomType) return null;
  const isValid = parseCheckInToDate(travelDate);
  if (isValid) {
    const d = Date.UTC(isValid.getUTCFullYear(), isValid.getUTCMonth(), isValid.getUTCDate());
    const season = (roomType.seasons ?? []).find((s) => {
      const start = parseCheckInToDate(s.startDate);
      const end = parseCheckInToDate(s.endDate);
      if (!start || !end) return false;
      const sd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const ed = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      return d >= sd && d <= ed;
    });
    if (season) {
      return {
        baseRoomPrice: season.price ?? roomType.sellingPrice ?? null,
        extraBedPrice: (season as unknown as { extraBedPrice?: number | null }).extraBedPrice ?? null,
        childWithoutBedPrice: (season as unknown as { childWithoutBedPrice?: number | null }).childWithoutBedPrice ?? null,
        pricingSource: 'SEASON',
      };
    }
    const month = isValid.getUTCMonth() + 1;
    const monthRow = (roomType.monthPrices ?? []).find((m) => m.month === month);
    if (monthRow) {
      return {
        baseRoomPrice: monthRow.price ?? roomType.sellingPrice ?? null,
        extraBedPrice: monthRow.extraBedPrice ?? null,
        childWithoutBedPrice: monthRow.childWithoutBedPrice ?? null,
        pricingSource: 'MONTH',
      };
    }
  }
  if (roomType.sellingPrice != null && Number(roomType.sellingPrice) > 0) {
    return {
      baseRoomPrice: Number(roomType.sellingPrice),
      extraBedPrice: roomType.extraBedPrice ?? null,
      childWithoutBedPrice: roomType.childWithoutBedPrice ?? null,
      pricingSource: 'BASE',
    };
  }
  if (roomType.extraBedPrice != null || roomType.childWithoutBedPrice != null) {
    return {
      baseRoomPrice: null,
      extraBedPrice: roomType.extraBedPrice ?? null,
      childWithoutBedPrice: roomType.childWithoutBedPrice ?? null,
      pricingSource: 'BASE',
    };
  }
  // If no base sellingPrice but month/season not matching, still check if any monthPrice exists with null date? fallback null
  return null;
};

export const resolveMealPlanPricingForDate = (
  mealPlan: {
    sellingPrice?: number | null;
    currency?: string | null;
    seasons?: Array<{ startDate: string | Date; endDate: string | Date; price: number | null; currency: string; name: string }>;
    monthPrices?: Array<{ month: number; price: number | null; currency: string }>;
  } | null | undefined,
  travelDate: string | Date | null | undefined,
): { price: number | null; pricingSource: 'SEASON' | 'MONTH' | 'BASE' | null } | null => {
  if (!mealPlan) return null;
  const isValid = parseCheckInToDate(travelDate);
  if (isValid) {
    const d = Date.UTC(isValid.getUTCFullYear(), isValid.getUTCMonth(), isValid.getUTCDate());
    const season = (mealPlan.seasons ?? []).find((s) => {
      const start = parseCheckInToDate(s.startDate);
      const end = parseCheckInToDate(s.endDate);
      if (!start || !end) return false;
      const sd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const ed = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      return d >= sd && d <= ed;
    });
    if (season) return { price: season.price ?? mealPlan.sellingPrice ?? null, pricingSource: 'SEASON' };
    const month = isValid.getUTCMonth() + 1;
    const monthRow = (mealPlan.monthPrices ?? []).find((m) => m.month === month);
    if (monthRow) return { price: monthRow.price ?? mealPlan.sellingPrice ?? null, pricingSource: 'MONTH' };
  }
  if (mealPlan.sellingPrice != null && Number(mealPlan.sellingPrice) > 0) return { price: Number(mealPlan.sellingPrice), pricingSource: 'BASE' };
  return null;
};

/** Cruise room-type matching: ID first, fallback to trimmed case-insensitive name (legacy). */
export function findCruiseRoomType(
  cruise: { roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> } | null | undefined,
  roomTypeId: string | null | undefined,
  fallbackName: string | null | undefined,
): { id: string; name: string; price?: number | null; status: string } | null {
  if (!cruise?.roomTypes?.length) return null;
  if (roomTypeId) {
    const byId = cruise.roomTypes.find((room) => room.id === roomTypeId);
    if (byId) return byId as never;
  }
  if (fallbackName?.trim()) {
    const key = fallbackName.trim().toLowerCase();
    const byName = cruise.roomTypes.find((room) => room.name.trim().toLowerCase() === key);
    if (byName) return byName as never;
  }
  return null;
}

/** Resolve cruise cabin price from matched room type. */
export function resolveCruiseCabinPrice(
  cruise: { roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> } | null | undefined,
  roomTypeId: string | null | undefined,
  fallbackName: string | null | undefined,
): number | null {
  const room = findCruiseRoomType(cruise, roomTypeId, fallbackName);
  if (!room) return null;
  return room.price != null ? Number(room.price) : null;
}

type HotelInputRow = QuotationVersionInput['hotels'][number];
type HotelRoomLineInput = HotelInputRow['roomLines'][number];
type HotelMealPlanLineInput = HotelInputRow['mealPlanLines'][number];

/** A clean, empty room allocation inside a hotel option. */
const emptyRoomLine = (seed: Partial<HotelRoomLineInput> = {}): HotelRoomLineInput => ({
  hotelRoomTypeId: null,
  roomType: null,
  rooms: 1,
  extraBedQuantity: null,
  extraBedPrice: null,
  childWithoutBedQuantity: null,
  childWithoutBedPrice: null,
  baseRoomPrice: null,
  pricingSource: null,
  sellingPrice: null,
  internalCost: null,
  notes: null,
  ...seed,
});

/** A clean, empty meal-plan selection inside a hotel option. */
const emptyMealLine = (seed: Partial<HotelMealPlanLineInput> = {}): HotelMealPlanLineInput => ({
  hotelMealPlanId: null,
  mealPlan: null,
  sellingPrice: null,
  internalCost: null,
  ...seed,
});

/**
 * A room line the user actually filled in. Untouched default lines (added via
 * "+ Add Room" but never completed) are dropped on save; a PARTIALLY filled
 * line (quantities/remark without a room type) is kept so validation can point
 * at the exact room ("Room 2: Room Type is required.").
 */
const roomLineHasData = (line: HotelRoomLineInput): boolean =>
  Boolean(line.hotelRoomTypeId) ||
  Boolean(line.roomType?.trim()) ||
  line.extraBedQuantity != null ||
  line.childWithoutBedQuantity != null ||
  Boolean(line.notes?.trim()) ||
  line.baseRoomPrice != null ||
  line.extraBedPrice != null ||
  line.childWithoutBedPrice != null ||
  line.sellingPrice != null;

const mealLineHasData = (line: HotelMealPlanLineInput): boolean =>
  Boolean(line.hotelMealPlanId) || Boolean(line.mealPlan?.trim());

/**
 * A legacy quotation row stores its single room/meal on the row-level scalar
 * columns with NULL lines. resolveHotelRoomLines / resolveHotelMealPlanLines
 * synthesize one line from those scalars, so the same repeatable editor can
 * load and extend old quotations without migration.
 */
const withSynthesizedLines = (row: HotelInputRow): HotelInputRow => {
  const roomLines = row.roomLines?.length
    ? row.roomLines
    : resolveHotelRoomLines(row).map((line) => emptyRoomLine(line));
  const mealPlanLines = row.mealPlanLines?.length
    ? row.mealPlanLines
    : resolveHotelMealPlanLines(row).map((line) => emptyMealLine(line));
  return {
    ...row,
    // Every hotel option edits at least one (possibly empty) room allocation
    // and one meal-plan selection, so "+ Add Room" / "+ Add Meal Plan" always
    // extend an existing list.
    roomLines: roomLines.length ? roomLines : [emptyRoomLine()],
    mealPlanLines: mealPlanLines.length ? mealPlanLines : [emptyMealLine()],
  };
};

type CruiseServiceInput = QuotationVersionInput['services'][number];
type CruiseRoomLineInput = QuotationCruiseRoomLine;

const emptyCruiseRoomLine = (seed: Partial<QuotationCruiseRoomLine> = {}): QuotationCruiseRoomLine => ({
  cruiseRoomTypeId: null,
  roomType: null,
  rooms: 1,
  roomRate: null,
  sellingPrice: null,
  internalCost: null,
  notes: null,
  ...seed,
} as QuotationCruiseRoomLine);

const cruiseRoomLineHasData = (line: QuotationCruiseRoomLine): boolean =>
  Boolean(line.cruiseRoomTypeId) ||
  Boolean(line.roomType?.trim()) ||
  (line.rooms != null && Number(line.rooms) !== 1) ||
  line.roomRate != null ||
  line.sellingPrice != null ||
  Boolean(line.notes?.trim());

const withCruiseSynthesizedLines = (service: unknown): unknown => {
  const raw = service as unknown as { cruiseRoomLines?: QuotationCruiseRoomLine[]; cruiseNights?: number | null; quantity?: number | null; sellingPrice?: number | null; city?: string | null; cruiseRoomTypeId?: string | null };
  const stored = Array.isArray(raw.cruiseRoomLines) ? raw.cruiseRoomLines : [];
  const lines = stored.length ? stored : resolveCruiseRoomLines(service).map((l) => emptyCruiseRoomLine(l as unknown as Partial<QuotationCruiseRoomLine>));
  const nights = raw.cruiseNights ?? 2;
  const resolvedNights = nights ?? 2;
  return {
    ...(service as Record<string, unknown>),
    cruiseNights: resolvedNights,
    cruiseRoomLines: lines.length ? lines : [emptyCruiseRoomLine()],
  } as unknown;
};

// ---------------------------------------------------------------------------
// Repeatable room-allocation and meal-plan editors for ONE hotel option.
// Unlimited entries: each line is its own field-array entry. The room type and
// meal plan come from the linked Hotel Master (free text still supported).
// ---------------------------------------------------------------------------

interface HotelLinesEditorProps {
  form: UseFormReturn<QuotationVersionInput>;
  hotelIndex: number;
  hotelId: string | null | undefined;
  canCost: boolean;
  /** Recomputes the row's additive selling/cost totals from all lines. */
  recalculateTotals: () => void;
}

function HotelRoomLinesEditor({ form, hotelIndex, hotelId, canCost, recalculateTotals }: HotelLinesEditorProps) {
  const roomLines = useFieldArray({
    control: form.control,
    name: `hotels.${hotelIndex}.roomLines`,
  });
  const watchedLines = useWatch({ control: form.control, name: `hotels.${hotelIndex}.roomLines` }) ?? [];
  const detail = useHotel(hotelId ?? undefined);
  const roomTypes = detail.data?.roomTypes ?? [];
  const currency = (form.watch('currency') as string) ?? 'INR';
  const isSectionWise = (form.watch('pricingMode') as string ?? 'PER_PERSON') === 'SECTION_WISE';
  const watchedNights = useWatch({ control: form.control, name: `hotels.${hotelIndex}.nights` as never }) as unknown as number | null | undefined;
  const nights = Number(watchedNights ?? form.watch(`hotels.${hotelIndex}.nights` as never) ?? 0) || 1;
  const checkInDate = useWatch({ control: form.control, name: `hotels.${hotelIndex}.checkInDate` as never }) as unknown as string | Date | null | undefined;
  const manualOverridesRef = useRef<Set<string>>(new Set());
  const markOverridden = (lineIndex: number, field: string) => {
    manualOverridesRef.current.add(`${hotelIndex}-${lineIndex}-${field}`);
  };
  const isOverridden = (lineIndex: number, field: string) => manualOverridesRef.current.has(`${hotelIndex}-${lineIndex}-${field}`);
  const clearOverrideForLine = (lineIndex: number) => {
    ['baseRoomPrice', 'extraBedPrice', 'childWithoutBedPrice'].forEach((f) => manualOverridesRef.current.delete(`${hotelIndex}-${lineIndex}-${f}`));
  };

  const applyLine = (lineIndex: number, patch: Partial<HotelRoomLineInput>) => {
    for (const [key, value] of Object.entries(patch))
      form.setValue(
        `hotels.${hotelIndex}.roomLines.${lineIndex}.${key}` as FieldPath<QuotationVersionInput>,
        value as never,
        { shouldDirty: true },
      );
    recalculateTotals();
  };

  // Auto-prefill room pricing when Hotel / Room Type / Check-in date changes, respecting manual overrides
  // Manual overrides are never overwritten; changing room type clears overrides.
  // Changing check-in date updates non-overridden fields to the new resolved master price.
  useEffect(() => {
    watchedLines.forEach((line, lineIndex) => {
      const roomTypeId = line?.hotelRoomTypeId;
      if (!roomTypeId) return;
      const roomType = roomTypes.find((rt) => rt.id === roomTypeId);
      if (!roomType) return;
      const resolved = resolveRoomPricingForDate(roomType as unknown as Parameters<typeof resolveRoomPricingForDate>[0], checkInDate);
      if (!resolved) return;
      const currentBase = line?.baseRoomPrice;
      const currentExtra = line?.extraBedPrice;
      const currentCwob = line?.childWithoutBedPrice;
      const patch: Partial<HotelRoomLineInput> = {};
      let needsPatch = false;
      if (resolved.baseRoomPrice != null && !isOverridden(lineIndex, 'baseRoomPrice')) {
        if (currentBase == null || Number(currentBase) !== Number(resolved.baseRoomPrice)) {
          patch.baseRoomPrice = resolved.baseRoomPrice;
          needsPatch = true;
        }
      }
      if (resolved.extraBedPrice != null && !isOverridden(lineIndex, 'extraBedPrice')) {
        if (currentExtra == null || Number(currentExtra) !== Number(resolved.extraBedPrice)) {
          patch.extraBedPrice = resolved.extraBedPrice;
          needsPatch = true;
        }
      }
      if (resolved.childWithoutBedPrice != null && !isOverridden(lineIndex, 'childWithoutBedPrice')) {
        if (currentCwob == null || Number(currentCwob) !== Number(resolved.childWithoutBedPrice)) {
          patch.childWithoutBedPrice = resolved.childWithoutBedPrice;
          needsPatch = true;
        }
      }
      if (needsPatch) {
        if (resolved.pricingSource) patch.pricingSource = resolved.pricingSource;
        applyLine(lineIndex, patch);
      } else if (resolved.pricingSource && line?.pricingSource !== resolved.pricingSource && !isOverridden(lineIndex, 'baseRoomPrice')) {
        // Keep pricingSource in sync when price already matches but source differs (e.g., initial BASE -> SEASON)
        applyLine(lineIndex, { pricingSource: resolved.pricingSource });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, checkInDate, detail.data, watchedLines.map((l) => l?.hotelRoomTypeId).join(','), roomTypes.length]);

  return (
    <div className="space-y-3">
      {roomLines.fields.map((lineField, lineIndex) => {
        const line = watchedLines[lineIndex];
        const basePrice = Number(line?.baseRoomPrice ?? 0);
        const ebQty = Number(line?.extraBedQuantity ?? 0);
        const ebPrice = Number(line?.extraBedPrice ?? 0);
        const cwQty = Number(line?.childWithoutBedQuantity ?? 0);
        const cwPrice = Number(line?.childWithoutBedPrice ?? 0);
        const rooms = Number(line?.rooms ?? 1);
        const lineBaseTotal = basePrice * rooms * (nights || 1);
        const ebTotal = ebQty * ebPrice * (nights || 1);
        const cwTotal = cwQty * cwPrice * (nights || 1);
        const lineTotal = lineBaseTotal + ebTotal + cwTotal;
        return (
          <div key={lineField.id} className="rounded-lg bg-muted/30 border border-border/40 p-3.5">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
              <span className={subsectionHeading}>Room {lineIndex + 1}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove room ${lineIndex + 1}`}
                onClick={() => {
                  roomLines.remove(lineIndex);
                  recalculateTotals();
                }}
              >
                <Trash2 className="h-4 w-4 text-red-600" /> Remove
              </Button>
            </div>
            <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm font-semibold text-slate-800 md:col-span-2 xl:col-span-2">
                Room Type <span className="text-red-500">*</span>
                <span className="mt-1 block">
                  <MasterSelect
                    ariaLabel={`Room ${lineIndex + 1} type master`}
                    placeholder={hotelId ? 'Link a room type' : 'Type room type'}
                    options={roomTypes.map((room) => ({ id: room.id, label: room.name }))}
                    value={line?.hotelRoomTypeId}
                    loading={Boolean(hotelId) && detail.isPending}
                    fallbackLabel={line?.roomType ?? undefined}
                    onText={(text) =>
                      applyLine(lineIndex, {
                        hotelRoomTypeId: null,
                        roomType: text.trim() ? text : null,
                      })
                    }
                    onSelect={(option) => {
                      const room = roomTypes.find((entry) => entry.id === option?.id);
                      clearOverrideForLine(lineIndex);
                      const resolved = room ? resolveRoomPricingForDate(room as unknown as Parameters<typeof resolveRoomPricingForDate>[0], checkInDate) : null;
                      const patch: Partial<HotelRoomLineInput> = {
                        hotelRoomTypeId: option?.id ?? null,
                        ...(option ? { roomType: option.label } : {}),
                      };
                      if (resolved) {
                        if (resolved.baseRoomPrice != null) patch.baseRoomPrice = resolved.baseRoomPrice;
                        if (resolved.extraBedPrice != null) patch.extraBedPrice = resolved.extraBedPrice;
                        if (resolved.childWithoutBedPrice != null) patch.childWithoutBedPrice = resolved.childWithoutBedPrice;
                        if (resolved.pricingSource) patch.pricingSource = resolved.pricingSource;
                      } else if (room?.sellingPrice != null && Number(room.sellingPrice) > 0) {
                        patch.baseRoomPrice = Number(room.sellingPrice);
                      }
                      if (canCost && room?.baseCost != null && Number(room.baseCost) > 0) {
                        patch.internalCost = Number(room.baseCost);
                      }
                      applyLine(lineIndex, patch);
                    }}
                  />
                </span>
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Number of Rooms
                <input
                  aria-label={`Room ${lineIndex + 1} number of rooms`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.rooms`, {
                    setValueAs: (value) => (value === '' ? 1 : Number(value)),
                  })}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Extra Bed Quantity
                <input
                  aria-label={`Room ${lineIndex + 1} extra bed quantity`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.extraBedQuantity`, {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Child Without Bed Quantity
                <input
                  aria-label={`Room ${lineIndex + 1} child without bed quantity`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.childWithoutBedQuantity`, {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            {isSectionWise && (() => {
              return (
              <div className={`mt-3 ${calculatedCard}`}>
                <p className={calculatedLabel}>Hotel Pricing — per night rates</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <label className="text-xs font-medium text-slate-700">
                    Room Rate / night ({currency}) <span className="text-[11px] font-normal text-brand-600">· master-derived, editable</span>
                    <input aria-label={`Room ${lineIndex + 1} rate per night`} type="number" step="0.01" min="0" {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.baseRoomPrice`, { setValueAs: (v)=> v===''||v==null?null:Number(v), onChange: () => markOverridden(lineIndex, 'baseRoomPrice') })} className={`${field} mt-1`} />
                    <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{rooms} × {nights || 1} nights = {(basePrice*rooms*(nights||1)).toFixed(2)}</span>
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Extra Bed Rate / night <span className="text-[11px] font-normal text-brand-600">· master</span>
                    <input aria-label={`Room ${lineIndex + 1} extra bed rate`} type="number" step="0.01" min="0" {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.extraBedPrice`, { setValueAs: (v)=> v===''||v==null?null:Number(v), onChange: () => markOverridden(lineIndex, 'extraBedPrice') })} className={`${field} mt-1`} />
                    <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{ebQty} × {ebPrice} × {nights||1} = {ebTotal.toFixed(2)}</span>
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Child w/o Bed Rate / night <span className="text-[11px] font-normal text-brand-600">· master</span>
                    <input aria-label={`Room ${lineIndex + 1} child without bed rate`} type="number" step="0.01" min="0" {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.childWithoutBedPrice`, { setValueAs: (v)=> v===''||v==null?null:Number(v), onChange: () => markOverridden(lineIndex, 'childWithoutBedPrice') })} className={`${field} mt-1`} />
                    <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{cwQty} × {cwPrice} × {nights||1} = {cwTotal.toFixed(2)}</span>
                  </label>
                </div>
                <div className="mt-2 flex items-baseline justify-between border-t border-border/40 pt-2">
                  <span className={calculatedLabel}>Line Amount</span>
                  <span className={calculatedValue}>{currency} {lineTotal.toFixed(2)}</span>
                </div>
                <span className="block text-[11px] text-muted-foreground">{rooms} room{rooms!==1?'s':''} × {nights||1} night{(nights||1)!==1?'s':''} — calculated</span>
              </div>
              );
            })()}
            <label className="mt-3 block text-sm font-semibold text-slate-800">
              Room Remark
              <input
                aria-label={`Room ${lineIndex + 1} remark`}
                placeholder="e.g. high floor, twin beds"
                {...form.register(`hotels.${hotelIndex}.roomLines.${lineIndex}.notes`)}
                className={`${field} mt-1`}
              />
            </label>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label="Add room"
        disabled={roomLines.fields.length >= 10}
        title={roomLines.fields.length >= 10 ? 'A hotel option supports up to 10 room allocations.' : undefined}
        onClick={() => roomLines.append(emptyRoomLine())}
      >
        <Plus className="h-4 w-4" /> Add Room
      </Button>
    </div>
  );
}

function HotelMealPlanLinesEditor({ form, hotelIndex, hotelId, canCost, recalculateTotals }: HotelLinesEditorProps) {
  const mealPlanLines = useFieldArray({
    control: form.control,
    name: `hotels.${hotelIndex}.mealPlanLines`,
  });
  const watchedLines = useWatch({ control: form.control, name: `hotels.${hotelIndex}.mealPlanLines` }) ?? [];
  const detail = useHotel(hotelId ?? undefined);
  const mealPlans = detail.data?.mealPlans ?? [];
  const currency = (form.watch('currency') as string) ?? 'INR';
  const isSectionWise = (form.watch('pricingMode') as string ?? 'PER_PERSON') === 'SECTION_WISE';
  const checkInDate = useWatch({ control: form.control, name: `hotels.${hotelIndex}.checkInDate` as never }) as unknown as string | Date | null | undefined;
  const manualOverridesRef = useRef<Set<string>>(new Set());
  const markOverridden = (lineIndex: number) => manualOverridesRef.current.add(`${hotelIndex}-${lineIndex}-sellingPrice`);
  const isOverridden = (lineIndex: number) => manualOverridesRef.current.has(`${hotelIndex}-${lineIndex}-sellingPrice`);
  const clearOverrideForLine = (lineIndex: number) => manualOverridesRef.current.delete(`${hotelIndex}-${lineIndex}-sellingPrice`);

  const applyLine = (lineIndex: number, patch: Partial<HotelMealPlanLineInput>) => {
    for (const [key, value] of Object.entries(patch))
      form.setValue(
        `hotels.${hotelIndex}.mealPlanLines.${lineIndex}.${key}` as FieldPath<QuotationVersionInput>,
        value as never,
        { shouldDirty: true },
      );
    recalculateTotals();
  };

  useEffect(() => {
    watchedLines.forEach((line, lineIndex) => {
      const mealPlanId = line?.hotelMealPlanId;
      if (!mealPlanId) return;
      const mealPlan = mealPlans.find((m) => m.id === mealPlanId);
      if (!mealPlan) return;
      const resolved = resolveMealPlanPricingForDate(mealPlan as unknown as Parameters<typeof resolveMealPlanPricingForDate>[0], checkInDate);
      if (!resolved || resolved.price == null) return;
      if (isOverridden(lineIndex)) return;
      const currentPrice = line?.sellingPrice;
      if (currentPrice == null || Number(currentPrice) !== Number(resolved.price)) {
        applyLine(lineIndex, { sellingPrice: resolved.price });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, checkInDate, detail.data, watchedLines.map((l) => l?.hotelMealPlanId).join(','), mealPlans.length]);

  return (
    <div className="space-y-3">
      {mealPlanLines.fields.map((lineField, lineIndex) => {
        const line = watchedLines[lineIndex];
        return (
          <div key={lineField.id} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
              Meal Plan {lineIndex + 1}
              <span className="mt-1 block">
                <MasterSelect
                  ariaLabel={`Meal plan ${lineIndex + 1} master`}
                  placeholder={hotelId ? 'Link a meal plan' : 'Type meal plan'}
                  options={mealPlans.map((meal) => ({ id: meal.id, label: meal.name, hint: meal.type }))}
                  value={line?.hotelMealPlanId}
                  loading={Boolean(hotelId) && detail.isPending}
                  fallbackLabel={line?.mealPlan ?? undefined}
                  onText={(text) =>
                    applyLine(lineIndex, {
                      hotelMealPlanId: null,
                      mealPlan: text.trim() ? text : null,
                    })
                  }
                  onSelect={(option) => {
                    const meal = mealPlans.find((entry) => entry.id === option?.id);
                    clearOverrideForLine(lineIndex);
                    const resolved = meal ? resolveMealPlanPricingForDate(meal as unknown as Parameters<typeof resolveMealPlanPricingForDate>[0], checkInDate) : null;
                    const patch: Partial<HotelMealPlanLineInput> = {
                      hotelMealPlanId: option?.id ?? null,
                      ...(option ? { mealPlan: option.label } : {}),
                    };
                    if (resolved && resolved.price != null) {
                      patch.sellingPrice = resolved.price;
                    } else if (meal?.sellingPrice != null && Number(meal.sellingPrice) > 0) {
                      patch.sellingPrice = Number(meal.sellingPrice);
                    }
                    if (canCost && meal?.baseCost != null && Number(meal.baseCost) > 0) {
                      patch.internalCost = Number(meal.baseCost);
                    }
                    applyLine(lineIndex, patch);
                  }}
                />
              </span>
            </label>
            {isSectionWise && (
              <label className="w-36 text-xs font-semibold text-slate-700">
                Rate ({currency})
                <input aria-label={`Meal plan ${lineIndex + 1} rate`} type="number" step="0.01" min="0" {...form.register(`hotels.${hotelIndex}.mealPlanLines.${lineIndex}.sellingPrice`, { setValueAs: (v)=> v===''||v==null?null:Number(v), onChange: () => markOverridden(lineIndex) })} className={`${field} mt-1`} />
              </label>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove meal plan ${lineIndex + 1}`}
              onClick={() => {
                mealPlanLines.remove(lineIndex);
                recalculateTotals();
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" /> Remove
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label="Add meal plan"
        disabled={mealPlanLines.fields.length >= 10}
        title={mealPlanLines.fields.length >= 10 ? 'A hotel option supports up to 10 meal plans.' : undefined}
        onClick={() => mealPlanLines.append(emptyMealLine())}
      >
        <Plus className="h-4 w-4" /> Add Meal Plan
      </Button>
    </div>
  );
}

interface CruiseLinesEditorProps {
  form: UseFormReturn<QuotationVersionInput>;
  serviceIndex: number;
  cruiseId: string | null | undefined;
  canCost: boolean;
  nights: number;
  recalculateTotals: () => void;
}

function CruiseRoomLinesEditor({ form, serviceIndex, cruiseId, canCost, nights, recalculateTotals }: CruiseLinesEditorProps) {
  const roomLines = useFieldArray({
    control: form.control,
    name: `services.${serviceIndex}.cruiseRoomLines` as never,
  });
  const watchedLines = useWatch({ control: form.control, name: `services.${serviceIndex}.cruiseRoomLines` as never }) as unknown as CruiseRoomLineInput[] ?? [];
  const detail = useCruise(cruiseId ?? undefined);
  // Prefer detailed cruise for pricing (has price), fallback to list
  const cruiseMastersList = useCruises(useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []));
  const listMaster = (cruiseMastersList.data?.data ?? []).find((m) => m.id === cruiseId);
  const cruiseMaster = (detail.data as unknown as { roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> }) ?? listMaster as unknown as { roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> } ?? null;
  const roomTypes = (cruiseMaster as unknown as { roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> })?.roomTypes ?? [];
  const currency = (form.watch('currency') as string) ?? 'INR';
  const manualOverridesRef = useRef<Set<string>>(new Set());
  const markOverridden = (lineIndex: number) => manualOverridesRef.current.add(`${serviceIndex}-${lineIndex}-roomRate`);
  const isOverridden = (lineIndex: number) => manualOverridesRef.current.has(`${serviceIndex}-${lineIndex}-roomRate`);
  const clearOverrideForLine = (lineIndex: number) => manualOverridesRef.current.delete(`${serviceIndex}-${lineIndex}-roomRate`);

  const applyLine = (lineIndex: number, patch: Partial<CruiseRoomLineInput>) => {
    for (const [key, value] of Object.entries(patch))
      form.setValue(
        `services.${serviceIndex}.cruiseRoomLines.${lineIndex}.${key}` as never,
        value as never,
        { shouldDirty: true },
      );
    recalculateTotals();
  };

  // Auto-prefill roomRate when cruise/room/nights change, respecting manual override
  useEffect(() => {
    watchedLines.forEach((line, lineIndex) => {
      const roomTypeId = (line as unknown as { cruiseRoomTypeId?: string | null })?.cruiseRoomTypeId;
      const fallbackName = (line as unknown as { roomType?: string | null })?.roomType;
      if (!roomTypeId && !fallbackName?.trim()) return;
      if (isOverridden(lineIndex)) return;
      const room = findCruiseRoomType(cruiseMaster as never, roomTypeId, fallbackName);
      if (!room || room.price == null) return;
      const currentRate = (line as unknown as { roomRate?: number | null })?.roomRate ?? (line as unknown as { sellingPrice?: number | null })?.sellingPrice;
      const masterPrice = Number(room.price);
      if (currentRate != null && Number(currentRate) === masterPrice) return;
      // If not overridden, sync to master price (covers initial and room change)
      applyLine(lineIndex, { roomRate: masterPrice, sellingPrice: masterPrice });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cruiseId, detail.data, watchedLines.map((l) => (l as unknown as { cruiseRoomTypeId?: string })?.cruiseRoomTypeId).join(','), watchedLines.map((l) => (l as unknown as { roomType?: string })?.roomType).join('|'), cruiseMaster?.roomTypes?.length]);

  return (
    <div className="space-y-3">
      {roomLines.fields.map((lineField, lineIndex) => {
        const line = watchedLines[lineIndex] as unknown as CruiseRoomLineInput | undefined;
        const roomRate = Number((line?.roomRate ?? line?.sellingPrice ?? 0) as number) || 0;
        const rooms = Number(line?.rooms ?? 1) || 1;
        const lineTotal = roomRate * rooms * (nights || 1);
        const roomTypeForLine = findCruiseRoomType(cruiseMaster as never, line?.cruiseRoomTypeId, line?.roomType);
        const hasMasterPrice = roomTypeForLine ? roomTypeForLine.price != null : false;
        const showNoPriceHelper = Boolean(line?.cruiseRoomTypeId || line?.roomType?.trim()) && !hasMasterPrice && (line?.roomRate == null && line?.sellingPrice == null);
        const isUnavailable = Boolean(cruiseId && (line?.cruiseRoomTypeId || line?.roomType?.trim()) && !roomTypeForLine);
        return (
          <div key={lineField.id} className="rounded-lg bg-muted/30 border border-border/40 p-3.5">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
              <span className={subsectionHeading}>Room {lineIndex + 1}</span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove room ${lineIndex + 1}`} onClick={() => { roomLines.remove(lineIndex); recalculateTotals(); }}>
                <Trash2 className="h-4 w-4 text-red-600" /> Remove
              </Button>
            </div>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-800 md:col-span-1">
                Room Type <span className="text-red-500">*</span>
                <span className="mt-1 block">
                  <MasterSelect
                    ariaLabel={`Room ${lineIndex + 1} type master`}
                    placeholder={cruiseId ? 'Link a room type' : 'Select cruise first'}
                    options={roomTypes.filter((r) => r.status === 'ACTIVE').map((room) => ({ id: room.id, label: room.name }))}
                    value={line?.cruiseRoomTypeId}
                    loading={Boolean(cruiseId) && detail.isPending}
                    fallbackLabel={line?.roomType ?? undefined}
                    onText={(text) => applyLine(lineIndex, { cruiseRoomTypeId: null, roomType: text.trim() ? text : null })}
                    onSelect={(option) => {
                      const room = roomTypes.find((entry) => entry.id === option?.id);
                      clearOverrideForLine(lineIndex);
                      const patch: Partial<CruiseRoomLineInput> = {
                        cruiseRoomTypeId: option?.id ?? null,
                        ...(option ? { roomType: option.label } : { roomType: null }),
                      } as Partial<CruiseRoomLineInput>;
                      if (room && room.price != null) {
                        (patch as unknown as Record<string, unknown>).roomRate = Number(room.price);
                        (patch as unknown as Record<string, unknown>).sellingPrice = Number(room.price);
                      } else if (room) {
                        (patch as unknown as Record<string, unknown>).roomRate = null;
                        (patch as unknown as Record<string, unknown>).sellingPrice = null;
                      }
                      if (canCost && (room as unknown as { baseCost?: number | null })?.baseCost != null) {
                        (patch as unknown as Record<string, unknown>).internalCost = Number((room as unknown as { baseCost?: number | null })?.baseCost);
                      }
                      applyLine(lineIndex, patch);
                    }}
                  />
                </span>
                {isUnavailable && <span className="mt-1 block text-[11px] text-red-600">The selected cruise room type is not available.</span>}
                {showNoPriceHelper && !isUnavailable && <span className="mt-1 block text-[11px] text-amber-600">No master price found for this room type.</span>}
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Number of Rooms
                <input
                  aria-label={`Room ${lineIndex + 1} number of rooms`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  {...form.register(`services.${serviceIndex}.cruiseRoomLines.${lineIndex}.rooms` as never, {
                    setValueAs: (value) => (value === '' ? 1 : Number(value)),
                    onChange: () => recalculateTotals(),
                  })}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Room Rate / night ({currency})
                <input
                  aria-label={`Room ${lineIndex + 1} rate per night`}
                  type="number"
                  step="0.01"
                  min={0}
                  {...form.register(`services.${serviceIndex}.cruiseRoomLines.${lineIndex}.roomRate` as never, {
                    setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                    onChange: () => markOverridden(lineIndex),
                  })}
                  className={`${field} mt-1`}
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  {rooms} × {nights || 1} nights × {roomRate.toFixed(2)} = {lineTotal.toFixed(2)}
                </span>
              </label>
            </div>
            <div className={`mt-3 ${calculatedCard} flex items-center justify-between`}>
              <span className={calculatedLabel}>Line Amount</span>
              <span className={calculatedValue}>{currency} {lineTotal.toFixed(2)}</span>
            </div>
            <span className="block text-[11px] text-muted-foreground">{rooms} room{rooms!==1?'s':''} × {nights||1} night{(nights||1)!==1?'s':''} × {roomRate.toFixed(2)} — calculated</span>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label="Add room"
        disabled={roomLines.fields.length >= 10}
        title={roomLines.fields.length >= 10 ? 'A cruise option supports up to 10 room allocations.' : undefined}
        onClick={() => roomLines.append(emptyCruiseRoomLine())}
      >
        <Plus className="h-4 w-4" /> Add Room
      </Button>
    </div>
  );
}

const emptyHotel = (
  sequence: number,
  selected = true,
  seed: Partial<HotelInputRow> = {},
): HotelInputRow => ({
  city: '',
  hotelName: '',
  category: null,
  roomType: null,
  mealPlan: null,
  hotelId: null,
  hotelRoomTypeId: null,
  hotelMealPlanId: null,
  rooms: null,
  nights: 0,
  checkInDate: null,
  checkOutDate: null,
  checkInTime: null,
  checkOutTime: null,
  showCheckInTime: false,
  showCheckOutTime: false,
  internalCost: 0,
  sellingPrice: 0,
  baseRoomPrice: null,
  extraBedQuantity: null,
  extraBedPrice: null,
  childWithoutBedQuantity: null,
  childWithoutBedPrice: null,
  pricingSource: null,
  selected,
  notes: null,
  sequence,
  images: [],
  imageSnapshotPresent: false,
  roomLines: [emptyRoomLine()],
  mealPlanLines: [emptyMealLine()],
  ...seed,
});

/**
 * A brand-new, fully independent blank Hotel Stay. Never clones the current or
 * previous stay — no hotel, no city, no dates, no rooms, no master links and no
 * image references. Used by "Add Stay Before" / "Add Stay After".
 */
const createEmptyHotelStay = (sequence: number, selected = true): HotelInputRow =>
  emptyHotel(sequence, selected);

/** True when a quotation hotel row's city matches a Hotel Master's city or destination. */
type DefaultHotelMaster = {
  id: string;
  name: string;
  status: string;
  isDefaultForCity: boolean;
  starCategory: number | null;
  city: { name: string };
  destination: { name: string };
  images: MasterImageMeta[];
};

/** Segments that do not require hotel accommodation. */
const NON_HOTEL_CITIES = new Set([
  'cruise',
  'at sea',
  'at-sea',
  'at_sea',
  'airport',
  'transfer',
  'in transit',
  'in-transit',
  'in_transit',
  'bus journey',
  'bus-journey',
  'bus_journey',
  'fly',
  'flight',
  'departure',
  'arrival',
]);

const isHotelStay = (city: string | null | undefined): boolean => {
  const key = (city ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
  return key.length > 0 && !NON_HOTEL_CITIES.has(key);
};

/** The active default hotel matching a row's city/destination, if any. */
const matchDefaultHotel = (rowCity: string, masters: DefaultHotelMaster[]) => {
  const city = rowCity.trim().toLowerCase();
  if (!city) return undefined;
  const defaults = masters.filter((hotel) => hotel.status === 'ACTIVE' && hotel.isDefaultForCity);
  // Prefer an exact city match, then destination match — never a substring match
  // that could pick a default hotel from a different city.
  return (
    defaults.find((hotel) => hotel.city.name.trim().toLowerCase() === city) ??
    defaults.find((hotel) => hotel.destination.name.trim().toLowerCase() === city) ??
    undefined
  );
};

/** The best available active hotel for a city (first by name). */
const matchBestCityHotel = (city: string, masters: DefaultHotelMaster[]) => {
  const c = city.trim().toLowerCase();
  if (!c) return undefined;
  const active = masters.filter(
    (hotel) => hotel.status === 'ACTIVE' && hotel.city.name.trim().toLowerCase() === c,
  );
  if (!active.length) return undefined;
  active.sort((a, b) => a.name.localeCompare(b.name));
  return active[0];
};

/**
 * Map lead-generated hotel rows through their destination's default hotel,
 * then fall back to the best available hotel for each city. Rows with no hotel
 * in the city keep their city/dates but have no hotel selected.
 */
const autoPrefillLeadRows = (
  rows: HotelInputRow[],
  masters: DefaultHotelMaster[],
): HotelInputRow[] => {
  if (!rows.length) return rows;
  const built: HotelInputRow[] = [];
  for (const row of rows) {
    const cityName = (row.city ?? '').trim();
    if (!cityName) continue;
    const defaultHotel = matchDefaultHotel(cityName, masters);
    const bestHotel = defaultHotel ?? matchBestCityHotel(cityName, masters);
    const selected = bestHotel;
    const images = masterGallerySnapshot(selected?.images, selected?.name ?? 'Hotel');
    built.push({
      ...row,
      hotelId: selected?.id ?? null,
      hotelRoomTypeId: null,
      hotelMealPlanId: null,
      hotelName: selected?.name ?? row.hotelName ?? '',
      city: selected ? selected.city.name : cityName,
      category: selected?.starCategory ? `${selected.starCategory} Star` : null,
      images,
      imageSnapshotPresent: masterGalleryPresence(selected),
      pdfImageUrl: images[0] ? quotationSnapshotImageIdentity(images[0]) : null,
    });
  }
  return built;
};

/** A clean, empty Cruise service row; the section title defaults to "Cruise Details". */
const newCruiseServiceRow = (sequence: number) => ({
  serviceType: 'CRUISE' as const,
  ...CLEARED_SERVICE_MASTERS,
  name: '',
  description: null,
  dayNumber: null,
  city: null,
  quantity: 1,
  internalCost: 0,
  sellingPrice: 0,
  taxCategory: 'Cruise Details',
  notes: null,
  cruiseNights: 1 as unknown as number,
  cruiseRoomLines: [emptyCruiseRoomLine()],
  images: [],
  imageSnapshotPresent: false,
  pdfImageUrl: null,
  sequence,
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Combine one policy across ordered destinations: single content is used as-is;
 * multiple distinct contents are joined under escaped destination headings.
 * Identical content from later destinations is dropped.
 */
const combineDestinationPolicy = (
  entries: Array<{ destination: string; content: string }>,
): string | null => {
  const seen = new Set<string>();
  const kept = entries.filter(({ content }) => {
    if (seen.has(content)) return false;
    seen.add(content);
    return true;
  });
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0]!.content;
  return kept
    .map(({ destination, content }) => `<h3>${escapeHtml(destination)}</h3>${content}`)
    .join('\n');
};

/** Destination policy → quotation policy field mapping. */
const DESTINATION_POLICY_MAP = [
  ['inclusionsHtml', 'inclusions'],
  ['exclusionsHtml', 'exclusions'],
  ['paymentPolicies', 'paymentPolicies'],
  ['cancellationPolicies', 'cancellationPolicies'],
  ['bookingTerms', 'bookingTerms'],
] as const;

type PolicyKey =
  'inclusionsHtml' | 'exclusionsHtml' | 'paymentPolicies' | 'cancellationPolicies' | 'bookingTerms';

/** True when rich-text HTML contains visible content (editor-empty markup excluded). */
export const hasPolicyHtml = (html?: string | null): boolean =>
  Boolean(html && html.replace(/<[^>]*>/g, '').trim());

/** Resolve a policy field value: keep meaningful existing quotation content,
 *  fall back to the destination master default for empty/null/editor-blank. */
export const policyValue = (
  versionValue: string | null | undefined,
  masterValue: string | null | undefined,
): string | null => (hasPolicyHtml(versionValue) ? (versionValue ?? null) : (masterValue ?? null));

/** Build quotation-policy prefills from the destination masters in lead order. */
const buildDestinationPolicyPrefill = (
  destinations: Destination[],
  destinationNames: string[],
): Partial<Record<PolicyKey, string>> => {
  const ordered = destinationNames
    .map((name) => {
      const key = name.trim().toLowerCase();
      return destinations.find((d) => d.name.trim().toLowerCase() === key);
    })
    .filter((d): d is Destination => Boolean(d));
  if (!ordered.length) return {};
  const result: Partial<Record<PolicyKey, string>> = {};
  for (const [quoteKey, destField] of DESTINATION_POLICY_MAP) {
    const combined = combineDestinationPolicy(
      ordered
        .map((d) => ({ destination: d.name, content: (d[destField] ?? '').trim() }))
        .filter((entry) => entry.content.length > 0),
    );
    if (combined) result[quoteKey] = combined;
  }
  return result;
};

function HotelPreview({
  hotelId,
  snapshotImageUrl,
  snapshotThumbnailUrl,
  snapshotAuthoritative,
}: {
  hotelId?: string | null | undefined;
  /** First saved snapshot image, shown when the hotel has no Master link. */
  snapshotImageUrl?: string | null | undefined;
  /** Fallback candidate for the same image, used if the primary fails. */
  snapshotThumbnailUrl?: string | null | undefined;
  /** True once this stay owns a gallery, including an intentional empty one. */
  snapshotAuthoritative?: boolean | undefined;
}) {
  const hotel = useHotel(hotelId ?? undefined);
  const image = useQuery({
    queryKey: ['masters', 'hotels', hotelId ?? '', 'quotation-preview'],
    queryFn: () => hotelImageUrl(hotelId!),
    enabled: Boolean(hotelId && hotel.data?.hasImage && !snapshotAuthoritative),
    staleTime: 4 * 60 * 1000,
  });
  const [previewFallback, setPreviewFallback] = useState(false);
  const snapshotSrc =
    previewFallback && snapshotThumbnailUrl ? snapshotThumbnailUrl : snapshotImageUrl;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-36 items-center justify-center bg-slate-100">
        {!snapshotAuthoritative && image.data?.url ? (
          <img
            src={image.data.url}
            alt={hotel.data?.name ?? 'Hotel preview'}
            className="h-full w-full object-cover"
          />
        ) : snapshotSrc ? (
          <img
            src={snapshotSrc}
            alt={hotel.data?.name ?? 'Hotel preview'}
            className="h-full w-full object-cover"
            onError={() => {
              if (!previewFallback) setPreviewFallback(true);
            }}
          />
        ) : (
          <div className="text-center text-slate-400">
            {hotelId ? (
              <ImageIcon className="mx-auto h-8 w-8" />
            ) : (
              <Building2 className="mx-auto h-8 w-8" />
            )}
            <p className="mt-2 text-xs">
              {hotelId ? 'No hotel image' : 'Select a hotel to preview'}
            </p>
          </div>
        )}
      </div>
      {hotel.data && (
        <div className="space-y-1 p-3">
          <p className="truncate text-sm font-semibold text-slate-800">{hotel.data.name}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            {hotel.data.starCategory ? (
              <>
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {hotel.data.starCategory} Star
              </>
            ) : (
              'Unrated'
            )}
            <span>·</span> {hotel.data.city.name}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A hotel snapshot image thumbnail in the builder's image manager. Renders the
 * bookmark-preferred URL and falls back to the same image's thumbnail candidate
 * (mirroring the bookmark carousel) when the primary fails to load.
 */
function HotelImageThumb({
  image,
  alt,
  fallbackUrl,
}: {
  image: QuotationImage;
  alt: string;
  fallbackUrl?: string | null | undefined;
}) {
  const [useThumbnail, setUseThumbnail] = useState(false);
  const src =
    (useThumbnail && image.thumbnailUrl ? image.thumbnailUrl : image.url) ?? fallbackUrl ?? null;
  if (!src)
    return (
      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      className="h-16 w-24 shrink-0 rounded-md object-cover"
      onError={() => {
        if (!useThumbnail && image.thumbnailUrl) setUseThumbnail(true);
      }}
    />
  );
}

/** Shared quotation-only gallery controls for Hotel/Vehicle/Cruise images. */
function QuotationImageManager({
  label,
  ariaPrefix,
  images,
  pdfImageUrl,
  fallbackUrls,
  onMove,
  onRemove,
  onSelectPdf,
}: {
  label: string;
  ariaPrefix: string;
  images: QuotationImage[];
  pdfImageUrl?: string | null | undefined;
  fallbackUrls?: Record<string, string | undefined>;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSelectPdf: (identity: string) => void;
}) {
  if (!images.length) return null;
  const selected =
    images.find((image) => quotationSnapshotImageIdentity(image) === pdfImageUrl) ?? images[0];
  const selectedIdentity = selected ? quotationSnapshotImageIdentity(selected) : null;
  return (
    <div className="space-y-2.5 border-t border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-slate-800">
        {label}{' '}
        <span className="font-normal text-slate-400">
          ({images.length}) · order saved with the quotation
        </span>
      </h4>
      {images.map((image, imageIndex) => {
        const identity = quotationSnapshotImageIdentity(image);
        const fallbackUrl = identity ? fallbackUrls?.[identity] : undefined;
        return (
          <div
            key={`${identity ?? 'image'}-${imageIndex}`}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2.5"
          >
            <HotelImageThumb
              image={image}
              fallbackUrl={fallbackUrl}
              alt={image.alt ?? `${label} ${imageIndex + 1}`}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={imageIndex === 0}
                aria-label={`Move ${ariaPrefix} image ${imageIndex + 1} left`}
                onClick={() => onMove(imageIndex, -1)}
              >
                <ArrowLeft className="h-4 w-4" /> Move Left
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={imageIndex === images.length - 1}
                aria-label={`Move ${ariaPrefix} image ${imageIndex + 1} right`}
                onClick={() => onMove(imageIndex, 1)}
              >
                Move Right <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Remove ${ariaPrefix} image ${imageIndex + 1}`}
                onClick={() => onRemove(imageIndex)}
              >
                <X className="h-4 w-4" /> Remove
              </Button>
            </div>
            {identity && (
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`${ariaPrefix}-pdf-image`}
                  aria-label={`Use ${ariaPrefix} image ${imageIndex + 1} in PDF`}
                  checked={identity === selectedIdentity}
                  onChange={() => onSelectPdf(identity)}
                  className="accent-brand-600"
                />
                Use in PDF
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PersistInitialQuotationSnapshot({
  enabled,
  ready,
  onPersist,
}: {
  enabled: boolean;
  ready: boolean;
  onPersist: () => void;
}) {
  const attempted = useRef(false);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  useEffect(() => {
    if (!enabled || !ready || attempted.current) return;
    attempted.current = true;
    const timer = window.setTimeout(() => persistRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, ready]);
  return null;
}


/** Canonical pricing-category order and their customer-facing labels. */
const PRICING_SECTION_LABELS: Record<string, string> = {
  flight: 'Flights',
  hotel: 'Hotels',
  cruise: 'Cruise',
  vehicle: 'Transportation',
  sightseeing: 'Sightseeing',
  addon: 'Add-ons',
  visa: 'Visa',
};
const DEFAULT_PRICING_ORDER = Object.keys(PRICING_SECTION_LABELS);

export function QuotationBuilderPage() {
  const { quotationId = '', versionId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const canCost = hasPermission(PERMISSIONS.QUOTATIONS_VIEW_COSTING);
  const canManageAirlineMedia = hasPermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA);
  const quotation = useQuotation(quotationId);
  const save = useUpdateQuotationVersion(quotationId, versionId);
  const weblinkSettings = useUpdateQuotationWeblinkSettings(quotationId);
  const weblinkName = useUpdateQuotationWeblinkName(quotationId);
  const [weblinkNameValue, setWeblinkNameValue] = useState('');
  const [weblinkNameError, setWeblinkNameError] = useState('');
  const addOnMasters = useAddOnServices(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const hotelMasters = useHotels(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const cruiseMasters = useCruises(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const destinationMasters = useDestinations(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  // Automatic default-hotel prefill state. Automatic initialization is tracked
  // separately from an explicit user choice so Hotel is never re-enabled after
  // the user turns it off.
  const autoHotelRef = useRef<{ userToggledHotel: boolean; enabledByAuto: boolean }>({
    userToggledHotel: false,
    enabledByAuto: false,
  });
  const hotelPreviewImportsRef = useRef<Set<string>>(new Set());
  // Manual cruise cabin-rate overrides per service row index (sellingPrice). Set when user types, cleared on room/cruise change.
  const cruisePriceOverridesRef = useRef<Set<number>>(new Set());
  // Vehicle description manual override – set when user edits, cleared when vehicle model changes
  const vehicleDescriptionOverriddenRef = useRef(false);
  const vehicleMasters = useVehicles(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const [activeTab, setActiveTab] = useState('pricingMethod');
  // If the temporarily hidden Visa tab is somehow the active tab, fall back to
  // the nearest visible tab instead of showing a blank panel.
  useEffect(() => {
    if (!SHOW_VISA_QUOTATION_TAB && activeTab === 'visa') setActiveTab('vehicle');
  }, [activeTab]);
  // Cruise starts excluded: the user explicitly enables it (auto-creating the
  // first entry). Saved quotations with Cruise rows re-enable it on load.
  const [excluded, setExcluded] = useState<Record<string, boolean>>({ cruise: true });
  // Local-only expand/collapse for Hotel Stay cards. UI state only — never
  // persisted. Every stay starts collapsed whenever the builder is opened.
  const [expandedHotels, setExpandedHotels] = useState<Record<string, boolean>>({});
  // Local-only expand/collapse for the Weblink Section Order accordion. UI
  // state only — never persisted. Always starts collapsed on every load.
  const [sectionOrderOpen, setSectionOrderOpen] = useState(false);
  // Extra Charges drawer state — By Section only
  const [extraChargeDrawerOpen, setExtraChargeDrawerOpen] = useState(false);
  const [editingExtraIndex, setEditingExtraIndex] = useState<number | null>(null);
  const [extraDraft, setExtraDraft] = useState<{ label: string; amount: string; description: string; category: string }>({ label: '', amount: '', description: '', category: '' });
  const [extraDraftError, setExtraDraftError] = useState('');
  useEffect(() => {
    setWeblinkNameValue(quotation.data?.publicSlug ?? '');
  }, [quotation.data?.publicSlug]);
  const normalizedWeblinkSlug = normalizePublicSlug(weblinkNameValue);
  const weblinkNamePreview =
    normalizedWeblinkSlug &&
    !isReservedPublicSlug(normalizedWeblinkSlug) &&
    quotation.data?.publicSlugBaseUrl
      ? `${quotation.data.publicSlugBaseUrl}/${normalizedWeblinkSlug}`
      : null;
  const saveWeblinkName = () => {
    setWeblinkNameError('');
    const value = weblinkNameValue.trim();
    if (value && !normalizePublicSlug(value)) {
      setWeblinkNameError('Enter a valid Weblink name.');
      return;
    }
    weblinkName.mutate(
      { publicSlug: value ? normalizePublicSlug(value) : null },
      {
        onSuccess: (result) => setWeblinkNameValue(result.publicSlug ?? ''),
        onError: (error) =>
          setWeblinkNameError(
            error instanceof Error && error.message
              ? error.message
              : 'Unable to save Weblink name.',
          ),
      },
    );
  };
  // Tracks whether the user has explicitly toggled a section's Include checkbox
  // so the init-time sync (from the lead's requested services) never re-enables
  // a section after a manual choice.
  const autoToggleRef = useRef<Set<string>>(new Set());
  // Version 1 is initially created before the builder's master-driven prefills
  // are available. Persist that completed client snapshot exactly once so the
  // public weblink and PDFs never read the sparse server seed.
  const initialSnapshotRef = useRef({ attempted: false, autoSaving: false });
  // Wait for the reset/prefill effect itself, not merely its backing queries.
  // Otherwise V1 can persist the sparse server seed one effect too early.
  const [initializedFormVersionId, setInitializedFormVersionId] = useState<string | null>(null);
  // Keep the resolver in sync with the latest include/exclude state without
  // re-creating the whole form. Hotel is the only tab that always carries a
  // default empty row, so excluding it must bypass hotel validation entirely.
  const excludedRef = useRef(excluded);
  useEffect(() => {
    excludedRef.current = excluded;
  }, [excluded]);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(defaultVehicleDraft);
  // Auto-fill vehicle description from master when vehicleId exists and description is empty (existing quotation load)
  useEffect(() => {
    if (vehicleDescriptionOverriddenRef.current) return;
    if (!vehicleDraft.vehicleId) return;
    const currentDesc = vehicleDraft.description ?? '';
    const isEmpty = !currentDesc || !currentDesc.replace(/<[^>]*>/g, '').trim();
    if (!isEmpty) return;
    const master = (vehicleMasters.data?.data ?? []).find((m) => m.id === vehicleDraft.vehicleId);
    const masterDesc = (master as unknown as { description?: string | null })?.description ?? '';
    if (!masterDesc) return;
    setVehicleDraft((current) => {
      if (current.vehicleId !== vehicleDraft.vehicleId) return current;
      const curDesc = current.description ?? '';
      if (curDesc && curDesc.replace(/<[^>]*>/g, '').trim()) return current;
      if (vehicleDescriptionOverriddenRef.current) return current;
      return { ...current, description: masterDesc };
    });
  }, [vehicleDraft.vehicleId, vehicleDraft.description, vehicleMasters.data]);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [flightImagePreviewUrls, setFlightImagePreviewUrls] = useState<Record<string, string>>({});
  const [flightImageUploading, setFlightImageUploading] = useState(false);
  const [flightImageError, setFlightImageError] = useState('');
  // "Tax Note on Total Price" is a control dropdown: it defaults to the sentinel
  // (keep the saved note) and only writes `taxNote` when a real option is picked.
  const [taxNoteChoice, setTaxNoteChoice] = useState<string>(QUOTATION_TAX_NOTE_SENTINEL);
  const form = useForm<QuotationVersionInput>({
    resolver: async (values, context, options) => {
      // When a section is excluded, its rows must not be required. Hotel rows
      // and Cruise service rows are normalised away so an empty default row
      // never blocks a draft save.
      let prepared: QuotationVersionInput = values;
      if (excludedRef.current.hotel) prepared = { ...prepared, hotels: [] };
      if (excludedRef.current.cruise)
        prepared = {
          ...prepared,
          services: (prepared.services ?? []).filter((service) => service.serviceType !== 'CRUISE'),
        };
      return zodResolver(quotationVersionInputSchema)(prepared, context, options);
    },
    defaultValues: defaults,
  });
  const itinerary = useFieldArray({ control: form.control, name: 'itinerary' });
  const hotels = useFieldArray({ control: form.control, name: 'hotels' });
  /** Import saved hotel bookmarks into the quotation form (DB only). */
  const importHotelBookmark = (bookmarks: LiveSearchBookmark[]) => {
    // The bookmark never writes the section Description (the provider summary
    // goes only into each stay Remark). Keep an existing manually entered
    // Description so a re-import never wipes it.
    const existingDescription = form.getValues('hotelDetails')?.description ?? null;
    // One independent stay per valid bookmark, in the entered order. Section
    // amount reflects the last imported hotel's saved price.
    const imported = bookmarks.map((bookmark) => hotelBookmarkToDetails(bookmark));
    const primary = imported[0];
    if (primary) {
      const last = imported[imported.length - 1]!;
      form.setValue(
        'hotelDetails',
        {
          ...last.hotelDetails,
          description: existingDescription,
          images: [],
          pdfImageUrl: null,
        },
        { shouldDirty: true },
      );
      if (bookmarks[0]?.currency)
        form.setValue('currency', bookmarks[0].currency, { shouldDirty: true });
    }
    // Append the imported stays as additional independent rows, preserving any
    // existing hotel stays already in the quotation.
    hotels.append(imported.map((entry) => entry.hotelRow));
    setExcluded((prev) => ({ ...prev, hotel: false }));
  };
  const services = useFieldArray({ control: form.control, name: 'services' });
  const faqs = useFieldArray({ control: form.control, name: 'faqs' });
  const outboundSegments = useFieldArray({
    control: form.control,
    name: 'flightDetails.outbound.segments',
  });
  const returnSegments = useFieldArray({
    control: form.control,
    name: 'flightDetails.returnJourney.segments',
  });
  const [expandedJourneys, setExpandedJourneys] = useState<Record<'outbound' | 'returnJourney', boolean>>({
    outbound: true,
    returnJourney: true,
  });
  const [expandedSegments, setExpandedSegments] = useState<Record<string, boolean>>({});
  const airlines = useAirlines(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const createAirline = useCreateAirline();
  const queryClient = useQueryClient();
  const expertUsersQuery = useUsers(useMemo(() => new URLSearchParams({ pageSize: '100' }), []));
  const settingsQuery = useSettings();
  const destinationExpertPresetsQuery = useDestinationExpertPresets();
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const watchedExpertConfig = useWatch({ control: form.control, name: 'destinationExpertConfig' });
  const filteredDestinationExpertPresets = useMemo(() => {
    const all = destinationExpertPresetsQuery.data ?? [];
    if (!all.length) return [];
    const tokens = new Set<string>();
    const add = (v: string | null | undefined) => {
      for (const part of (v ?? '').split(/[•,>/→|-]+/)) {
        const t = part.trim().toLowerCase();
        if (t) tokens.add(t);
      }
    };
    for (const stay of quotation.data?.query?.itinerary ?? []) {
      add((stay as unknown as { country?: string | null })?.country);
      add((stay as unknown as { destination?: string | null })?.destination);
    }
    add(quotation.data?.destinationSummary);
    if (!tokens.size) return all;
    return all.filter((p) => {
      const key = p.destination.trim().toLowerCase();
      return [...tokens].some((t) => key === t || key.includes(t) || t.includes(key));
    });
  }, [destinationExpertPresetsQuery.data, quotation.data]);
  const masterFaqsQuery = useFaqs(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const faqPrefillAttemptedRef = useRef(false);
  const [importedFaqDestination, setImportedFaqDestination] = useState<string | null>(null);

  // Real company/expert fallback contacts (never fake). Used to prefill when selecting expert.
  const getExpertFallback = (expertId: string | null) => {
    const expert = (expertUsersQuery.data?.data ?? []).find(
      (u: { id: string }) => u.id === expertId,
    ) as unknown as { whatsappNumber?: string | null; phone?: string | null; email?: string | null } | undefined;
    const companyPhone = settingsQuery.data?.profile.phone ?? null;
    const companyEmail = settingsQuery.data?.profile.email ?? null;
    const whatsappNumber =
      expert?.whatsappNumber?.trim() || expert?.phone?.trim() || companyPhone?.trim() || null;
    const callNumber = expert?.phone?.trim() || companyPhone?.trim() || null;
    const email = expert?.email?.trim() || companyEmail?.trim() || null;
    return { whatsappNumber, callNumber, email };
  };
  // Always force Destination Expert to current user (particular user can create data for itself)
  useEffect(() => {
    if (watchedExpertConfig?.enabled && user?.id && watchedExpertConfig.expertUserId !== user.id) {
      const cur = form.getValues('destinationExpertConfig') as unknown as Record<string, unknown> | null;
      const fallback = getExpertFallback(user.id);
      form.setValue(
        'destinationExpertConfig',
        {
          ...(cur ?? {}),
          enabled: true,
          expertUserId: user.id,
          whatsappNumber: (cur as Record<string, unknown> | null)?.whatsappNumber || fallback.whatsappNumber,
          callNumber: (cur as Record<string, unknown> | null)?.callNumber || fallback.callNumber,
          email: (cur as Record<string, unknown> | null)?.email || fallback.email,
        } as never,
        { shouldDirty: true },
      );
    }
  }, [user?.id, watchedExpertConfig?.enabled, watchedExpertConfig?.expertUserId]);

  // Sightseeing master resolved by destinationId for each lead itinerary stay
  // instead of imprecise free-text search — guarantees complete city coverage.
  const destinationIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (!destinationMasters.data?.data) return ids;
    const byName = new Map<string, string>();
    for (const dest of destinationMasters.data.data)
      byName.set(dest.name.trim().toLowerCase(), dest.id);
    for (const stay of quotation.data?.query?.itinerary ?? []) {
      const key = stay.country?.trim().toLowerCase();
      if (key) {
        const id = byName.get(key);
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [destinationMasters.data?.data, quotation.data?.query?.itinerary]);
  // Resolved Master Destination name (country) from the lead itinerary — the
  // sightseeing feed resolves activities by destination, while the quotation's
  // destinationSummary often holds the city (e.g. "Kuala Lumpur").
  const sightseeingDestinationName = useMemo(() => {
    const byName = new Map<string, string>();
    for (const dest of destinationMasters.data?.data ?? [])
      byName.set(dest.name.trim().toLowerCase(), dest.name.trim());
    for (const stay of quotation.data?.query?.itinerary ?? []) {
      const key = stay.country?.trim().toLowerCase();
      if (key) {
        const name = byName.get(key);
        if (name) return name;
      }
    }
    return null;
  }, [destinationMasters.data?.data, quotation.data?.query?.itinerary]);
  const sightseeingMasters = useSightseeingList(
    useMemo(() => {
      const params = new URLSearchParams({ status: 'ACTIVE', pageSize: '100' });
      const firstId = [...destinationIdSet][0];
      if (firstId) params.set('destinationId', firstId);
      return params;
    }, [destinationIdSet]),
  );
  const version = quotation.data?.versions.find((row) => row.id === versionId);
  const builderVersion = useMemo(
    () => (version ? normalizeQuotationVersionForBuilder(version) : undefined),
    [version],
  );

  // Quotation destination name tokens (lead itinerary country/destination + summary)
  // used to match destination-attached master FAQs.
  const quotationDestinationTokens = useMemo(() => {
    const tokens = new Set<string>();
    const add = (value: string | null | undefined) => {
      for (const part of (value ?? '').split(/[•,>/→|-]+/)) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) tokens.add(trimmed);
      }
    };
    for (const stay of quotation.data?.query?.itinerary ?? []) {
      add(stay.country);
      add(stay.destination);
    }
    add(quotation.data?.destinationSummary);
    return tokens;
  }, [quotation.data?.query?.itinerary, quotation.data?.destinationSummary]);

  // Prefill quotation FAQs from the FAQ master based on this quotation's
  // destination. Runs once when the FAQ list is still empty so saved FAQs are
  // never overwritten, and a manual "Import FAQs" button stays available.
  const importMasterFaqs = () => {
    const master = masterFaqsQuery.data?.data ?? [];
    if (!master.length) return;
    const matches = (destinations: string[] | null | undefined) => {
      if (!destinations?.length) return true;
      return destinations.some((destination) => {
        const key = destination.trim().toLowerCase();
        return [...quotationDestinationTokens].some(
          (token) => key === token || key.includes(token) || token.includes(key),
        );
      });
    };
    const rows = master.filter((faq) => matches(faq.destinations));
    if (!rows.length) return;
    const current = (form.getValues('faqs') ?? []).map((f) => f.question.trim().toLowerCase());
    const toAdd = rows.filter(
      (row) => !current.includes(row.question.trim().toLowerCase()),
    );
    if (!toAdd.length) return;
    toAdd.forEach((row) => faqs.append({ question: row.question, answer: row.answer }));
    const destNames = [
      ...new Set(
        (rows.flatMap((r) => r.destinations ?? []) as string[]).filter(Boolean),
      ),
    ];
    setImportedFaqDestination(destNames.length ? destNames.join(', ') : 'this destination');
  };
  useEffect(() => {
    if (faqPrefillAttemptedRef.current) return;
    if (!builderVersion) return;
    if (faqs.fields.length > 0) {
      faqPrefillAttemptedRef.current = true;
      return;
    }
    if (!masterFaqsQuery.data) return;
    faqPrefillAttemptedRef.current = true;
    importMasterFaqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderVersion, faqs.fields.length, masterFaqsQuery.data]);

  useEffect(() => {
    const details = builderVersion?.flightDetails;
    const documentIds = details?.images?.length
      ? details.images.map((image) => image.documentId)
      : details?.imageDocumentId
        ? [details.imageDocumentId]
        : [];
    if (documentIds.length === 0) {
      setFlightImagePreviewUrls({});
      return;
    }
    let active = true;
    void Promise.all(
      documentIds.map(async (documentId) => {
        try {
          return [documentId, await quotationDocumentInlineUrl(quotationId, documentId)] as const;
        } catch {
          return [documentId, ''] as const;
        }
      }),
    ).then((entries) => {
      if (active) setFlightImagePreviewUrls(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [quotationId, builderVersion?.flightDetails]);
  // Tabs requested by the Lead — the source of truth for the red `*` on each
  // service tab. Derived from the lead's own service selections, never from the
  // quotation's saved state (so a requested-but-unchecked service still shows
  // its `*`, meaning "requested on the Lead").
  const leadRequested = useMemo(
    () => leadRequestedTabs(quotation.data?.query),
    [quotation.data?.query],
  );
  useEffect(() => {
    if (!builderVersion) return;
    const version = builderVersion;
    // Prefill a fresh Flight tab from the lead: outbound = departure city → main
    // destination on the travel-start date; return is the reverse on travel-end.
    const stripCode = (value: string | null | undefined) =>
      (value ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const depCity = stripCode(quotation.data?.query?.departureCity);
    const destCity = (quotation.data?.destinationSummary ?? '').split(/[•(→>,]/)[0]?.trim() ?? '';
    const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
    const startStr = dateOnly(quotation.data?.travelStartDate);
    const endStr = dateOnly(quotation.data?.travelEndDate);
    // Return date = travel start + total lead nights (falls back to travel end).
    const leadTotalNights = (quotation.data?.query?.itinerary ?? []).reduce(
      (sum, row) => sum + (row.nights ?? 0),
      0,
    );
    const addDays = (iso: string | null, days: number) => {
      if (!iso) return null;
      const day = new Date(iso);
      day.setDate(day.getDate() + days);
      return day.toISOString().slice(0, 10);
    };
    const returnStr = leadTotalNights > 0 && startStr ? addDays(startStr, leadTotalNights) : endStr;
    // Prefill a day-per-night sightseeing itinerary (+1 final travel day) from the
    // lead. Each day receives at most ONE primary activity, taken from the
    // active master in ascending sequence order and preferring the day's city;
    // the remaining attractions stay available in the activity selector.
    const leadCities: string[] = [];
    for (const row of quotation.data?.query?.itinerary ?? [])
      for (let n = 0; n < (row.nights ?? 0); n += 1) leadCities.push(row.destination);
    const sightDayCount = Math.max(1, leadCities.length + (leadCities.length ? 1 : 0));
    const dayCities = Array.from(
      { length: sightDayCount },
      (_, i) => leadCities[i] ?? leadCities[leadCities.length - 1] ?? '',
    );
    const cityKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
    const destinationToken = (quotation.data?.destinationSummary ?? '')
      .split(/[•(→>,]/)[0]
      ?.trim()
      ?.toLowerCase();
    const destinationMatch = (row: Sightseeing) => {
      if (!destinationToken) return true;
      return [row.destination?.name, row.destination?.countryName]
        .map((value) => value?.toLowerCase())
        .some((value) => Boolean(value && value.includes(destinationToken)));
    };
    const orderedMasters = (sightseeingMasters.data?.data ?? [])
      .filter((row) => row.status === 'ACTIVE' && destinationMatch(row))
      .sort(
        (a, b) =>
          (a.sequence ?? 0) - (b.sequence ?? 0) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );

    /** Detect a departure activity by normalized title. */
    const normTitle = (value: string | null | undefined) =>
      (value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, ' ');
    const isDepartureTitle = (title: string | null | undefined) => {
      const n = normTitle(title);
      return n.includes('departure') || /check[\s-]?out\s+and\s+departure/i.test(n);
    };

    // If configured, resolve an optional departure master for the final
    // destination: exact city match first, then any active departure master for
    // the destination, then by sequence and title.
    const finalCity = dayCities[dayCities.length - 1] ?? '';
    const departureMasters = orderedMasters.filter((row) => isDepartureTitle(row.title));
    const departureMaster =
      departureMasters.find((row) => cityKey(row.city?.name) === cityKey(finalCity)) ??
      departureMasters[0] ??
      null;

    const usedIds = new Set<string>();
    // Reserve the optional departure master so it is never consumed by earlier days.
    if (departureMaster) usedIds.add(departureMaster.id);
    let sequenceCursor = 0;
    const nextForDay = (city: string, isLastDay: boolean): Sightseeing | null => {
      if (isLastDay && departureMaster) return departureMaster;
      const key = cityKey(city);
      const cityMatch = orderedMasters.find(
        (row) => !usedIds.has(row.id) && cityKey(row.city?.name) === key,
      );
      if (cityMatch) {
        usedIds.add(cityMatch.id);
        return cityMatch;
      }
      while (
        sequenceCursor < orderedMasters.length &&
        usedIds.has(orderedMasters[sequenceCursor]!.id)
      )
        sequenceCursor += 1;
      const next = orderedMasters[sequenceCursor];
      if (next) {
        usedIds.add(next.id);
        sequenceCursor += 1;
      }
      return next ?? null;
    };
    const toActivity = (row: Sightseeing) => {
      const images = masterGallerySnapshot(row.images, row.title);
      return {
        sightseeingId: row.id,
        name: row.title,
        startTime: row.suggestedStartTime ?? null,
        showTime: Boolean(row.suggestedStartTime),
        duration: row.estimatedHours != null ? `${row.estimatedHours} hours` : null,
        city: row.city?.name ?? null,
        description: row.description ?? null,
        imageUrl: null,
        images,
        imageSnapshotPresent: masterGalleryPresence(row),
        pdfImageUrl: images[0] ? quotationSnapshotImageIdentity(images[0]) : null,
        pricingOptions: emptySightseeingActivity().pricingOptions,
        sequence: 1,
      };
    };
    const prefilledSightseeing = {
      include: true,
      sectionTitle: 'Sightseeing & Experiences',
      amount: 0,
      description: null,
      days: dayCities.map((city, i) => {
        const isLastDay = i === dayCities.length - 1;
        const primary = nextForDay(city, isLastDay);
        return emptySightseeingDay(i + 1, {
          title: primary
            ? `Day ${i + 1}: ${primary.title}`
            : city
              ? `Day ${i + 1}: ${city}`
              : `Day ${i + 1}`,
          city: city || null,
          date: addDays(startStr, i),
          activities: primary ? [toActivity(primary)] : [emptySightseeingActivity()],
        });
      }),
    };
    // Build hotel stay rows from the lead itinerary.  Non-hotel segments
    // (Cruise, Airport, Transfer, etc.) are excluded.  Consecutive same-city
    // segments are merged into a single continuous stay.
    let stayCursor = startStr ? new Date(startStr) : null;
    const rawStays = (quotation.data?.query?.itinerary ?? []).filter(
      (stay) => stay.nights > 0 && isHotelStay(stay.destination),
    );
    const mergedStays: typeof rawStays = [];
    for (const stay of rawStays) {
      const prev = mergedStays[mergedStays.length - 1];
      if (prev && prev.destination.trim().toLowerCase() === stay.destination.trim().toLowerCase()) {
        prev.nights += stay.nights;
      } else {
        mergedStays.push({ ...stay });
      }
    }
    // When the itinerary produces exactly one hotel city (even when it
    // appears multiple times interrupted by Cruise etc.), that single
    // Hotel Stay must cover the quotation's complete total nights, not
    // only the land-segment nights.
    const itineraryHotelRows: HotelInputRow[] = mergedStays.map((stay, index) => {
      const isSingleHotelCity = mergedStays.length === 1 && leadTotalNights > (stay.nights ?? 0);
      const nightsForStay = isSingleHotelCity ? leadTotalNights : (stay.nights ?? 0);
      const checkIn = stay.arrivalDate ? new Date(stay.arrivalDate) : stayCursor;
      const derivedCheckOut = checkIn ? new Date(checkIn) : null;
      if (derivedCheckOut) derivedCheckOut.setDate(derivedCheckOut.getDate() + nightsForStay);
      const checkOut = stay.departureDate ? new Date(stay.departureDate) : derivedCheckOut;
      if (checkOut) stayCursor = new Date(checkOut);
      return emptyHotel(index + 1, true, {
        city: stay.destination,
        rooms: Math.max(1, quotation.data?.rooms ?? 1),
        nights: nightsForStay,
        checkInDate: checkIn ? new Date(checkIn) : null,
        checkOutDate: checkOut,
      });
    });
    const fallbackNights =
      startStr && endStr
        ? Math.max(
            1,
            Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86_400_000),
          )
        : 1;
    const fallbackCity =
      (quotation.data?.destinationSummary ?? '').split(/[•(→>,]/)[0]?.trim() ?? '';
    const leadHotelRows: HotelInputRow[] = itineraryHotelRows.length
      ? itineraryHotelRows
      : fallbackCity || startStr || endStr
        ? [
            emptyHotel(1, true, {
              city: fallbackCity,
              rooms: Math.max(1, quotation.data?.rooms ?? 1),
              nights: fallbackNights,
              checkInDate: startStr ? new Date(startStr) : null,
              checkOutDate: returnStr ? new Date(returnStr) : endStr ? new Date(endStr) : null,
            }),
          ]
        : [];
    const base = defaultFlightDetails();
    const prefilledFlight: NonNullable<QuotationVersionInput['flightDetails']> = {
      ...base,
      outbound: {
        ...base.outbound,
        fromCity: depCity || null,
        toCity: destCity || null,
        segments: [
          {
            ...emptySegment(),
            from: depCity || null,
            to: destCity || null,
            departureDate: startStr,
            arrivalDate: startStr,
          },
        ],
      },
      returnJourney: {
        ...base.returnJourney,
        fromCity: destCity || null,
        toCity: depCity || null,
        segments: [
          {
            ...emptySegment(),
            from: destCity || null,
            to: depCity || null,
            departureDate: returnStr,
            arrivalDate: returnStr,
          },
        ],
      },
    };
    const savedVehicle = version.services.find(
      (service) => service.serviceType === 'VEHICLE_TRANSFER',
    );
    vehicleDescriptionOverriddenRef.current = false;
    setVehicleDraft({
      // Keep the reference section visible for a new quotation. A vehicle is
      // only persisted once a model is selected, so this does not create an
      // empty service row.
      include: true,
      sectionTitle: savedVehicle?.taxCategory?.trim() || 'Transportation',
      amount: Number(savedVehicle?.unitSellingPrice ?? 0),
      vehicleType: savedVehicle?.city ?? '',
      vehicleId: savedVehicle?.vehicleId ?? '',
      vehicleModel: savedVehicle?.name ?? '',
      usage: savedVehicle?.notes ?? '',
      description: savedVehicle?.description ?? '',
      images: savedVehicle?.images ?? [],
      imageSnapshotPresent:
        savedVehicle?.imageSnapshotPresent ?? Boolean(savedVehicle?.images?.length),
      pdfImageUrl: savedVehicle?.pdfImageUrl ?? null,
      pricingBasis: savedVehicle?.pricingBasis ?? 'PER_DAY',
      quantity: Number(savedVehicle?.quantity ?? 1) || 1,
    });
    const legacyTitle = version.title.trim().toLowerCase();
    const legacyDestinationTitle =
      `${version.destinationSummary.trim()} travel proposal`.toLowerCase();
    const legacyPrimaryDestinationTitle = `${destCity} travel proposal`.toLowerCase();
    const leadTitle =
      destCity && quotation.data?.customerName
        ? `${destCity} Package for ${quotation.data.customerName}`
        : version.title;
    // Policy prefill from the lead's Destination Masters, in destination order.
    // Saved quotation policy values always win over destination content.
    const destinationPolicyPrefill = buildDestinationPolicyPrefill(
      destinationMasters.data?.data ?? [],
      (quotation.data?.query?.itinerary ?? [])
        .map((stay) => stay.country?.trim())
        .filter(Boolean) as string[],
    );
    // A freshly loaded version keeps its saved tax note; the dropdown starts on
    // the "keep existing" sentinel until the user deliberately changes it.
    setTaxNoteChoice(QUOTATION_TAX_NOTE_SENTINEL);
    form.reset({
      title:
        legacyTitle === legacyDestinationTitle || legacyTitle === legacyPrimaryDestinationTitle
          ? leadTitle
          : version.title,
      introduction: version.introduction,
      weblinkHeading: version.weblinkHeading ?? null,
      destinationSummary: version.destinationSummary,
      travelStartDate: version.travelStartDate ? new Date(version.travelStartDate) : null,
      travelEndDate: version.travelEndDate ? new Date(version.travelEndDate) : null,
      currency: version.currency,
      pricingMode: normalizePricingMode(version.pricingMode) as QuotationVersionInput['pricingMode'],
      pricingHeading: version.pricingHeading ?? 'Price Breakdown',
      pricingSubheading: version.pricingSubheading ?? null,
      pricingDisplayOrder:
        Array.isArray((version as { pricingDisplayOrder?: unknown }).pricingDisplayOrder)
          ? ((version as { pricingDisplayOrder?: unknown }).pricingDisplayOrder as string[])
          : undefined,
      markupMode: version.markupMode as QuotationVersionInput['markupMode'],
      markupValue: Number(version.markupValue),
      taxRate: Number(version.taxRate),
      discountAmount: Number(version.discountAmount),
      perAdultPrice: Number(version.perAdultPrice ?? 0),
      perChildWithBedPrice: Number(version.perChildWithBedPrice ?? 0),
      perChildWithoutBedPrice: Number(version.perChildWithoutBedPrice ?? 0),
      perInfantPrice: Number(version.perInfantPrice ?? 0),
      taxNote: version.taxNote ?? null,
      netAmount: Number(version.netAmount ?? 0),
      initialPaymentAmount: Number(version.initialPaymentAmount ?? 0),
      paymentLink: version.paymentLink ?? null,
      showServiceChargesSeparately: version.showServiceChargesSeparately ?? false,
      markServiceChargesOutside: version.markServiceChargesOutside ?? false,
      hidePricing: version.hidePricing ?? false,
      showIndividualPricing: version.showIndividualPricing ?? false,
      showQuickNav: version.showQuickNav ?? true,
      quickNavSticky: version.quickNavSticky ?? true,
      inclusionsHtml: policyValue(version.inclusionsHtml, destinationPolicyPrefill.inclusionsHtml),
      exclusionsHtml: policyValue(version.exclusionsHtml, destinationPolicyPrefill.exclusionsHtml),
      paymentPolicies: policyValue(
        version.paymentPolicies,
        destinationPolicyPrefill.paymentPolicies,
      ),
      cancellationPolicies: policyValue(
        version.cancellationPolicies,
        destinationPolicyPrefill.cancellationPolicies,
      ),
      bookingTerms: policyValue(version.bookingTerms, destinationPolicyPrefill.bookingTerms),
      includeVisa: version.includeVisa ?? true,
      visaSectionTitle: version.visaSectionTitle ?? null,
      visaAmount: Number(version.visaAmount ?? 0),
      visaDestination: version.visaDestination ?? null,
      visaType: version.visaType ?? null,
      visaServiceCharge: Number(version.visaServiceCharge ?? 0),
      visaGstPercent: Number(version.visaGstPercent ?? 0),
      visaVfsCharge: Number(version.visaVfsCharge ?? 0),
      customCharges: Array.isArray((version as unknown as { customCharges?: unknown }).customCharges)
        ? ((version as unknown as { customCharges: Array<{ label: string; amount: number; description?: string | null; category?: string | null }> }).customCharges ?? []).map((c) => ({
            label: c.label,
            amount: c.amount,
            description: (c as { description?: string | null }).description ?? null,
            category: (c as { category?: string | null }).category ?? null,
          }))
        : [],
      flightDetails: version.flightDetails
        ? {
            ...defaultFlightDetails(),
            ...version.flightDetails,
            images: version.flightDetails.images?.length
              ? version.flightDetails.images.map((image) => ({
                  ...image,
                  description: image.description ?? image.heading ?? null,
                  heading: null,
                }))
              : version.flightDetails.imageDocumentId
                ? [
                    {
                      documentId: version.flightDetails.imageDocumentId,
                      fileName: version.flightDetails.imageFileName,
                      description: null,
                      heading: null,
                    },
                  ]
                : [],
            outbound: {
              ...defaultFlightDetails().outbound,
              ...version.flightDetails.outbound,
              segments: version.flightDetails.outbound?.segments?.length
                ? version.flightDetails.outbound.segments
                : [emptySegment()],
            },
            returnJourney: {
              ...defaultFlightDetails().returnJourney,
              ...version.flightDetails.returnJourney,
              segments: version.flightDetails.returnJourney?.segments?.length
                ? version.flightDetails.returnJourney.segments
                : [emptySegment()],
            },
          }
        : prefilledFlight,
      hotelDetails: version.hotelDetails
        ? {
            ...defaultHotelDetails(),
            ...version.hotelDetails,
            sectionTitle: hotelSectionTitle(version.hotelDetails.sectionTitle),
          }
        : defaultHotelDetails(),
      addOnDetails: version.addOnDetails
        ? {
            include: version.addOnDetails.include !== false,
            sectionTitle: version.addOnDetails.sectionTitle ?? 'Additional Services',
          }
        : { include: true, sectionTitle: 'Additional Services' },
      sightseeingDetails:
        version.sightseeingDetails && version.sightseeingDetails.days?.length
          ? withSightseeingPricingRows(version.sightseeingDetails)
          : prefilledSightseeing,
      notes: version.notes,
      internalNotes: version.internalNotes ?? null,
      itinerary: version.itinerary.map((row) => ({
        ...row,
        date: row.date ? new Date(row.date) : null,
      })),
      hotels: version.hotels.length
        ? version.hotels.map((row, index) => {
            const matchingStay =
              leadHotelRows.find(
                (stay) =>
                  (stay.city ?? '').trim().toLowerCase() === (row.city ?? '').trim().toLowerCase(),
              ) ?? leadHotelRows[index];
            return withSynthesizedLines({
              ...row,
              checkInDate: row.checkInDate
                ? new Date(row.checkInDate)
                : (matchingStay?.checkInDate ?? (startStr ? new Date(startStr) : null)),
              checkOutDate: row.checkOutDate
                ? new Date(row.checkOutDate)
                : (matchingStay?.checkOutDate ??
                  (returnStr ? new Date(returnStr) : endStr ? new Date(endStr) : null)),
              showCheckInTime: Boolean(row.checkInTime?.trim()),
              showCheckOutTime: Boolean(row.checkOutTime?.trim()),
              internalCost: row.internalCost ? Number(row.internalCost) : 0,
              sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : 0,
              // Backward compatibility: older quotations stored the bookmark
              // gallery at section level (hotelDetails.images). Migrate it onto
              // the single hotel stay so the per-stay image manager and PDF
              // selection keep working. Rows that already carry their own
              // images (newer saves) are left untouched.
              images: (row.imageSnapshotPresent
                ? (row.images ?? [])
                : version.hotels.length === 1 &&
                    Array.isArray(version.hotelDetails?.images) &&
                    version.hotelDetails.images.length > 0
                  ? version.hotelDetails.images.map((image) => ({
                      url: image.url,
                      thumbnailUrl: null,
                      alt: image.alt ?? null,
                    }))
                  : (row.images ?? [])) as NonNullable<
                QuotationVersionInput['hotels']
              >[number]['images'],
              imageSnapshotPresent:
                (row.imageSnapshotPresent ?? Boolean(row.images?.length)) ||
                (version.hotels.length === 1 &&
                  Array.isArray(version.hotelDetails?.images) &&
                  version.hotelDetails.images.length > 0),
              pdfImageUrl:
                row.pdfImageUrl ??
                (version.hotels.length === 1 ? (version.hotelDetails?.pdfImageUrl ?? null) : null),
            } as unknown as HotelInputRow);
          })
        : autoPrefillLeadRows(leadHotelRows, hotelMasters.data?.data ?? []).map(withSynthesizedLines),
      services: version.services.map((row) => {
        const base = {
          serviceType: row.serviceType as ServiceType,
          airlineId: row.airlineId ?? null,
          cruiseId: row.cruiseId ?? null,
          cruiseRoomTypeId: row.cruiseRoomTypeId ?? null,
          vehicleId: row.vehicleId ?? null,
          sightseeingId: row.sightseeingId ?? null,
          addOnServiceId: row.addOnServiceId ?? null,
          name: row.name,
          description: row.description,
          dayNumber: row.dayNumber,
          city: row.city,
          quantity: Number(row.quantity),
          internalCost: row.unitCost ? Number(row.unitCost) : 0,
          sellingPrice: Number(row.unitSellingPrice),
          // Cruise rows default their section title to "Cruise Details" when the
          // snapshot never stored one (legacy/custom rows), while custom titles
          // are always preserved.
          taxCategory:
            row.serviceType === 'CRUISE' && !(row.taxCategory ?? '').trim()
              ? 'Cruise Details'
              : row.taxCategory,
          notes: row.notes,
          cruiseNights: (row as unknown as { cruiseNights?: number | null })?.cruiseNights ?? null,
          cruiseRoomLines: Array.isArray((row as unknown as { cruiseRoomLines?: unknown[] })?.cruiseRoomLines)
            ? ((row as unknown as { cruiseRoomLines: unknown[] }).cruiseRoomLines as unknown as QuotationVersionInput['services'][number]['cruiseRoomLines'])
            : undefined,
          images: row.images ?? [],
          imageSnapshotPresent: row.imageSnapshotPresent ?? Boolean(row.images?.length),
          pdfImageUrl: row.pdfImageUrl ?? null,
          sequence: row.sequence,
        };
        if (base.serviceType === 'CRUISE') {
          return withCruiseSynthesizedLines(base as unknown as CruiseServiceInput) as unknown as typeof base;
        }
        return base;
      }),
      inclusions: version.inclusions,
      exclusions: version.exclusions,
      terms: version.terms,
      faqs: Array.isArray((version as unknown as { faqs?: unknown }).faqs)
        ? ((version as unknown as { faqs: Array<{ question: string; answer: string }> }).faqs ?? [])
        : [],
      weblinkSectionOrder: Array.isArray(
        (version as unknown as { weblinkSectionOrder?: unknown }).weblinkSectionOrder,
      )
        ? ((version as unknown as { weblinkSectionOrder: string[] })
            .weblinkSectionOrder as string[])
        : null,
      destinationExpertConfig: (version as unknown as { destinationExpertConfig?: unknown })
        .destinationExpertConfig
        ? ((
            version as unknown as {
              destinationExpertConfig: QuotationVersionInput['destinationExpertConfig'];
            }
          ).destinationExpertConfig as QuotationVersionInput['destinationExpertConfig'])
        : null,
    }, { keepDirtyValues: true });
    // A brand-new quotation with a prefilled default hotel keeps the Hotel
    // section included unless the user explicitly turned it off. A saved
    // quotation's `hotelDetails.include` is authoritative (an explicitly
    // excluded hotel stays excluded).
    const prefilledHotelRows = !version.hotels.length
      ? autoPrefillLeadRows(leadHotelRows, hotelMasters.data?.data ?? [])
      : [];
    const savedHotelInclude = version.hotelDetails?.include ?? true;
    if (savedHotelInclude && !autoHotelRef.current.userToggledHotel) {
      if (prefilledHotelRows.some((row) => row.hotelId) || version.hotels.length > 0) {
        autoHotelRef.current.enabledByAuto = true;
        setExcluded((current) => ({ ...current, hotel: false }));
      }
    } else if (!savedHotelInclude && !autoHotelRef.current.userToggledHotel) {
      setExcluded((current) => ({ ...current, hotel: true }));
    }
    // Cruise Include default, derived from the version's OWN saved CRUISE rows.
    // A NEW quotation created from a Lead has its version services seeded from
    // the Lead's requested services, so a lead-requested Cruise is included
    // (checked) by default. An existing draft's saved service rows reflect the
    // user's Include choice (an unchecked Cruise has no saved row), so reopening
    // preserves that state — the Lead is never re-applied over a saved choice.
    // An explicit user toggle always wins.
    if (!autoToggleRef.current.has('cruise')) {
      const hasSavedCruiseRow = (version.services ?? []).some(
        (row) => row.serviceType === 'CRUISE',
      );
      setExcluded((current) => ({ ...current, cruise: !hasSavedCruiseRow }));
    }
    // Add-on Services top-level include: a NEW quotation defaults from the
    // Lead's requested services; an existing quotation keeps its saved state.
    // `version.addOnDetails` is null on a brand-new version, so default it once.
    if (!version.addOnDetails) {
      const addOnIncluded = leadRequested.has('addon');
      form.setValue(
        'addOnDetails',
        { include: addOnIncluded, sectionTitle: 'Additional Services' },
        { shouldDirty: false },
      );
    }
    setInitializedFormVersionId(version.id);
  }, [
    version,
    form,
    quotation.data,
    sightseeingMasters.data,
    hotelMasters.data,
    destinationMasters.data,
    leadRequested,
  ]);

  // Recover the display snapshot for older drafts that only saved a vehicle id.
  useEffect(() => {
    if (!vehicleDraft.vehicleId) return;
    const master = (vehicleMasters.data?.data ?? []).find(
      (entry) => entry.id === vehicleDraft.vehicleId,
    );
    if (!master) return;
    setVehicleDraft((current) => ({
      ...current,
      vehicleType: current.vehicleType || master.vehicleType,
      vehicleModel: current.vehicleModel || master.name,
    }));
  }, [vehicleDraft.vehicleId, vehicleMasters.data]);
  const watchedHotels = useWatch({ control: form.control, name: 'hotels' });
  const watchedServices = useWatch({ control: form.control, name: 'services' });
  const markupMode = useWatch({ control: form.control, name: 'markupMode' });
  const markupValue = useWatch({ control: form.control, name: 'markupValue' }) ?? 0;
  const taxRate = useWatch({ control: form.control, name: 'taxRate' }) ?? 0;
  const discount = useWatch({ control: form.control, name: 'discountAmount' }) ?? 0;

  const applyPatch = (path: 'hotels' | 'services', index: number, patch: object) => {
    for (const [key, value] of Object.entries(patch))
      form.setValue(`${path}.${index}.${key}` as 'hotels.0.hotelName', value as never, {
        shouldDirty: true,
      });
  };
  const applyHotel = (index: number, patch: HotelRowPatch) => applyPatch('hotels', index, patch);
  const applyService = (index: number, patch: ServiceRowPatch) =>
    applyPatch('services', index, patch);

  // Cruise: auto-prefill cabin rate from master when room selected, respecting manual override.
  // Handles both stable ID and legacy name-only (city) fallback.
  useEffect(() => {
    if (!cruiseMasters.data?.data) return;
    const masters = cruiseMasters.data.data as unknown as Array<{ id: string; roomTypes?: Array<{ id: string; name: string; price?: number | null; status: string }> }>;
    (watchedServices ?? []).forEach((row, index) => {
      if ((row as unknown as { serviceType: string })?.serviceType !== 'CRUISE') return;
      const cruiseId = (row as unknown as { cruiseId?: string | null })?.cruiseId;
      const roomTypeId = (row as unknown as { cruiseRoomTypeId?: string | null })?.cruiseRoomTypeId;
      const fallbackName = (row as unknown as { city?: string | null })?.city;
      if (!cruiseId) return;
      if (!roomTypeId && !fallbackName?.trim()) return;
      const master = masters.find((m) => m.id === cruiseId);
      if (!master) return;
      const room = findCruiseRoomType(master as never, roomTypeId, fallbackName);
      if (!room) return;
      // Legacy: if id missing but name matched, migrate id to stable value
      if (!roomTypeId && fallbackName?.trim() && room.id) {
        applyService(index, { cruiseRoomTypeId: room.id, city: room.name });
      }
      if (room.price == null) return;
      if (cruisePriceOverridesRef.current.has(index)) return;
      const currentPrice = (row as unknown as { sellingPrice?: number | null })?.sellingPrice;
      const masterPrice = Number(room.price);
      if (currentPrice != null && Number(currentPrice) === masterPrice) return;
      // If not overridden, sync to master price (covers initial fill and room change)
      applyService(index, { sellingPrice: masterPrice });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cruiseMasters.data, watchedServices?.map((s) => `${(s as unknown as { cruiseId?: string })?.cruiseId}-${(s as unknown as { cruiseRoomTypeId?: string })?.cruiseRoomTypeId}-${(s as unknown as { city?: string })?.city}`).join('|')]);

  /**
   * A room/meal allocation's master selection writes its own additive selling
   * figure onto the line; the row's sellingPrice/internalCost become the sum
   * across ALL allocations — the same additive rule the single room+meal pair
   * always used, never accumulated twice. Manual figures are kept when no line
   * carries a master price.
   */
  const recalculateHotelTotals = (index: number) => {
    const row = form.getValues(`hotels.${index}`) as HotelInputRow;
    const lines = [...(row.roomLines ?? []), ...(row.mealPlanLines ?? [])];
    if (!lines.some((line) => line?.sellingPrice != null)) return;
    const selling = lines.reduce((sum, line) => sum + (Number(line?.sellingPrice) || 0), 0);
    form.setValue(`hotels.${index}.sellingPrice`, selling as never, { shouldDirty: true });
    if (canCost && lines.some((line) => line?.internalCost != null)) {
      const cost = lines.reduce((sum, line) => sum + (Number(line?.internalCost) || 0), 0);
      form.setValue(`hotels.${index}.internalCost`, cost as never, { shouldDirty: true });
    }
  };

  // Unsaved Master refs deliberately carry no expiring URL. Enrich them for
  // editing in the background, while merging into the latest order so delayed
  // responses never restore images the user removed or moved.
  useEffect(() => {
    (watchedHotels ?? []).forEach((row, index) => {
      const current = (row.images ?? []) as QuotationImage[];
      if (!row.hotelId || !row.imageSnapshotPresent) return;
      if (!current.some((image) => image.masterImageId && !image.url)) return;
      const key = `${index}:${row.hotelId}:${current
        .map((image) => quotationSnapshotImageIdentity(image) ?? '')
        .join(',')}`;
      if (hotelPreviewImportsRef.current.has(key)) return;
      hotelPreviewImportsRef.current.add(key);
      void importMasterGalleryPreviews(row.hotelId, current, hotelImageUrl).then((previewed) => {
        if (form.getValues(`hotels.${index}.hotelId`) !== row.hotelId) return;
        form.setValue(
          `hotels.${index}.images`,
          mergeMasterGalleryPreviews(form.getValues(`hotels.${index}.images`), previewed) as never,
          { shouldDirty: false },
        );
      });
    });
  }, [watchedHotels, form]);

  // Per-stay bookmark snapshot image management. Every hotel stay owns its own
  // image list and its own "Use in PDF" selection. Reordering and removal only
  // edit this quotation's saved copy — the bookmark itself is never touched.
  // Removing the PDF-selected image moves the selection to the first remaining
  // image, matching the PDF's fallback rule.
  const moveHotelImage = (stayIndex: number, index: number, direction: -1 | 1) => {
    const current = (watchedHotels?.[stayIndex]?.images ?? []) as QuotationImage[];
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    form.setValue(`hotels.${stayIndex}.images`, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`hotels.${stayIndex}.imageSnapshotPresent`, true, { shouldDirty: true });
  };
  const removeHotelImage = (stayIndex: number, index: number) => {
    const current = (watchedHotels?.[stayIndex]?.images ?? []) as QuotationImage[];
    const removed = current[index];
    const next = current.filter((_, imageIndex) => imageIndex !== index);
    form.setValue(`hotels.${stayIndex}.images`, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`hotels.${stayIndex}.imageSnapshotPresent`, true, { shouldDirty: true });
    if (
      removed &&
      watchedHotels?.[stayIndex]?.pdfImageUrl === quotationSnapshotImageIdentity(removed)
    )
      form.setValue(
        `hotels.${stayIndex}.pdfImageUrl`,
        next[0] ? quotationSnapshotImageIdentity(next[0]) : null,
        {
          shouldDirty: true,
        },
      );
  };
  const setHotelPdfImage = (stayIndex: number, identity: string) =>
    form.setValue(`hotels.${stayIndex}.pdfImageUrl`, identity, { shouldDirty: true });

  const moveServiceImage = (serviceIndex: number, imageIndex: number, direction: -1 | 1) => {
    const current = (watchedServices?.[serviceIndex]?.images ?? []) as QuotationImage[];
    const target = imageIndex + direction;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[imageIndex], next[target]] = [next[target]!, next[imageIndex]!];
    form.setValue(`services.${serviceIndex}.images`, next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`services.${serviceIndex}.imageSnapshotPresent`, true, { shouldDirty: true });
  };
  const removeServiceImage = (serviceIndex: number, imageIndex: number) => {
    const current = (watchedServices?.[serviceIndex]?.images ?? []) as QuotationImage[];
    const removed = current[imageIndex];
    const next = current.filter((_, index) => index !== imageIndex);
    form.setValue(`services.${serviceIndex}.images`, next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`services.${serviceIndex}.imageSnapshotPresent`, true, { shouldDirty: true });
    if (
      removed &&
      watchedServices?.[serviceIndex]?.pdfImageUrl === quotationSnapshotImageIdentity(removed)
    )
      form.setValue(
        `services.${serviceIndex}.pdfImageUrl`,
        next[0] ? quotationSnapshotImageIdentity(next[0]) : null,
        { shouldDirty: true },
      );
  };
  const setServicePdfImage = (serviceIndex: number, identity: string) =>
    form.setValue(`services.${serviceIndex}.pdfImageUrl`, identity, { shouldDirty: true });

  const moveVehicleImage = (imageIndex: number, direction: -1 | 1) => {
    setVehicleDraft((current) => {
      const target = imageIndex + direction;
      if (target < 0 || target >= current.images.length) return current;
      const images = [...current.images];
      [images[imageIndex], images[target]] = [images[target]!, images[imageIndex]!];
      return { ...current, images, imageSnapshotPresent: true };
    });
  };
  const removeVehicleImage = (imageIndex: number) => {
    setVehicleDraft((current) => {
      const removed = current.images[imageIndex];
      const images = current.images.filter((_, index) => index !== imageIndex);
      const removedIdentity = removed ? quotationSnapshotImageIdentity(removed) : null;
      return {
        ...current,
        images,
        imageSnapshotPresent: true,
        pdfImageUrl:
          removedIdentity && current.pdfImageUrl === removedIdentity
            ? images[0]
              ? quotationSnapshotImageIdentity(images[0])
              : null
            : current.pdfImageUrl,
      };
    });
  };

  // Prefill default hotels for untouched hotel rows that appear after
  // initialization (e.g. "Add Hotel"), without ever touching a row the user
  // has selected or edited.
  useEffect(() => {
    const state = autoHotelRef.current;
    if (state.userToggledHotel) return;
    if (!hotelMasters.data) return;
    // Automatic prefill only applies to brand-new quotations; saved snapshots
    // are never rewritten.
    if ((version?.hotels?.length ?? 0) > 0) return;
    const rows = watchedHotels ?? [];
    let matched = false;
    rows.forEach((row, index) => {
      if (row.hotelId || row.hotelName?.trim()) return;
      // A hotel for this destination already exists → no duplicate default.
      const city = (row.city ?? '').trim().toLowerCase();
      const covered = city
        ? rows.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              Boolean(other.hotelId) &&
              (other.city ?? '').trim().toLowerCase() === city,
          )
        : false;
      if (covered) return;
      const defaultHotel = matchDefaultHotel(row.city ?? '', hotelMasters.data?.data ?? []);
      if (!defaultHotel) return;
      matched = true;
      const images = masterGallerySnapshot(defaultHotel.images, defaultHotel.name);
      const matchedRate = hotelRateForDate(defaultHotel as never, row.checkInDate);
      const price = matchedRate != null && Number(matchedRate) > 0 ? Number(matchedRate) : null;
      // Same mapping as a manual master selection (see HotelMasterFields).
      for (const [key, patchValue] of Object.entries({
        hotelId: defaultHotel.id,
        hotelRoomTypeId: null,
        hotelMealPlanId: null,
        hotelName: defaultHotel.name,
        city: defaultHotel.city.name,
        category: defaultHotel.starCategory ? `${defaultHotel.starCategory} Star` : null,
        images,
        imageSnapshotPresent: masterGalleryPresence(defaultHotel),
        pdfImageUrl: images[0] ? quotationSnapshotImageIdentity(images[0]) : null,
        ...(price != null ? { sellingPrice: price } : {}),
      })) {
        form.setValue(`hotels.${index}.${key}` as 'hotels.0.hotelName', patchValue as never, {
          shouldDirty: true,
        });
      }
      if (price != null) {
        const sectionAmount = form.getValues('hotelDetails.amount' as never) as unknown;
        const sectionEmpty = sectionAmount == null || sectionAmount === '' || Number(sectionAmount) === 0;
        if (sectionEmpty)
          form.setValue('hotelDetails.amount', price as never, { shouldDirty: true });
      }
    });
    if (matched && !state.enabledByAuto) {
      state.enabledByAuto = true;
      setExcluded((current) => ({ ...current, hotel: false }));
    }
  }, [watchedHotels, hotelMasters.data, version, form]);

  const createHotelRow = (
    sequence: number,
    selected: boolean,
    seed: Partial<HotelInputRow> = {},
  ) => {
    const start = quotation.data?.travelStartDate;
    const end = quotation.data?.travelEndDate;
    const stayNights =
      start && end
        ? Math.max(
            1,
            Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000),
          )
        : 1;
    return emptyHotel(sequence, selected, {
      city: (quotation.data?.destinationSummary ?? '').split(/[•(→>,]/)[0]?.trim() ?? '',
      rooms: Math.max(1, quotation.data?.rooms ?? 1),
      nights: stayNights,
      checkInDate: start ? new Date(start) : null,
      checkOutDate: end ? new Date(end) : null,
      ...seed,
    });
  };

  const appendHotel = (selected: boolean, seed: Partial<HotelInputRow> = {}) => {
    hotels.append(createHotelRow(hotels.fields.length + 1, selected, seed));
  };

  const insertHotelAfter = (index: number) => {
    hotels.insert(index + 1, createEmptyHotelStay(index + 2));
  };

  const insertHotelBefore = (index: number) => {
    hotels.insert(index, createEmptyHotelStay(index + 1));
  };

  const estimate = useMemo(() => {
    const hotelRows = watchedHotels ?? [];
    const serviceRows = watchedServices ?? [];
    const isAddon = (row: { serviceType?: string }) =>
      ADDON_TYPES.includes((row.serviceType ?? '') as ServiceType);
    const packageServices = serviceRows.filter((row) => !isAddon(row));
    const addonServices = serviceRows.filter(isAddon);
    // Add-on services are quoted separately and are NOT part of the package total.
    const addOnIncluded = form.watch('addOnDetails.include') !== false;
    const addon = addOnIncluded
      ? addonServices
          .map((row) => Number(row.sellingPrice ?? 0) * Number(row.quantity ?? 1))
          .reduce((a, b) => a + b, 0)
      : 0;
    const cost = [
      ...hotelRows.map((row) => Number(row.internalCost ?? 0)),
      ...packageServices.map((row) => Number(row.internalCost ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const selling = [
      ...hotelRows.map((row) => Number(row.sellingPrice ?? 0)),
      ...packageServices.map((row) => Number(row.sellingPrice ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const markup =
      markupMode === 'PERCENTAGE'
        ? (selling * Number(markupValue)) / 100
        : markupMode === 'FIXED'
          ? Number(markupValue)
          : 0;
    const preTax = Math.max(0, selling + markup - Number(discount));
    const tax = (preTax * Number(taxRate)) / 100;
    return { cost, selling, markup, tax, addon, final: preTax + tax, margin: preTax - cost };
  }, [watchedHotels, watchedServices, markupMode, markupValue, taxRate, discount]);

  if (quotation.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-card" />;
  if (!quotation.data || !version)
    return <div className="rounded-xl bg-card p-12 text-center">Draft version unavailable.</div>;
  if (version.status !== 'DRAFT')
    return (
      <div className="rounded-xl bg-card p-12 text-center">
        Finalized versions are immutable. Create a revision to edit.
      </div>
    );

  const q = quotation.data;
  const itineraryNights = (q.query?.itinerary ?? []).reduce(
    (sum, row) => sum + (row.nights ?? 0),
    0,
  );
  const dateNights =
    q.travelStartDate && q.travelEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
              86_400_000,
          ),
        )
      : null;
  const nights = itineraryNights > 0 ? itineraryNights : dateNights || null;
  const travellers = [
    q.adults ? `${q.adults} Adult(s)` : '',
    q.childrenWithBed + q.childrenWithoutBed
      ? `${q.childrenWithBed + q.childrenWithoutBed} Child(ren)`
      : '',
    q.infants ? `${q.infants} Infant(s)` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Reference "Summary & Pricing": the package total is per-passenger pricing
  // multiplied by this lead's traveller mix. Add-ons are quoted separately.
  const pax = {
    adults: q.adults ?? 0,
    cwb: q.childrenWithBed ?? 0,
    cwob: q.childrenWithoutBed ?? 0,
    infants: q.infants ?? 0,
  };
  const perPax = {
    adult: Number(form.watch('perAdultPrice') ?? 0),
    cwb: Number(form.watch('perChildWithBedPrice') ?? 0),
    cwob: Number(form.watch('perChildWithoutBedPrice') ?? 0),
    infant: Number(form.watch('perInfantPrice') ?? 0),
  };
  const packageTotal =
    perPax.adult * pax.adults +
    perPax.cwb * pax.cwb +
    perPax.cwob * pax.cwob +
    perPax.infant * pax.infants;
  const packageMargin = packageTotal - Number(form.watch('netAmount') ?? 0);
  const currency = form.watch('currency');
  // Currency-aware money formatting (₹10,000.00, $10,000.00, …). Indian
  // grouping for INR; the runtime default locale for every other currency.
  const formatMoney = (value: number, digits = 2) => {
    const code = (currency || 'INR').toUpperCase();
    const safe = Number.isFinite(value) ? value : 0;
    try {
      return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : undefined, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(safe);
    } catch {
      return `${code} ${safe.toFixed(digits)}`;
    }
  };
  // Single shared pricing resolver for the builder. Every view (Summary &
  // Pricing, Pricing Breakdown and the summary card) reads the same numbers so
  // the grand total can never drift between them.
  const resolveCurrentPricing = (modeOverride?: string) =>
    resolveQuotationPricing({
      version: {
        pricingMode: modeOverride ?? form.watch('pricingMode'),
        finalAmount: packageTotal > 0 ? packageTotal : 0,
        currency,
        flightDetails: form.watch('flightDetails'),
        hotelDetails: form.watch('hotelDetails'),
        hotels: form.watch('hotels'),
        sightseeingDetails: form.watch('sightseeingDetails'),
        services: form.watch('services'),
        includeVisa: form.watch('includeVisa'),
        visaAmount: form.watch('visaAmount'),
        visaServiceCharge: form.watch('visaServiceCharge'),
        visaGstPercent: form.watch('visaGstPercent'),
        visaVfsCharge: form.watch('visaVfsCharge'),
        discountAmount: form.watch('discountAmount'),
        taxRate: form.watch('taxRate'),
        perAdultPrice: form.watch('perAdultPrice'),
        perChildWithBedPrice: form.watch('perChildWithBedPrice'),
        perChildWithoutBedPrice: form.watch('perChildWithoutBedPrice'),
        perInfantPrice: form.watch('perInfantPrice'),
      },
      quotation: {
        adults: pax.adults,
        childrenWithBed: pax.cwb,
        childrenWithoutBed: pax.cwob,
        infants: pax.infants,
        currency,
      },
    });
  // The Quotation Summary card's single total: the section total in
  // section-wise mode, otherwise the per-passenger package total (falling back
  // to the live itemized final total for legacy quotations with no
  // per-passenger prices). Add-ons are never shown as a separate bar — they
  // live inside the section total. The section-wise decision always comes from
  // the resolver's normalized pricing mode, never the raw form string, so the
  // summary card, the Pricing Breakdown tab and the Summary & Pricing tab can
  // never disagree about the mode.
  const livePricing = resolveCurrentPricing();
  // Switching the pricing method never deletes the other configuration — it
  // only changes which subtotal is authoritative. When the customer total
  // would change, the agent confirms first.
  const handlePricingMethodChange = (next: 'SECTION_WISE' | 'PER_PERSON') => {
    if (next === form.getValues('pricingMode')) return;
    const fromTotal = resolveCurrentPricing().grandTotal;
    const toTotal = resolveCurrentPricing(next).grandTotal;
    // Confirm only when BOTH methods carry a real price and the customer total
    // would change — switching to a not-yet-configured method is expected and
    // needs no confirmation.
    if (fromTotal > 0 && toTotal > 0 && fromTotal !== toTotal) {
      const confirmed = window.confirm(
        `Changing the pricing method will change the quotation total from ${formatMoney(fromTotal)} to ${formatMoney(toTotal)}. Continue?`,
      );
      if (!confirmed) return;
    }
    form.setValue('pricingMode', next, { shouldDirty: true });
  };
  const isSectionWisePricing = livePricing.pricingMode === 'SECTION_WISE';
  // The single authoritative builder total. In section-wise mode this is always
  // the resolver's sectionTotal. It also becomes the sectionTotal when the
  // quotation is section-priced (no per-person package price) even if the
  // stored pricing mode is the legacy TOTAL default — otherwise the summary
  // card would show ₹0 instead of the sum of the priced sections. A real
  // per-person package total always wins in TOTAL mode.
  const hasPackagePrice = packageTotal > 0;
  const summaryTotal =
    isSectionWisePricing || (!hasPackagePrice && livePricing.sectionTotal > 0)
      ? livePricing.grandTotal
      : hasPackagePrice
        ? livePricing.grandTotal
        : estimate.final;
  // Authoritative pricing-completeness issues (single shared validator, the
  // same one the backend enforces at finalization).
  const pricingIssues = validateQuotationPricing({
    version: {
      pricingMode: form.watch('pricingMode'),
      finalAmount: packageTotal > 0 ? packageTotal : 0,
      currency,
      flightDetails: form.watch('flightDetails'),
      hotelDetails: form.watch('hotelDetails'),
      hotels: form.watch('hotels'),
      sightseeingDetails: form.watch('sightseeingDetails'),
      services: form.watch('services'),
      includeVisa: form.watch('includeVisa'),
      visaAmount: form.watch('visaAmount'),
      visaServiceCharge: form.watch('visaServiceCharge'),
      visaGstPercent: form.watch('visaGstPercent'),
      visaVfsCharge: form.watch('visaVfsCharge'),
      discountAmount: form.watch('discountAmount'),
      taxRate: form.watch('taxRate'),
      perAdultPrice: form.watch('perAdultPrice'),
      perChildWithBedPrice: form.watch('perChildWithBedPrice'),
      perChildWithoutBedPrice: form.watch('perChildWithoutBedPrice'),
      perInfantPrice: form.watch('perInfantPrice'),
    },
    quotation: {
      adults: pax.adults,
      childrenWithBed: pax.cwb,
      childrenWithoutBed: pax.cwob,
      infants: pax.infants,
      currency,
    },
  });
  const validationMessageFor = (path: string, message: string) => {
    const serviceMatch = path.match(/^services\.(\d+)\.(.+)$/);
    if (serviceMatch) {
      const index = Number(serviceMatch[1]);
      const fieldName = serviceMatch[2];
      const service = form.getValues(`services.${index}` as FieldPath<QuotationVersionInput>) as
        QuotationVersionInput['services'][number] | undefined;
      const label =
        service?.serviceType === 'CRUISE'
          ? 'Cruise'
          : service?.serviceType === 'VEHICLE_TRANSFER'
            ? 'Vehicle'
            : service?.serviceType === 'OTHER_ADD_ON'
              ? 'Add-on service'
              : service?.serviceType === 'SIGHTSEEING'
                ? 'Sightseeing service'
                : service?.serviceType === 'FLIGHT'
                  ? 'Flight service'
                  : 'Service';
      if (fieldName === 'description' && /characters|too long/i.test(message))
        return `${label} ${index + 1} description is too long.`;
      if (fieldName === 'name') return `${label} ${index + 1} needs a name.`;
      return `${label} ${index + 1}: ${message}`;
    }
    const hotelMatch = path.match(/^hotels\.(\d+)\.(.+)$/);
    if (hotelMatch) {
      const index = Number(hotelMatch[1]) + 1;
      const fieldName = hotelMatch[2];
      if (fieldName === 'hotelName') return `Hotel stay ${index} needs a hotel name.`;
      if (fieldName === 'images') return `Hotel stay ${index} images could not be read.`;
      return `Hotel stay ${index}: ${message}`;
    }
    if (path === 'inclusionsHtml') return 'Inclusions content is too long.';
    if (path === 'exclusionsHtml') return 'Exclusions content is too long.';
    if (path === 'title') return 'Quotation title is required.';
    if (path === 'destinationSummary') return 'Destination summary is required.';
    if (path === 'currency') return 'Currency must be a 3-letter code.';
    if (path.includes('images')) return 'One image gallery could not be read.';
    return `${path.replace(/\.\d+\./g, ' ').replace(/\./g, ' ')}: ${message}`;
  };

  const submit = form.handleSubmit(
    (value) => {
      if (
        value.flightDetails?.entryMode !== 'IMAGE' &&
        hasInvalidFlightTiming(value.flightDetails)
      ) {
        setInvalidFields([
          'flightDetails: Arrival date and time must be after departure date and time.',
        ]);
        setActiveTab('flight');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setInvalidFields([]);
      const seq = <T extends object>(rows: T[]) =>
        rows.map((row, index) => ({ ...row, sequence: index + 1 }));
      // Persist the auto-calculated segment durations (the field is read-only UI).
      const withDurations = (
        journey: NonNullable<QuotationVersionInput['flightDetails']>['outbound'],
      ) => ({
        ...journey,
        segments: (journey.segments ?? []).map((s) => ({
          ...s,
          duration:
            computeDuration(s.departureDate, s.departureTime, s.arrivalDate, s.arrivalTime) ||
            s.duration ||
            null,
        })),
      });
      const flightDetails = value.flightDetails
        ? {
            ...value.flightDetails,
            outbound:
              value.flightDetails.entryMode === 'IMAGE'
                ? value.flightDetails.outbound
                : withDurations(value.flightDetails.outbound),
            returnJourney:
              value.flightDetails.entryMode === 'IMAGE'
                ? value.flightDetails.returnJourney
                : withDurations(value.flightDetails.returnJourney),
          }
        : value.flightDetails;
      // The reference Vehicle tab is one structured vehicle configuration. It
      // is stored as the existing vehicle service snapshot so old quotations,
      // pricing and master-reference validation continue to work unchanged.
      const nonVehicleServices = value.services.filter(
        (service) => service.serviceType !== 'VEHICLE_TRANSFER',
      );
      const vehicleService =
        vehicleDraft.include && vehicleDraft.vehicleModel.trim()
          ? {
              serviceType: 'VEHICLE_TRANSFER' as const,
              ...CLEARED_SERVICE_MASTERS,
              vehicleId: vehicleDraft.vehicleId || null,
              name: vehicleDraft.vehicleModel.trim(),
              description: vehicleDraft.description || null,
              dayNumber: null,
              // Vehicle type is the customer-facing snapshot for this section.
              city: vehicleDraft.vehicleType.trim() || null,
              // The rate is per pricing basis; quantity is days/hours/transfers.
              quantity: Math.max(1, Number(vehicleDraft.quantity) || 1),
              pricingBasis: (vehicleDraft.pricingBasis || 'PER_DAY') as never,
              internalCost: 0,
              sellingPrice: Number(vehicleDraft.amount) || 0,
              // Section title and usage are preserved in the two existing
              // customer-safe snapshot fields.
              taxCategory: vehicleDraft.sectionTitle.trim() || 'Transportation',
              notes: vehicleDraft.usage.trim() || null,
              images: vehicleDraft.images,
              imageSnapshotPresent: vehicleDraft.imageSnapshotPresent,
              pdfImageUrl: vehicleDraft.pdfImageUrl,
              sequence: nonVehicleServices.length + 1,
            }
          : null;
      const submittedServices = vehicleService
        ? [...nonVehicleServices, vehicleService]
        : nonVehicleServices;
      // Excluded sections are removed from the persisted snapshot (vehicle uses
      // its draft flag; Cruise uses the tab's include checkbox).
      const persistedServices = excluded.cruise
        ? submittedServices.filter((service) => service.serviceType !== 'CRUISE')
        : submittedServices;
      save.mutate(
        {
          ...value,
          flightDetails,
          hotelDetails: {
            sectionTitle: value.hotelDetails?.sectionTitle ?? 'Your Hotels',
            amount: value.hotelDetails?.amount ?? 0,
            description: value.hotelDetails?.description ?? null,
            include: !excludedRef.current.hotel,
            // Persist the bookmark image order and the "Use in PDF" selection
            // so the weblink carousel and the generated PDF survive re-saves.
            images: value.hotelDetails?.images ?? [],
            pdfImageUrl: value.hotelDetails?.pdfImageUrl ?? null,
          },
          addOnDetails: {
            include: value.addOnDetails?.include !== false,
            sectionTitle: value.addOnDetails?.sectionTitle ?? 'Additional Services',
          },
          sightseeingDetails: value.sightseeingDetails
            ? {
                ...value.sightseeingDetails,
                days: value.sightseeingDetails.days.map((day, dayIndex) => ({
                  ...day,
                  dayNumber: dayIndex + 1,
                  title: formatItineraryDayTitle(dayIndex + 1, day.title),
                  activities: day.activities.map((activity, activityIndex) => ({
                    ...activity,
                    sequence: activityIndex + 1,
                  })),
                })),
              }
            : value.sightseeingDetails,
          itinerary: seq(value.itinerary).map((row, index) => ({ ...row, dayNumber: index + 1 })),
          hotels: seq(value.hotels)
            .map((hotel) => {
              // Untouched default allocations are dropped; partially filled
              // ones are kept so validation reports the exact room number.
              const roomLines = (hotel.roomLines ?? []).filter(roomLineHasData);
              const mealPlanLines = (hotel.mealPlanLines ?? []).filter(mealLineHasData);
              const firstRoom = roomLines[0];
              const firstMeal = mealPlanLines[0];
              return {
                ...hotel,
                // Persist the calendar-date-derived nights whenever valid dates
                // exist, so re-saving repairs historical incorrect night counts.
                nights: hotelStayNights(hotel.checkInDate, hotel.checkOutDate) ?? hotel.nights,
                roomLines,
                mealPlanLines,
                // Mirror the first allocation onto the legacy scalar columns so
                // older readers (PDF fallbacks, booking import, exports) always
                // see a coherent snapshot; `rooms` is the total across ALL
                // allocations.
                ...(roomLines.length
                  ? {
                      hotelRoomTypeId: firstRoom?.hotelRoomTypeId ?? null,
                      roomType: firstRoom?.roomType ?? null,
                      rooms: roomLines.reduce((sum, line) => sum + (Number(line.rooms) || 1), 0),
                      extraBedQuantity: firstRoom?.extraBedQuantity ?? null,
                      extraBedPrice: firstRoom?.extraBedPrice ?? null,
                      childWithoutBedQuantity: firstRoom?.childWithoutBedQuantity ?? null,
                      childWithoutBedPrice: firstRoom?.childWithoutBedPrice ?? null,
                      baseRoomPrice: firstRoom?.baseRoomPrice ?? null,
                      pricingSource: firstRoom?.pricingSource ?? null,
                    }
                  : {}),
                ...(mealPlanLines.length
                  ? {
                      hotelMealPlanId: firstMeal?.hotelMealPlanId ?? null,
                      mealPlan: firstMeal?.mealPlan ?? null,
                    }
                  : {}),
              };
            })
            // Draft Hotel Stays added via "Add Stay Before/After" but never
            // named have no hotel name — they must not be persisted (the API
            // also rejects empty hotel rows).
            .filter((hotel) => (hotel.hotelName ?? '').trim().length > 0),
          customCharges: (value.customCharges ?? [])
            .filter((c) => c.label?.trim() && Number(c.amount) > 0)
            .map((c) => ({
              label: c.label!.trim(),
              amount: Number(c.amount),
              description: (c as { description?: string | null }).description?.trim() || null,
              category: (c as { category?: string | null }).category?.trim() || null,
            })),
          services: seq(
            (persistedServices as unknown as QuotationVersionInput['services']).map((service: QuotationVersionInput['services'][number]) => {
                if ((service as unknown as { serviceType: string })?.serviceType !== 'CRUISE') return service;
                const svc = service as unknown as QuotationVersionInput['services'][number] & {
                  cruiseRoomLines?: QuotationCruiseRoomLine[];
                  cruiseNights?: number | null;
                  quantity?: number;
                  sellingPrice?: number;
                };
                const lines = ((svc as unknown as { cruiseRoomLines?: QuotationCruiseRoomLine[] }).cruiseRoomLines ?? []).filter(cruiseRoomLineHasData) as QuotationCruiseRoomLine[];
                // Keep partially filled lines for validation; drop untouched defaults
                const nights = (svc as unknown as { cruiseNights?: number | null }).cruiseNights ?? 2;
                const total = lines.reduce((sum: number, line: QuotationCruiseRoomLine) => {
                  const rate = (line.roomRate ?? line.sellingPrice ?? 0) as number;
                  const rooms = (line.rooms ?? 1) as number;
                  return sum + Number(rate || 0) * Number(rooms || 1) * Number(nights || 1);
                }, 0);
                return {
                  ...(svc as unknown as Record<string, unknown>),
                  cruiseRoomLines: lines,
                  // Mirror total for legacy readers (PDF fallback) – quantity stays 1, sellingPrice is total
                  quantity: 1,
                  sellingPrice: total,
                  ...(lines[0] ? { cruiseRoomTypeId: (lines[0] as QuotationCruiseRoomLine).cruiseRoomTypeId ?? null, city: (lines[0] as QuotationCruiseRoomLine).roomType ?? null } : {}),
                } as unknown as QuotationVersionInput['services'][number];
              })
              .filter((service) => {
                if ((service as unknown as { serviceType: string })?.serviceType === 'CRUISE') {
                  const svc = service as unknown as { name?: string | null; cruiseId?: string | null };
                  return Boolean((svc.name ?? '').trim() || svc.cruiseId);
                }
                return true;
              }),
          ),
          inclusions: seq(value.inclusions),
          exclusions: seq(value.exclusions),
          terms: seq(value.terms),
          faqs: (value.faqs ?? [])
            .map((row) => ({
              question: (row.question ?? '').trim(),
              answer: (row.answer ?? '').trim(),
            }))
            .filter((row) => row.question && row.answer),
          weblinkSectionOrder: value.weblinkSectionOrder?.length
            ? resolveWeblinkSectionOrder(value.weblinkSectionOrder)
            : null,
          destinationExpertConfig: value.destinationExpertConfig
            ? {
                enabled: Boolean(value.destinationExpertConfig.enabled),
                expertUserId: value.destinationExpertConfig.expertUserId ?? null,
                heading: (value.destinationExpertConfig.heading ?? '').trim() || null,
                customIntroduction:
                  (value.destinationExpertConfig.customIntroduction ?? '').trim() || null,
                whatsappNumber:
                  ((value.destinationExpertConfig as unknown as Record<string, unknown>).whatsappNumber as string | null | undefined)?.trim() || null,
                callNumber:
                  ((value.destinationExpertConfig as unknown as Record<string, unknown>).callNumber as string | null | undefined)?.trim() || null,
                email:
                  ((value.destinationExpertConfig as unknown as Record<string, unknown>).email as string | null | undefined)?.trim().toLowerCase() || null,
                showWhatsapp: value.destinationExpertConfig.showWhatsapp !== false,
                showCall: value.destinationExpertConfig.showCall !== false,
                showEmail: value.destinationExpertConfig.showEmail !== false,
                showExperience: value.destinationExpertConfig.showExperience !== false,
                showTripsPlanned: value.destinationExpertConfig.showTripsPlanned !== false,
                  showLanguages: value.destinationExpertConfig.showLanguages !== false,
                  jobTitle: ((value.destinationExpertConfig as unknown as Record<string, unknown>).jobTitle as string | null | undefined)?.trim() || null,
                  bio: ((value.destinationExpertConfig as unknown as Record<string, unknown>).bio as string | null | undefined)?.trim() || null,
                  specialization: ((value.destinationExpertConfig as unknown as Record<string, unknown>).specialization as string | null | undefined)?.trim() || null,
                  yearsOfExperience: (value.destinationExpertConfig as unknown as { yearsOfExperience?: number | null }).yearsOfExperience ?? null,
                  tripsPlanned: (value.destinationExpertConfig as unknown as { tripsPlanned?: number | null }).tripsPlanned ?? null,
                  languages: ((value.destinationExpertConfig as unknown as Record<string, unknown>).languages as string | null | undefined)?.trim() || null,
                  gender: ((value.destinationExpertConfig as unknown as Record<string, unknown>).gender as string | null | undefined) as 'MALE' | 'FEMALE' | null ?? null,
                  profileImageUrl: ((value.destinationExpertConfig as unknown as Record<string, unknown>).profileImageUrl as string | null | undefined)?.trim() || null,
                  destination: ((value.destinationExpertConfig as unknown as Record<string, unknown>).destination as string | null | undefined)?.trim() || null,
                } as unknown as NonNullable<QuotationVersionInput['destinationExpertConfig']>
              : null,
        },
        {
          onSuccess: () => {
            if (initialSnapshotRef.current.autoSaving) {
              initialSnapshotRef.current.autoSaving = false;
              return;
            }
            navigate(`/quotations/${quotationId}`);
          },
          onError: () => {
            initialSnapshotRef.current.autoSaving = false;
          },
        },
      );
    },
    (errors) => {
      // Surface why a save was blocked instead of failing silently.
      const paths: string[] = [];
      const walk = (node: unknown, prefix: string) => {
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (typeof record.message === 'string') {
          paths.push(validationMessageFor(prefix.replace(/\.$/, ''), record.message));
          return;
        }
        for (const key of Object.keys(record)) {
          if (key === 'ref' || key === 'type') continue;
          walk(record[key], `${prefix}${key}.`);
        }
      };
      walk(errors, '');
      setInvalidFields(paths.slice(0, 15));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  );

  const isIncluded = (key: string) => !excluded[key];
  const toggleInclude = (key: string) => {
    // Any explicit toggle is a user choice: automatic prefill from the Lead must
    // never re-enable a section afterwards.
    autoToggleRef.current.add(key);
    if (key === 'hotel') autoHotelRef.current.userToggledHotel = true;
    const next = !excluded[key];
    setExcluded((current) => ({ ...current, [key]: next }));
    // Turning Hotel off (`next === true` → excluded) must drop any stale Hotel
    // field errors immediately so an empty hidden row cannot keep blocking a
    // draft save. Other sections' errors are left untouched.
    if (key === 'hotel' && next) {
      form.clearErrors(['hotels', 'hotelDetails']);
      setInvalidFields((current) =>
        current.filter((entry) => !/^(hotels|hotelDetails)(\.|:)/.test(entry)),
      );
    }
    // Turning Cruise on auto-creates exactly one clean entry when none exist,
    // or fills the empty section title of an existing entry; turning it off
    // clears its service-row errors (only the CRUISE rows).
    if (key === 'cruise') {
      if (!next) {
        const cruiseIndexes = (services.fields ?? [])
          .map((_, index) => index)
          .filter((index) => watchedServices?.[index]?.serviceType === 'CRUISE');
        if (!cruiseIndexes.length) {
          services.append(newCruiseServiceRow(services.fields.length + 1));
        } else {
          // Never replace a custom title — only fill an empty/whitespace one.
          const primaryIndex = cruiseIndexes[0]!;
          const current = watchedServices?.[primaryIndex]?.taxCategory;
          if (!(current ?? '').trim())
            applyService(primaryIndex, { taxCategory: 'Cruise Details' });
        }
      } else {
        const cruiseIndexes = (services.fields ?? [])
          .map((_, index) => index)
          .filter((index) => watchedServices?.[index]?.serviceType === 'CRUISE');
        if (cruiseIndexes.length) {
          form.clearErrors(
            cruiseIndexes.map((index) => `services.${index}` as FieldPath<QuotationVersionInput>),
          );
          setInvalidFields((current) =>
            current.filter((entry) => {
              const match = entry.match(/^services\.(\d+)/);
              return !(match && cruiseIndexes.includes(Number(match[1])));
            }),
          );
        }
      }
    }
  };

  /** A coloured section header bar like the reference tabs' bodies. */
  const IncludeBar = ({ tabKey, label }: { tabKey: string; label: string }) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={isIncluded(tabKey)} onChange={() => toggleInclude(tabKey)} />
      Include {label} in Quotation
    </label>
  );

  /** Render the service rows belonging to a tab, plus an add button. */
  const serviceTab = (tab: TabDef) => {
    const types = tab.types ?? [];
    const rows = services.fields
      .map((row, index) => ({ row, index }))
      .filter(({ index }) =>
        types.includes((watchedServices?.[index]?.serviceType ?? 'SIGHTSEEING') as ServiceType),
      );
    return (
      <div className="space-y-4">
        <IncludeBar tabKey={tab.key} label={tab.label} />
        {isIncluded(tab.key) && (
          <>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  services.append({
                    serviceType: types[0] ?? 'OTHER_ADD_ON',
                    ...CLEARED_SERVICE_MASTERS,
                    name: '',
                    description: null,
                    dayNumber: null,
                    city: null,
                    quantity: 1,
                    internalCost: 0,
                    sellingPrice: 0,
                    taxCategory: null,
                    notes: null,
                    sequence: services.fields.length + 1,
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add {tab.label}
              </Button>
            </div>
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No {tab.label.toLowerCase()} added yet.
              </p>
            )}
            {rows.map(({ row, index }) => (
              <article key={row.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                <select
                  aria-label="Service type"
                  {...form.register(`services.${index}.serviceType`, {
                    onChange: () => applyService(index, CLEARED_SERVICE_MASTERS),
                  })}
                  className={field}
                >
                  {(tab.types ?? []).map((value) => (
                    <option key={value} value={value}>
                      {labelForLookup(value)}
                    </option>
                  ))}
                </select>
                <ServiceMasterFields
                  serviceType={watchedServices?.[index]?.serviceType ?? 'SIGHTSEEING'}
                  value={{
                    airlineId: watchedServices?.[index]?.airlineId,
                    cruiseId: watchedServices?.[index]?.cruiseId,
                    cruiseRoomTypeId: watchedServices?.[index]?.cruiseRoomTypeId,
                    vehicleId: watchedServices?.[index]?.vehicleId,
                    sightseeingId: watchedServices?.[index]?.sightseeingId,
                    addOnServiceId: watchedServices?.[index]?.addOnServiceId,
                  }}
                  onChange={(patch) => applyService(index, patch)}
                />
                <input
                  aria-label="Service name"
                  placeholder="Name / title"
                  {...form.register(`services.${index}.name`)}
                  className={field}
                />
                <input
                  aria-label="Service city"
                  placeholder="City"
                  {...form.register(`services.${index}.city`)}
                  className={field}
                />
                <input
                  aria-label="Service day"
                  type="number"
                  placeholder="Day"
                  {...form.register(`services.${index}.dayNumber`, { setValueAs: nullable })}
                  className={field}
                />
                <input
                  aria-label="Quantity"
                  type="number"
                  step="0.01"
                  placeholder="Qty"
                  {...form.register(`services.${index}.quantity`, {
                    setValueAs: (value) => {
                      const parsed = Number(value);
                      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                    },
                  })}
                  className={field}
                />
                {canCost && (
                  <input
                    aria-label="Service unit cost"
                    type="number"
                    step="0.01"
                    placeholder="Unit cost"
                    {...form.register(`services.${index}.internalCost`, { setValueAs: nullable })}
                    className={field}
                  />
                )}
                <input
                  aria-label="Service unit selling"
                  type="number"
                  step="0.01"
                  placeholder="Selling price"
                  {...form.register(`services.${index}.sellingPrice`, { setValueAs: nullable })}
                  className={field}
                />
                <textarea
                  aria-label="Service description"
                  rows={2}
                  placeholder="Description"
                  {...form.register(`services.${index}.description`)}
                  className={`${field} md:col-span-3`}
                />
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" onClick={() => services.remove(index)}>
                    <Trash2 className="h-4 w-4 text-red-600" /> Remove
                  </Button>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    );
  };

  /** Reference Vehicle tab: one vehicle master with exactly the requested fields. */
  const vehicleTab = () => {
    const masters = vehicleMasters.data?.data ?? [];
    const vehicleTypes = [...new Set(masters.map((master) => master.vehicleType).filter(Boolean))]
      .concat(
        vehicleDraft.vehicleType && !masters.some((m) => m.vehicleType === vehicleDraft.vehicleType)
          ? [vehicleDraft.vehicleType]
          : [],
      )
      .sort((a, b) => a.localeCompare(b));
    const models = vehicleDraft.vehicleType
      ? masters.filter((master) => master.vehicleType === vehicleDraft.vehicleType)
      : [];

    return (
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={vehicleDraft.include}
            onChange={(event) =>
              setVehicleDraft((current) => ({ ...current, include: event.target.checked }))
            }
          />
          Include Vehicle in Quotation
        </label>

        {vehicleDraft.include && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">
                Section Title
                <input
                  aria-label="Vehicle section title"
                  maxLength={80}
                  value={vehicleDraft.sectionTitle}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({
                      ...current,
                      sectionTitle: event.target.value,
                    }))
                  }
                  className={`${field} mt-1`}
                />
              </label>
              {(form.watch('pricingMode') as string) === 'SECTION_WISE' && (
              <label className="text-sm font-semibold text-slate-800">
                Rate
                <div className="mt-1 flex rounded-lg border border-slate-300 bg-card focus-within:ring-2 focus-within:ring-brand-500">
                  <span className="flex items-center border-r px-3 text-sm text-slate-500">
                    {currency}
                  </span>
                  <input
                    aria-label="Vehicle amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={vehicleDraft.amount}
                    onChange={(event) =>
                      setVehicleDraft((current) => ({
                        ...current,
                        amount: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    className="w-full rounded-r-lg bg-transparent px-3 py-2 text-sm outline-none"
                  />
                </div>
              </label>
              )}
            </div>

            {(form.watch('pricingMode') as string) === 'SECTION_WISE' && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-800">
                Pricing Basis
                <select
                  aria-label="Vehicle pricing basis"
                  value={vehicleDraft.pricingBasis}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({
                      ...current,
                      pricingBasis: event.target.value,
                    }))
                  }
                  className={`${field} mt-1`}
                >
                  {VEHICLE_PRICING_BASES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-800">
                {vehicleDraft.pricingBasis === 'PER_HOUR'
                  ? 'Hours'
                  : vehicleDraft.pricingBasis === 'PER_TRANSFER'
                    ? 'Transfers'
                    : vehicleDraft.pricingBasis === 'PER_VEHICLE'
                      ? 'Vehicles'
                      : 'Days'}
                <input
                  aria-label="Vehicle quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={vehicleDraft.quantity}
                  disabled={vehicleDraft.pricingBasis === 'FIXED'}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({
                      ...current,
                      quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                    }))
                  }
                  className={`${field} mt-1 disabled:bg-slate-100`}
                />
              </label>
              <div className={`${calculatedCard} text-sm`}>
                <p className={calculatedLabel}>
                  Calculation
                </p>
                <p className="mt-1 text-slate-700">
                  {formatMoney(vehicleDraft.amount)} ×{' '}
                  {vehicleDraft.pricingBasis === 'FIXED' ? 1 : vehicleDraft.quantity} ={' '}
                  <span className={calculatedValue}>
                    {formatMoney(
                      vehicleDraft.amount *
                        (vehicleDraft.pricingBasis === 'FIXED' ? 1 : vehicleDraft.quantity),
                    )}
                  </span>
                </p>
              </div>
            </div>
            )}
            {(form.watch('pricingMode') as string) === 'SECTION_WISE' && <div className={`${calculatedCard} flex items-center justify-between`}><span className={calculatedLabel}>Transportation Total</span><span className={calculatedValue}>{formatMoney(vehicleDraft.amount * (vehicleDraft.pricingBasis === 'FIXED' ? 1 : vehicleDraft.quantity))}</span></div>}

            <div>
              <p className={`${subsectionHeading} mb-3 border-b border-border/50 pb-1`}>Vehicle Details</p>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-semibold text-slate-800">
                  Vehicle Type <span className="text-red-500">*</span>
                <select
                  aria-label="Vehicle type"
                  value={vehicleDraft.vehicleType}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({
                      ...current,
                      vehicleType: event.target.value,
                      vehicleId: '',
                      vehicleModel: '',
                      images: [],
                      imageSnapshotPresent: false,
                      pdfImageUrl: null,
                    }))
                  }
                  className={`${field} mt-1`}
                >
                  <option value="">Select Vehicle Type</option>
                  {vehicleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Vehicle Model <span className="text-red-500">*</span>
                <select
                  aria-label="Vehicle model"
                  value={vehicleDraft.vehicleId}
                  disabled={!vehicleDraft.vehicleType || vehicleMasters.isPending}
                  onChange={(event) => {
                    const master = masters.find((entry) => entry.id === event.target.value);
                    const snapshot = masterGallerySnapshot(
                      master?.images,
                      master?.name ?? 'Vehicle',
                    );
                    // Changing vehicle model resets manual description override and auto-fills from master
                    vehicleDescriptionOverriddenRef.current = false;
                    setVehicleDraft((current) => {
                      const masterPrice = (master as unknown as { price?: number | null })?.price;
                      const isEmpty = current.amount == null || Number(current.amount) === 0;
                      const shouldPrefill =
                        masterPrice != null && Number(masterPrice) > 0 && isEmpty;
                      return {
                        ...current,
                        vehicleId: master?.id ?? '',
                        vehicleModel: master?.name ?? '',
                        description: master?.description ?? '',
                        images: snapshot,
                        imageSnapshotPresent: masterGalleryPresence(master),
                        pdfImageUrl: snapshot[0]
                          ? quotationSnapshotImageIdentity(snapshot[0])
                          : null,
                        ...(shouldPrefill ? { amount: Number(masterPrice) } : {}),
                      };
                    });
                    if (master)
                      void importMasterGalleryPreviews(master.id, snapshot, vehicleImageUrl).then(
                        (images) => {
                          setVehicleDraft((current) =>
                            current.vehicleId === master.id
                              ? {
                                  ...current,
                                  images: mergeMasterGalleryPreviews(current.images, images),
                                }
                              : current,
                          );
                        },
                      );
                  }}
                  className={`${field} mt-1 disabled:bg-slate-100`}
                >
                  <option value="">Select Vehicle Model</option>
                  {models.map((master) => (
                    <option key={master.id} value={master.id}>
                      {master.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Usage / Duration
                <input
                  aria-label="Vehicle usage or duration"
                  maxLength={2000}
                  placeholder="e.g., Airport transfers & sightseeing"
                  value={vehicleDraft.usage}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({ ...current, usage: event.target.value }))
                  }
                  className={`${field} mt-1`}
                />
              </label>
              </div>
            </div>

            <div>
              <h3 className={`${subsectionHeadingMuted} mb-1`}>Description</h3>
              <RichTextEditor
                ariaLabel="Vehicle description"
                value={vehicleDraft.description}
                onChange={(html) => {
                  vehicleDescriptionOverriddenRef.current = true;
                  setVehicleDraft((current) => ({ ...current, description: html }));
                }}
              />
            </div>
            <QuotationImageManager
              label="Vehicle Images"
              ariaPrefix="vehicle"
              images={vehicleDraft.images}
              pdfImageUrl={vehicleDraft.pdfImageUrl}
              onMove={moveVehicleImage}
              onRemove={removeVehicleImage}
              onSelectPdf={(identity) =>
                setVehicleDraft((current) => ({ ...current, pdfImageUrl: identity }))
              }
            />
          </>
        )}
      </div>
    );
  };

  const hotelRows = hotels.fields.map((row, index) => ({ row, index }));
  const defaultHotelRows = hotelRows.filter(
    ({ index }) => watchedHotels?.[index]?.selected !== false,
  );
  const alternativeHotelRows = hotelRows.filter(
    ({ index }) => watchedHotels?.[index]?.selected === false,
  );

  const hotelCard = (index: number, rowId: string, allowInsertBefore = false) => {
    const hotel = watchedHotels?.[index];
    // Nights are derived from the hotel's own check-in/check-out calendar dates
    // and written back to the snapshot whenever either date changes.
    const setStayDate = (field: 'checkInDate' | 'checkOutDate', value: Date | null) => {
      form.setValue(`hotels.${index}.${field}`, value, { shouldDirty: true });
      const checkIn = field === 'checkInDate' ? value : (hotel?.checkInDate ?? null);
      const checkOut = field === 'checkOutDate' ? value : (hotel?.checkOutDate ?? null);
      const computed = hotelStayNights(checkIn, checkOut);
      if (computed !== null)
        form.setValue(`hotels.${index}.nights`, computed, { shouldDirty: true });
    };
    const displayNights =
      hotelStayNights(hotel?.checkInDate, hotel?.checkOutDate) ?? hotel?.nights ?? '';
    return (
      <article
        key={rowId}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-expanded={(expandedHotels[rowId] ?? false) ? 'true' : 'false'}
              aria-label={`${expandedHotels[rowId] ? 'Collapse' : 'Expand'} hotel stay ${index + 1}`}
              title={`${expandedHotels[rowId] ? 'Collapse' : 'Expand'} hotel stay ${index + 1}`}
              onClick={() =>
                setExpandedHotels((current) => ({
                  ...current,
                  [rowId]: !(current[rowId] ?? false),
                }))
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <ChevronDown
                aria-hidden="true"
                className={`h-5 w-5 transition-transform ${expandedHotels[rowId] ? 'rotate-180' : ''}`}
              />
            </button>
            <div>
              {hotel?.hotelName?.trim() ? (
                <>
                  <h4 className="font-semibold text-slate-800">{hotel.hotelName}</h4>
                  {hotel?.city?.trim() ? (
                    <p className="text-xs text-slate-500">{hotel.city}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-slate-800">Hotel Stay</h4>
                  <p className="text-xs text-slate-500">
                    Choose the hotel, stay dates and room details.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={index === 0}
              aria-label={`Move hotel stay ${index + 1} up`}
              onClick={() => hotels.move(index, index - 1)}
            >
              <ArrowUp className="h-4 w-4" /> Up
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={index === hotels.fields.length - 1}
              aria-label={`Move hotel stay ${index + 1} down`}
              onClick={() => hotels.move(index, index + 1)}
            >
              Down <ArrowDown className="h-4 w-4" />
            </Button>
            {allowInsertBefore && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Add hotel stay before stay ${index + 1}`}
                onClick={() => insertHotelBefore(index)}
              >
                <Plus className="h-4 w-4" /> Add Stay Before
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Add hotel stay after stay ${index + 1}`}
              onClick={() => insertHotelAfter(index)}
            >
              <Plus className="h-4 w-4" /> Add Stay After
            </Button>
            <Button size="sm" variant="ghost" onClick={() => hotels.remove(index)}>
              <Trash2 className="h-4 w-4 text-red-600" /> Remove
            </Button>
          </div>
        </header>

        {(expandedHotels[rowId] ?? false) && (
          <>
            <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-5">
                <div>
                  <p className={`${subsectionHeading} mb-3 border-b border-border/50 pb-1`}>Hotel Details</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <HotelMasterFields
                    canCost={canCost}
                    preferredCity={hotel?.city ?? undefined}
                    showLabels
                    hotelOnly
                    value={{
                      hotelId: hotel?.hotelId,
                      hotelRoomTypeId: hotel?.hotelRoomTypeId,
                      hotelMealPlanId: hotel?.hotelMealPlanId,
                    }}
                    roomTypeText={hotel?.roomType}
                    mealPlanText={hotel?.mealPlan}
                    hotelNameText={hotel?.hotelName}
                    onChange={(patch) => applyHotel(index, patch)}
                    onMasterSelect={(_hotelId, masterImages, name) => {
                      const snapshot = masterGallerySnapshot(masterImages, name);
                      const patch: HotelRowPatch = {
                        images: snapshot,
                        imageSnapshotPresent: Array.isArray(masterImages) ? true : undefined,
                        pdfImageUrl: snapshot[0]
                          ? quotationSnapshotImageIdentity(snapshot[0])
                          : null,
                      };
                      const master = (hotelMasters.data?.data ?? []).find(
                        (hotel) => hotel.id === _hotelId,
                      ) as unknown as {
                        price?: number | null;
                        seasons?: Array<{
                          startDate: string;
                          endDate: string;
                          price: number | null;
                        }>;
                      };
                      const masterPrice = hotelRateForDate(master, hotel?.checkInDate);
                      if (masterPrice != null && Number(masterPrice) > 0) {
                        const current = form.getValues(`hotels.${index}.sellingPrice` as never) as unknown;
                        const isEmpty =
                          current == null ||
                          current === '' ||
                          (typeof current === 'number' && current === 0) ||
                          Number(current) === 0;
                        if (isEmpty) patch.sellingPrice = Number(masterPrice);
                        // Prefill the section-wise Hotel Amount from the master
                        // price too, so the section breakdown, weblink and PDFs
                        // show it. Only when the section amount is still empty —
                        // the employee can always edit it afterwards, and it is
                        // never re-linked to the master.
                        const sectionAmount = form.getValues(
                          'hotelDetails.amount' as never,
                        ) as unknown;
                        const sectionEmpty =
                          sectionAmount == null ||
                          sectionAmount === '' ||
                          Number(sectionAmount) === 0;
                        if (sectionEmpty)
                          form.setValue('hotelDetails.amount', Number(masterPrice) as never, {
                            shouldDirty: true,
                          });
                      }
                      applyHotel(index, patch);
                    }}
                  />
                  </div>
                </div>

                <p className={`${subsectionHeadingMuted} border-b border-border/50 pb-1`}>Stay Dates</p>
                <div className="grid gap-3 md:grid-cols-5">
                  <label className="text-sm font-semibold text-slate-800">
                    City <span className="text-xs font-normal text-muted-foreground">· from master</span>
                    <input
                      aria-label="Hotel city"
                      value={hotel?.city ?? ''}
                      readOnly
                      className={`${fieldMuted} mt-1`}
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Check-In <span className="text-red-500">*</span>
                    <input
                      aria-label="Hotel check-in"
                      type="date"
                      value={toDate(hotel?.checkInDate)}
                      onChange={(event) =>
                        setStayDate(
                          'checkInDate',
                          event.target.value ? new Date(event.target.value) : null,
                        )
                      }
                      className={`${field} mt-1`}
                    />
                    <input
                      {...form.register(`hotels.${index}.checkInTime`)}
                      aria-label="Hotel check-in time"
                      type="time"
                      value={hotel?.checkInTime ?? ''}
                      onChange={(event) => {
                        const time = event.target.value || null;
                        form.setValue(`hotels.${index}.checkInTime`, time, {
                          shouldDirty: true,
                        });
                        form.setValue(`hotels.${index}.showCheckInTime`, Boolean(time), {
                          shouldDirty: true,
                        });
                      }}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Check-Out <span className="text-red-500">*</span>
                    <input
                      aria-label="Hotel check-out"
                      type="date"
                      value={toDate(hotel?.checkOutDate)}
                      onChange={(event) =>
                        setStayDate(
                          'checkOutDate',
                          event.target.value ? new Date(event.target.value) : null,
                        )
                      }
                      className={`${field} mt-1`}
                    />
                    <input
                      {...form.register(`hotels.${index}.checkOutTime`)}
                      aria-label="Hotel check-out time"
                      type="time"
                      value={hotel?.checkOutTime ?? ''}
                      onChange={(event) => {
                        const time = event.target.value || null;
                        form.setValue(`hotels.${index}.checkOutTime`, time, {
                          shouldDirty: true,
                        });
                        form.setValue(`hotels.${index}.showCheckOutTime`, Boolean(time), {
                          shouldDirty: true,
                        });
                      }}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    <span className={calculatedLabel}>Nights</span>
                    <input
                      aria-label="Hotel nights"
                      readOnly
                      value={String(displayNights)}
                      className={`${fieldMuted} mt-1`}
                    />
                    <span className="text-[11px] text-muted-foreground">calculated from dates</span>
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    <span className={calculatedLabel}>Total Rooms</span>
                    <input
                      aria-label="Hotel total rooms"
                      readOnly
                      value={String(
                        (hotel?.roomLines ?? []).reduce(
                          (sum, line) => sum + (Number(line?.rooms) || 1),
                          0,
                        ) || '',
                      )}
                      className={`${fieldMuted} mt-1`}
                    />
                    <span className="text-[11px] text-muted-foreground">sum of room allocations</span>
                  </label>
                </div>

                <div>
                  <p className={`${subsectionHeading} mb-3 border-b border-border/50 pb-1`}>Room Configuration</p>
                  <HotelRoomLinesEditor
                    form={form}
                    hotelIndex={index}
                    hotelId={hotel?.hotelId}
                    canCost={canCost}
                    recalculateTotals={() => recalculateHotelTotals(index)}
                  />
                </div>

                <div>
                  <p className={`${subsectionHeadingMuted} mb-3 border-b border-border/50 pb-1`}>Meal Plan</p>
                  <HotelMealPlanLinesEditor
                    form={form}
                  hotelIndex={index}
                  hotelId={hotel?.hotelId}
                  canCost={canCost}
                  recalculateTotals={() => recalculateHotelTotals(index)}
                  />
                </div>

                {hotel &&
                  (hotel.roomLines ?? []).some(
                    (line) => line?.baseRoomPrice != null || line?.extraBedPrice != null || line?.childWithoutBedPrice != null,
                  ) && (
                  <div className={`${calculatedCard} text-sm`}>
                    <h5 className={`${calculatedLabel} text-slate-800`}>Accommodation Breakdown</h5>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {(hotel.roomLines ?? []).map((line, lineIndex) => {
                        if (line?.baseRoomPrice == null && line?.extraBedPrice == null && line?.childWithoutBedPrice == null)
                          return null;
                        const lineNights = hotel.nights ?? displayNights;
                        return (
                          <li key={lineIndex}>
                            Room {lineIndex + 1}
                            {line?.roomType ? ` (${line.roomType})` : ''}:{' '}
                            {line?.baseRoomPrice != null
                              ? `Base Room: ${line.baseRoomPrice} × ${lineNights} nights${line?.rooms ? ` × ${line.rooms} rooms` : ''}`
                              : '—'}
                            {line?.extraBedPrice != null && line?.extraBedQuantity != null
                              ? ` · Extra Bed: ${line.extraBedPrice} × ${line.extraBedQuantity} × ${lineNights} nights`
                              : ''}
                            {line?.childWithoutBedPrice != null && line?.childWithoutBedQuantity != null
                              ? ` · Child Without Bed: ${line.childWithoutBedPrice} × ${line.childWithoutBedQuantity} × ${lineNights} nights`
                              : ''}
                          </li>
                        );
                      })}
                      {hotel.pricingSource && (
                        <li className="text-xs text-slate-500">Pricing: {hotel.pricingSource}</li>
                      )}
                    </ul>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-slate-800">
                    Remark
                    <input
                      aria-label="Hotel remark"
                      placeholder="e.g. additional bed, flower arrangement"
                      {...form.register(`hotels.${index}.notes`)}
                      className={`${field} mt-1`}
                    />
                  </label>
                </div>
              </div>

              <HotelPreview
                hotelId={hotel?.hotelId}
                snapshotImageUrl={hotel?.hotelName ? hotel?.images?.[0]?.url : undefined}
                snapshotThumbnailUrl={
                  hotel?.hotelName ? hotel?.images?.[0]?.thumbnailUrl : undefined
                }
                snapshotAuthoritative={hotel?.imageSnapshotPresent}
              />
            </div>

            <QuotationImageManager
              label="Hotel Images"
              ariaPrefix={`hotel-${index}`}
              images={(hotel?.images ?? []) as QuotationImage[]}
              pdfImageUrl={hotel?.pdfImageUrl}
              onMove={(imageIndex, direction) => moveHotelImage(index, imageIndex, direction)}
              onRemove={(imageIndex) => removeHotelImage(index, imageIndex)}
              onSelectPdf={(identity) => setHotelPdfImage(index, identity)}
            />
          </>
        )}
      </article>
    );
  };

  /**
   * Reference Cruise tab: Include checkbox, section Title + Amount, then one
   * labelled card per cruise entry (Name, Duration, Room Type, Description).
   * Multiple cruises remain supported; each row is its own card.
   */
  const cruiseTab = () => {
    const cruiseRows = services.fields
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => watchedServices?.[index]?.serviceType === 'CRUISE');
    const masters = cruiseMasters.data?.data ?? [];
    const primaryIndex = cruiseRows[0]?.index;
    const primary = primaryIndex !== undefined ? watchedServices?.[primaryIndex] : undefined;
    const isCruiseSectionWise = (form.watch('pricingMode') as string) === 'SECTION_WISE';
    return (
      <div className="space-y-5">
        <IncludeBar tabKey="cruise" label="Cruise" />
        {isIncluded('cruise') && (
          <>
            {primaryIndex !== undefined && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Section Title
                  <input
                    aria-label="Cruise section title"
                    maxLength={80}
                    value={primary?.taxCategory ?? ''}
                    onChange={(event) =>
                      applyService(primaryIndex, { taxCategory: event.target.value || null })
                    }
                    className={`${field} mt-1`}
                  />
                </label>
              </div>
            )}
            {isCruiseSectionWise && primary && (() => {
              const total = cruiseRows.reduce((sum, { index: idx }) => {
                const svc = watchedServices?.[idx] as unknown as { cruiseNights?: number | null } | undefined;
                const nights = (svc as unknown as { cruiseNights?: number | null })?.cruiseNights != null ? Number((svc as unknown as { cruiseNights?: number | null })?.cruiseNights) : 2;
                return sum + calculateCruiseRoomLinesTotal(watchedServices?.[idx] ?? {}, nights);
              }, 0);
              return <div className={`${calculatedCard} flex items-center justify-between`}><span className={calculatedLabel}>Cruise Total</span><span className={calculatedValue}>{formatMoney(total)} {cruiseRows.length>1 ? `· ${cruiseRows.length} cruises` : ''}</span></div>;
            })()}

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => services.append(newCruiseServiceRow(services.fields.length + 1))}
              >
                <Plus className="h-4 w-4" /> Add Cruise
              </Button>
            </div>

            {cruiseRows.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No cruise added yet. Add the first cruise below.
              </p>
            )}

            <div className="space-y-4">
              {cruiseRows.map(({ row, index }) => {
                const cruise = watchedServices?.[index] as unknown as QuotationVersionInput['services'][number] | undefined;
                return (
                  <article
                    key={row.id}
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
                      <h4 className={`${subsectionHeading} text-slate-800 normal-case tracking-normal`}>Cruise Stay</h4>
                      <Button size="sm" variant="ghost" onClick={() => services.remove(index)}>
                        <Trash2 className="h-4 w-4 text-red-600" /> Remove
                      </Button>
                    </header>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-800">
                          Cruise Name <span className="text-red-500">*</span>
                          <div className="mt-1">
                            <MasterSelect
                              ariaLabel="Cruise master"
                              placeholder="Link a cruise"
                              options={masters.map((m) => ({ id: m.id, label: m.name }))}
                              value={cruise?.cruiseId}
                              loading={cruiseMasters.isPending}
                              fallbackLabel={masters.find((m) => m.id === cruise?.cruiseId)?.name}
                              onSelect={(option) => {
                                const selectedMaster = masters.find(
                                  (master) => master.id === option?.id,
                                );
                                const snapshot = masterGallerySnapshot(
                                  selectedMaster?.images,
                                  selectedMaster?.name ?? 'Cruise',
                                );
                                // Changing cruise revalidates rooms: clear invalid room lines
                                cruisePriceOverridesRef.current.delete(index);
                                const currentNights = (cruise as unknown as { cruiseNights?: number | null })?.cruiseNights ?? 2;
                                applyService(index, {
                                  cruiseId: option?.id ?? null,
                                  // Keep cruiseNights, reset room lines if cruise changed
                                  ...(option?.id
                                    ? {
                                        cruiseRoomTypeId: null,
                                        city: null,
                                        sellingPrice: 0,
                                        quantity: 1,
                                        cruiseNights: currentNights,
                                        cruiseRoomLines: [emptyCruiseRoomLine()],
                                      }
                                    : {
                                        cruiseRoomTypeId: null,
                                        city: null,
                                        sellingPrice: 0,
                                        quantity: 1,
                                        cruiseNights: 2,
                                        cruiseRoomLines: [emptyCruiseRoomLine()],
                                      }),
                                  description: selectedMaster?.description ?? null,
                                  images: snapshot,
                                  imageSnapshotPresent: masterGalleryPresence(selectedMaster),
                                  pdfImageUrl: snapshot[0]
                                    ? quotationSnapshotImageIdentity(snapshot[0])
                                    : null,
                                  ...(option ? { name: option.label } : { name: '' }),
                                } as unknown as ServiceRowPatch);
                                if (selectedMaster)
                                  void importMasterGalleryPreviews(
                                    selectedMaster.id,
                                    snapshot,
                                    cruiseImageUrl,
                                  ).then((images) => {
                                    if (
                                      form.getValues(`services.${index}.cruiseId`) !==
                                      selectedMaster.id
                                    )
                                      return;
                                    applyService(index, {
                                      images: mergeMasterGalleryPreviews(
                                        form.getValues(`services.${index}.images`),
                                        images,
                                      ),
                                    });
                                  });
                              }}
                            />
                          </div>
                        </label>
                        <label className="text-sm font-semibold text-slate-800">
                          Number of Nights <span className="text-red-500">*</span>
                          <input
                            aria-label="Cruise nights"
                            type="number"
                            min={1}
                            max={365}
                            step={1}
                            value={Number((cruise as unknown as { cruiseNights?: number | null })?.cruiseNights ?? 2)}
                            onChange={(event) => {
                              const nights = Math.max(1, Math.min(365, Math.floor(Number(event.target.value) || 1)));
                              applyService(index, { cruiseNights: nights } as unknown as ServiceRowPatch);
                            }}
                            className={`${field} mt-1`}
                          />
                        </label>
                      </div>
                      <CruiseRoomLinesEditor
                        form={form}
                        serviceIndex={index}
                        cruiseId={cruise?.cruiseId}
                        canCost={canCost}
                        nights={Number((cruise as unknown as { cruiseNights?: number | null })?.cruiseNights ?? 2)}
                        recalculateTotals={() => {}}
                      />
                      <label className="block text-sm font-semibold text-slate-800">
                        Description
                        <div className="mt-1">
                          <RichTextEditor
                            ariaLabel="Cruise description"
                            value={cruise?.description ?? ''}
                            onChange={(html) => applyService(index, { description: html || null })}
                          />
                        </div>
                      </label>
                    </div>
                    <QuotationImageManager
                      label="Cruise Images"
                      ariaPrefix={`cruise-${index}`}
                      images={(cruise?.images ?? []) as QuotationImage[]}
                      pdfImageUrl={cruise?.pdfImageUrl}
                      onMove={(imageIndex, direction) =>
                        moveServiceImage(index, imageIndex, direction)
                      }
                      onRemove={(imageIndex) => removeServiceImage(index, imageIndex)}
                      onSelectPdf={(identity) => setServicePdfImage(index, identity)}
                    />
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  /**
   * The Flight tab (reference layout): a section title + amount, a journey type,
   * and Outbound / Return journeys, each a route selector plus one or more
   * segments (connections). Stored as structured JSON on `flightDetails`.
   */
  const flightSection = () => {
    const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
    const currency = form.watch('currency');
    const include = form.watch('flightDetails.include') ?? true;
    const entryMode = form.watch('flightDetails.entryMode') ?? 'MANUAL';
    const flightPricingBasis =
      (form.watch('flightDetails.pricingBasis') as 'FIXED_TOTAL' | 'PER_TRAVELER' | undefined) ??
      'FIXED_TOTAL';
    const flightSectionTotal = calculateFlightTotal(form.watch('flightDetails'), {
      adults: pax.adults,
      childrenWithBed: pax.cwb,
      childrenWithoutBed: pax.cwob,
      infants: pax.infants,
    });
    const isFlightSectionWise = (form.watch('pricingMode') as string) === 'SECTION_WISE';
    const flightImages = form.watch('flightDetails.images') ?? [];
    const journeyType = form.watch('flightDetails.journeyType') ?? 'ROUND_TRIP';
    const showOutbound = journeyType === 'ROUND_TRIP' || journeyType === 'ONEWAY_OUTBOUND';
    const showReturn = journeyType === 'ROUND_TRIP' || journeyType === 'ONEWAY_RETURN';
    const airlineList = airlines.data?.data ?? [];
    const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

    /**
     * Import a saved flight bookmark into the quotation form (DB only). Each
     * segment's airline is matched against the Airline Master and created
     * automatically when missing, so the Airline dropdown is never left blank.
     */
    const importFlightBookmark = async (bookmarks: LiveSearchBookmark[]) => {
      const bookmark = bookmarks[0];
      if (!bookmark) return;
      const details = flightBookmarkToDetails(bookmark);
      form.setValue('flightDetails', details, { shouldDirty: true });
      // `setValue` on the parent path does not re-sync the segment field
      // arrays, so replace them with every imported segment. Otherwise only the
      // default single segment would render until the next "Add Connection".
      outboundSegments.replace(details.outbound.segments);
      returnSegments.replace(details.returnJourney.segments);
      if (bookmark.currency) form.setValue('currency', bookmark.currency, { shouldDirty: true });

      const refs = flightBookmarkSegmentAirlines(bookmark);
      if (refs.length === 0) return;
      try {
        const resolved = await resolveFlightSegmentAirlines(refs, {
          airlines: airlineList,
          createAirline: (input) => createAirline.mutateAsync(input),
          canManageMedia: canManageAirlineMedia,
          // Ensure dropdown options include any just-created airline immediately,
          // without waiting for the server list to refetch.
          onAirlineCreated: (airline) => {
            queryClient.setQueriesData<Page<Airline>>(
              { queryKey: ['masters', 'airlines'] },
              (current) => {
                if (!current || !Array.isArray(current.data)) return current;
                if (current.data.some((row) => row.id === airline.id)) return current;
                return { ...current, data: [...current.data, airline] };
              },
            );
          },
        });
        for (const ref of refs) {
          const key = normalizeAirlineName(ref.name ?? '');
          const airline = resolved.get(key);
          if (!airline?.airlineId) continue;
          const path = `flightDetails.${ref.leg}.segments.${ref.segmentIndex}`;
          form.setValue(fp(`${path}.airlineId`), airline.airlineId as never, { shouldDirty: true });
          form.setValue(fp(`${path}.airlineName`), (airline.airlineName ?? ref.name) as never, {
            shouldDirty: true,
          });
        }
      } catch {
        // Airline auto-resolution is best-effort; the bookmark itself already
        // loaded the flight details (including the airline name as text).
      }
    };

    const segmentCard = (
      leg: 'outbound' | 'returnJourney',
      arr: typeof outboundSegments | typeof returnSegments,
      index: number,
      id: string,
    ) => {
      const base = `flightDetails.${leg}.segments.${index}`;
      const via =
        index > 0
          ? (form.watch(fp(`${base}.from`)) as string) ||
            (form.watch(fp(`flightDetails.${leg}.segments.${index - 1}.to`)) as string) ||
            ''
          : '';
      const departureDate = form.watch(fp(`${base}.departureDate`)) as string | null;
      const departureTime = form.watch(fp(`${base}.departureTime`)) as string | null;
      const arrivalDate = form.watch(fp(`${base}.arrivalDate`)) as string | null;
      const arrivalTime = form.watch(fp(`${base}.arrivalTime`)) as string | null;
      const computedDuration = computeDuration(
        departureDate,
        departureTime,
        arrivalDate,
        arrivalTime,
      );
      const invalidArrival = !flightTimesAreChronological(
        departureDate,
        departureTime,
        arrivalDate,
        arrivalTime,
      );
      const segmentKey = `${leg}-${index}`;
      const isSegmentExpanded = expandedSegments[segmentKey] ?? true;
      return (
        <article key={id} className="overflow-hidden rounded-lg border border-border/60 bg-card">
          <button
            type="button"
            onClick={() =>
              setExpandedSegments((prev) => ({ ...prev, [segmentKey]: !isSegmentExpanded }))
            }
            className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left hover:bg-muted/50"
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${isSegmentExpanded ? 'rotate-180' : ''}`}
              />
              <strong className={`${subsectionHeading} normal-case tracking-normal`}>Segment {index + 1}</strong>
            </span>
            {index > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  arr.remove(index);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    arr.remove(index);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> Remove
              </span>
            )}
          </button>
          {isSegmentExpanded && (
            <div className="space-y-3 p-4">
              {index > 0 && (
            <p className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">
              🔗 Connection{via ? `: Connected via ${via}` : ''}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelCls}>
              Airline <span className="text-red-500">*</span>
              <select
                aria-label="Airline"
                className={`${field} mt-1`}
                value={(form.watch(fp(`${base}.airlineId`)) as string) ?? ''}
                onChange={(event) => {
                  const picked = airlineList.find((row) => row.id === event.target.value);
                  form.setValue(fp(`${base}.airlineId`), (event.target.value || null) as never, {
                    shouldDirty: true,
                  });
                  form.setValue(fp(`${base}.airlineName`), (picked?.name ?? null) as never, {
                    shouldDirty: true,
                  });
                }}
              >
                <option value="">Select Airline</option>
                {airlineList.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Flight Number
              <input
                placeholder="e.g. AI101"
                className={`${field} mt-1`}
                {...form.register(fp(`${base}.flightNumber`))}
              />
            </label>
            <label className={labelCls}>
              Class
              <select className={`${field} mt-1`} {...form.register(fp(`${base}.travelClass`))}>
                {CLASS_OPTIONS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              From <span className="text-red-500">*</span>
              <input className={`${field} mt-1`} {...form.register(fp(`${base}.from`))} />
            </label>
            <label className={labelCls}>
              To <span className="text-red-500">*</span>
              <input className={`${field} mt-1`} {...form.register(fp(`${base}.to`))} />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className={labelCls}>
              Departure Date
              <input
                type="date"
                className={`${field} mt-1`}
                {...form.register(fp(`${base}.departureDate`))}
              />
            </label>
            <label className={labelCls}>
              Departure Time
              <input
                type="time"
                lang="en-US"
                className={`${field} mt-1`}
                {...form.register(fp(`${base}.departureTime`))}
              />
            </label>
            <label className={labelCls}>
              Arrival Date
              <input
                type="date"
                className={`${field} mt-1`}
                {...form.register(fp(`${base}.arrivalDate`))}
              />
            </label>
            <label className={labelCls}>
              Arrival Time
              <input
                type="time"
                lang="en-US"
                className={`${field} mt-1`}
                {...form.register(fp(`${base}.arrivalTime`))}
              />
            </label>
            {invalidArrival && (
              <p
                role="alert"
                className="flex items-center gap-1 text-xs font-medium text-amber-600 md:col-span-4"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Arrival time must be after departure time.
              </p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelCls}>
              <span className={calculatedLabel}>Duration</span>
              <input
                readOnly
                placeholder="Auto-calculated"
                value={computedDuration}
                className={`${fieldMuted} mt-1`}
              />
              <span className="text-[11px] text-muted-foreground">calculated from dates</span>
            </label>
            <label className={labelCls}>
              Cabin Luggage
              <select className={`${field} mt-1`} {...form.register(fp(`${base}.cabinLuggage`))}>
                {CABIN_LUGGAGE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {cabinLuggageLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Check-in Luggage
              <select className={`${field} mt-1`} {...form.register(fp(`${base}.checkInLuggage`))}>
                {CHECKIN_LUGGAGE_OPTIONS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className={labelCls}>Additional Notes</span>
            <div className="mt-1">
              <RichTextEditor
                ariaLabel={`Segment ${index + 1} notes`}
                value={(form.watch(fp(`${base}.notes`)) as string) ?? ''}
                onChange={(html) =>
                  form.setValue(fp(`${base}.notes`), html as never, { shouldDirty: true })
                }
              />
            </div>
          </div>
            </div>
          )}
        </article>
      );
    };

    const journeyBlock = (
      leg: 'outbound' | 'returnJourney',
      arr: typeof outboundSegments | typeof returnSegments,
      headerClass: string,
      title: string,
    ) => {
      const base = `flightDetails.${leg}`;
      const from = (form.watch(fp(`${base}.fromCity`)) as string) || '';
      const to = (form.watch(fp(`${base}.toCity`)) as string) || '';
      const isJourneyExpanded = expandedJourneys[leg] ?? true;
      return (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div
            role="button"
            tabIndex={0}
            onClick={() =>
              setExpandedJourneys((prev) => ({ ...prev, [leg]: !isJourneyExpanded }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedJourneys((prev) => ({ ...prev, [leg]: !isJourneyExpanded }));
              }
            }}
            className={`flex cursor-pointer select-none items-center justify-between px-5 py-3 font-semibold text-white ${headerClass}`}
          >
            <span className="flex items-center gap-2">
              <ChevronDown
                className={`h-4 w-4 text-white/80 transition-transform ${isJourneyExpanded ? 'rotate-180' : ''}`}
              />
              ✈ {title}
            </span>
            <span className="text-sm opacity-90">
              {from && to ? `${from} → ${to}` : 'Route will appear here'}
            </span>
          </div>
          {isJourneyExpanded && (
            <div className="p-5">
              <div className="space-y-4">
                {arr.fields.map((segment, index) => segmentCard(leg, arr, index, segment.id))}
              </div>
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => arr.append(emptySegment())}>
                  <Plus className="h-4 w-4" /> Add Connection
                </Button>
              </div>
            </div>
          )}
        </section>
      );
    };

    return (
      <div className="space-y-5">
        <BookmarkLoadField type="FLIGHT" placeholder="FLT-000456" onLoaded={importFlightBookmark} />
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" {...form.register('flightDetails.include')} />
          Include Flight in Quotation
        </label>
        {include && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">
                Section Title
                <input
                  aria-label="Flight section title"
                  placeholder="Flight Details"
                  className={`${field} mt-1`}
                  {...form.register('flightDetails.sectionTitle')}
                />
              </label>
              {isFlightSectionWise && (
              <div>
                <span className="text-sm font-semibold text-slate-800">Pricing Basis</span>
                <div
                  role="radiogroup"
                  aria-label="Flight pricing basis"
                  className="mt-1 grid max-w-md grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-1"
                >
                  {(
                    [
                      ['FIXED_TOTAL', 'Fixed Total'],
                      ['PER_TRAVELER', 'Per Traveler'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={flightPricingBasis === value}
                      className={cn(
                        'rounded-md px-4 py-2 text-sm font-semibold transition',
                        flightPricingBasis === value
                          ? 'bg-white text-brand-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                      onClick={() =>
                        form.setValue('flightDetails.pricingBasis', value, { shouldDirty: true })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Only the selected pricing basis contributes to the quotation total.
                </p>
              </div>
              )}
            </div>
            {isFlightSectionWise && (flightPricingBasis === 'PER_TRAVELER' ? (
              <div className="rounded-xl border p-4">
                <p className="text-sm font-semibold text-slate-800">Per-Traveler Flight Rates</p>
                <div className="mt-3 grid gap-4 md:grid-cols-4">
                  {(
                    [
                      ['Adult Rate', 'flightDetails.perTraveler.adult'],
                      ['CWB Rate', 'flightDetails.perTraveler.childWithBed'],
                      ['CWOB Rate', 'flightDetails.perTraveler.childWithoutBed'],
                      ['Infant Rate', 'flightDetails.perTraveler.infant'],
                    ] as const
                  ).map(([label, name]) => (
                    <label key={name} className="text-sm font-semibold text-slate-800">
                      {label}
                      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                          {currency}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={label}
                          className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                          {...form.register(name as never, MONEY_FIELD)}
                        />
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  {(
                    [
                      ['Adult', pax.adults, Number(form.watch('flightDetails.perTraveler.adult') ?? 0)],
                      ['CWB', pax.cwb, Number(form.watch('flightDetails.perTraveler.childWithBed') ?? 0)],
                      ['CWOB', pax.cwob, Number(form.watch('flightDetails.perTraveler.childWithoutBed') ?? 0)],
                      ['Infant', pax.infants, Number(form.watch('flightDetails.perTraveler.infant') ?? 0)],
                    ] as const
                  )
                    .filter(([, count, rate]) => count > 0 && rate > 0)
                    .map(([label, count, rate]) => (
                      <div key={label} className="flex justify-between">
                        <span>
                          {label}: {count} × {formatMoney(rate)}
                        </span>
                        <span className="font-medium">{formatMoney(rate * count)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800">
                    <span>Flight Total</span>
                    <span>{formatMoney(flightSectionTotal)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <label className="block max-w-sm text-sm font-semibold text-slate-800">
                Flight Selling Price
                <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                  <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                    {currency}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Flight amount"
                    className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                    {...form.register('flightDetails.amount', MONEY_FIELD)}
                  />
                </div>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Total selling price for the whole flight section.
                </span>
              </label>
            ))}
            {isFlightSectionWise && <div className={`${calculatedCard} flex items-center justify-between`}><span className={calculatedLabel}>Flight Section Total</span><span className={calculatedValue}>{formatMoney(flightSectionTotal)}</span></div>}

            <div>
              <span className={subsectionHeadingMuted}>Flight Information</span>
              <div
                role="radiogroup"
                aria-label="Flight information mode"
                className="mt-2 grid max-w-xl grid-cols-2 rounded-lg border border-border bg-muted/30 p-1"
              >
                {(
                  [
                    ['MANUAL', 'Fill details'],
                    ['IMAGE', 'Upload image'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={entryMode === value}
                    className={cn(
                      'rounded-md px-4 py-2 text-sm font-semibold transition',
                      entryMode === value
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800',
                    )}
                    onClick={() =>
                      form.setValue('flightDetails.entryMode', value, { shouldDirty: true })
                    }
                  >
                    {value === 'IMAGE' ? <Upload className="mr-2 inline h-4 w-4" /> : null}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {entryMode === 'IMAGE' && (
              <div className="space-y-4 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {flightImages.map((image, index) => (
                    <div
                      key={image.documentId}
                      className="w-full rounded-lg border bg-white p-3 shadow-sm"
                    >
                      {flightImagePreviewUrls[image.documentId] && (
                        <img
                          src={flightImagePreviewUrls[image.documentId]}
                          alt={`Uploaded flight itinerary ${index + 1}`}
                          className="block h-auto w-full rounded-md"
                        />
                      )}
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="text-sm font-semibold text-slate-700">
                          Description <span className="font-normal text-slate-400">(optional)</span>
                          <input
                            aria-label={`Flight image ${index + 1} description`}
                            placeholder="e.g. Outbound flight ticket"
                            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                            {...form.register(`flightDetails.images.${index}.description`)}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            form.setValue(
                              'flightDetails.images',
                              flightImages.filter((_, imageIndex) => imageIndex !== index),
                              { shouldDirty: true, shouldValidate: true },
                            );
                            setFlightImagePreviewUrls((current) => {
                              const next = { ...current };
                              delete next[image.documentId];
                              return next;
                            });
                            setFlightImageError('');
                          }}
                        >
                          <X className="h-4 w-4" /> Remove
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {image.fileName || 'Flight image'}
                      </p>
                    </div>
                  ))}
                </div>
                {flightImages.length < 10 && (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg bg-white px-6 py-8 text-center shadow-sm">
                    <ImageIcon className="h-9 w-9 text-brand-600" />
                    <span className="font-semibold text-slate-800">
                      {flightImages.length
                        ? 'Add another flight image'
                        : 'Upload flight screenshot or itinerary'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Choose, drop, or paste · PNG, JPG or WebP
                    </span>
                    <input
                      type="file"
                      aria-label="Flight image"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={flightImageUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        setFlightImageError('');
                        setFlightImageUploading(true);
                        void uploadQuotationAttachment(quotationId, file, versionId)
                          .then(({ documentId, url }) => {
                            form.setValue(
                              'flightDetails.images',
                              [
                                ...flightImages,
                                {
                                  documentId,
                                  fileName: file.name,
                                  description: null,
                                  heading: null,
                                },
                              ],
                              { shouldDirty: true, shouldValidate: true },
                            );
                            form.setValue('flightDetails.imageDocumentId', null, {
                              shouldDirty: true,
                            });
                            form.setValue('flightDetails.imageFileName', null, {
                              shouldDirty: true,
                            });
                            setFlightImagePreviewUrls((current) => ({
                              ...current,
                              [documentId]: url,
                            }));
                          })
                          .catch((error: unknown) =>
                            setFlightImageError(
                              error instanceof Error
                                ? error.message
                                : 'The flight image upload failed.',
                            ),
                          )
                          .finally(() => setFlightImageUploading(false));
                      }}
                    />
                    <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                      {flightImageUploading ? 'Uploading…' : 'Choose image'}
                    </span>
                  </label>
                )}
                {flightImageError && (
                  <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                    {flightImageError}
                  </p>
                )}
              </div>
            )}

            {entryMode === 'MANUAL' && (
              <label className="block max-w-md text-sm font-semibold text-slate-800">
                Journey Type <span className="text-red-500">*</span>
                <select
                  aria-label="Journey type"
                  className={`${field} mt-1`}
                  {...form.register('flightDetails.journeyType')}
                >
                  {Object.entries(FLIGHT_JOURNEY_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Select flight direction to show relevant sections.
                </span>
              </label>
            )}

            {entryMode === 'MANUAL' &&
              showOutbound &&
              journeyBlock('outbound', outboundSegments, 'bg-brand-600', 'Outbound Journey')}
            {entryMode === 'MANUAL' &&
              showReturn &&
              journeyBlock('returnJourney', returnSegments, 'bg-emerald-600', 'Return Journey')}
          </>
        )}
      </div>
    );
  };

  /**
   * The Add-on Services tab is a master-driven include-table (reference layout):
   * every active add-on master is a row you toggle into the quotation. Including
   * one appends an OTHER_ADD_ON service carrying its name, description and price,
   * which the caller can then edit per-quotation.
   */
  const addonTable = () => {
    const masters = addOnMasters.data?.data ?? [];
    const includedIndex = (id: string) =>
      (watchedServices ?? []).findIndex((row) => row?.addOnServiceId === id);
    const totalPax = pax.adults + pax.cwb + pax.cwob + pax.infants;
    const total = masters.reduce((sum, master) => {
      const index = includedIndex(master.id);
      const row = index >= 0 ? watchedServices?.[index] : undefined;
      return row
        ? sum + Number(row.sellingPrice ?? 0) * (Number(row.quantity ?? 1) || 1)
        : sum;
    }, 0);
    const currency = form.watch('currency');
    const ADDON_BASES: Array<[string, string]> = [
      ['FIXED', 'Fixed'],
      ['PER_TRAVELER', 'Per Traveler'],
      ['PER_DAY', 'Per Day'],
      ['PER_TRANSFER', 'Per Transfer'],
      ['PER_UNIT', 'Per Unit'],
    ];
     const toggle = (master: (typeof masters)[number], checked: boolean) => {
      if (checked) {
        services.append({
          serviceType: 'OTHER_ADD_ON',
          ...CLEARED_SERVICE_MASTERS,
          addOnServiceId: master.id,
          name: master.name,
          description: master.description ?? null,
          dayNumber: null,
          city: null,
          quantity: 1,
          pricingBasis: 'FIXED' as never,
          internalCost: 0,
          sellingPrice: master.price != null ? Number(master.price) : 0,
          taxCategory: null,
          notes: null,
          sequence: services.fields.length + 1,
        });
      } else {
        const index = includedIndex(master.id);
        if (index >= 0) services.remove(index);
      }
    };
    const isAddonSectionWise = (form.watch('pricingMode') as string) === 'SECTION_WISE';
    return (
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.watch('addOnDetails.include') !== false}
            onChange={(event) =>
              form.setValue('addOnDetails.include', event.target.checked, { shouldDirty: true })
            }
          />
          Include Add-on Services in Quotation
        </label>
        {form.watch('addOnDetails.include') !== false && (
          <>
            <p className="text-sm text-slate-600">
              {isAddonSectionWise ? 'Select additional services — pricing entered per service below:' : 'Select additional services to include (pricing entered centrally in Summary & Pricing):'}
            </p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="w-20 px-4 py-3 font-semibold">Include</th>
                    <th className="w-48 px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    {isAddonSectionWise && <th className="w-40 px-4 py-3 font-semibold">Pricing Basis</th>}
                    {isAddonSectionWise && <th className="w-24 px-4 py-3 font-semibold">Qty</th>}
                    {isAddonSectionWise && <th className="w-40 px-4 py-3 font-semibold">Unit Price</th>}
                  </tr>
                </thead>
                <tbody>
                  {masters.length === 0 && (
                    <tr>
                      <td colSpan={isAddonSectionWise ? 6 : 3} className="px-4 py-8 text-center text-slate-500">
                        {addOnMasters.isPending
                          ? 'Loading add-on services…'
                          : 'No add-on services in the master list yet.'}
                      </td>
                    </tr>
                  )}
                  {masters.map((master) => {
                    const index = includedIndex(master.id);
                    const included = index >= 0;
                    return (
                      <tr key={master.id} className="border-t align-top">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Include ${master.name}`}
                            checked={included}
                            onChange={(event) => toggle(master, event.target.checked)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{master.name}</td>
                        <td className="min-w-[18rem] px-4 py-3">
                          {included ? (
                            <RichTextEditor
                              ariaLabel={`${master.name} description`}
                              value={(watchedServices?.[index]?.description as string) ?? ''}
                              onChange={(html) =>
                                form.setValue(
                                  `services.${index}.description` as 'services.0.description',
                                  html as never,
                                  { shouldDirty: true },
                                )
                              }
                              placeholder="Describe this add-on for the customer…"
                            />
                          ) : (
                            <p className="text-slate-500">
                              {master.description
                                ?.replace(/<[^>]*>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim() || '—'}
                            </p>
                          )}
                        </td>
                        {isAddonSectionWise && (
                        <td className="px-4 py-3">
                          {included ? (
                            <select
                              aria-label={`${master.name} pricing basis`}
                              value={(watchedServices?.[index]?.pricingBasis as string) ?? 'FIXED'}
                              onChange={(event) => {
                                const basis = event.target.value;
                                form.setValue(
                                  `services.${index}.pricingBasis` as 'services.0.pricingBasis',
                                  basis as never,
                                  { shouldDirty: true },
                                );
                                if (basis === 'PER_TRAVELER') {
                                  form.setValue(
                                    `services.${index}.quantity` as 'services.0.quantity',
                                    Math.max(1, totalPax),
                                    { shouldDirty: true },
                                  );
                                }
                              }}
                              className={`${field}`}
                            >
                              {ADDON_BASES.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        )}
                        {isAddonSectionWise && (
                        <td className="px-4 py-3">
                          {included ? (
                            <input
                              type="number"
                              min="1"
                              step="1"
                              aria-label={`${master.name} quantity`}
                              value={Number(watchedServices?.[index]?.quantity ?? 1) || 1}
                              readOnly={
                                (watchedServices?.[index]?.pricingBasis as string) ===
                                'PER_TRAVELER'
                              }
                              onChange={(event) =>
                                form.setValue(
                                  `services.${index}.quantity` as 'services.0.quantity',
                                  Math.max(1, Math.floor(Number(event.target.value) || 1)),
                                  { shouldDirty: true },
                                )
                              }
                              className={`${field} ${
                                (watchedServices?.[index]?.pricingBasis as string) ===
                                'PER_TRAVELER'
                                  ? 'bg-slate-100'
                                  : ''
                              }`}
                            />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        )}
                        {isAddonSectionWise && (
                        <td className="px-4 py-3">
                          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300">
                            <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                              {currency}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              aria-label={`${master.name} price`}
                              disabled={!included}
                              value={
                                included
                                  ? (watchedServices?.[index]?.sellingPrice ?? 0)
                                  : (master.price ?? 0)
                              }
                              onChange={(event) =>
                                included &&
                                form.setValue(
                                  `services.${index}.sellingPrice`,
                                  event.target.value === '' ? 0 : Number(event.target.value),
                                  { shouldDirty: true },
                                )
                              }
                              className="min-w-0 flex-1 bg-card px-3 py-2 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </div>
                        </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {isAddonSectionWise && (
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td colSpan={5} className="px-4 py-3 text-right font-semibold text-slate-700">
                      Total Add-on Services:
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {currency} {total.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
                )}
                {!isAddonSectionWise && masters.filter(m=> includedIndex(m.id)>=0).length>0 && (
                  <tfoot><tr className="border-t bg-slate-50"><td colSpan={3} className="px-4 py-2 text-sm text-slate-600">Add-ons selected: {masters.filter(m=> includedIndex(m.id)>=0).length} · Pricing in Summary & Pricing</td></tr></tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  /** Reference "Visa" tab — one dedicated section, not a list of service rows. */
  const visaSection = () => {
    const svc = Number(form.watch('visaServiceCharge') ?? 0);
    const gst = Number(form.watch('visaGstPercent') ?? 0);
    const vfs = Number(form.watch('visaVfsCharge') ?? 0);
    const gstAmount = (svc * gst) / 100;
    const consolidated = svc + gstAmount + vfs;
    const included = form.watch('includeVisa') ?? true;
    const isVisaSectionWise = (form.watch('pricingMode') as string) === 'SECTION_WISE';
    const moneyInput = (
      label: string,
      name: 'visaAmount' | 'visaServiceCharge' | 'visaVfsCharge',
    ) => (
      <label className="text-sm font-semibold text-slate-800">
        {label}
        <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
          <span className="flex items-center bg-slate-100 px-2 text-slate-500">{currency}</span>
          <input
            type="number"
            step="0.01"
            aria-label={label}
            {...form.register(name, MONEY_FIELD)}
            className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
          />
        </div>
      </label>
    );
    return (
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" {...form.register('includeVisa')} />
          Include Visa in Quotation
        </label>
        {included && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">
                Section Title
                <input
                  aria-label="Visa section title"
                  placeholder="Visa Details"
                  {...form.register('visaSectionTitle')}
                  className={`${field} mt-1`}
                />
              </label>
              {isVisaSectionWise && moneyInput('Visa Selling Price', 'visaAmount')}
              <label className="text-sm font-semibold text-slate-800">
                Destination
                <input
                  aria-label="Visa destination"
                  {...form.register('visaDestination')}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Visa Type
                <input
                  aria-label="Visa type"
                  placeholder="Select Visa Type"
                  {...form.register('visaType')}
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            {isVisaSectionWise && (
            <div className="grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-3">
              {moneyInput('Service Charge', 'visaServiceCharge')}
              <label className="text-sm font-semibold text-slate-800">
                GST %
                <input
                  type="number"
                  step="0.01"
                  aria-label="Visa GST percent"
                  {...form.register('visaGstPercent', MONEY_FIELD)}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                GST Amount
                <input
                  readOnly
                  value={`${currency} ${gstAmount.toFixed(2)}`}
                  className={`${field} mt-1 bg-slate-100`}
                />
              </label>
              {moneyInput('VFS Charge', 'visaVfsCharge')}
              <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                Consolidated Total
                <input
                  readOnly
                  value={`${currency} ${consolidated.toFixed(2)}`}
                  className={`${field} mt-1 bg-slate-100`}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Service Charge + GST + VFS Charge
                </span>
              </label>
            </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <PersistInitialQuotationSnapshot
        enabled={
          version.versionNumber === 1 &&
          version.status === 'DRAFT' &&
          !version.flightDetails &&
          !version.hotelDetails &&
          !version.sightseeingDetails &&
          !version.addOnDetails
        }
        ready={Boolean(
          quotation.data &&
          hotelMasters.data &&
          destinationMasters.data &&
          sightseeingMasters.data &&
          initializedFormVersionId === version.id,
        )}
        onPersist={() => {
          if (initialSnapshotRef.current.attempted) return;
          initialSnapshotRef.current.attempted = true;
          initialSnapshotRef.current.autoSaving = true;
          void submit();
        }}
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/quotations/${quotationId}`} className="rounded-lg p-2 hover:bg-card">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">
              {q.quotationNumber} · Version {version.versionNumber}
            </p>
            <h1 className="text-2xl font-semibold">Quotation builder</h1>
          </div>
        </div>
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save quotation
        </Button>
      </header>
      {save.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{save.error.message}</p>
      )}
      {invalidFields.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">Please fix the following before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {invalidFields.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-t-xl bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 font-semibold text-white">
        Quotation for {q.customerName}
        {nights != null && ` (${nights} Nights / ${nights + 1} Days)`}
        {q.destinationSummary && ` — ${q.destinationSummary}`}
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">
            Quotation Title <span className="text-red-500">*</span>
            <input aria-label="Title" {...form.register('title')} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Weblink Heading
            <input
              aria-label="Weblink Heading"
              placeholder="e.g. Singapore Family Holiday"
              {...form.register('weblinkHeading')}
              className={`${field} mt-1`}
            />
            <p className="mt-1 text-xs font-normal text-slate-400">
              Optional override for the large hero heading on the public weblink.
            </p>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Version
            <input
              value={version.versionNumber}
              readOnly
              className={`${field} mt-1 bg-slate-100`}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Lead Stage
            <input
              value={q.query?.leadStage ? labelForLookup(q.query.leadStage) : ''}
              readOnly
              className={`${field} mt-1 bg-slate-100`}
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative -mb-px whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-brand-600 bg-brand-50/50 text-brand-700'
                : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
            )}
          >
            {tab.label}
            {leadRequested.has(tab.key) && <span className="ml-0.5 text-red-500">*</span>}
          </button>
        ))}
      </div>

      {/* Tab panels — only the active tab is mounted (RHF keeps field values). */}
      <section className="rounded-xl border border-border bg-card p-4">
        {activeTab === 'pricingMethod' &&
          (() => {
            const mode = (form.watch('pricingMode') ?? 'PER_PERSON') as 'SECTION_WISE' | 'PER_PERSON';
            const switchMode = (next: 'SECTION_WISE' | 'PER_PERSON') => {
              if (next === form.getValues('pricingMode')) return;
              const cur = form.watch('currency') || 'INR';
              const fmt = (v: number) => {
                try {
                  return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: cur }).format(v);
                } catch {
                  return `${cur} ${v.toFixed(2)}`;
                }
              };
              try {
                const fromPricing = resolveQuotationPricing({
                  version: {
                    pricingMode: mode,
                    finalAmount: 0,
                    currency: cur,
                    flightDetails: form.getValues('flightDetails'),
                    hotelDetails: form.getValues('hotelDetails'),
                    hotels: form.getValues('hotels'),
                    sightseeingDetails: form.getValues('sightseeingDetails'),
                    services: form.getValues('services'),
                    includeVisa: form.getValues('includeVisa'),
                    visaAmount: form.getValues('visaAmount'),
                    visaServiceCharge: form.getValues('visaServiceCharge'),
                    visaGstPercent: form.getValues('visaGstPercent'),
                    visaVfsCharge: form.getValues('visaVfsCharge'),
                    discountAmount: form.getValues('discountAmount'),
                    taxRate: form.getValues('taxRate'),
                    perAdultPrice: form.getValues('perAdultPrice'),
                    perChildWithBedPrice: form.getValues('perChildWithBedPrice'),
                    perChildWithoutBedPrice: form.getValues('perChildWithoutBedPrice'),
                    perInfantPrice: form.getValues('perInfantPrice'),
                  },
                  quotation: {
                    adults: quotation.data?.adults ?? 0,
                    childrenWithBed: quotation.data?.childrenWithBed ?? 0,
                    childrenWithoutBed: quotation.data?.childrenWithoutBed ?? 0,
                    infants: quotation.data?.infants ?? 0,
                    currency: cur,
                  },
                });
                const toPricing = resolveQuotationPricing({
                  version: {
                    pricingMode: next,
                    finalAmount: 0,
                    currency: cur,
                    flightDetails: form.getValues('flightDetails'),
                    hotelDetails: form.getValues('hotelDetails'),
                    hotels: form.getValues('hotels'),
                    sightseeingDetails: form.getValues('sightseeingDetails'),
                    services: form.getValues('services'),
                    includeVisa: form.getValues('includeVisa'),
                    visaAmount: form.getValues('visaAmount'),
                    visaServiceCharge: form.getValues('visaServiceCharge'),
                    visaGstPercent: form.getValues('visaGstPercent'),
                    visaVfsCharge: form.getValues('visaVfsCharge'),
                    discountAmount: form.getValues('discountAmount'),
                    taxRate: form.getValues('taxRate'),
                    perAdultPrice: form.getValues('perAdultPrice'),
                    perChildWithBedPrice: form.getValues('perChildWithBedPrice'),
                    perChildWithoutBedPrice: form.getValues('perChildWithoutBedPrice'),
                    perInfantPrice: form.getValues('perInfantPrice'),
                  },
                  quotation: {
                    adults: quotation.data?.adults ?? 0,
                    childrenWithBed: quotation.data?.childrenWithBed ?? 0,
                    childrenWithoutBed: quotation.data?.childrenWithoutBed ?? 0,
                    infants: quotation.data?.infants ?? 0,
                    currency: cur,
                  },
                });
                if (fromPricing.grandTotal > 0 && toPricing.grandTotal > 0 && fromPricing.grandTotal !== toPricing.grandTotal) {
                  const ok = window.confirm(
                    `Change pricing method? Your quotation currently uses ${mode === 'SECTION_WISE' ? 'By Section' : 'By Traveler'} (${fmt(fromPricing.grandTotal)}). Switching to ${next === 'SECTION_WISE' ? 'By Section' : 'By Traveler'} will change the authoritative total to ${fmt(toPricing.grandTotal)}. Existing values will be preserved where possible.`,
                  );
                  if (!ok) return;
                }
              } catch (_e) {
                void _e;
              }
              form.setValue('pricingMode', next, { shouldDirty: true });
            };
            return (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-base font-semibold text-slate-900">How would you like to price this quotation?</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ['SECTION_WISE', 'By Section', 'Set and calculate a selling price for each service section individually.'],
                      ['PER_PERSON', 'By Traveler', 'Build the itinerary and calculate the final package price per traveler.'],
                    ] as const
                  ).map(([value, title, desc]) => {
                    const selected = mode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        aria-label={title}
                        onClick={() => switchMode(value as 'SECTION_WISE' | 'PER_PERSON')}
                        className={`text-left rounded-xl border-2 p-5 transition ${selected ? 'border-brand-600 bg-brand-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-slate-800'}`}>{title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{desc}</p>
                          </div>
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}
                            aria-hidden="true"
                          >
                            {selected ? '✓' : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        {TABS.filter(
          (t) => t.types && t.key === activeTab && !['addon', 'vehicle', 'cruise'].includes(t.key),
        ).map((tab) => (
          <div key={tab.key}>{serviceTab(tab)}</div>
        ))}

        {/* Flight — structured journeys/segments (reference layout). */}
        {activeTab === 'flight' && flightSection()}

        {/* Keep this field array mounted so V1 initialization never depends on
            the user visiting the Sightseeing/itinerary tab. */}
        <div className={activeTab === 'sightseeing' ? 'block' : 'hidden'}>
          <SightseeingSection
            form={form}
            quotationId={quotationId}
            quotationVersionId={versionId}
            destination={sightseeingDestinationName}
            pax={{
              adults: pax.adults,
              childrenWithBed: pax.cwb,
              childrenWithoutBed: pax.cwob,
              infants: pax.infants,
            }}
          />
        </div>

        {/* Add-on Services — master-driven include-table. */}
        {activeTab === 'addon' && addonTable()}

        {/* Visa — dedicated section. */}
        {SHOW_VISA_QUOTATION_TAB && activeTab === 'visa' && visaSection()}

        {/* Vehicle — reference single-vehicle layout. */}
        {activeTab === 'vehicle' && vehicleTab()}

        {/* Cruise — reference layout with section title, amount, name, duration, room type, description. */}
        {activeTab === 'cruise' && cruiseTab()}

        {/* Hotel */}
        {activeTab === 'hotel' && (
          <div className="space-y-5">
            <IncludeBar tabKey="hotel" label="Hotel" />
            {isIncluded('hotel') && (
              <>
                <HotelBookmarkListField onLoaded={importHotelBookmark} />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-800">
                    Section Title
                    <input
                      aria-label="Hotel section title"
                      {...form.register('hotelDetails.sectionTitle')}
                      className={`${field} mt-1`}
                    />
                  </label>
                  {(form.watch('pricingMode') as string) === 'SECTION_WISE' && (
                  <label className="text-sm font-semibold text-slate-800">
                    Amount
                    <div className="mt-1 flex rounded-lg border border-slate-300 bg-card focus-within:ring-2 focus-within:ring-brand-500">
                      <span className="flex items-center border-r px-3 text-sm text-slate-500">
                        {currency}
                      </span>
                      <input
                        aria-label="Hotel amount"
                        type="number"
                        min="0"
                        step="0.01"
                        {...form.register('hotelDetails.amount', { setValueAs: nullable })}
                        className="w-full rounded-r-lg bg-transparent px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <span className="mt-1 block text-xs font-normal text-slate-500">Hotel section total is auto-calculated from room allocations when rates are entered.</span>
                  </label>
                  )}
                </div>
                {(form.watch('pricingMode') as string) === 'SECTION_WISE' && (() => {
                  const rows = form.watch('hotels') ?? [];
                  const hotelTotal = rows.filter(r=> r.selected!==false).reduce((sum,row)=> sum + calculateHotelRowTotal(row).total, 0);
                  return hotelTotal>0 ? <div className={`${calculatedCard} flex items-center justify-between`}><span className={calculatedLabel}>Hotel Section Total</span><span className={calculatedValue}>{currency} {hotelTotal.toFixed(2)}</span></div> : null;
                })()}

                <div>
                  <h3 className="mb-1 text-sm font-semibold text-slate-800">Description</h3>
                  <RichTextEditor
                    ariaLabel="Hotel description"
                    value={form.watch('hotelDetails.description') ?? ''}
                    onChange={(html) =>
                      form.setValue('hotelDetails.description', html || null, {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>

                {hotels.fields.length === 0 && (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                    No hotel stays were found on this lead. Add the first stay below.
                  </p>
                )}

                <section className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">Hotel Options</h3>
                  </div>
                  {defaultHotelRows.length === 0 && (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label="Add Hotel"
                        onClick={() => appendHotel(true)}
                      >
                        <Plus className="h-4 w-4" /> Add First Hotel Stay
                      </Button>
                    </div>
                  )}
                  {defaultHotelRows.map(({ row, index }, position) =>
                    hotelCard(index, row.id, position === 0),
                  )}
                </section>

                {SHOW_HOTEL_OPTIONS && (
                  <section className="space-y-3 border-t pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">Hotel Options</h3>
                        <p className="text-xs text-slate-500">
                          Provide alternative hotel combinations for the customer to choose.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => appendHotel(false)}>
                        <Plus className="h-4 w-4" /> Add Hotel Option
                      </Button>
                    </div>
                    {alternativeHotelRows.length === 0 && (
                      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">
                        No alternative hotel option added.
                      </p>
                    )}
                    {alternativeHotelRows.map(({ row, index }) => hotelCard(index, row.id))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* Legacy day-wise itinerary — superseded by SightseeingSection; never rendered. */}
        {activeTab === '__legacy_itinerary__' && (
          <div className="mt-6 border-t pt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Day-wise Itinerary</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  itinerary.append({
                    dayNumber: itinerary.fields.length + 1,
                    date: null,
                    title: '',
                    destination: '',
                    description: '',
                    meals: null,
                    overnightLocation: null,
                    activities: null,
                    transfers: null,
                    notes: null,
                    sequence: itinerary.fields.length + 1,
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add Day
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {itinerary.fields.map((row, index) => (
                <article key={row.id} className="rounded-lg border p-4">
                  <div className="flex justify-between">
                    <strong>Day {index + 1}</strong>
                    <Button size="sm" variant="ghost" onClick={() => itinerary.remove(index)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <input
                      aria-label="Itinerary title"
                      placeholder="Title"
                      {...form.register(`itinerary.${index}.title`)}
                      className={field}
                    />
                    <input
                      aria-label="Itinerary destination"
                      placeholder="Destination"
                      {...form.register(`itinerary.${index}.destination`)}
                      className={field}
                    />
                    <input
                      aria-label="Itinerary meals"
                      placeholder="Meals"
                      {...form.register(`itinerary.${index}.meals`)}
                      className={field}
                    />
                    <textarea
                      aria-label="Itinerary description"
                      rows={3}
                      placeholder="Description"
                      {...form.register(`itinerary.${index}.description`)}
                      className={`${field} md:col-span-3`}
                    />
                    <input
                      aria-label="Activities"
                      placeholder="Activities"
                      {...form.register(`itinerary.${index}.activities`)}
                      className={field}
                    />
                    <input
                      aria-label="Transfers"
                      placeholder="Transfers"
                      {...form.register(`itinerary.${index}.transfers`)}
                      className={field}
                    />
                    <input
                      aria-label="Overnight"
                      placeholder="Overnight location"
                      {...form.register(`itinerary.${index}.overnightLocation`)}
                      className={field}
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Inclusions & Exclusions — five rich-text blocks (reference layout). */}
        {activeTab === 'inclusions' && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Customize the inclusions and exclusions for this quotation. These will override the
              default destination policies.
            </p>
            <div className="grid gap-5 lg:grid-cols-2">
              {(
                [
                  [
                    '✅ Inclusions',
                    'inclusionsHtml',
                    'List all services and items included in the package.',
                  ],
                  [
                    '❌ Exclusions',
                    'exclusionsHtml',
                    'List all services and items not included in the package.',
                  ],
                  [
                    '💳 Payment Policies',
                    'paymentPolicies',
                    'Specify payment terms, advance requirements, etc.',
                  ],
                  [
                    '🚫 Cancellation Policies',
                    'cancellationPolicies',
                    'Specify cancellation charges and conditions.',
                  ],
                ] as const
              ).map(([title, name, hint]) => (
                <div key={name}>
                  <h3 className="mb-1 font-semibold text-slate-800">{title}</h3>
                  <RichTextEditor
                    ariaLabel={title.replace(/^\S+\s/, '')}
                    value={form.watch(name) ?? ''}
                    onChange={(html) => form.setValue(name, html, { shouldDirty: true })}
                  />
                  <p className="mt-1 text-xs text-slate-500">{hint}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-slate-800">
                📄 Booking Terms &amp; Conditions
              </h3>
              <RichTextEditor
                ariaLabel="Booking Terms & Conditions"
                value={form.watch('bookingTerms') ?? ''}
                onChange={(html) => form.setValue('bookingTerms', html, { shouldDirty: true })}
              />
              <p className="mt-1 text-xs text-slate-500">
                General terms, conditions, and important notes.
              </p>
            </div>
          </div>
        )}

        {/* FAQs — quotation-level weblink content. */}
        {activeTab === 'faqs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs text-slate-500">
                Add useful questions and answers for this quotation. They appear as an accordion on
                the public weblink. Leave empty if not needed.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!masterFaqsQuery.data?.data?.length}
                  onClick={importMasterFaqs}
                >
                  <Plus className="h-4 w-4" /> Import FAQs for destination
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => faqs.append({ question: '', answer: '' })}
                >
                  <Plus className="h-4 w-4" /> Add FAQ
                </Button>
              </div>
            </div>
            {importedFaqDestination && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Imported FAQs for {importedFaqDestination}. You can edit or remove them before saving.
              </p>
            )}
            {faqs.fields.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">
                No FAQs added yet. Click &quot;Add FAQ&quot; or import FAQs for this destination from
                the FAQ master.
              </p>
            )}
            <div className="space-y-4">
              {faqs.fields.map((row, index) => (
                <div key={row.id} className="rounded-lg border bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      FAQ {index + 1}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={index === 0}
                        aria-label={`Move FAQ ${index + 1} up`}
                        onClick={() => faqs.move(index, index - 1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={index === faqs.fields.length - 1}
                        aria-label={`Move FAQ ${index + 1} down`}
                        onClick={() => faqs.move(index, index + 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete FAQ ${index + 1}`}
                        onClick={() => faqs.remove(index)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" /> Remove FAQ
                      </Button>
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-slate-700">Question</span>
                    <div className="mt-1">
                      <RichTextEditor
                        ariaLabel={`FAQ ${index + 1} question`}
                        placeholder="e.g. Is breakfast included?"
                        value={form.watch(`faqs.${index}.question`) ?? ''}
                        onChange={(html) => {
                          form.setValue(`faqs.${index}.question`, html, { shouldDirty: true });
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="block text-xs font-semibold text-slate-700">Answer</span>
                    <div className="mt-1">
                      <RichTextEditor
                        ariaLabel={`FAQ ${index + 1} answer`}
                        placeholder="e.g. Yes, daily breakfast is included at the hotel."
                        value={form.watch(`faqs.${index}.answer`) ?? ''}
                        onChange={(html) => {
                          form.setValue(`faqs.${index}.answer`, html, { shouldDirty: true });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary & Pricing — per-passenger package pricing (reference layout). */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-xl border">
              <div className="bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-3 font-semibold text-white">
                Pricing
              </div>
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-800">Pricing Method: </span>
                    <span className="font-medium text-brand-700">{isSectionWisePricing ? 'By Section' : 'By Traveler'}</span>
                    <span className="ml-2 text-xs text-slate-500">{isSectionWisePricing ? 'Section totals are authoritative' : 'Traveler prices are authoritative'}</span>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => handlePricingMethodChange(isSectionWisePricing ? 'PER_PERSON' : 'SECTION_WISE')}>Change pricing method</Button>
                </div>
                <label className="block max-w-sm text-sm font-semibold text-slate-800">
                  Pricing Heading
                  <input
                    aria-label="Pricing heading"
                    placeholder="Price Breakdown"
                    {...form.register('pricingHeading')}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block max-w-sm text-sm font-semibold text-slate-800">
                  Pricing Subheading
                  <input
                    aria-label="Pricing subheading"
                    placeholder="Optional"
                    {...form.register('pricingSubheading')}
                    className={`${field} mt-1`}
                  />
                </label>
                <div className="max-w-md">
                  <p className="text-sm font-semibold text-slate-800">Pricing Display Order</p>
                  <p className="text-xs text-slate-500">
                    The order used on the customer Weblink and PDF.
                  </p>
                  <ol className="mt-2 space-y-1">
                    {(form.watch('pricingDisplayOrder') ?? DEFAULT_PRICING_ORDER).map(
                      (id: string, index: number, arr: string[]) => {
                      const label = PRICING_SECTION_LABELS[id] ?? id;
                      return (
                        <li
                          key={id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                        >
                          <span className="font-medium text-slate-700">{label}</span>
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${label} up`}
                              disabled={index === 0}
                              onClick={() => {
                                const next = (
                                  form.watch('pricingDisplayOrder') ?? DEFAULT_PRICING_ORDER
                                ).slice() as string[];
                                const j = index - 1;
                                if (j < 0 || j >= next.length) return;
                                const removed = next.splice(index, 1)[0]!;
                                next.splice(j, 0, removed);
                                form.setValue('pricingDisplayOrder', next, { shouldDirty: true });
                              }}
                              className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${label} down`}
                              disabled={index === arr.length - 1}
                              onClick={() => {
                                const next = (
                                  form.watch('pricingDisplayOrder') ?? DEFAULT_PRICING_ORDER
                                ).slice() as string[];
                                const j = index + 1;
                                if (j < 0 || j >= next.length) return;
                                const removed = next.splice(index, 1)[0]!;
                                next.splice(j, 0, removed);
                                form.setValue('pricingDisplayOrder', next, { shouldDirty: true });
                              }}
                              className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                            >
                              ↓
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    type="button"
                    onClick={() =>
                      form.setValue('pricingDisplayOrder', DEFAULT_PRICING_ORDER, { shouldDirty: true })
                    }
                    className="mt-2 text-xs font-medium text-brand-700 hover:underline"
                  >
                    Reset order
                  </button>
                </div>
                <p className="max-w-sm text-xs text-slate-500">
                  The heading and pricing method will be used on the customer Weblink and PDF.
                </p>
                <label className="block max-w-sm text-sm font-semibold text-slate-800">
                  Currency <span className="text-red-500">*</span>
                  <select
                    aria-label="Currency"
                    {...form.register('currency')}
                    className={`${field} mt-1`}
                  >
                    {(SETTINGS_CURRENCIES.includes(currency as (typeof SETTINGS_CURRENCIES)[number])
                      ? SETTINGS_CURRENCIES
                      : [currency, ...SETTINGS_CURRENCIES]
                    ).map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>

                {!isSectionWisePricing && (
                <div className="grid gap-4 md:grid-cols-4">
                  {(
                    [
                      ['Per Adult Price', 'perAdultPrice', true],
                      ['Per CWB Price', 'perChildWithBedPrice', false],
                      ['Per CWOB Price', 'perChildWithoutBedPrice', false],
                      ['Per Infant Price', 'perInfantPrice', false],
                    ] as const
                  ).map(([label, name, required]) => (
                    <label key={name} className="text-sm font-semibold text-slate-800">
                      {label} {required && <span className="text-red-500">*</span>}
                      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                          {currency}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={label}
                          {...form.register(name, MONEY_FIELD)}
                          className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                        />
                      </div>
                    </label>
                  ))}
                </div>
                )}

                <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {(
                    [
                      ['Adults', pax.adults],
                      ['CWB', pax.cwb],
                      ['CWOB', pax.cwob],
                      ['Infants', pax.infants],
                    ] as const
                  ).map(([label, value]) => (
                    <label key={label} className="text-sm font-semibold text-slate-800">
                      {label}
                      <input readOnly value={value} className={`${field} mt-1 bg-slate-100`} />
                    </label>
                  ))}
                  {!isSectionWisePricing && (
                  <label className="text-sm font-semibold text-slate-800">
                    Total Package Price
                    <input
                      readOnly
                      aria-label="Total Package Price"
                      value={formatMoney(packageTotal)}
                      className={`${field} mt-1 bg-slate-100`}
                    />
                  </label>
                  )}
                  {isSectionWisePricing && (
                    <label className="text-sm font-semibold text-slate-800">
                      Section Total
                      <input readOnly aria-label="Section Total" value={formatMoney(livePricing.sectionTotal)} className={`${field} mt-1 bg-slate-100`} />
                    </label>
                  )}
                  <label className="text-sm font-semibold text-slate-800">
                    Tax Note on Total Price
                    <select
                      aria-label="Tax note"
                      value={taxNoteChoice}
                      onChange={(event) => {
                        const choice = event.target.value;
                        setTaxNoteChoice(choice);
                        if (choice === QUOTATION_TAX_NOTE_SENTINEL) return;
                        form.setValue(
                          'taxNote',
                          resolveTaxNoteChoice(choice, form.getValues('taxNote')) ?? null,
                          { shouldDirty: true },
                        );
                      }}
                      className={`${field} mt-1`}
                    >
                      {QUOTATION_TAX_NOTE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Current: {form.watch('taxNote')?.trim() || 'not shown publicly'}
                    </span>
                  </label>
                </div>

                {canCost && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-800">
                      Net Amount
                      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                          {currency}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label="Net Amount"
                          {...form.register('netAmount', MONEY_FIELD)}
                          className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        Enter net amount to calculate margin.
                      </span>
                    </label>
                    <label className="text-sm font-semibold text-slate-800">
                      Margin
                      <input
                        readOnly
                        aria-label="Margin"
                        value={formatMoney(packageMargin)}
                        className={`${field} mt-1 bg-slate-100`}
                      />
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        Total Package Price − Net Amount. Internal cost {formatMoney(estimate.cost)}
                        .
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </section>

            {!isSectionWisePricing && (
              <div className="rounded-xl bg-teal-600 p-5 text-white">
                <p className="font-semibold">Package Pricing Breakdown</p>
                {packageTotal === 0 ? (
                  <p className="mt-1 text-sm text-white/80">Enter prices to see the breakdown.</p>
                ) : (
                  <div className="mt-3 space-y-1 text-sm">
                    {(
                      [
                        ['Adults', pax.adults, perPax.adult],
                        ['CWB', pax.cwb, perPax.cwb],
                        ['CWOB', pax.cwob, perPax.cwob],
                        ['Infants', pax.infants, perPax.infant],
                      ] as const
                    )
                      .filter(([, count, price]) => count > 0 && price > 0)
                      .map(([label, count, price]) => (
                        <div
                          key={label}
                          className="flex justify-between border-b border-white/20 py-1"
                        >
                          <span>
                            {label}: {count} × {formatMoney(price)}
                          </span>
                          <span>{formatMoney(price * count)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between py-1 font-bold">
                      <span>Package Subtotal:</span>
                      <span>{formatMoney(packageTotal)}</span>
                    </div>
                    {livePricing.discountAmount !== 0 && (
                      <div className="flex justify-between border-t border-white/20 py-1">
                        <span>Discount:</span>
                        <span>-{formatMoney(livePricing.discountAmount)}</span>
                      </div>
                    )}
                    {livePricing.taxAmount !== 0 && (
                      <div className="flex justify-between border-b border-white/20 py-1">
                        <span>Tax ({livePricing.taxRate}%):</span>
                        <span>{formatMoney(livePricing.taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 font-bold">
                      <span>Grand Total:</span>
                      <span>{formatMoney(livePricing.grandTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isSectionWisePricing &&
              (() => {
                const pricing = livePricing;
                return (
                  <div className="rounded-xl border bg-white p-5">
                    <h3 className="font-semibold text-slate-800">Section-wise Price Breakdown</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      {pricing.sections
                        .filter((s) => s.amount > 0)
                        .map((s) => (
                          <div key={s.id} className="flex justify-between">
                            <span className="text-slate-600">{s.label}</span>
                            <span className="font-medium">{formatMoney(s.amount)}</span>
                          </div>
                        ))}
                      {(pricing.discountAmount !== 0 || pricing.taxAmount !== 0) && (
                        <div className="flex justify-between border-t pt-2 font-bold">
                          <span>Subtotal</span>
                          <span>{formatMoney(pricing.sectionTotal)}</span>
                        </div>
                      )}
                      {pricing.discountAmount !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Discount</span>
                          <span>-{formatMoney(pricing.discountAmount)}</span>
                        </div>
                      )}
                      {pricing.taxAmount !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Tax ({pricing.taxRate}%)</span>
                          <span>{formatMoney(pricing.taxAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2 font-bold">
                        <span>Grand Total</span>
                        <span>{formatMoney(pricing.grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {isSectionWisePricing && (
              <section className="rounded-xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">Extra Charges</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Fixed package amounts — each appears as its own line in the Price Breakdown, like Flights or Hotels. Only for By Section.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingExtraIndex(null);
                      setExtraDraft({ label: '', amount: '', description: '', category: '' });
                      setExtraDraftError('');
                      setExtraChargeDrawerOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add Extra Charge
                  </Button>
                </div>
                {(() => {
                  const charges = (form.watch('customCharges') ?? []) as Array<{ label?: string; amount?: number; description?: string | null; category?: string | null }>;
                  if (charges.length === 0) {
                    return (
                      <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
                        <p className="text-sm font-medium text-slate-700">No extra charges yet</p>
                        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Charges are fixed package amounts — not multiplied by traveler count. Add a guide fee, travel insurance, tips, etc.</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setEditingExtraIndex(null);
                            setExtraDraft({ label: '', amount: '', description: '', category: '' });
                            setExtraDraftError('');
                            setExtraChargeDrawerOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" /> Add Extra Charge
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <div className="mt-4 space-y-2">
                      {charges.map((c, idx) => (
                        <div key={idx} className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-slate-50">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{c.label}</p>
                            {c.description ? <p className="truncate text-xs text-slate-500">{c.description}</p> : null}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              {c.category ? <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.category}</span> : null}
                              <span>Entire Package · Fixed</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="mr-2 text-sm font-semibold text-slate-900">{formatMoney(Number(c.amount) || 0)}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit extra charge ${c.label}`}
                              onClick={() => {
                                setEditingExtraIndex(idx);
                                setExtraDraft({ label: c.label ?? '', amount: String(c.amount ?? ''), description: c.description ?? '', category: c.category ?? '' });
                                setExtraDraftError('');
                                setExtraChargeDrawerOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete extra charge ${c.label}`}
                              onClick={() => {
                                if (!window.confirm(`Delete "${c.label}"?`)) return;
                                const next = charges.filter((_, i) => i !== idx);
                                form.setValue('customCharges', next as never, { shouldDirty: true });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <p className="text-sm font-medium text-slate-700">Extra Charges Total: {formatMoney(charges.reduce((s, c) => s + (Number(c.amount) || 0), 0))}</p>
                    </div>
                  );
                })()}
                {extraChargeDrawerOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExtraChargeDrawerOpen(false)}>
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label={editingExtraIndex === null ? 'Add Extra Charge' : 'Edit Extra Charge'}
                      className="w-full max-w-lg rounded-xl bg-card p-5 shadow-xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900">{editingExtraIndex === null ? 'Add Extra Charge' : 'Edit Extra Charge'}</h4>
                          <p className="mt-0.5 text-xs text-slate-500">Fixed package amount — applied once to the section-wise total, not per traveler.</p>
                        </div>
                        <button type="button" aria-label="Close" onClick={() => setExtraChargeDrawerOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                          <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {extraDraftError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{extraDraftError}</p>}
                        <label className="block text-sm font-medium text-slate-700">
                          Charge Name <span className="text-red-500">*</span>
                          <input
                            autoFocus
                            className={`${field} mt-1`}
                            placeholder="e.g. Guide, Travel Insurance, Tips"
                            value={extraDraft.label}
                            onChange={(event) => setExtraDraft((s) => ({ ...s, label: event.target.value }))}
                            aria-label="Charge Name"
                          />
                          <span className="mt-1 block text-xs font-normal text-slate-500">Shown as its own line in the breakdown, like Flights or Hotels.</span>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Description <span className="font-normal text-slate-400">(optional)</span>
                          <textarea
                            className={`${field} mt-1`}
                            rows={2}
                            placeholder="Optional details shown on expand"
                            value={extraDraft.description}
                            onChange={(event) => setExtraDraft((s) => ({ ...s, description: event.target.value }))}
                            aria-label="Charge description"
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Amount <span className="text-red-500">*</span>
                          <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                            <span className="flex items-center bg-slate-100 px-3 text-sm text-slate-500">{currency}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 9999"
                              className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                              value={extraDraft.amount}
                              onChange={(event) => setExtraDraft((s) => ({ ...s, amount: event.target.value }))}
                              aria-label="Charge amount"
                            />
                          </div>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Category <span className="font-normal text-slate-400">(optional)</span>
                          <input
                            className={`${field} mt-1`}
                            placeholder="e.g. Service, Fee"
                            value={extraDraft.category}
                            onChange={(event) => setExtraDraft((s) => ({ ...s, category: event.target.value }))}
                            aria-label="Charge category"
                          />
                        </label>
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Apply To: <span className="font-medium text-slate-800">Entire Package</span> · Fixed amount, not multiplied by traveler count
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <Button variant="secondary" type="button" onClick={() => setExtraChargeDrawerOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            const label = extraDraft.label.trim();
                            if (!label) {
                              setExtraDraftError('Charge Name is required.');
                              return;
                            }
                            if (label.length > 100) {
                              setExtraDraftError('Charge Name must be 100 characters or fewer.');
                              return;
                            }
                            const amountNum = Number(extraDraft.amount);
                            if (!extraDraft.amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
                              setExtraDraftError('Enter a valid Amount greater than 0.');
                              return;
                            }
                            if (amountNum > 999999999999) {
                              setExtraDraftError('Amount is too large.');
                              return;
                            }
                            const nextCharge = {
                              label,
                              amount: Math.round(amountNum * 100) / 100,
                              description: extraDraft.description.trim() || null,
                              category: extraDraft.category.trim() || null,
                            };
                            const current = (form.getValues('customCharges') as unknown as Array<{ label: string; amount: number; description?: string | null; category?: string | null }>) ?? [];
                            let next: typeof current;
                            if (editingExtraIndex === null) {
                              next = [...current, nextCharge];
                            } else {
                              next = current.map((c, i) => (i === editingExtraIndex ? nextCharge : c));
                            }
                            form.setValue('customCharges', next as never, { shouldDirty: true });
                            setExtraChargeDrawerOpen(false);
                            setEditingExtraIndex(null);
                            setExtraDraft({ label: '', amount: '', description: '', category: '' });
                            setExtraDraftError('');
                          }}
                        >
                          {editingExtraIndex === null ? 'Add Charge' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Adjustment pipeline — applied ONCE to the active pricing
                method's subtotal. Never to both. */}
            <section className="rounded-xl border p-5">
              <h3 className="text-base font-semibold text-slate-800">Discount &amp; Tax</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Applied after the {isSectionWisePricing ? 'section-wise' : 'traveler-wise'}{' '}
                subtotal: Subtotal → Discount → Tax → Grand Total.
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Discount Amount
                  <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                    <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label="Discount amount"
                      className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                      {...form.register('discountAmount', MONEY_FIELD)}
                    />
                  </div>
                </label>
                <label className="text-sm font-semibold text-slate-800">
                  Tax Rate (%)
                  <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      aria-label="Tax rate percent"
                      className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                      {...form.register('taxRate', MONEY_FIELD)}
                    />
                    <span className="flex items-center bg-slate-100 px-2 text-slate-500">%</span>
                  </div>
                </label>
              </div>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Subtotal ({isSectionWisePricing ? 'Section-wise' : 'Traveler-wise'})
                  </span>
                  <span className="font-medium">{formatMoney(livePricing.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium">-{formatMoney(livePricing.discountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Taxable Amount</span>
                  <span className="font-medium">{formatMoney(livePricing.taxableAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax ({livePricing.taxRate}%)</span>
                  <span className="font-medium">{formatMoney(livePricing.taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold text-slate-900">
                  <span>Grand Total</span>
                  <span>{formatMoney(livePricing.grandTotal)}</span>
                </div>
              </div>
            </section>

            {/* Pricing completeness — same validator the backend enforces on
                finalization. Errors block finalize/send; warnings advise. */}
            {pricingIssues.length > 0 && (
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h3 className="text-base font-semibold text-amber-800">Pricing Validation</h3>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {pricingIssues.map((issue, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="font-semibold uppercase">
                        {issue.severity === 'ERROR' ? 'Error:' : 'Warning:'}
                      </span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border p-5">
              <h3 className="text-lg font-semibold text-slate-800">Initial Payment Details</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Initial Amount for Booking
                  <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                    <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Initial amount for booking"
                      placeholder="Amount required to confirm booking"
                      {...form.register('initialPaymentAmount', MONEY_FIELD)}
                      className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </label>
                <label className="text-sm font-semibold text-slate-800">
                  Payment Link
                  <input
                    aria-label="Payment link"
                    placeholder="https://example.com/pay"
                    {...form.register('paymentLink', {
                      setValueAs: (value: unknown) =>
                        typeof value === 'string' ? value.trim() || null : (value ?? null),
                    })}
                    className={`${field} mt-1`}
                  />
                  {form.formState.errors.paymentLink && (
                    <span className="mt-1 block text-xs font-normal text-red-600">
                      {form.formState.errors.paymentLink.message as string}
                    </span>
                  )}
                </label>
              </div>
            </section>

            <section className="grid gap-4 rounded-xl border p-5 md:grid-cols-1">
              <label className="text-sm font-semibold text-slate-800">
                Introduction
                <textarea rows={2} {...form.register('introduction')} className={`${field} mt-1`} />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Shown to the customer near the beginning of the weblink and PDF.
                </span>
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Notes for Customer
                <textarea rows={2} {...form.register('notes')} className={`${field} mt-1`} />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Shown to the customer near the end of the weblink and PDF.
                </span>
              </label>
              {canCost && (
                <label className="text-sm font-semibold text-slate-800">
                  Internal Notes
                  <textarea
                    rows={2}
                    {...form.register('internalNotes')}
                    className={`${field} mt-1`}
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Staff only - never shown in customer weblinks or PDFs.
                  </span>
                </label>
              )}
            </section>
          </div>
        )}

        {/* Pricing Breakdown — every priced quotation section from the shared
            resolver (single source of truth, incl. Visa). The section total is
            the grand total for SECTION_WISE; TOTAL pricing keeps the package
            total as the single authoritative number. */}
        {activeTab === 'pricingBreakdown' &&
          (() => {
            const pricing = livePricing;
            const isSectionWise = pricing.pricingMode === 'SECTION_WISE';
            const order = form.watch('pricingDisplayOrder') ?? DEFAULT_PRICING_ORDER;
            const sections = [...pricing.sections].sort((a, b) => {
                const ia = order.indexOf(a.id);
                const ib = order.indexOf(b.id);
                return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
              });
            // The grand total follows the same rule as the summary card: the
            // authoritative pipeline total (subtotal − discount + tax) of the
            // ACTIVE pricing method only.
            const grandTotal = pricing.grandTotal;
            // Expandable hotel calculation: every contributing stay with its
            // room/meal lines so the agent can verify the arithmetic.
            const hotelBreakdownRows = (() => {
              const rows = form.watch('hotels') ?? [];
              if (!rows.length || form.watch('hotelDetails.include') === false) return [];
              return rows
                .filter((row) => row.selected !== false)
                .map((row) => ({ row, totals: calculateHotelRowTotal(row) }))
                .filter((entry) => entry.totals.total !== 0);
            })();
            // Flight per-traveler breakdown — reuse authoritative getFlightPerTravelerBreakdown
            // (same data used by Weblink/PDF). Only when flight is PER_TRAVELER with rates.
            const flightBreakdownRows = (() => {
              const details = form.watch('flightDetails') as unknown;
              if (!details || typeof details !== 'object') return null;
              return getFlightPerTravelerBreakdown(details, {
                adults: (q as unknown as { adults?: number }).adults ?? 0,
                childrenWithBed: (q as unknown as { childrenWithBed?: number }).childrenWithBed ?? 0,
                childrenWithoutBed: (q as unknown as { childrenWithoutBed?: number }).childrenWithoutBed ?? 0,
                infants: (q as unknown as { infants?: number }).infants ?? 0,
              });
            })();
            const money = (value: number) => formatMoney(Math.round(value * 100) / 100);
            return (
              <div className="space-y-5">
                <section className="overflow-hidden rounded-xl border">
                  <div className="bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-3 font-semibold text-white">
                    Pricing Breakdown
                    <span className="ml-2 text-sm font-normal text-white/80">
                      {isSectionWise ? 'By Section' : 'By Traveler'}
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="text-lg font-semibold text-slate-900">
                      {form.watch('pricingHeading') || 'Price Breakdown'}
                    </p>
                    {form.watch('pricingSubheading') ? (
                      <p className="mt-0.5 text-sm text-slate-500">{form.watch('pricingSubheading')}</p>
                    ) : null}
                    {isSectionWise ? (
                      <div className="overflow-hidden rounded-xl border bg-card">
                        <div className="divide-y">
                          {sections.map((section) => (
                            <div key={section.id} className="px-4 py-2.5 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-slate-700">{section.label}</span>
                                <span className="font-semibold text-slate-900">{formatMoney(section.amount)}</span>
                              </div>
                              {section.id.startsWith('extra-') && (section as { description?: string | null }).description ? (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-xs text-brand-700 hover:underline">Details</summary>
                                  <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">{(section as { description?: string | null }).description}</p>
                                </details>
                              ) : null}
                              {section.id.startsWith('extra-') && (section as { category?: string | null }).category ? (
                                <span className="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{(section as { category?: string | null }).category}</span>
                              ) : null}
                              {section.id === 'hotel' && hotelBreakdownRows.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-xs text-brand-700 hover:underline">
                                    Show hotel calculation
                                  </summary>
                                  <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                                    {hotelBreakdownRows.map(({ row, totals }, index) => (
                                      <div key={index}>
                                        <p className="font-semibold text-slate-700">
                                          {row.hotelName || `Stay ${index + 1}`}
                                          {row.nights ? ` · ${row.nights} night(s)` : ''}
                                          {row.optionGroupId ? ' · Alternative option' : ''}
                                        </p>
                                        {resolveHotelRoomLines(row).map((line, lineIndex) => (
                                          <p key={lineIndex}>
                                            {line.roomType || `Room ${lineIndex + 1}`}:{' '}
                                            {line.rooms ?? 1} × {money(Number(line.baseRoomPrice ?? line.sellingPrice ?? 0))} ×{' '}
                                            {row.nights ?? 1} ={' '}
                                            {money(
                                              (Number(line.baseRoomPrice ?? line.sellingPrice ?? 0)) *
                                                (line.rooms ?? 1) *
                                                (row.nights ?? 1),
                                            )}
                                            {(line.extraBedQuantity ?? 0) > 0 &&
                                              ` + Extra bed ${line.extraBedQuantity} × ${money(Number(line.extraBedPrice ?? 0))} × ${row.nights ?? 1}`}
                                            {(line.childWithoutBedQuantity ?? 0) > 0 &&
                                              ` + CWOB ${line.childWithoutBedQuantity} × ${money(Number(line.childWithoutBedPrice ?? 0))} × ${row.nights ?? 1}`}
                                          </p>
                                        ))}
                                        {resolveHotelMealPlanLines(row).map((line, lineIndex) => (
                                          <p key={`meal-${lineIndex}`}>
                                            Meal plan {line.mealPlan || ''}:{' '}
                                            {money(Number(line.sellingPrice ?? 0))}
                                          </p>
                                        ))}
                                        <p className="font-semibold text-slate-700">
                                          Stay total: {money(totals.total)}
                                          {totals.mealTotal > 0
                                            ? ` (Rooms ${money(totals.roomTotal)} + Meals ${money(totals.mealTotal)})`
                                            : ''}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                              {section.id === 'flight' &&
                                flightBreakdownRows &&
                                flightBreakdownRows.filter(
                                  (r: { count: number; rate: number }) => r.count > 0 && r.rate > 0,
                                ).length > 0 && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-xs text-brand-700 hover:underline">
                                      Show flight calculation
                                    </summary>
                                    <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                                      {flightBreakdownRows
                                        .filter(
                                          (r: { count: number; rate: number }) => r.count > 0 && r.rate > 0,
                                        )
                                        .map(
                                          (row: { label: string; count: number; rate: number; total: number }) => (
                                          <div
                                            key={row.label}
                                            className="flex items-center justify-between"
                                          >
                                            <span className="text-slate-600">
                                              {row.label}: {row.count} × {formatMoney(row.rate)}
                                            </span>
                                            <span className="font-medium text-slate-900">
                                              {formatMoney(row.total)}
                                            </span>
                                          </div>
                                        ))}
                                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                                        <span>Flight Total</span>
                                        <span>{formatMoney(section.amount)}</span>
                                      </div>
                                    </div>
                                  </details>
                                )}
                            </div>
                          ))}
                           {(pricing.discountAmount !== 0 || pricing.taxAmount !== 0) && (
                            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                              <span className="font-medium text-slate-700">Subtotal</span>
                              <span className="text-slate-900">{formatMoney(pricing.sectionTotal)}</span>
                            </div>
                          )}
                          {pricing.discountAmount !== 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                              <span className="font-medium text-slate-700">Discount</span>
                              <span className="text-slate-900">
                                -{formatMoney(pricing.discountAmount)}
                              </span>
                            </div>
                          )}
                          {pricing.taxAmount !== 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                              <span className="font-medium text-slate-700">
                                Tax ({pricing.taxRate}%)
                              </span>
                              <span className="text-slate-900">{formatMoney(pricing.taxAmount)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                            <span>Grand Total</span>
                            <span>{formatMoney(grandTotal)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
                        <p className="font-semibold text-slate-900">Per-Person Pricing</p>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Number of Travelers</span>
                          <span className="font-semibold text-slate-900">
                            {pax.adults + pax.cwb + pax.cwob + pax.infants}
                          </span>
                        </div>
                        {(
                          [
                            ['Adult', pax.adults, perPax.adult],
                            ['Child with Bed', pax.cwb, perPax.cwb],
                            ['Child without Bed', pax.cwob, perPax.cwob],
                            ['Infant', pax.infants, perPax.infant],
                          ] as const
                        )
                          .filter(([, count, price]) => count > 0 && Number(price) > 0)
                          .map(([label, count, price]) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-slate-600">
                                {label} ({count})
                              </span>
                              <span className="font-medium text-slate-900">
                                {formatMoney(Number(price))}
                              </span>
                            </div>
                          ))}
                        <div className="flex items-center justify-between border-t-2 border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">
                          <span>Package Subtotal</span>
                          <span>{formatMoney(pricing.travelerPricing.subtotal)}</span>
                        </div>
                        {pricing.discountAmount !== 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Discount</span>
                            <span>-{formatMoney(pricing.discountAmount)}</span>
                          </div>
                        )}
                        {pricing.taxAmount !== 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Tax ({pricing.taxRate}%)</span>
                            <span>{formatMoney(pricing.taxAmount)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                          <span>Grand Total</span>
                          <span>{formatMoney(grandTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            );
          })()}

        {/* Settings and Destination Expert */}
        {(activeTab === 'setting' || activeTab === 'destinationExpert') && (
          <div className="space-y-4">
            {activeTab === 'setting' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold text-slate-900">Quotation Settings</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Manage the public weblink and final quotation review.
                </p>
              </div>
            )}

            <div className="grid items-start gap-4">
              {activeTab === 'setting' && <div className="space-y-4">
                {/* Weblink Settings */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="text-sm font-semibold text-slate-900">Weblink Settings</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Control how customers navigate the public quotation.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                        checked={form.watch('showQuickNav') ?? true}
                        disabled={weblinkSettings.isPending}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          form.setValue('showQuickNav', checked, { shouldDirty: true });
                          if (version) {
                            weblinkSettings.mutate({
                              versionId: version.id,
                              showQuickNav: checked,
                            });
                          }
                        }}
                      />
                      <span>
                        <span className="block font-medium text-slate-800">
                          Show Quick Navigation
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                          Let customers jump between weblink sections.
                        </span>
                      </span>
                    </label>
                    <label
                      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm ${
                        (form.watch('showQuickNav') ?? true) ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                        checked={form.watch('quickNavSticky') ?? true}
                        disabled={
                          !(form.watch('showQuickNav') ?? true) || weblinkSettings.isPending
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          form.setValue('quickNavSticky', checked, { shouldDirty: true });
                          if (version) {
                            weblinkSettings.mutate({
                              versionId: version.id,
                              quickNavSticky: checked,
                            });
                          }
                        }}
                      />
                      <span>
                        <span className="block font-medium">Keep navigation sticky</span>
                        <span className="mt-0.5 block text-xs leading-4 opacity-75">
                          Keep shortcuts visible while scrolling.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <label htmlFor="weblink-name" className="text-sm font-semibold text-slate-800">
                      Weblink Name
                    </label>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Create a short, memorable name for the customer link.
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        id="weblink-name"
                        className={`${field} min-w-0 flex-1`}
                        type="text"
                        placeholder="e.g. Mohan"
                        value={weblinkNameValue}
                        disabled={weblinkName.isPending}
                        onChange={(event) => {
                          setWeblinkNameValue(event.target.value);
                          setWeblinkNameError('');
                        }}
                        onBlur={() => void saveWeblinkName()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={weblinkName.isPending}
                        onClick={() => void saveWeblinkName()}
                      >
                        Save name
                      </Button>
                    </div>
                    <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Friendly link:</span>{' '}
                      {weblinkNamePreview ? (
                        <span className="break-all font-medium text-brand-600 underline decoration-brand-300 underline-offset-2">
                          {weblinkNamePreview}
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                    {weblinkNameError && (
                      <p role="alert" className="mt-2 text-xs text-red-700">
                        {weblinkNameError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Section Order — collapsible accordion (collapsed by default). */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSectionOrderOpen((open) => !open)}
                    aria-expanded={sectionOrderOpen}
                    aria-controls="weblink-section-order-panel"
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:px-5"
                  >
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        Weblink Section Order
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {
                            resolveWeblinkSectionOrder(
                              form.watch('weblinkSectionOrder')?.length
                                ? form.watch('weblinkSectionOrder')
                                : DEFAULT_WEBLINK_SECTION_ORDER,
                            ).length
                          }{' '}
                          sections
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Arrange sections in the order customers should see them.
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${sectionOrderOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {sectionOrderOpen && (
                    <div id="weblink-section-order-panel" className="border-t border-slate-200">
                      <div className="divide-y divide-slate-100 px-4 sm:px-5">
                        {(() => {
                          const saved = form.watch('weblinkSectionOrder');
                          const order = resolveWeblinkSectionOrder(
                            saved?.length ? saved : DEFAULT_WEBLINK_SECTION_ORDER,
                          );
                          const move = (index: number, dir: -1 | 1) => {
                            const next = [...order];
                            const target = index + dir;
                            if (target < 0 || target >= next.length) return;
                            [next[index], next[target]] = [next[target]!, next[index]!];
                            form.setValue('weblinkSectionOrder', next, { shouldDirty: true });
                          };
                          return order.map((sectionId, index) => (
                            <div
                              key={sectionId}
                              className="flex items-center justify-between gap-3 py-2"
                            >
                              <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">
                                  {index + 1}
                                </span>
                                <span className="truncate">
                                  {WEBLINK_SECTION_LABELS[sectionId] ?? sectionId}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={index === 0}
                                  aria-label={`Move ${sectionId} up`}
                                  onClick={() => move(index, -1)}
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={index === order.length - 1}
                                  aria-label={`Move ${sectionId} down`}
                                  onClick={() => move(index, 1)}
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-600 hover:text-slate-900"
                          onClick={() =>
                            form.setValue(
                              'weblinkSectionOrder',
                              [...DEFAULT_WEBLINK_SECTION_ORDER],
                              { shouldDirty: true },
                            )
                          }
                        >
                          Reset to default order
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>}

              {/* Destination Expert */}
              {activeTab === 'destinationExpert' && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Destination Expert</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Add a trusted contact to the customer-facing weblink.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-700 xl:w-full">
                    <span>Show Destination Expert</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                      checked={Boolean(watchedExpertConfig?.enabled)}
                      onChange={(e) => {
                        const cur = form.getValues('destinationExpertConfig') as unknown as Record<string, unknown> | null;
                        const enabled = e.target.checked;
                        const currentUserId = user?.id ?? null;
                        const next: Record<string, unknown> = {
                          enabled,
                          expertUserId: currentUserId,
                          heading: (cur as Record<string, unknown> | null)?.heading ?? null,
                          customIntroduction: (cur as Record<string, unknown> | null)?.customIntroduction ?? null,
                          whatsappNumber: (cur as Record<string, unknown> | null)?.whatsappNumber ?? null,
                          callNumber: (cur as Record<string, unknown> | null)?.callNumber ?? null,
                          email: (cur as Record<string, unknown> | null)?.email ?? null,
                          showWhatsapp: (cur as Record<string, unknown> | null)?.showWhatsapp ?? true,
                          showCall: (cur as Record<string, unknown> | null)?.showCall ?? true,
                          showEmail: (cur as Record<string, unknown> | null)?.showEmail ?? true,
                          showExperience: (cur as Record<string, unknown> | null)?.showExperience ?? true,
                          showTripsPlanned: (cur as Record<string, unknown> | null)?.showTripsPlanned ?? true,
                          showLanguages: (cur as Record<string, unknown> | null)?.showLanguages ?? true,
                        };
                        if (enabled) {
                          const expertId = (next.expertUserId as string | null) ?? null;
                          const fallback = getExpertFallback(expertId);
                          if (!next.whatsappNumber && fallback.whatsappNumber) next.whatsappNumber = fallback.whatsappNumber;
                          if (!next.callNumber && fallback.callNumber) next.callNumber = fallback.callNumber;
                          if (!next.email && fallback.email) next.email = fallback.email;
                        }
                        form.setValue('destinationExpertConfig', next as never, { shouldDirty: true });
                      }}
                    />
                  </label>
                </div>
                {watchedExpertConfig?.enabled && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <label className="block text-sm font-semibold text-slate-800">
                      Expert
                      <input
                        className={`${field} mt-1 bg-slate-100`}
                        value={user?.fullName ?? ''}
                        disabled
                        readOnly
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <label className="block flex-1 text-sm font-semibold text-slate-800">
                        Import destination preset
                        <select
                          className={`${field} mt-1 bg-white`}
                          value={selectedPresetId}
                          onChange={(e) => setSelectedPresetId(e.target.value)}
                        >
                          <option value="">Select destination preset</option>
                          {filteredDestinationExpertPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.destination}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!selectedPresetId}
                        onClick={() => {
                          const preset = (destinationExpertPresetsQuery.data ?? []).find((p) => p.id === selectedPresetId);
                          if (!preset) return;
                          const cur = form.getValues('destinationExpertConfig') as unknown as Record<string, unknown> | null;
                          form.setValue(
                            'destinationExpertConfig',
                            {
                              ...(cur ?? {}),
                              enabled: true,
                              expertUserId: user?.id ?? null,
                              heading: preset.heading ?? null,
                              customIntroduction: preset.customIntroduction ?? null,
                              whatsappNumber: preset.whatsappNumber ?? null,
                              callNumber: preset.callNumber ?? null,
                              email: preset.email ?? null,
                              showWhatsapp: preset.showWhatsapp,
                              showCall: preset.showCall,
                              showEmail: preset.showEmail,
                              showExperience: preset.showExperience,
                              showTripsPlanned: preset.showTripsPlanned,
                              showLanguages: preset.showLanguages,
                              jobTitle: (preset as unknown as { jobTitle?: string | null }).jobTitle ?? null,
                              bio: (preset as unknown as { bio?: string | null }).bio ?? null,
                              specialization: (preset as unknown as { specialization?: string | null }).specialization ?? null,
                              yearsOfExperience: (preset as unknown as { yearsOfExperience?: number | null }).yearsOfExperience ?? null,
                              tripsPlanned: (preset as unknown as { tripsPlanned?: number | null }).tripsPlanned ?? null,
                              languages: (preset as unknown as { languages?: string | null }).languages ?? null,
                              gender: (preset as unknown as { gender?: string | null }).gender ?? null,
                              profileImageUrl: (preset as unknown as { profileImageUrl?: string | null }).profileImageUrl ?? null,
                              destination: preset.destination ?? null,
                            } as never,
                            { shouldDirty: true },
                          );
                        }}
                      >
                        Import
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400">Presets are managed in Settings → Destination Expert (per user, per destination).</p>
                    <label className="block text-sm font-semibold text-slate-800">
                      Heading
                      <input
                        className={`${field} mt-1 bg-white`}
                        placeholder="e.g. Your Destination Expert"
                        value={watchedExpertConfig?.heading ?? ''}
                        onChange={(e) => {
                          const cur = form.getValues('destinationExpertConfig');
                          form.setValue(
                            'destinationExpertConfig',
                            { ...(cur ?? {}), heading: e.target.value || null } as never,
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      Custom introduction
                      <textarea
                        rows={2}
                        className={`${field} mt-1 bg-white`}
                        placeholder="Custom intro shown under expert details"
                        value={watchedExpertConfig?.customIntroduction ?? ''}
                        onChange={(e) => {
                          const cur = form.getValues('destinationExpertConfig');
                          form.setValue(
                            'destinationExpertConfig',
                            { ...(cur ?? {}), customIntroduction: e.target.value || null } as never,
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      WhatsApp Number
                      <input
                        className={`${field} mt-1 bg-white`}
                        placeholder="+91XXXXXXXXXX"
                        value={((watchedExpertConfig as unknown as { whatsappNumber?: string | null })?.whatsappNumber ?? '') as string}
                        onChange={(e) => {
                          const cur = form.getValues('destinationExpertConfig');
                          form.setValue(
                            'destinationExpertConfig',
                            { ...(cur ?? {}), whatsappNumber: e.target.value.trim() || null } as never,
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      Call Number
                      <input
                        className={`${field} mt-1 bg-white`}
                        placeholder="+91XXXXXXXXXX"
                        value={((watchedExpertConfig as unknown as { callNumber?: string | null })?.callNumber ?? '') as string}
                        onChange={(e) => {
                          const cur = form.getValues('destinationExpertConfig');
                          form.setValue(
                            'destinationExpertConfig',
                            { ...(cur ?? {}), callNumber: e.target.value.trim() || null } as never,
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      Email Address
                      <input
                        className={`${field} mt-1 bg-white`}
                        placeholder="expert@email.com"
                        value={((watchedExpertConfig as unknown as { email?: string | null })?.email ?? '') as string}
                        onChange={(e) => {
                          const cur = form.getValues('destinationExpertConfig');
                          form.setValue(
                            'destinationExpertConfig',
                            { ...(cur ?? {}), email: e.target.value.trim() || null } as never,
                            { shouldDirty: true },
                          );
                        }}
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {(
                        [
                          ['showWhatsapp', 'Show WhatsApp'],
                          ['showCall', 'Show Call'],
                          ['showEmail', 'Show Email'],
                          ['showExperience', 'Show Experience'],
                          ['showTripsPlanned', 'Show Trips Planned'],
                          ['showLanguages', 'Show Languages'],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600"
                            checked={Boolean(
                              (watchedExpertConfig as unknown as Record<string, unknown>)?.[key] ??
                              true,
                            )}
                            onChange={(e) => {
                              const cur = form.getValues('destinationExpertConfig');
                              form.setValue(
                                'destinationExpertConfig',
                                { ...(cur ?? {}), [key]: e.target.checked } as never,
                                { shouldDirty: true },
                              );
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>}
            </div>
          </div>
        )}
      </section>

      {/* Quotation Summary (preserved across every builder tab). */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="bg-emerald-600 px-5 py-3 font-semibold text-white">Quotation Summary</div>
        <div className="grid gap-0 p-0 md:grid-cols-2">
          <table className="text-sm">
            <tbody>
              {[
                ['Client Name', q.customerName],
                ['Contact', [q.customerPhone, q.customerEmail].filter(Boolean).join(' / ')],
                ['Travelers', travellers || '—'],
                [
                  'Dates',
                  q.travelStartDate
                    ? `${new Date(q.travelStartDate).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}${nights != null ? ` (${nights} Nights / ${nights + 1} Days)` : ''}`
                    : '—',
                ],
                ['Destination', q.destinationSummary || '—'],
              ].map(([label, value]) => (
                <tr key={label} className="border-b last:border-0">
                  <th className="w-40 border-r bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700">
                    {label}
                  </th>
                  <td className="px-4 py-3 text-slate-700">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col justify-center gap-3 p-5">
            <div className="rounded-lg bg-emerald-600 p-4 text-white">
              <p className="text-sm opacity-90">Final Quotation Total</p>
              <p className="text-2xl font-bold">
                {currency} {summaryTotal.toFixed(2)}
              </p>
              <p className="text-xs opacity-80">
                {isSectionWisePricing ? '(Section-wise Total)' : '(Package Price)'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {activeTab === 'setting' ? (
        <div
          aria-label="Settings actions"
          className="flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <p className="text-xs text-slate-500">
            Saving applies these settings to the current quotation version.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Link to={`/quotations/${quotationId}`} className="w-full sm:inline-flex sm:w-auto">
              <Button variant="secondary" type="button" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button type="submit" isLoading={save.isPending} className="w-full sm:w-auto">
              <Save className="h-4 w-4" />
              Save quotation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" isLoading={save.isPending}>
            <Save className="h-4 w-4" />
            Save quotation
          </Button>
          <Link to={`/quotations/${quotationId}`}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
        </div>
      )}
    </form>
  );
}
