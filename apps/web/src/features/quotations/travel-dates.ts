/**
 * Travel-date display helpers for quotations/leads.
 *
 * "Open" is never a valid end date. When an end date is missing, a reliable
 * inclusive end date is derived from the trip duration (number of travel days),
 * else only the start date is shown. Dates are compared on their UTC calendar
 * day to avoid timezone/off-by-one errors.
 */

/** Parse a date-like value to a UTC date at midnight, or null when invalid. */
function utcDay(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Format a date as a local calendar date (e.g. 02/09/2026). */
function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString() : '';
}

export interface TravelDateInput {
  start: string | Date | null | undefined;
  end: string | Date | null | undefined;
  /** Number of travel DAYS (e.g. a 7-day trip → 7). Inclusive end = start + (days - 1). */
  totalDays?: number | null | undefined;
  /** Number of NIGHTS (fallback when no reliable totalDays). End = start + nights. */
  nights?: number | null | undefined;
}

export interface TravelDateResult {
  start: Date | null;
  end: Date | null;
  label: string;
}

/**
 * Resolve a quotation/lead's travel-date range.
 *
 * Precedence:
 *  1. start + a stored end strictly LATER than the start → show both actual
 *     dates. An end equal to (or before) the start is stale/invalid.
 *  2. otherwise, reliable totalDays > 1 → derive inclusive end = start + (days-1).
 *  3. otherwise, reliable nights > 0 → derive end = start + nights
 *     (6 nights → 7 calendar travel days). A Day-1-only itinerary (maxDay = 1)
 *     must never suppress a real multi-night stay.
 *  4. otherwise → show only the start date (never a fake "start – start" range).
 */
export function resolveTravelDates(input: TravelDateInput): TravelDateResult {
  const start = utcDay(input.start);
  const storedEnd = utcDay(input.end);

  // A stored end is only trustworthy when it is strictly after the start.
  // end === start (or end before start) is treated as stale/invalid.
  let end = start && storedEnd && storedEnd.getTime() > start.getTime() ? storedEnd : null;

  if (start && !end) {
    const days = input.totalDays;
    const nights = input.nights;
    if (days != null && days > 1) {
      end = new Date(start.getTime() + (days - 1) * 86_400_000);
    } else if (nights != null && nights > 0) {
      end = new Date(start.getTime() + nights * 86_400_000);
    }
  }

  if (!start) return { start: null, end: null, label: '' };
  if (!end) return { start, end: null, label: fmt(start) };
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

/**
 * Display label for a lead's travel dates, reusing the same rules. Returns '' so
 * callers can show their existing empty/fallback value.
 */
export function leadTravelDatesLabel(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  totalDays?: number | null | undefined,
): string {
  return resolveTravelDates({ start, end, totalDays }).label;
}
