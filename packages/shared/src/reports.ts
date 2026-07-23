import { z } from 'zod';
import { DASHBOARD_PERIODS } from './dashboard.js';
import { QUOTATION_STATUSES } from './quotations.js';
import { BOOKING_STATUSES } from './bookings.js';

/**
 * Reports module contracts (Phase 19).
 *
 * Reports deliberately reuse the Dashboard period vocabulary (DASHBOARD_PERIODS)
 * and the company-timezone period resolver on the server — this file never
 * re-implements period maths. It only adds the pagination, sorting, filter and
 * export-query shapes the reports need on top of the shared period selector.
 *
 * Two period semantics exist and are intentional:
 *   - Creation-based reports (leads, quotations, bookings, staff, sources,
 *     destinations) apply the period to each row's createdAt.
 *   - Due-date reports (client payments, vendor payables) apply the period to
 *     the schedule/payable dueDate instead, because "what is due this quarter"
 *     is the meaningful question there.
 */

/** The report sections a caller can request. */
export const REPORT_TYPES = [
  'LEADS',
  'QUOTATIONS',
  'BOOKINGS',
  'CLIENT_PAYMENTS',
  'VENDOR_PAYABLES',
  'STAFF_CONVERSIONS',
  'STAFF_FINANCIALS',
  'LEAD_SOURCES',
  'DESTINATIONS',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Client payment-schedule statuses surfaced by the receivables report. */
export const CLIENT_PAYMENT_DUE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] as const;
export type ClientPaymentDueStatus = (typeof CLIENT_PAYMENT_DUE_STATUSES)[number];

/** Vendor-payable statuses surfaced by the payables report. */
export const VENDOR_PAYABLE_DUE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] as const;
export type VendorPayableDueStatus = (typeof VENDOR_PAYABLE_DUE_STATUSES)[number];

/** Maximum rows any report CSV will emit; anything beyond is flagged truncated. */
export const REPORT_EXPORT_ROW_LIMIT = 5000;

const optionalDate = z.coerce.date().optional();

/**
 * Base period query shared by the summary endpoint and every report. Cross-field
 * rules (CUSTOM requires from+to; from <= to) are enforced by the server-side
 * period resolver, so this stays a plain ZodObject the validation middleware
 * accepts as a query schema.
 */
export const reportPeriodQuerySchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default('THIS_YEAR'),
  from: optionalDate,
  to: optionalDate,
});
export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;

/** Ranked staff reports accept a bounded top-N limit. */
export const reportStaffQuerySchema = reportPeriodQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type ReportStaffQuery = z.infer<typeof reportStaffQuerySchema>;

/** Shared pagination + sorting shape for the row-level reports. */
const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(120).optional(),
};

const outstandingRangeShape = {
  minOutstanding: z.coerce.number().min(0).optional(),
  maxOutstanding: z.coerce.number().min(0).optional(),
};

export const reportLeadsQuerySchema = reportPeriodQuerySchema.extend({
  ...paginationShape,
  sortBy: z.enum(['createdAt', 'travelStartDate', 'leadStage']).default('createdAt'),
});
export type ReportLeadsQuery = z.infer<typeof reportLeadsQuerySchema>;

export const reportQuotationsQuerySchema = reportPeriodQuerySchema.extend({
  ...paginationShape,
  sortBy: z.enum(['createdAt', 'status']).default('createdAt'),
  status: z.enum(QUOTATION_STATUSES).optional(),
});
export type ReportQuotationsQuery = z.infer<typeof reportQuotationsQuerySchema>;

export const reportBookingsQuerySchema = reportPeriodQuerySchema.extend({
  ...paginationShape,
  sortBy: z.enum(['createdAt', 'travelStartDate', 'bookingStatus']).default('createdAt'),
  bookingStatus: z.enum(BOOKING_STATUSES).optional(),
});
export type ReportBookingsQuery = z.infer<typeof reportBookingsQuerySchema>;

/**
 * Client payments filter on the scheduled installment `amount`, not on a stored
 * outstanding column: per-installment outstanding is derived (amount minus the
 * payments allocated to that installment) and therefore cannot be filtered in
 * SQL without breaking pagination. Vendor payables do store `outstandingAmount`
 * and so filter on it directly.
 */
export const reportClientPaymentsQuerySchema = reportPeriodQuerySchema.extend({
  ...paginationShape,
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  sortBy: z.enum(['dueDate', 'amount']).default('dueDate'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(CLIENT_PAYMENT_DUE_STATUSES).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  assignedToId: z.string().uuid().optional(),
});
export type ReportClientPaymentsQuery = z.infer<typeof reportClientPaymentsQuerySchema>;

export const reportVendorPayablesQuerySchema = reportPeriodQuerySchema.extend({
  ...paginationShape,
  ...outstandingRangeShape,
  sortBy: z.enum(['dueDate', 'outstandingAmount']).default('dueDate'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(VENDOR_PAYABLE_DUE_STATUSES).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  vendorId: z.string().uuid().optional(),
});
export type ReportVendorPayablesQuery = z.infer<typeof reportVendorPayablesQuerySchema>;

/** Optional, backward-compatible metadata attached to every report CSV payload. */
export interface ReportCsvMeta {
  fileName: string;
  mimeType: 'text/csv';
  content: string;
  exportedCount: number;
  truncated: boolean;
  rowLimit: number;
}
