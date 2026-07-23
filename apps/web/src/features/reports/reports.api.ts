import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { downloadCsv, type CsvPayload } from '@/lib/downloadCsv';
import type { DashboardPeriod } from '@interscale/shared';

/**
 * Reports data access.
 *
 * Every hook talks to the `/reports/*` endpoints — the Dashboard API is never
 * called and then reinterpreted here. Period resolution stays on the server;
 * the client only forwards the selected period/range. Query keys carry the full
 * parameter set so changing period, page, sort or any filter refetches.
 */

export interface ReportPeriod {
  key: DashboardPeriod;
  from: string | null;
  to: string | null;
  timezone: string;
}

export interface ReportCapabilities {
  canViewLeads: boolean;
  canViewQuotations: boolean;
  canViewBookings: boolean;
  canViewFinancials: boolean;
  canViewVendors: boolean;
  canViewVendorFinancials: boolean;
  canViewCustomers: boolean;
  canViewClientPayments: boolean;
  canViewVendorPayables: boolean;
}

export interface ReportParams {
  period: DashboardPeriod;
  from?: string;
  to?: string;
}

export interface ListParams extends ReportParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
  status?: string;
  bookingStatus?: string;
  overdueOnly?: boolean;
  limit?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReportSummary {
  period: ReportPeriod;
  capabilities: ReportCapabilities;
  leads?: {
    total: number;
    converted: number;
    lost: number;
    hot: number;
    conversionRate: number;
    winRate: number;
  };
  quotations?: {
    total: number;
    accepted: number;
    rejected: number;
    totalQuotedValue: string;
    acceptanceRate: number;
  };
  bookings?: { total: number; confirmed: number; completed: number; cancelled: number };
  financials?: {
    customerAmount: string;
    totalPayable: string;
    paymentsReceived: string;
    customerOutstanding: string;
    refunds: string;
    netRevenue: string;
    totalCost: string;
    grossProfit: string;
    netProfit: string;
    margin: string;
  };
  receivables?: {
    overdueCount: number;
    overdueAmount: string;
    dueInPeriodCount: number;
    dueInPeriodAmount: string;
  };
  vendorPayables?: {
    overdueCount: number;
    overdueAmount: string;
    dueInPeriodCount: number;
    dueInPeriodAmount: string;
  };
}

export interface LeadSourceRow {
  source: string;
  label: string;
  leadCount: number;
  convertedCount: number;
  conversionRate: number;
  percentage: number;
}

export interface DestinationRow {
  destination: string;
  enquiryCount: number;
  convertedCount: number;
  percentage: number;
  rank: number;
}

export interface StaffConversionRow {
  userId: string;
  displayName: string;
  totalLeads: number;
  convertedLeads: number;
  lostLeads: number;
  conversionRate: number;
  winRate: number;
  rank: number;
}

export interface StaffFinancialRow {
  userId: string;
  displayName: string;
  bookingCount: number;
  revenue: string;
  netRevenue: string;
  grossProfit: string;
  netProfit: string;
  marginPercentage: string;
  rank: number;
}

export interface QuotationReportRow {
  quotationId: string;
  quotationNumber: string;
  leadNumber: string | null;
  customerName: string;
  destination: string;
  status: string;
  currentVersion: number | null;
  currency: string;
  currentAmount: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  bookingNumber: string | null;
}

export interface BookingReportRow {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  destination: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  bookingStatus: string;
  operationalStatus: string;
  paymentStatus: string;
  bookedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  customerAmount?: string;
  gstAmount?: string;
  tcsAmount?: string;
  totalPayable?: string;
  paidAmount?: string;
  outstandingAmount?: string;
  refundedAmount?: string;
  netRevenue?: string;
  totalCost?: string;
  vendorOutstanding?: string;
  grossProfit?: string;
  netProfit?: string;
  marginPercentage?: string;
}

export interface ClientPaymentRow {
  scheduleId: string;
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  installmentNumber: number;
  label: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: string;
  overdue: boolean;
  assignedTo: string | null;
}

export interface VendorPayableRow {
  payableId: string;
  payableNumber: string;
  vendorId: string;
  vendorName: string;
  bookingId: string;
  bookingNumber: string;
  supplierInvoiceNumber: string | null;
  dueDate: string | null;
  originalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  paymentStatus: string;
  overdue: boolean;
  createdAt: string;
}

interface Sectioned<TRow, TSummary> {
  period: ReportPeriod;
  capabilities: ReportCapabilities;
  summary?: TSummary;
  rows?: TRow[];
  pagination?: Pagination;
}

export type QuotationReport = Sectioned<
  QuotationReportRow,
  {
    totalQuotations: number;
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
    totalQuotedValue: string;
    acceptedValue: string;
    acceptanceRate: number;
  }
>;

export type BookingReport = Sectioned<
  BookingReportRow,
  {
    totalBookings: number;
    confirmedBookings: number;
    pendingConfirmation: number;
    travelInProgress: number;
    completed: number;
    cancelled: number;
  }
> & {
  includesFinancials?: boolean;
  financialSummary?: ReportSummary['financials'] & {
    totalCustomerAmount: string;
    customerPaymentsReceived: string;
    customerOutstanding: string;
    totalRefunded: string;
    totalVendorOutstanding: string;
    profitMarginPercentage: string;
  };
};

export type ClientPaymentReport = Sectioned<
  ClientPaymentRow,
  {
    totalSchedules: number;
    totalScheduledAmount: string;
    totalPaidAmount: string;
    totalOutstandingAmount: string;
    overdueCount: number;
    overdueAmount: string;
  }
>;

export type VendorPayableReport = Sectioned<
  VendorPayableRow,
  {
    totalPayables: number;
    originalAmount: string;
    paidAmount: string;
    outstandingAmount: string;
    overdueCount: number;
    overdueAmount: string;
  }
>;

export interface LeadReport {
  period: ReportPeriod;
  capabilities: ReportCapabilities;
  summary?: {
    totalLeads: number;
    convertedLeads: number;
    lostLeads: number;
    hotLeads: number;
    qualifiedLeads: number;
    quotationRequired: number;
    readyToBook: number;
    conversionRate: number;
    winRate: number;
  };
  byStage?: { stage: string; label: string; count: number }[];
  byType?: { type: string; label: string; count: number }[];
  bySource?: LeadSourceRow[];
  byDestination?: DestinationRow[];
  byAssignee?: { userId: string; displayName: string; totalLeads: number }[];
}

/** Serialise params, dropping empties so keys stay stable. */
function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const reportKeys = {
  all: ['reports'] as const,
  section: (section: string, params: Record<string, unknown>) =>
    ['reports', section, params] as const,
};

function useReport<T>(
  section: string,
  path: string,
  params: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: reportKeys.section(section, params),
    queryFn: ({ signal }) => apiClient.get<T>(`/reports/${path}${toQuery(params)}`, signal),
    enabled,
  });
}

export const useReportSummary = (params: ReportParams) =>
  useReport<ReportSummary>('summary', 'summary', { ...params });

export const useLeadReport = (params: ReportParams, enabled = true) =>
  useReport<LeadReport>('leads', 'leads', { ...params }, enabled);

export const useQuotationReport = (params: ListParams, enabled = true) =>
  useReport<QuotationReport>('quotations', 'quotations', { ...params }, enabled);

export const useBookingReport = (params: ListParams, enabled = true) =>
  useReport<BookingReport>('bookings', 'bookings', { ...params }, enabled);

export const useClientPaymentReport = (params: ListParams, enabled = true) =>
  useReport<ClientPaymentReport>('client-payments', 'client-payments', { ...params }, enabled);

export const useVendorPayableReport = (params: ListParams, enabled = true) =>
  useReport<VendorPayableReport>('vendor-payables', 'vendor-payables', { ...params }, enabled);

export const useStaffConversionReport = (params: ListParams, enabled = true) =>
  useReport<{ period: ReportPeriod; rows?: StaffConversionRow[] }>(
    'staff-conversions',
    'staff-conversions',
    { ...params },
    enabled,
  );

export const useStaffFinancialReport = (params: ListParams, enabled = true) =>
  useReport<{ period: ReportPeriod; rows?: StaffFinancialRow[] }>(
    'staff-financials',
    'staff-financials',
    { ...params },
    enabled,
  );

export const useLeadSourceReport = (params: ReportParams, enabled = true) =>
  useReport<{ period: ReportPeriod; totalLeads?: number; rows?: LeadSourceRow[] }>(
    'lead-sources',
    'lead-sources',
    { ...params },
    enabled,
  );

export const useDestinationReport = (params: ReportParams, enabled = true) =>
  useReport<{ period: ReportPeriod; totalEnquiries?: number; rows?: DestinationRow[] }>(
    'destinations',
    'destinations',
    { ...params },
    enabled,
  );

/** Fetch a report CSV and hand it to the shared download helper. */
export function useReportExport(path: string) {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      const csv = await apiClient.get<CsvPayload>(`/reports/${path}/export${toQuery(params)}`);
      return downloadCsv(csv);
    },
  });
}
