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
}

export interface TravelDateResult {
  start: Date | null;
  end: Date | null;
  label: string;
}

/**
 * Resolve a quotation/lead's travel-date range.
 *
 * Priority:
 *  1. start + end present            → show both actual dates.
 *  2. start present, end missing, but a reliable trip-duration exists → derive
 *     inclusive end = start + (totalDays - 1) (only when totalDays > 0).
 *  3. start present, no reliable duration → show only the start date.
 *  4. no start → empty label (the caller's existing empty state, e.g. "—").
 */
export function resolveTravelDates(input: TravelDateInput): TravelDateResult {
  const start = utcDay(input.start);
  let end = utcDay(input.end);

  if (start && !end && input.totalDays != null && input.totalDays > 0) {
    end = new Date(start.getTime() + (input.totalDays - 1) * 86_400_000);
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
