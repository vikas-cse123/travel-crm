import { useEffect, useState } from 'react';
import {
  hotelStayNights,
  type AirlineInput,
  type FlightBookmarkSnapshot,
  type HotelBookmarkSnapshot,
  type LiveSearchBookmark,
  type QuotationVersionInput,
  type SearchApiFlightSegment,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useBookmarkByCode } from '@/features/search/search.api';
import { normalizeHotelImages } from '@/features/search/hotel-images';
import { importAirlineLogoFromUrl, type Airline } from '@/features/masters/masters.api';

/**
 * Mapping helpers + UI for importing a Live Search bookmark into a quotation.
 *
 * Everything here reads ONLY the saved bookmark snapshot in our database —
 * no SearchAPI request is ever made.
 */

/**
 * Split a concatenated list of flight segments into outbound and return legs.
 * The return journey is the contiguous block that starts from the arrival
 * airport of the original search; everything before it is outbound.
 */
function splitFlightSegments(
  segments: SearchApiFlightSegment[],
  arrivalId: string | null,
): { outbound: SearchApiFlightSegment[]; return: SearchApiFlightSegment[] } {
  if (!arrivalId) return { outbound: segments, return: [] };
  const returnStart = segments.findIndex((segment) => segment.departure_airport.id === arrivalId);
  if (returnStart === -1) return { outbound: segments, return: [] };
  return {
    outbound: segments.slice(0, returnStart),
    return: segments.slice(returnStart),
  };
}

/** Format a flight duration in minutes as "Xh Ym" (matches the quotation UI). */
function formatDuration(minutes: number | undefined): string | null {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Airport display label prefers the full name, falling back to the code. */
function airportLabel(airport: { id?: string; name?: string } | undefined): string | null {
  if (!airport) return null;
  return (airport.name && airport.name !== '—' ? airport.name : airport.id) || null;
}

/**
 * Convert a provider time string to the quotation's 24h HH:mm format.
 * Handles both "14:30" and 12-hour "2:30 PM" inputs; returns null if unusable.
 */
function normalizeTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const trimmed = time.trim();
  const match24 = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (match24) return `${match24[1]}:${match24[2]}`;
  const match12 = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(trimmed);
  if (match12) {
    const period = (match12[3] ?? '').toUpperCase();
    let hours = Number(match12[1]) % 12;
    if (period === 'PM') hours += 12;
    return `${String(hours).padStart(2, '0')}:${match12[2]}`;
  }
  return null;
}

function segmentToQuotation(segment: SearchApiFlightSegment) {
  return {
    airlineId: null,
    airlineName: segment.airline && segment.airline !== '—' ? segment.airline : null,
    flightNumber: segment.flight_number ?? null,
    travelClass: segment.travel_class ?? 'Economy',
    from: airportLabel(segment.departure_airport),
    to: airportLabel(segment.arrival_airport),
    departureDate: segment.departure_airport?.date ?? null,
    departureTime: segment.departure_airport?.time ?? null,
    arrivalDate: segment.arrival_airport?.date ?? null,
    arrivalTime: segment.arrival_airport?.time ?? null,
    duration: formatDuration(segment.duration),
    cabinLuggage: null,
    checkInLuggage: null,
    notes: null,
    connectionVia: null,
  };
}

/**
 * Build the quotation `flightDetails` form value from a saved flight bookmark.
 *
 * Multi-segment (connecting) flights preserve every segment. A round-trip
 * bookmark is split into outbound + return journeys using the same convention
 * as the Live Search page (a return leg departs from the arrival airport).
 */
export function flightBookmarkToDetails(
  bookmark: LiveSearchBookmark,
): NonNullable<QuotationVersionInput['flightDetails']> {
  const flight = bookmark.snapshot.flight as FlightBookmarkSnapshot | undefined;
  const segments = flight?.segments ?? [];
  const isRoundTrip = Boolean(flight?.type?.toLowerCase().includes('round'));

  const searchParams = bookmark.searchParams ?? {};
  const arrivalId = typeof searchParams.arrival_id === 'string' ? searchParams.arrival_id : null;
  const split = splitFlightSegments(segments, isRoundTrip ? arrivalId : null);

  const outbound = split.outbound.map(segmentToQuotation);
  const returnJourney = split.return.map(segmentToQuotation);

  const outboundFirst = split.outbound[0];
  const outboundLast = split.outbound[split.outbound.length - 1];
  const returnFirst = split.return[0];
  const returnLast = split.return[split.return.length - 1];
  const price = flight?.price;

  return {
    include: true,
    sectionTitle: 'Flight Details',
    amount: typeof price === 'number' && Number.isFinite(price) ? price : 0,
    entryMode: 'MANUAL',
    imageDocumentId: null,
    imageFileName: null,
    images: [],
    journeyType: isRoundTrip ? 'ROUND_TRIP' : 'ONEWAY_OUTBOUND',
    outbound: {
      fromCity: airportLabel(outboundFirst?.departure_airport),
      toCity: airportLabel(outboundLast?.arrival_airport),
      travelClass: outboundFirst?.travel_class ?? 'Economy',
      segments: outbound,
    },
    returnJourney: {
      fromCity: airportLabel(returnFirst?.departure_airport),
      toCity: airportLabel(returnLast?.arrival_airport),
      travelClass: returnFirst?.travel_class ?? outboundFirst?.travel_class ?? 'Economy',
      segments: returnJourney,
    },
  };
}

/**
 * Airline resolution for flight bookmarks.
 *
 * When a flight bookmark is loaded into a quotation, each segment's airline is
 * matched against the Airline Master (by IATA code first, then by normalized
 * name). If the airline does not exist, it is created automatically using the
 * bookmark/provider data, so the quotation Airline dropdown is never left on
 * "Select Airline" when valid airline information is present.
 */

/** Case-insensitive name key, mirroring the backend's `normalizeCustomerName`. */
export function normalizeAirlineName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Derive a candidate IATA code from a flight number, e.g. "6E 101" -> "6E" and
 * "AI 2115" -> "AI". Returns null when the flight number has no usable prefix.
 */
export function deriveAirlineIataCode(flightNumber: string | null | undefined): string | null {
  if (!flightNumber) return null;
  const match = /^([A-Z0-9]{2})\s*(\d{1,4})/.exec(flightNumber.trim());
  const code = match?.[1]?.toUpperCase();
  return code && /^[A-Z0-9]{2}$/.test(code) ? code : null;
}

/** One airline reference for a single quotation flight segment. */
export interface FlightSegmentAirlineRef {
  leg: 'outbound' | 'returnJourney';
  segmentIndex: number;
  /** Airline name from the bookmark segment, e.g. "IndiGo". */
  name: string | null;
  /** Candidate IATA code derived from the flight number, e.g. "6E". */
  iataCode: string | null;
  /** Airline logo URL from the bookmark segment, if any. */
  logoUrl: string | null;
}

/**
 * Enumerate the airlines referenced by every flight segment of a bookmark,
 * using the exact same outbound/return split as `flightBookmarkToDetails`.
 */
export function flightBookmarkSegmentAirlines(
  bookmark: LiveSearchBookmark,
): FlightSegmentAirlineRef[] {
  const flight = bookmark.snapshot.flight as FlightBookmarkSnapshot | undefined;
  const segments = flight?.segments ?? [];
  const isRoundTrip = Boolean(flight?.type?.toLowerCase().includes('round'));

  const searchParams = bookmark.searchParams ?? {};
  const arrivalId = typeof searchParams.arrival_id === 'string' ? searchParams.arrival_id : null;
  const split = splitFlightSegments(segments, isRoundTrip ? arrivalId : null);

  const toRef = (
    segment: SearchApiFlightSegment,
    leg: 'outbound' | 'returnJourney',
    segmentIndex: number,
  ): FlightSegmentAirlineRef => ({
    leg,
    segmentIndex,
    name: segment.airline && segment.airline !== '—' ? segment.airline : null,
    iataCode: deriveAirlineIataCode(segment.flight_number),
    logoUrl: segment.airline_logo ?? null,
  });

  return [
    ...split.outbound.map((segment, index) => toRef(segment, 'outbound', index)),
    ...split.return.map((segment, index) => toRef(segment, 'returnJourney', index)),
  ];
}

/**
 * Find the existing Airline Master record for a bookmark airline. IATA code is
 * the strongest identifier, then the normalized name (case-insensitive).
 */
export function findMatchingAirline(
  ref: Pick<FlightSegmentAirlineRef, 'name' | 'iataCode'>,
  airlines: Airline[],
): Airline | null {
  const code = ref.iataCode?.toUpperCase();
  const normalized = normalizeAirlineName(ref.name ?? '');
  return (
    airlines.find((airline) => code && airline.iataCode?.toUpperCase() === code) ??
    airlines.find((airline) => normalized && normalizeAirlineName(airline.name) === normalized) ??
    null
  );
}

/** Accepted airline logo mime types (mirrors the shared catalogue). */

/**
 * Persist a provider logo onto an airline using the server-side import flow.
 * The server downloads the remote URL, validates and stores the image through
 * the existing Airline Master storage, and updates the master record. Best
 * effort: download/validation failures leave the airline without a logo rather
 * than failing the import.
 */
export async function uploadAirlineLogoFromUrl(airlineId: string, logoUrl: string): Promise<void> {
  await importAirlineLogoFromUrl(airlineId, logoUrl);
}

export interface ResolveAirlineDeps {
  /** The already-loaded ACTIVE Airline Master records. */
  airlines: Airline[];
  /** Creates an airline through the Airline Master API. */
  createAirline: (input: AirlineInput) => Promise<Airline>;
  /** Whether the caller may manage airline media (logo upload). */
  canManageMedia: boolean;
  /** Called with every airline that had to be created, so callers can refresh lists. */
  onAirlineCreated?: (airline: Airline) => void;
}

/**
 * Resolve every referenced airline: reuse the existing master record when one
 * matches, otherwise create it automatically. Returns a map keyed by the
 * normalized airline name. Creation is best-effort — if the current user may
 * not create masters (or the create fails), the segment simply stays unlinked.
 */
export async function resolveFlightSegmentAirlines(
  refs: FlightSegmentAirlineRef[],
  deps: ResolveAirlineDeps,
): Promise<Map<string, { airlineId: string | null; airlineName: string | null }>> {
  const result = new Map<string, { airlineId: string | null; airlineName: string | null }>();

  // Deduplicate by normalized name so one airline is resolved (and possibly
  // created) exactly once per import.
  const unique = new Map<string, FlightSegmentAirlineRef>();
  for (const ref of refs) {
    const key = normalizeAirlineName(ref.name ?? '');
    if (!key) continue;
    if (!unique.has(key)) unique.set(key, ref);
  }

  // One logo attempt per resolved airline so repeated loads never re-upload.
  const logoAttempted = new Set<string>();

  for (const [key, ref] of unique) {
    let match = findMatchingAirline(ref, deps.airlines);
    if (!match) {
      try {
        const created = await deps.createAirline({
          name: ref.name ?? '',
          iataCode: ref.iataCode,
          icaoCode: null,
          countryCode: null,
          website: null,
          internalNotes: null,
          status: 'ACTIVE',
        });
        match = created;
        deps.onAirlineCreated?.(created);
      } catch {
        // No permission / validation failure: leave the segment unlinked but
        // keep the bookmark's airline name for display.
        result.set(key, { airlineId: null, airlineName: ref.name });
        continue;
      }
    }
    // Persist the provider logo onto the master record when the airline has no
    // logo yet. Existing airlines that already have a logo are left untouched
    // (no replace / re-upload), and one attempt per airline keeps repeated
    // bookmark loads from importing the same logo more than once.
    if (ref.logoUrl && deps.canManageMedia && !match.hasLogo && !logoAttempted.has(match.id)) {
      logoAttempted.add(match.id);
      await uploadAirlineLogoFromUrl(match.id, ref.logoUrl).catch(() => undefined);
    }
    result.set(key, { airlineId: match.id, airlineName: match.name });
  }

  return result;
}

/**
 * Build the quotation hotel section from a saved hotel bookmark: one hotel stay
 * row plus `hotelDetails` (title, amount, description, bookmarked images).
 * Prices are historical and fully editable.
 */
export function hotelBookmarkToDetails(bookmark: LiveSearchBookmark): {
  hotelRow: NonNullable<QuotationVersionInput['hotels']>[number];
  hotelDetails: NonNullable<QuotationVersionInput['hotelDetails']>;
  primaryImageUrl: string | null;
} {
  const hotel = bookmark.snapshot.hotel as HotelBookmarkSnapshot | undefined;
  const searchParams = bookmark.searchParams ?? {};

  const checkIn =
    typeof searchParams.check_in_date === 'string' ? searchParams.check_in_date : null;
  const checkOut =
    typeof searchParams.check_out_date === 'string' ? searchParams.check_out_date : null;
  const nights = hotelStayNights(checkIn, checkOut) ?? 1;
  const rooms = typeof searchParams.rooms === 'number' ? searchParams.rooms : null;
  const checkInTime = normalizeTime(hotel?.checkInTime);
  const checkOutTime = normalizeTime(hotel?.checkOutTime);

  const totalPrice = hotel?.totalPrice?.extracted_price;
  const perNight = hotel?.pricePerNight?.extracted_price;
  const savedPrice = typeof totalPrice === 'number' ? totalPrice : (perNight ?? 0);

  const images = normalizeHotelImages(hotel?.images).map((image) => ({
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    alt: hotel?.name ?? null,
  }));

  return {
    hotelRow: {
      city: hotel?.city ?? '',
      hotelName: hotel?.name ?? '',
      category: hotel?.stars ? `${hotel.stars} Star` : null,
      roomType: null,
      mealPlan: null,
      hotelId: null,
      hotelRoomTypeId: null,
      hotelMealPlanId: null,
      rooms,
      nights,
      checkInDate: checkIn ? new Date(`${checkIn}T00:00:00`) : null,
      checkOutDate: checkOut ? new Date(`${checkOut}T00:00:00`) : null,
      checkInTime,
      checkOutTime,
      showCheckInTime: Boolean(checkInTime),
      showCheckOutTime: Boolean(checkOutTime),
      internalCost: 0,
      sellingPrice: savedPrice,
      selected: true,
      notes: hotel?.description ?? null,
      sequence: 1,
      // Store per-stay images instead of section-level images
      images: images.length ? images : [],
    },
    hotelDetails: {
      include: true,
      sectionTitle: 'Your Hotels',
      amount: savedPrice,
      // The provider's hotel summary belongs in the per-stay Remark (see
      // `notes` on the row), never duplicated into the section Description —
      // that field stays empty unless the user types a custom section note.
      description: null,
      // Clear section-level images when importing to per-stay storage
      images: [],
      pdfImageUrl: null,
    },
    primaryImageUrl: images[0]?.url ?? null,
  };
}

/**
 * A small "Bookmark ID (optional) [ Load ]" field for a quotation section.
 *
 * Verifies the bookmark exists, belongs to the caller's tenant, and matches the
 * requested type before calling `onLoaded`. Never touches SearchAPI.
 */
export function BookmarkLoadField({
  type,
  placeholder,
  onLoaded,
}: {
  type: 'FLIGHT' | 'HOTEL';
  placeholder: string;
  onLoaded: (bookmark: LiveSearchBookmark) => void;
}) {
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadedCode, setLoadedCode] = useState<string | null>(null);
  const { data, isFetching, isError, refetch } = useBookmarkByCode(submitted);

  useEffect(() => {
    // A resolved bookmark of the wrong type must not be loaded into this section.
    if (!submitted || isFetching || isError || !data) return;
    if (data.type !== type) {
      setError(
        type === 'HOTEL'
          ? 'This is a flight bookmark. Enter a hotel bookmark ID.'
          : 'This is a hotel bookmark. Enter a flight bookmark ID.',
      );
      setLoadedCode(null);
      return;
    }
    setError(null);
    setLoadedCode(data.bookmarkCode);
    onLoaded(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, data, isFetching, isError, type]);

  const load = () => {
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z]{3}-\d{6}$/.test(trimmed)) {
      setError('Enter a valid bookmark ID (e.g. HTL-000123 or FLT-000456).');
      setLoadedCode(null);
      return;
    }
    setError(null);
    setLoadedCode(null);
    setSubmitted(trimmed);
    void refetch();
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-800">
        Bookmark ID (optional)
        <div className="mt-1 flex items-center gap-2">
          <input
            aria-label="Bookmark ID"
            className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm"
            placeholder={placeholder}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                load();
              }
            }}
          />
          <Button type="button" size="sm" variant="secondary" onClick={load} disabled={isFetching}>
            {isFetching ? 'Loading…' : 'Load'}
          </Button>
        </div>
      </label>

      {loadedCode ? (
        <p className="text-sm font-medium text-emerald-600">✓ Loaded from {loadedCode}</p>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {isError ? (
        <p className="text-xs text-red-600">
          {submitted ? 'Bookmark not found or you do not have access.' : ''}
        </p>
      ) : null}
    </div>
  );
}
