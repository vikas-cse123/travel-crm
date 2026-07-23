import { ValidationError } from '../../utils/errors.js';
import { localDayBounds, localWeekStart, zonedTimeToUtc } from '../../utils/timezone.js';
import type { DashboardPeriod } from '@interscale/shared';

export interface ResolvedPeriod {
  key: DashboardPeriod;
  /** Inclusive lower bound (UTC). Null for ALL_TIME — no created-date filter. */
  from: Date | null;
  /** Exclusive upper bound (UTC). Null for ALL_TIME. */
  to: Date | null;
  timezone: string;
}

/** Local calendar Y/M/D for a UTC instant in the given timezone. */
function localParts(timezone: string, reference: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

/**
 * Resolve a dashboard period into a half-open [from, to) UTC range in the
 * company timezone. All boundaries align to local midnight, matching the
 * conventions used by the follow-up and reminder analytics. ALL_TIME applies no
 * created-date filter (both bounds null). CUSTOM uses the supplied dates, taking
 * the start of `from`'s local day and the start of the day after `to`.
 */
export function resolvePeriod(
  period: DashboardPeriod,
  timezone: string,
  from?: Date,
  to?: Date,
  reference = new Date(),
): ResolvedPeriod {
  const { start: todayStart, end: todayEnd } = localDayBounds(timezone, reference);
  const { year, month } = localParts(timezone, reference);
  const startOfDay = (date: Date) => localDayBounds(timezone, date).start;
  const dayAfter = (date: Date) => localDayBounds(timezone, date).end;

  switch (period) {
    case 'TODAY':
      return { key: period, from: todayStart, to: todayEnd, timezone };
    case 'THIS_WEEK':
      return { key: period, from: localWeekStart(timezone, reference), to: todayEnd, timezone };
    case 'THIS_MONTH':
      return {
        key: period,
        from: zonedTimeToUtc(timezone, year, month, 1),
        to: todayEnd,
        timezone,
      };
    case 'THIS_QUARTER': {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return {
        key: period,
        from: zonedTimeToUtc(timezone, year, quarterStartMonth, 1),
        to: todayEnd,
        timezone,
      };
    }
    case 'THIS_YEAR':
      return { key: period, from: zonedTimeToUtc(timezone, year, 1, 1), to: todayEnd, timezone };
    case 'LAST_30_DAYS':
      return {
        key: period,
        from: startOfDay(new Date(reference.getTime() - 29 * 86_400_000)),
        to: todayEnd,
        timezone,
      };
    case 'LAST_90_DAYS':
      return {
        key: period,
        from: startOfDay(new Date(reference.getTime() - 89 * 86_400_000)),
        to: todayEnd,
        timezone,
      };
    case 'ALL_TIME':
      return { key: period, from: null, to: null, timezone };
    case 'CUSTOM': {
      if (!from || !to)
        throw new ValidationError('A custom period requires both from and to dates.');
      if (from > to) throw new ValidationError('The start date must be on or before the end date.');
      return { key: period, from: startOfDay(from), to: dayAfter(to), timezone };
    }
    default:
      return {
        key: 'THIS_YEAR',
        from: zonedTimeToUtc(timezone, year, 1, 1),
        to: todayEnd,
        timezone,
      };
  }
}

/** Prisma createdAt filter for a resolved period, or {} for ALL_TIME. */
export function createdAtFilter(period: ResolvedPeriod): { createdAt?: { gte: Date; lt: Date } } {
  if (!period.from || !period.to) return {};
  return { createdAt: { gte: period.from, lt: period.to } };
}
