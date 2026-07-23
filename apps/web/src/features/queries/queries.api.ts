import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { downloadCsv, type CsvPayload } from '@/lib/downloadCsv';
import type { ContactMethodValue, QueryInput, QueryUpdateInput } from '@interscale/shared';

export interface Lead {
  id: string;
  queryNumber: string;
  customerName: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  leadSource: string;
  leadType: string;
  leadStage: string;
  priority: string;
  departureCountry: string | null;
  departureCity: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  flexibleDates: boolean;
  rooms: number;
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
  extraBeds: number;
  travellerSummary: string;
  expectedAmount: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  expectedMargin: string | null;
  currency: string;
  tripType: string | null;
  quotationRequired: boolean;
  bookingStatusPlaceholder: string | null;
  webLinkPlaceholder: string | null;
  supplierCostingNotes: string | null;
  assignedToId: string | null;
  createdById: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  internalRemarks: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: UserOption | null;
  createdBy: UserOption;
  customer: {
    id: string;
    customerNumber: string;
    displayName: string;
    primaryPhone: string | null;
    email: string | null;
  } | null;
  services: Array<{ serviceType: string }>;
  itinerary: Array<{
    id: string;
    country: string;
    destination: string;
    nights: number;
    sequence: number;
    arrivalDate: string | null;
    departureDate: string | null;
    notes: string | null;
  }>;
  // Phase 17 enriched list fields (present on the list endpoint; omitted by the
  // server when the caller lacks the relevant module permission).
  hasQuotations?: boolean;
  quotationSummary?: {
    quotationId: string;
    quotationNumber: string;
    quotationStatus: string;
    acceptedVersionId: string | null;
    latestVersionAmount: string | null;
    currency: string | null;
    bookingId: string | null;
    lastSentAt: string | null;
    acceptedAt: string | null;
  } | null;
  bookingSummary?: {
    bookingId: string;
    bookingNumber: string;
    bookingStatus: string;
    operationalStatus: string;
    travelStartDate: string | null;
    travelEndDate: string | null;
    paymentStatus?: string;
  } | null;
  actions?: {
    canCreateQuotation: boolean;
    canOpenQuotation: boolean;
    canConvertToBooking: boolean;
    canViewBooking: boolean;
    canAddFollowUp: boolean;
  };
}
export interface UserOption {
  id: string;
  fullName: string;
  username: string;
}
export interface Lookups {
  countries: string[];
  cities: string[];
  leadSources: Option[];
  leadTypes: Option[];
  leadStages: Option[];
  priorities: Option[];
  serviceTypes: Option[];
  tripTypes: string[];
  currencies: string[];
  assignableUsers: UserOption[];
}
interface Option {
  value: string;
  label: string;
}
export interface Analytics {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  followUpsDue: number;
  quotationRequired: number;
  readyToBook: number;
  bookingConfirmed: number;
  lostLeads: number;
  conversionRate: number;
  winRate: number;
  byLeadType: Record<string, number>;
  byLeadStage: Record<string, number>;
}
export interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isCustomerContact: boolean;
  contactMethod: string | null;
  contactedAt: string | null;
  authorUser: UserOption;
}
export interface FollowUp {
  id: string;
  scheduledAt: string;
  status: string;
  effectiveStatus: string;
  outcomeType: string | null;
  outcome: string | null;
  notes: string | null;
  completionNotes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  assignedTo: UserOption;
  createdBy: UserOption;
}
export interface TimelineEntry {
  id: string;
  type: string;
  actor: UserOption | null;
  title: string;
  description: string | null;
  timestamp: string;
  iconKey: string;
}
export interface LeadWorkspace {
  lead: Lead;
  operationalSummary: {
    pendingFollowUpCount: number;
    overdueFollowUpCount: number;
    completedFollowUpCount: number;
    notesCount: number;
    daysSinceLastContact: number | null;
    noFutureFollowUp: boolean;
    requiresAttention: boolean;
  };
  recent: { notes: Note[]; followUps: FollowUp[]; timeline: TimelineEntry[] };
  quotations: {
    count: number;
    latest: LeadQuotationSummary | null;
    items: LeadQuotationSummary[];
  };
  bookings: {
    count: number;
    latest: LeadBookingSummary | null;
    items: LeadBookingSummary[];
  };
  indicators: string[];
  timezone: string;
  permissions: {
    canEdit: boolean;
    canAssign: boolean;
    canChangeStage: boolean;
    canAddNote: boolean;
    canScheduleFollowUp: boolean;
    canCompleteFollowUp: boolean;
    canArchive: boolean;
    canViewQuotations: boolean;
    canCreateQuotation: boolean;
    canSendQuotation: boolean;
    canGenerateQuotationPdf: boolean;
    canViewBookings: boolean;
    canConvertBooking: boolean;
  };
}
export interface LeadQuotationSummary {
  id: string;
  quotationNumber: string;
  status: string;
  currentVersionId: string | null;
  lastSentAt: string | null;
  lastViewedAt: string | null;
  createdAt: string;
  booking: { id: string; bookingNumber: string; bookingStatus: string } | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    finalAmount: string;
    currency: string;
    status: string;
  }>;
}
export interface LeadBookingSummary {
  id: string;
  bookingNumber: string;
  bookingStatus: string;
  operationalStatus: string;
  paymentStatus: string;
  destinationSummary: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  createdAt: string;
}

export const queryKeys = {
  all: ['queries'] as const,
  list: (q: string) => ['queries', 'list', q] as const,
  analytics: ['queries', 'analytics'] as const,
  lookups: ['queries', 'lookups'] as const,
  detail: (id: string) => ['queries', id] as const,
  workspace: (id: string) => ['queries', id, 'workspace'] as const,
  notes: (id: string) => ['queries', id, 'notes'] as const,
  followUps: (id: string) => ['queries', id, 'follow-ups'] as const,
  timeline: (id: string) => ['queries', id, 'timeline'] as const,
};
export function useLeads(params: URLSearchParams) {
  const q = params.toString();
  return useQuery({
    queryKey: queryKeys.list(q),
    queryFn: ({ signal }) => apiClient.get<Page<Lead>>(`/queries${q ? `?${q}` : ''}`, signal),
  });
}
export function useLeadAnalytics() {
  return useQuery({
    queryKey: queryKeys.analytics,
    queryFn: ({ signal }) => apiClient.get<Analytics>('/queries/analytics', signal),
  });
}
export function useLeadLookups() {
  return useQuery({
    queryKey: queryKeys.lookups,
    queryFn: ({ signal }) => apiClient.get<Lookups>('/queries/lookups', signal),
  });
}
export function useLead(id?: string) {
  return useQuery({
    queryKey: queryKeys.detail(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Lead>(`/queries/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useLeadWorkspace(id?: string) {
  return useQuery({
    queryKey: queryKeys.workspace(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<LeadWorkspace>(`/queries/${id}/workspace`, signal),
    enabled: Boolean(id),
  });
}
export function usePhoneSearch(phone: string) {
  return useQuery({
    queryKey: ['queries', 'phone', phone],
    queryFn: ({ signal }) =>
      apiClient.get<
        Array<
          Pick<
            Lead,
            | 'id'
            | 'queryNumber'
            | 'customerName'
            | 'phone'
            | 'alternatePhone'
            | 'email'
            | 'dateOfBirth'
            | 'departureCity'
          >
        >
      >(`/queries/search-by-phone?phone=${encodeURIComponent(phone)}`, signal),
    enabled: phone.replace(/\D/g, '').length >= 5,
  });
}
export function useSaveLead(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QueryInput | QueryUpdateInput) =>
      id ? apiClient.patch<Lead>(`/queries/${id}`, input) : apiClient.post<Lead>('/queries', input),
    onSuccess: (lead) => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
      qc.setQueryData(queryKeys.detail(lead.id), lead);
    },
  });
}
export function useLeadAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiClient.patch<Lead>(`/queries/${id}/${path}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
      void qc.invalidateQueries({ queryKey: queryKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.timeline(id) });
    },
  });
}
export function useArchiveLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ archived: boolean; id: string }>(`/queries/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}

export interface BulkResult {
  updatedCount: number;
  unchangedCount: number;
  results: Array<{ queryId: string; changed: boolean }>;
}
export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { queryIds: string[]; assignedToId: string }) =>
      apiClient.post<BulkResult>('/queries/bulk-assignment', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}
export function useBulkStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { queryIds: string[]; leadStage: string; reason?: string }) =>
      apiClient.post<BulkResult>('/queries/bulk-stage', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}
/** Fetch the filtered lead CSV and trigger a browser download. */
export function useLeadExport() {
  return useMutation({
    mutationFn: async (params: URLSearchParams) => {
      const query = params.toString();
      const csv = await apiClient.get<CsvPayload>(`/queries/export${query ? `?${query}` : ''}`);
      return downloadCsv(csv);
    },
  });
}
export function useNotes(id: string) {
  return useQuery({
    queryKey: queryKeys.notes(id),
    queryFn: ({ signal }) => apiClient.get<Note[]>(`/queries/${id}/notes`, signal),
  });
}
export function useNoteAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      content,
      isCustomerContact,
      contactMethod,
      remove,
    }: {
      noteId?: string;
      content?: string;
      isCustomerContact?: boolean;
      contactMethod?: ContactMethodValue | null;
      remove?: boolean;
    }) =>
      remove
        ? apiClient.delete(`/queries/${id}/notes/${noteId}`)
        : noteId
          ? apiClient.patch(`/queries/${id}/notes/${noteId}`, {
              content,
              isCustomerContact: isCustomerContact ?? false,
              contactMethod,
            })
          : apiClient.post(`/queries/${id}/notes`, {
              content,
              isCustomerContact: isCustomerContact ?? false,
              contactMethod,
            }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notes(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.timeline(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(id) });
    },
  });
}
export function useFollowUps(id: string) {
  return useQuery({
    queryKey: queryKeys.followUps(id),
    queryFn: ({ signal }) => apiClient.get<FollowUp[]>(`/queries/${id}/follow-ups`, signal),
  });
}
export function useFollowUpAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      followUpId,
      action,
      body,
    }: {
      followUpId?: string;
      action?: 'complete' | 'cancel' | 'delete';
      body?: unknown;
    }) =>
      !followUpId
        ? apiClient.post(`/queries/${id}/follow-ups`, body)
        : action === 'delete'
          ? apiClient.delete(`/queries/${id}/follow-ups/${followUpId}`)
          : apiClient.patch(
              `/queries/${id}/follow-ups/${followUpId}${action ? `/${action}` : ''}`,
              body,
            ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.followUps(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.timeline(id) });
    },
  });
}
export function useTimeline(id: string) {
  return useQuery({
    queryKey: queryKeys.timeline(id),
    queryFn: ({ signal }) =>
      apiClient.get<Page<TimelineEntry>>(`/queries/${id}/timeline?pageSize=50`, signal),
  });
}
