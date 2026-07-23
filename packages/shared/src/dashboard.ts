import { z } from 'zod';

/**
 * Dashboard period selector (Phase 16).
 *
 * The dashboard is the only surface that supports date-period filtering; the
 * legacy per-module analytics endpoints are unchanged. Ranges are resolved
 * server-side in the company timezone so every metric in one response shares
 * the same window.
 */
export const DASHBOARD_PERIODS = [
  'TODAY',
  'THIS_WEEK',
  'THIS_MONTH',
  'THIS_QUARTER',
  'THIS_YEAR',
  'LAST_30_DAYS',
  'LAST_90_DAYS',
  'ALL_TIME',
  'CUSTOM',
] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This week',
  THIS_MONTH: 'This month',
  THIS_QUARTER: 'This quarter',
  THIS_YEAR: 'This year',
  LAST_30_DAYS: 'Last 30 days',
  LAST_90_DAYS: 'Last 90 days',
  ALL_TIME: 'All time',
  CUSTOM: 'Custom range',
};

const optionalDate = z.coerce.date().optional();

/**
 * Shared query schema for both dashboard endpoints. `from`/`to` are only
 * consulted for the CUSTOM period. `limit` bounds the top-N lists.
 *
 * Cross-field rules (CUSTOM requires from+to; from <= to) are enforced
 * server-side in the period resolver so this stays a plain ZodObject that the
 * request-validation middleware accepts.
 */
export const dashboardQuerySchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default('THIS_YEAR'),
  from: optionalDate,
  to: optionalDate,
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
