import { useEffect, useState } from 'react';
import type {
  FlightBookmarkSnapshot,
  HotelBookmarkSnapshot,
  LiveSearchBookmark,
  SearchApiFlightSegment,
} from '@interscale/shared';
import { hotelStayNights } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useBookmarkByCode } from '@/features/search/search.api';

/**
 * Mapping helpers + UI for importing a Live Search bookmark into a quotation.
 *
 * Everything here reads ONLY the saved bookmark snapshot in our database —
 * no SearchAPI request is ever made.
 */

/** Format a flight duration in minutes as "Xh Ym" (matches the quotation UI). */
function formatDuration(minutes: number | undefined): string | null {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Airport display label prefers the full name, falling back to the code. */
function airportLabel(
  airport: { id?: string; name?: string } | undefined,
): string | null {
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
): NonNullable<import('@interscale/shared').QuotationVersionInput['flightDetails']> {
  const flight = bookmark.snapshot.flight as FlightBookmarkSnapshot | undefined;
  const segments = flight?.segments ?? [];
  const isRoundTrip = Boolean(flight?.type?.toLowerCase().includes('round'));

  const searchParams = bookmark.searchParams ?? {};
  const arrivalId = typeof searchParams.arrival_id === 'string' ? searchParams.arrival_id : null;
  const outboundSegments = segments.filter(
    (segment) => !isRoundTrip || segment.departure_airport.id !== arrivalId,
  );
  const returnSegments = isRoundTrip
    ? segments.filter((segment) => segment.departure_airport.id === arrivalId)
    : [];

  const outbound = outboundSegments.map(segmentToQuotation);
  const returnJourney = returnSegments.map(segmentToQuotation);

  const outboundFirst = outboundSegments[0];
  const outboundLast = outboundSegments[outboundSegments.length - 1];
  const returnFirst = returnSegments[0];
  const returnLast = returnSegments[returnSegments.length - 1];
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

/** Extract the first valid image URL from a saved hotel snapshot. */
function hotelImageUrl(hotel: HotelBookmarkSnapshot | undefined): string | null {
  for (const image of hotel?.images ?? []) {
    const url = image.original || image.thumbnail;
    if (url) return url;
  }
  return null;
}

/**
 * Build the quotation hotel section from a saved hotel bookmark: one hotel stay
 * row plus `hotelDetails` (title, amount, description, bookmarked images).
 * Prices are historical and fully editable.
 */
export function hotelBookmarkToDetails(bookmark: LiveSearchBookmark): {
  hotelRow: NonNullable<import('@interscale/shared').QuotationVersionInput['hotels']>[number];
  hotelDetails: NonNullable<import('@interscale/shared').QuotationVersionInput['hotelDetails']>;
  primaryImageUrl: string | null;
} {
  const hotel = bookmark.snapshot.hotel as HotelBookmarkSnapshot | undefined;
  const searchParams = bookmark.searchParams ?? {};

  const checkIn = typeof searchParams.check_in_date === 'string' ? searchParams.check_in_date : null;
  const checkOut = typeof searchParams.check_out_date === 'string' ? searchParams.check_out_date : null;
  const nights = hotelStayNights(checkIn, checkOut) ?? 1;
  const rooms = typeof searchParams.rooms === 'number' ? searchParams.rooms : null;
  const checkInTime = normalizeTime(hotel?.checkInTime);
  const checkOutTime = normalizeTime(hotel?.checkOutTime);

  const totalPrice = hotel?.totalPrice?.extracted_price;
  const perNight = hotel?.pricePerNight?.extracted_price;
  const savedPrice = typeof totalPrice === 'number' ? totalPrice : perNight ?? 0;

  const images = (hotel?.images ?? [])
    .map((image) => image.original || image.thumbnail)
    .filter((url): url is string => Boolean(url))
    .slice(0, 12)
    .map((url) => ({ url, alt: hotel?.name ?? null }));

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
    },
    hotelDetails: {
      include: true,
      sectionTitle: 'Your Hotels',
      amount: savedPrice,
      description: hotel?.description ?? null,
      images: images.length ? images : undefined,
    },
    primaryImageUrl: hotelImageUrl(hotel),
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
