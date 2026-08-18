import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  ChevronDown,
  ImageIcon,
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
  cabinLuggageLabel,
  formatItineraryDayTitle,
  hotelStayNights,
  labelForLookup,
  quotationVersionInputSchema,
  resolveTaxNoteChoice,
  type LiveSearchBookmark,
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
} from '@/features/quotations/quotations.api';
import {
  hotelImageUrl,
  useAddOnServices,
  useAirlines,
  useCreateAirline,
  useCruises,
  useDestinations,
  useHotel,
  useHotels,
  useSightseeingList,
  useVehicles,
  type Airline,
  type Destination,
  type Page,
  type Sightseeing,
} from '@/features/masters/masters.api';
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

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';

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
}

const defaultVehicleDraft = (): VehicleDraft => ({
  include: true,
  sectionTitle: 'Transportation',
  amount: 0,
  vehicleType: '',
  vehicleId: '',
  vehicleModel: '',
  usage: '',
  description: '',
});

const hotelSectionTitle = (value: string | null | undefined) => {
  const title = value?.trim();
  return !title || title === 'Accommodation Details' ? 'Your Hotels' : title;
};

const TABS: TabDef[] = [
  { key: 'flight', label: 'Flight' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'cruise', label: 'Cruise', types: ['CRUISE'] },
  { key: 'vehicle', label: 'Vehicle', types: ['VEHICLE_TRANSFER'] },
  ...(SHOW_VISA_QUOTATION_TAB ? [{ key: 'visa', label: 'Visa' }] : []),
  { key: 'addon', label: 'Add-on Services', types: ADDON_TYPES },
  { key: 'inclusions', label: 'Inclusions & Exclusions' },
  { key: 'summary', label: 'Summary & Pricing' },
];

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
  pricingMode: 'ITEMIZED',
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
  showServiceChargesSeparately: false,
  markServiceChargesOutside: false,
  hidePricing: false,
  showIndividualPricing: false,
  showQuickNav: true,
  quickNavSticky: false,
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
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
};
const toDate = (value: string | Date | null | undefined) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const nullable = (value: string) => (value === '' ? null : Number(value));

type HotelInputRow = QuotationVersionInput['hotels'][number];

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
  selected,
  notes: null,
  sequence,
  images: [],
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
    built.push({
      ...row,
      hotelId: selected?.id ?? null,
      hotelRoomTypeId: null,
      hotelMealPlanId: null,
      hotelName: selected?.name ?? row.hotelName ?? '',
      city: selected ? selected.city.name : cityName,
      category: selected?.starCategory ? `${selected.starCategory} Star` : null,
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
}: {
  hotelId?: string | null | undefined;
  /** First saved snapshot image, shown when the hotel has no Master link. */
  snapshotImageUrl?: string | null | undefined;
  /** Fallback candidate for the same image, used if the primary fails. */
  snapshotThumbnailUrl?: string | null | undefined;
}) {
  const hotel = useHotel(hotelId ?? undefined);
  const image = useQuery({
    queryKey: ['masters', 'hotels', hotelId ?? '', 'quotation-preview'],
    queryFn: () => hotelImageUrl(hotelId!),
    enabled: Boolean(hotelId && hotel.data?.hasImage),
    staleTime: 4 * 60 * 1000,
  });
  const [previewFallback, setPreviewFallback] = useState(false);
  const snapshotSrc =
    previewFallback && snapshotThumbnailUrl ? snapshotThumbnailUrl : snapshotImageUrl;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-36 items-center justify-center bg-slate-100">
        {image.data?.url ? (
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
}: {
  image: { url: string; thumbnailUrl?: string | null | undefined };
  alt: string;
}) {
  const [useThumbnail, setUseThumbnail] = useState(false);
  const src = useThumbnail && image.thumbnailUrl ? image.thumbnailUrl : image.url;
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

export function QuotationBuilderPage() {
  const { quotationId = '', versionId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCost = hasPermission(PERMISSIONS.QUOTATIONS_VIEW_COSTING);
  const canManageAirlineMedia = hasPermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA);
  const quotation = useQuotation(quotationId);
  const save = useUpdateQuotationVersion(quotationId, versionId);
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
  const vehicleMasters = useVehicles(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const [activeTab, setActiveTab] = useState('flight');
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
  // Tracks whether the user has explicitly toggled a section's Include checkbox
  // so the init-time sync (from the lead's requested services) never re-enables
  // a section after a manual choice.
  const autoToggleRef = useRef<Set<string>>(new Set());
  // Keep the resolver in sync with the latest include/exclude state without
  // re-creating the whole form. Hotel is the only tab that always carries a
  // default empty row, so excluding it must bypass hotel validation entirely.
  const excludedRef = useRef(excluded);
  useEffect(() => {
    excludedRef.current = excluded;
  }, [excluded]);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(defaultVehicleDraft);
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
  const outboundSegments = useFieldArray({
    control: form.control,
    name: 'flightDetails.outbound.segments',
  });
  const returnSegments = useFieldArray({
    control: form.control,
    name: 'flightDetails.returnJourney.segments',
  });
  const airlines = useAirlines(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const createAirline = useCreateAirline();
  const queryClient = useQueryClient();
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
  useEffect(() => {
    const details = version?.flightDetails;
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
  }, [quotationId, version?.flightDetails]);
  // Tabs requested by the Lead — the source of truth for the red `*` on each
  // service tab. Derived from the lead's own service selections, never from the
  // quotation's saved state (so a requested-but-unchecked service still shows
  // its `*`, meaning "requested on the Lead").
  const leadRequested = useMemo(
    () => leadRequestedTabs(quotation.data?.query),
    [quotation.data?.query],
  );
  useEffect(() => {
    if (!version) return;
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
    // Prefill a day-per-night sightseeing itinerary (+1 departure day) from the
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

    // Resolve the departure master for the final destination: exact city match
    // first, then any active departure master for the destination, then by
    // sequence then title.
    const finalCity = dayCities[dayCities.length - 1] ?? '';
    const departureMasters = orderedMasters.filter((row) => isDepartureTitle(row.title));
    const departureMaster =
      departureMasters.find((row) => cityKey(row.city?.name) === cityKey(finalCity)) ??
      departureMasters[0] ??
      null;

    const usedIds = new Set<string>();
    // Reserve the departure master so it is never consumed by earlier days.
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
    const toActivity = (row: Sightseeing) => ({
      sightseeingId: row.id,
      name: row.title,
      startTime: row.suggestedStartTime ?? null,
      showTime: Boolean(row.suggestedStartTime),
      duration: row.estimatedHours != null ? `${row.estimatedHours} hours` : null,
      city: row.city?.name ?? null,
      description: row.description ?? null,
      imageUrl: null,
      pricingOptions: emptySightseeingActivity().pricingOptions,
      sequence: 1,
    });
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
      pricingMode: version.pricingMode as QuotationVersionInput['pricingMode'],
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
      quickNavSticky: version.quickNavSticky ?? false,
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
            return {
              ...row,
              checkInDate: row.checkInDate
                ? new Date(row.checkInDate)
                : (matchingStay?.checkInDate ?? (startStr ? new Date(startStr) : null)),
              checkOutDate: row.checkOutDate
                ? new Date(row.checkOutDate)
                : (matchingStay?.checkOutDate ??
                  (returnStr ? new Date(returnStr) : endStr ? new Date(endStr) : null)),
              showCheckInTime: Boolean(row.checkInTime) && row.showCheckInTime !== false,
              showCheckOutTime: Boolean(row.checkOutTime) && row.showCheckOutTime !== false,
              internalCost: row.internalCost ? Number(row.internalCost) : 0,
              sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : 0,
              // Backward compatibility: older quotations stored the bookmark
              // gallery at section level (hotelDetails.images). Migrate it onto
              // the single hotel stay so the per-stay image manager and PDF
              // selection keep working. Rows that already carry their own
              // images (newer saves) are left untouched.
              images: (Array.isArray(row.images) && row.images.length > 0
                ? row.images
                : version.hotels.length === 1 && Array.isArray(version.hotelDetails?.images)
                  ? version.hotelDetails.images.map((image) => ({
                      url: image.url,
                      thumbnailUrl: null,
                      alt: image.alt ?? null,
                    }))
                  : (row.images ?? [])) as NonNullable<
                QuotationVersionInput['hotels']
              >[number]['images'],
              pdfImageUrl:
                row.pdfImageUrl ??
                (version.hotels.length === 1 ? (version.hotelDetails?.pdfImageUrl ?? null) : null),
            };
          })
        : autoPrefillLeadRows(leadHotelRows, hotelMasters.data?.data ?? []),
      services: version.services.map((row) => ({
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
        sequence: row.sequence,
      })),
      inclusions: version.inclusions,
      exclusions: version.exclusions,
      terms: version.terms,
    });
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

  // Per-stay bookmark snapshot image management. Every hotel stay owns its own
  // image list and its own "Use in PDF" selection. Reordering and removal only
  // edit this quotation's saved copy — the bookmark itself is never touched.
  // Removing the PDF-selected image moves the selection to the first remaining
  // image, matching the PDF's fallback rule.
  const moveHotelImage = (stayIndex: number, index: number, direction: -1 | 1) => {
    const current = (watchedHotels?.[stayIndex]?.images ?? []) as Array<{
      url: string;
      thumbnailUrl?: string | null;
      alt?: string | null;
    }>;
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    form.setValue(`hotels.${stayIndex}.images`, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const removeHotelImage = (stayIndex: number, index: number) => {
    const current = (watchedHotels?.[stayIndex]?.images ?? []) as Array<{
      url: string;
      thumbnailUrl?: string | null;
      alt?: string | null;
    }>;
    const removed = current[index];
    const next = current.filter((_, imageIndex) => imageIndex !== index);
    form.setValue(`hotels.${stayIndex}.images`, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (removed && watchedHotels?.[stayIndex]?.pdfImageUrl === removed.url)
      form.setValue(`hotels.${stayIndex}.pdfImageUrl`, next[0]?.url ?? null, {
        shouldDirty: true,
      });
  };
  const setHotelPdfImage = (stayIndex: number, url: string) =>
    form.setValue(`hotels.${stayIndex}.pdfImageUrl`, url, { shouldDirty: true });

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
      // Same mapping as a manual master selection (see HotelMasterFields).
      for (const [key, patchValue] of Object.entries({
        hotelId: defaultHotel.id,
        hotelRoomTypeId: null,
        hotelMealPlanId: null,
        hotelName: defaultHotel.name,
        city: defaultHotel.city.name,
        category: defaultHotel.starCategory ? `${defaultHotel.starCategory} Star` : null,
      })) {
        form.setValue(`hotels.${index}.${key}` as 'hotels.0.hotelName', patchValue as never, {
          shouldDirty: true,
        });
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
              quantity: 1,
              internalCost: 0,
              sellingPrice: Number(vehicleDraft.amount) || 0,
              // Section title and usage are preserved in the two existing
              // customer-safe snapshot fields.
              taxCategory: vehicleDraft.sectionTitle.trim() || 'Transportation',
              notes: vehicleDraft.usage.trim() || null,
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
            .map((hotel) => ({
              ...hotel,
              // Persist the calendar-date-derived nights whenever valid dates
              // exist, so re-saving repairs historical incorrect night counts.
              nights: hotelStayNights(hotel.checkInDate, hotel.checkOutDate) ?? hotel.nights,
            }))
            // Draft Hotel Stays added via "Add Stay Before/After" but never
            // named have no hotel name — they must not be persisted (the API
            // also rejects empty hotel rows).
            .filter((hotel) => (hotel.hotelName ?? '').trim().length > 0),
          services: seq(persistedServices),
          inclusions: seq(value.inclusions),
          exclusions: seq(value.exclusions),
          terms: seq(value.terms),
        },
        { onSuccess: () => navigate(`/quotations/${quotationId}`) },
      );
    },
    (errors) => {
      // Surface why a save was blocked instead of failing silently.
      const paths: string[] = [];
      const walk = (node: unknown, prefix: string) => {
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (typeof record.message === 'string') {
          paths.push(`${prefix.replace(/\.$/, '')}: ${record.message}`);
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
              <label className="text-sm font-semibold text-slate-800">
                Amount
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
            </div>

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
                    setVehicleDraft((current) => ({
                      ...current,
                      vehicleId: master?.id ?? '',
                      vehicleModel: master?.name ?? '',
                    }));
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

            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">Description</h3>
              <RichTextEditor
                ariaLabel="Vehicle description"
                value={vehicleDraft.description}
                onChange={(html) =>
                  setVehicleDraft((current) => ({ ...current, description: html }))
                }
              />
            </div>
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
        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
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
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <HotelMasterFields
                    canCost={canCost}
                    preferredCity={hotel?.city ?? undefined}
                    showLabels
                    value={{
                      hotelId: hotel?.hotelId,
                      hotelRoomTypeId: hotel?.hotelRoomTypeId,
                      hotelMealPlanId: hotel?.hotelMealPlanId,
                    }}
                    roomTypeText={hotel?.roomType}
                    mealPlanText={hotel?.mealPlan}
                    hotelNameText={hotel?.hotelName}
                    onChange={(patch) => applyHotel(index, patch)}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  <label className="text-sm font-semibold text-slate-800">
                    City
                    <input
                      aria-label="Hotel city"
                      value={hotel?.city ?? ''}
                      readOnly
                      className={`${field} mt-1 bg-slate-100`}
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
                    <span className="mt-2 flex items-start gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        aria-label="Hotel check-in include time in PDF and weblink"
                        checked={hotel?.showCheckInTime === true}
                        onChange={(event) =>
                          form.setValue(`hotels.${index}.showCheckInTime`, event.target.checked, {
                            shouldDirty: true,
                          })
                        }
                        className="mt-0.5"
                      />
                      Include time in PDF and weblink
                    </span>
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
                    <span className="mt-2 flex items-start gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        aria-label="Hotel check-out include time in PDF and weblink"
                        checked={hotel?.showCheckOutTime === true}
                        onChange={(event) =>
                          form.setValue(`hotels.${index}.showCheckOutTime`, event.target.checked, {
                            shouldDirty: true,
                          })
                        }
                        className="mt-0.5"
                      />
                      Include time in PDF and weblink
                    </span>
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Nights
                    <input
                      aria-label="Hotel nights"
                      readOnly
                      value={String(displayNights)}
                      className={`${field} mt-1 bg-slate-100`}
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Number of Rooms
                    <input
                      aria-label="Hotel number of rooms"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      {...form.register(`hotels.${index}.rooms`, {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                      className={`${field} mt-1`}
                    />
                  </label>
                </div>

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
              />
            </div>

            {/* Per-stay bookmark image manager: this hotel stay owns its own image
            order and its own "Use in PDF" selection. */}
            {Array.isArray(hotel?.images) && hotel.images.length > 0 && (
              <div className="space-y-2.5 border-t border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Hotel Images{' '}
                  <span className="font-normal text-slate-400">
                    ({hotel.images.length}) · order saved with the quotation
                  </span>
                </h4>
                {hotel.images.map((image, imageIndex) => (
                  <div
                    key={image.url}
                    className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2.5"
                  >
                    <HotelImageThumb
                      image={image}
                      alt={image.alt ?? `Hotel image ${imageIndex + 1}`}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={imageIndex === 0}
                        aria-label={`Move hotel image ${imageIndex + 1} left`}
                        onClick={() => moveHotelImage(index, imageIndex, -1)}
                      >
                        <ArrowLeft className="h-4 w-4" /> Move Left
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={imageIndex === hotel.images.length - 1}
                        aria-label={`Move hotel image ${imageIndex + 1} right`}
                        onClick={() => moveHotelImage(index, imageIndex, 1)}
                      >
                        Move Right <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Remove hotel image ${imageIndex + 1}`}
                        onClick={() => removeHotelImage(index, imageIndex)}
                      >
                        <X className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                    <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name={`hotel-${index}-pdf-image`}
                        aria-label={`Use hotel image ${imageIndex + 1} in PDF`}
                        checked={hotel.pdfImageUrl === image.url}
                        onChange={() => setHotelPdfImage(index, image.url)}
                        className="accent-brand-600"
                      />
                      Use in PDF
                    </label>
                  </div>
                ))}
              </div>
            )}
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
    const currency = form.watch('currency');
    const masters = cruiseMasters.data?.data ?? [];
    const primaryIndex = cruiseRows[0]?.index;
    const primary = primaryIndex !== undefined ? watchedServices?.[primaryIndex] : undefined;
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
                <label className="text-sm font-semibold text-slate-800">
                  Amount
                  <div className="mt-1 flex rounded-lg border border-slate-300 bg-card focus-within:ring-2 focus-within:ring-brand-500">
                    <span className="flex items-center border-r px-3 text-sm text-slate-500">
                      {currency}
                    </span>
                    <input
                      aria-label="Cruise amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={primary?.sellingPrice ?? 0}
                      onChange={(event) =>
                        applyService(primaryIndex, {
                          sellingPrice: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className="w-full rounded-r-lg bg-transparent px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </label>
              </div>
            )}

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
                const cruise = watchedServices?.[index];
                const cruiseMaster = masters.find((m) => m.id === cruise?.cruiseId);
                // Active options for new selections; a saved historical room type
                // (now inactive/removed) is kept so reopening never loses it.
                const allRoomTypes = cruiseMaster?.roomTypes ?? [];
                const activeRoomTypes = allRoomTypes.filter((room) => room.status === 'ACTIVE');
                const savedRoomType = allRoomTypes.find(
                  (room) => room.id === cruise?.cruiseRoomTypeId,
                );
                const roomOptions =
                  savedRoomType && !activeRoomTypes.some((room) => room.id === savedRoomType.id)
                    ? [...activeRoomTypes, savedRoomType]
                    : activeRoomTypes;
                return (
                  <article
                    key={row.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
                      <h4 className="font-semibold text-slate-800">Cruise Stay</h4>
                      <Button size="sm" variant="ghost" onClick={() => services.remove(index)}>
                        <Trash2 className="h-4 w-4 text-red-600" /> Remove
                      </Button>
                    </header>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-4 md:grid-cols-3">
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
                              onSelect={(option) =>
                                applyService(index, {
                                  cruiseId: option?.id ?? null,
                                  cruiseRoomTypeId: null,
                                  ...(option ? { name: option.label } : {}),
                                })
                              }
                            />
                          </div>
                        </label>
                        <label className="text-sm font-semibold text-slate-800">
                          Duration
                          <input
                            aria-label="Cruise duration"
                            placeholder="e.g. 2 nights"
                            value={cruise?.notes ?? ''}
                            onChange={(event) =>
                              applyService(index, { notes: event.target.value || null })
                            }
                            className={`${field} mt-1`}
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-800">
                          Room Type
                          <div className="mt-1">
                            <MasterSelect
                              ariaLabel="Cruise room type master"
                              placeholder={
                                !cruise?.cruiseId
                                  ? 'Select cruise first'
                                  : roomOptions.length > 0
                                    ? 'Select room type'
                                    : 'No room types configured'
                              }
                              options={roomOptions.map((room) => ({
                                id: room.id,
                                label: room.name,
                              }))}
                              value={cruise?.cruiseRoomTypeId}
                              disabled={!cruise?.cruiseId}
                              loading={cruiseMasters.isPending}
                              fallbackLabel={savedRoomType?.name}
                              onSelect={(option) => {
                                const room = roomOptions.find((entry) => entry.id === option?.id);
                                applyService(index, {
                                  cruiseRoomTypeId: option?.id ?? null,
                                  // Price is absent for viewers without costing.
                                  ...(room && room.price != null
                                    ? { sellingPrice: Number(room.price) }
                                    : {}),
                                });
                              }}
                            />
                          </div>
                        </label>
                      </div>
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
      return (
        <article key={id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <strong className="text-brand-700">Segment {index + 1}</strong>
            {index > 0 && (
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={() => arr.remove(index)}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
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
              Duration
              <input
                readOnly
                placeholder="Auto-calculated"
                value={computedDuration}
                className={`${field} mt-1 bg-slate-50`}
              />
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
      return (
        <section className="overflow-hidden rounded-xl border">
          <div
            className={`flex items-center justify-between px-5 py-3 font-semibold text-white ${headerClass}`}
          >
            <span>✈ {title}</span>
            <span className="text-sm opacity-90">
              {from && to ? `${from} → ${to}` : 'Route will appear here'}
            </span>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className={labelCls}>
                From city
                <input className={`${field} mt-1`} {...form.register(fp(`${base}.fromCity`))} />
              </label>
              <label className={labelCls}>
                To city
                <input className={`${field} mt-1`} {...form.register(fp(`${base}.toCity`))} />
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
            {arr.fields.map((segment, index) => segmentCard(leg, arr, index, segment.id))}
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => arr.append(emptySegment())}>
                <Plus className="h-4 w-4" /> Add Connection
              </Button>
            </div>
          </div>
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
              <label className="text-sm font-semibold text-slate-800">
                Amount
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
              </label>
            </div>

            <div>
              <span className="text-sm font-semibold text-slate-800">Flight information</span>
              <div
                role="radiogroup"
                aria-label="Flight information mode"
                className="mt-2 grid max-w-xl grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-1"
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
    const total = masters.reduce((sum, master) => {
      const index = includedIndex(master.id);
      return index >= 0 ? sum + Number(watchedServices?.[index]?.sellingPrice ?? 0) : sum;
    }, 0);
    const currency = form.watch('currency');
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
          internalCost: 0,
          sellingPrice: master.price ?? 0,
          taxCategory: null,
          notes: null,
          sequence: services.fields.length + 1,
        });
      } else {
        const index = includedIndex(master.id);
        if (index >= 0) services.remove(index);
      }
    };
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
              Select additional services to include in this quotation:
            </p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="w-20 px-4 py-3 font-semibold">Include</th>
                    <th className="w-48 px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="w-40 px-4 py-3 font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {masters.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
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
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-right font-semibold text-slate-700">
                      Total Add-on Services:
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {currency} {total.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
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
              {moneyInput('Amount', 'visaAmount')}
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
          </div>
        )}
      </div>
    );
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
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

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-brand-500 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative -mb-px border-b-2 px-1 py-3 text-sm font-semibold',
              activeTab === tab.key
                ? 'border-brand-600 text-slate-900'
                : 'border-transparent text-brand-700 hover:text-brand-900',
            )}
          >
            {tab.label}
            {leadRequested.has(tab.key) && <span className="ml-0.5 text-red-500">*</span>}
          </button>
        ))}
      </div>

      {/* Tab panels — only the active tab is mounted (RHF keeps field values). */}
      <section className="rounded-xl border bg-card p-5">
        {TABS.filter(
          (t) => t.types && t.key === activeTab && !['addon', 'vehicle', 'cruise'].includes(t.key),
        ).map((tab) => (
          <div key={tab.key}>{serviceTab(tab)}</div>
        ))}

        {/* Flight — structured journeys/segments (reference layout). */}
        {activeTab === 'flight' && flightSection()}

        {/* Sightseeing — day-wise activity itinerary (reference layout). */}
        {activeTab === 'sightseeing' && (
          <SightseeingSection
            form={form}
            quotationId={quotationId}
            quotationVersionId={versionId}
            destination={sightseeingDestinationName}
          />
        )}

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
                  </label>
                </div>

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

        {/* Summary & Pricing — per-passenger package pricing (reference layout). */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-xl border">
              <div className="bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-3 font-semibold text-white">
                Package Pricing
              </div>
              <div className="space-y-5 p-5">
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
                  <label className="text-sm font-semibold text-slate-800">
                    Total Package Price
                    <input
                      readOnly
                      aria-label="Total Package Price"
                      value={formatMoney(packageTotal)}
                      className={`${field} mt-1 bg-slate-100`}
                    />
                  </label>
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
                  <div className="flex justify-between pt-2 font-bold">
                    <span>Total Package Price:</span>
                    <span>{formatMoney(packageTotal)}</span>
                  </div>
                </div>
              )}
            </div>

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
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Customer notes
                <textarea rows={2} {...form.register('notes')} className={`${field} mt-1`} />
              </label>
              {canCost && (
                <label className="text-sm font-semibold text-slate-800">
                  Internal notes
                  <textarea
                    rows={2}
                    {...form.register('internalNotes')}
                    className={`${field} mt-1`}
                  />
                </label>
              )}
            </section>
          </div>
        )}
      </section>

      {/* Quotation Summary (always visible, like the reference) */}
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
                {currency} {packageTotal.toFixed(2)}
              </p>
              <p className="text-xs opacity-80">(Package Price)</p>
            </div>
            <div className="rounded-lg bg-amber-500 p-4 text-white">
              <p className="text-sm opacity-90">Add-on Services Total</p>
              <p className="text-2xl font-bold">
                {currency} {estimate.addon.toFixed(2)}
              </p>
              <p className="text-xs opacity-80">(Not added to final total)</p>
            </div>
          </div>
        </div>
      </section>

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
    </form>
  );
}
