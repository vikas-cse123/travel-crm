import { hotelStayNights } from '@interscale/shared';

/**
 * Canonical duration resolver for the "Create Booking from Lead" workflow.
 *
 * Resolves a single duration from the exact selected quotation-version
 * snapshot, then the quotation, then the linked lead. The version snapshot is
 * authoritative; stale lead dates are only a final fallback.
 *
 * Source priority (adapted to the repository's actual fields):
 *  1. version-snapshot travel start + travel end
 *  2. quotation travel start + travel end
 *  3. version stay-night allocations (hotels) — the canonical fallback the
 *     public quotation page and generated PDFs already use
 *  4. exact version itinerary-day count (only when it is a genuine multi-day
 *     itinerary, so a single imported destination row never overrides hotels)
 *  5. lead/query travel dates, then lead itinerary nights (final fallback)
 */

export interface BookingDurationSource {
  travelStartDate?: Date | string | null;
  travelEndDate?: Date | string | null;
  hotels?: Array<{
    checkInDate?: Date | string | null;
    checkOutDate?: Date | string | null;
    nights?: number | null;
    selected?: boolean;
  }>;
  itineraryDays?: Array<{ dayNumber?: number }>;
}

export interface BookingDurationLead extends BookingDurationSource {
  itineraryNights?: Array<{ nights?: number | null }>;
}

export interface BookingDuration {
  travelStart: string | null;
  travelEnd: string | null;
  totalNights: number | null;
  totalDays: number | null;
  durationLabel: string | null;
}

/** Normalize a Date/ISO string to a UTC 'YYYY-MM-DD' day (null when invalid). */
export function toIsoDay(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** Calendar-day difference between two travel edges (UTC-normalized). */
export function nightsBetweenDates(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null {
  const from = toIsoDay(start);
  const to = toIsoDay(end);
  if (!from || !to) return null;
  const toUtc = (day: string) => {
    const [year, month, date] = day.split('-');
    return Date.UTC(Number(year), Number(month) - 1, Number(date));
  };
  const diff = Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
  return diff >= 0 ? diff : null;
}

/** Format a night count as "N Nights / N Days" with correct singular grammar. */
export function durationLabelForNights(nights: number | null): string | null {
  if (nights === null || Number.isNaN(nights) || nights < 0) return null;
  const days = nights + 1;
  const nightLabel = nights === 1 ? 'Night' : 'Nights';
  const dayLabel = days === 1 ? 'Day' : 'Days';
  return `${nights} ${nightLabel} / ${days} ${dayLabel}`;
}

interface DurationCandidate {
  nights: number;
  days: number;
  start: string | null;
  end: string | null;
}

function dateCandidate(source: BookingDurationSource): DurationCandidate | null {
  const nights = nightsBetweenDates(source.travelStartDate, source.travelEndDate);
  if (nights === null) return null;
  return {
    nights,
    days: nights + 1,
    start: toIsoDay(source.travelStartDate),
    end: toIsoDay(source.travelEndDate),
  };
}

function hotelCandidate(source: BookingDurationSource): DurationCandidate | null {
  const rows = (source.hotels ?? []).filter((hotel) => hotel.selected !== false);
  if (!rows.length) return null;
  let total = 0;
  for (const hotel of rows) {
    const computed = hotelStayNights(hotel.checkInDate, hotel.checkOutDate);
    const nights = computed ?? hotel.nights ?? 0;
    if (Number.isNaN(nights) || nights <= 0) continue;
    total += nights;
  }
  if (total <= 0) return null;
  const checkIns = rows
    .map((hotel) => toIsoDay(hotel.checkInDate))
    .filter((day): day is string => day !== null)
    .sort();
  const checkOuts = rows
    .map((hotel) => toIsoDay(hotel.checkOutDate))
    .filter((day): day is string => day !== null)
    .sort();
  return {
    nights: total,
    days: total + 1,
    start: checkIns[0] ?? null,
    end: checkOuts[checkOuts.length - 1] ?? null,
  };
}

function itineraryCandidate(source: BookingDurationSource): DurationCandidate | null {
  const days = (source.itineraryDays ?? []).length;
  // A single itinerary row can represent many nights (imported from a lead
  // destination list); only treat a genuine multi-day itinerary as a day count.
  if (days <= 1) return null;
  const nights = days - 1;
  return nights > 0 ? { nights, days, start: null, end: null } : null;
}

function leadCandidate(lead: BookingDurationLead): DurationCandidate | null {
  const dates = dateCandidate(lead);
  if (dates) return dates;
  const total = (lead.itineraryNights ?? []).reduce(
    (sum, row) => sum + (Number(row.nights) || 0),
    0,
  );
  return total > 0 ? { nights: total, days: total + 1, start: null, end: null } : null;
}

export function resolveBookingDuration(
  version: BookingDurationSource,
  quotation: BookingDurationSource,
  lead: BookingDurationLead,
): BookingDuration {
  const candidates: Array<DurationCandidate | null> = [
    dateCandidate(version),
    dateCandidate(quotation),
    hotelCandidate(version),
    itineraryCandidate(version),
    leadCandidate(lead),
  ];
  const resolved = candidates.find((entry): entry is DurationCandidate => entry !== null) ?? null;

  // The travel window follows the source that produced the nights. Candidates
  // without explicit edges (itinerary-day count / lead itinerary nights) fall
  // back to the first available date edge.
  const fallbackStart = [version, quotation, lead]
    .map((source) => toIsoDay(source.travelStartDate))
    .find((day): day is string => day !== null);
  const fallbackEnd = [version, quotation, lead]
    .map((source) => toIsoDay(source.travelEndDate))
    .find((day): day is string => day !== null);

  const travelStart = resolved?.start ?? fallbackStart ?? null;
  const travelEnd = resolved?.end ?? fallbackEnd ?? null;

  return {
    travelStart,
    travelEnd,
    totalNights: resolved?.nights ?? null,
    totalDays: resolved?.days ?? null,
    durationLabel: durationLabelForNights(resolved?.nights ?? null),
  };
}
