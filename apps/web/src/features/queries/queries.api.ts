import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { downloadCsv, type CsvPayload } from '@/lib/downloadCsv';
import type {
  ContactMethodValue,
  LeadImportInput,
  QueryInput,
  QueryUpdateInput,
} from '@interscale/shared';
import type { LeadDateFilterType } from '@interscale/shared';

/** Date keys shared between the URL state and the API request. */
export const LEAD_DATE_KEYS = ['dateType', 'dateFrom', 'dateTo'] as const;

/** Build a query string carrying only the active lead date-filter params. */
export function leadDateQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of LEAD_DATE_KEYS) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  return out.toString();
}

export interface LeadDateFilterState {
  dateType: LeadDateFilterType;
  dateFrom: string;
  dateTo: string;
}

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
    // Costing figures — present only when the caller holds quotation-costing
    // permission. Used to surface Amount/Margin in the Leads table.
    netAmount?: string | null;
    marginAmount?: string | null;
    bookingId: string | null;
    lastSentAt: string | null;
    acceptedAt: string | null;
  } | null;
  weblink?: {
    quotationId: string;
    publicUrl: string | null;
    isGenerated: boolean;
    totalViews: number;
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
    canCreateWeblink: boolean;
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
export interface NoteFollowUpRef {
  id: string;
  scheduledAt: string;
  status: string;
  snoozedUntil: string | null;
}
export interface Note {
  id: string;
  content: string;
  leadStage: string | null;
  createdAt: string;
  updatedAt: string;
  isCustomerContact: boolean;
  contactMethod: string | null;
  contactedAt: string | null;
  authorUser: UserOption;
  followUp: NoteFollowUpRef | null;
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
  analytics: (q: string) => ['queries', 'analytics', q] as const,
  lookups: ['queries', 'lookups'] as const,
  detail: (id: string) => ['queries', id] as const,
  workspace: (id: string) => ['queries', id, 'workspace'] as const,
  notes: (id: string) => ['queries', id, 'notes'] as const,
  notesOverview: ['queries', 'notes-overview'] as const,
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
/** Rows a lead type-ahead asks for per keystroke pause. */
export const LEAD_SEARCH_PAGE_SIZE = 20;

/** Pause in typing before a lead type-ahead hits the server. */
export const LEAD_SEARCH_DEBOUNCE_MS = 300;

/**
 * Type-ahead lookup over the leads the caller is allowed to see.
 *
 * Deliberately the same `GET /queries` list endpoint the Leads page uses, via
 * its existing `search` parameter: tenant scoping, RBAC and per-user lead
 * visibility are applied server-side there, so a search can never surface a
 * lead the caller could not already list. Filtering in the browser instead
 * would only ever see one page of leads, so an account with more leads than
 * `LEAD_SEARCH_PAGE_SIZE` would silently hide matches.
 *
 * The cache key matches `useLeads` for identical parameters, so both share
 * results and the existing `queryKeys.all` invalidations already cover this.
 */
export function useLeadSearch(search: string, options: { enabled?: boolean } = {}) {
  const params = new URLSearchParams({ pageSize: String(LEAD_SEARCH_PAGE_SIZE) });
  const term = search.trim();
  if (term) params.set('search', term);
  const q = params.toString();
  return useQuery({
    queryKey: queryKeys.list(q),
    queryFn: ({ signal }) => apiClient.get<Page<Lead>>(`/queries?${q}`, signal),
    // Keep the previous matches on screen while the next search resolves so the
    // list does not blank out between keystrokes.
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useLeadAnalytics(params: URLSearchParams) {
  const q = leadDateQuery(params);
  return useQuery({
    queryKey: queryKeys.analytics(q),
    queryFn: ({ signal }) =>
      apiClient.get<Analytics>(`/queries/analytics${q ? `?${q}` : ''}`, signal),
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

export type LeadInlineField = 'leadType' | 'leadStage';

export interface LeadInlineFieldUpdate {
  field: LeadInlineField;
  value: string;
  /** Required for stages such as CANCELLED/INVALID. */
  reason?: string;
  /** Required when moving a lead to LOST. */
  lostReason?: string;
}

/**
 * Inline update of a single lead field (Type or Stage) straight from a list.
 * Type reuses the generic update endpoint; Stage reuses the dedicated stage
 * endpoint so all transition rules, history and activity logging are preserved.
 * The API response is treated as the source of truth. Empty reason values are
 * never sent, so a non-Lost stage change never carries a blank lost reason.
 */
export function useUpdateLeadField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ field, value, reason, lostReason }: LeadInlineFieldUpdate) =>
      field === 'leadStage'
        ? apiClient.patch<Lead>(`/queries/${id}/stage`, {
            stage: value,
            ...(reason ? { reason } : {}),
            ...(lostReason ? { lostReason } : {}),
          })
        : apiClient.patch<Lead>(`/queries/${id}`, { leadType: value }),
    onSuccess: (lead) => {
      // Re-fetch list, analytics and counters; cache the returned lead as fresh.
      void qc.invalidateQueries({ queryKey: queryKeys.all });
      void qc.invalidateQueries({ queryKey: ['queries', 'analytics'] });
      qc.setQueryData(queryKeys.detail(lead.id), lead);
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

export interface LeadImportRowResult {
  row: number;
  customerName: string;
  status: 'IMPORTED' | 'SKIPPED' | 'FAILED';
  reason?: string;
}
export interface LeadImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  results: LeadImportRowResult[];
  errorCsv: CsvPayload;
}
/** Bulk-import mapped lead rows; refreshes the list on success. */
export function useLeadImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadImportInput) =>
      apiClient.post<LeadImportSummary>('/queries/import', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.all });
      void qc.invalidateQueries({ queryKey: queryKeys.analytics('') });
    },
  });
}
export function useLeadImportErrorDownload() {
  return {
    download: (payload: CsvPayload) => downloadCsv(payload),
  };
}
export function useNotes(id: string) {
  return useQuery({
    queryKey: queryKeys.notes(id),
    queryFn: ({ signal }) => apiClient.get<Note[]>(`/queries/${id}/notes`, signal),
  });
}
export interface NotesOverviewLead {
  id: string;
  queryNumber: string;
  customerName: string;
  phone: string;
  leadStage: string;
  assignedTo: UserOption | null;
  noteCount: number;
  latestNote: Note | null;
  previousNotes: Note[];
}
export interface NotesOverview {
  stats: {
    totalNotes: number;
    totalLeads: number;
    totalLeadsWithNotes: number;
    totalPages: number;
  };
  page: number;
  pageSize: number;
  leads: NotesOverviewLead[];
}
export function useNotesOverview(params: URLSearchParams) {
  const q = params.toString();
  return useQuery({
    queryKey: [...queryKeys.notesOverview, q],
    queryFn: ({ signal }) =>
      apiClient.get<NotesOverview>(`/queries/notes-overview${q ? `?${q}` : ''}`, signal),
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
      reminderAt,
      reminderAssignedToId,
      reminderNotes,
      remove,
    }: {
      noteId?: string;
      content?: string;
      isCustomerContact?: boolean;
      contactMethod?: ContactMethodValue | null;
      reminderAt?: string;
      reminderAssignedToId?: string;
      reminderNotes?: string;
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
              ...(reminderAt ? { reminderAt, reminderAssignedToId, reminderNotes } : {}),
            }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notes(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.timeline(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.notesOverview });
      void qc.invalidateQueries({ queryKey: ['reminders'] });
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
