import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type {
  QuotationInput,
  QuotationSendInput,
  QuotationTemplateInput,
  QuotationTemplateUpdate,
  QuotationVersionUpdate,
} from '@interscale/shared';

export interface PersonRef {
  id: string;
  fullName: string;
  username: string;
}
export interface TemplateItinerary {
  id: string;
  dayNumber: number;
  date?: string | null;
  title: string;
  destination: string;
  description: string;
  meals: string | null;
  overnightLocation: string | null;
  activities: string | null;
  transfers: string | null;
  notes: string | null;
  sequence: number;
}
/** Optional links to travel masters; the snapshot fields below still render. */
export interface MasterHotelRefs {
  hotelId?: string | null;
  hotelRoomTypeId?: string | null;
  hotelMealPlanId?: string | null;
}
export interface MasterServiceRefs {
  airlineId?: string | null;
  cruiseId?: string | null;
  cruiseRoomTypeId?: string | null;
  vehicleId?: string | null;
  sightseeingId?: string | null;
  addOnServiceId?: string | null;
}
export interface TemplateHotel extends MasterHotelRefs {
  id: string;
  city: string;
  hotelName: string;
  category: string | null;
  roomType: string | null;
  mealPlan: string | null;
  rooms: number;
  nights: number;
  checkInDate: string | null;
  checkOutDate: string | null;
  internalCost?: string;
  sellingPrice: string | null;
  selected: boolean;
  notes: string | null;
  sequence: number;
}
export interface TemplateService extends MasterServiceRefs {
  id: string;
  serviceType: string;
  name: string;
  description: string | null;
  dayNumber: number | null;
  city: string | null;
  quantity: string;
  internalCost?: string;
  sellingPrice: string | null;
  taxCategory: string | null;
  notes: string | null;
  sequence: number;
}
export interface ContentRow {
  id: string;
  content: string;
  sequence: number;
}
export interface QuotationTemplate {
  id: string;
  templateCode: string;
  name: string;
  description: string | null;
  destinationSummary: string;
  durationDays: number;
  durationNights: number;
  baseCurrency: string;
  adultBasePrice: string | null;
  childWithBedBasePrice: string | null;
  childWithoutBedBasePrice: string | null;
  infantBasePrice: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  usageCount: number;
  internalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PersonRef;
  cities?: string[];
  itinerary: TemplateItinerary[];
  hotels: TemplateHotel[];
  services: TemplateService[];
  inclusions: ContentRow[];
  exclusions: ContentRow[];
  terms: ContentRow[];
  actionPermissions?: { canUpdate: boolean; canDelete: boolean; canUse: boolean };
  counts?: { cities: number; services: number; hotelOptions: number };
}
export interface FlightSegment {
  airlineId?: string | null;
  airlineName?: string | null;
  flightNumber?: string | null;
  travelClass?: string | null;
  from?: string | null;
  to?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  duration?: string | null;
  cabinLuggage?: string | null;
  checkInLuggage?: string | null;
  notes?: string | null;
  connectionVia?: string | null;
}
export interface FlightJourney {
  fromCity?: string | null;
  toCity?: string | null;
  travelClass?: string | null;
  segments: FlightSegment[];
}
export interface FlightDetails {
  include: boolean;
  sectionTitle?: string | null;
  amount?: number | null;
  journeyType: 'ROUND_TRIP' | 'ONEWAY_OUTBOUND' | 'ONEWAY_RETURN';
  outbound: FlightJourney;
  returnJourney: FlightJourney;
}
export interface HotelDetails {
  include?: boolean;
  sectionTitle?: string | null;
  amount?: number | null;
  description?: string | null;
}
export interface SightseeingActivity {
  sightseeingId?: string | null;
  name?: string | null;
  startTime?: string | null;
  duration?: string | null;
  city?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  sequence?: number | null;
}
export type SightseeingMealMode = 'NO_TRANSFER' | 'INCLUDE_AT_HOTEL' | 'WITH_TRANSFER';
export interface SightseeingMealPreference {
  mode: SightseeingMealMode;
  transferDetails?: string | null;
}
export interface SightseeingMealPreferences {
  breakfast?: SightseeingMealPreference;
  lunch?: SightseeingMealPreference;
  dinner?: SightseeingMealPreference;
}
export interface SightseeingDay {
  dayNumber: number;
  title?: string | null;
  titleTouched?: boolean;
  city?: string | null;
  date?: string | null;
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean };
  mealMode: SightseeingMealMode;
  mealPreferences?: SightseeingMealPreferences;
  dailyTransfer: 'PRIVATE' | 'SHARED' | 'NO_TRANSFER';
  activities: SightseeingActivity[];
}
export interface SightseeingDetails {
  include: boolean;
  sectionTitle?: string | null;
  amount?: number | null;
  description?: string | null;
  days: SightseeingDay[];
}
export interface QuotationVersion {
  id: string;
  versionNumber: number;
  title: string;
  introduction: string | null;
  weblinkHeading: string | null;
  destinationSummary: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  currency: string;
  subtotalSellingPrice: string;
  subtotalCost?: string;
  markupMode: string;
  markupValue: string;
  totalMarkup: string;
  taxRate: string;
  taxAmount: string;
  discountAmount: string;
  finalAmount: string;
  marginAmount?: string;
  marginPercentage?: string;
  pricingMode: string;
  // Reference "Summary & Pricing" — per-passenger package pricing.
  perAdultPrice: string;
  perChildWithBedPrice: string;
  perChildWithoutBedPrice: string;
  perInfantPrice: string;
  taxNote: string | null;
  netAmount?: string;
  initialPaymentAmount: string;
  paymentLink: string | null;
  showServiceChargesSeparately: boolean;
  markServiceChargesOutside: boolean;
  hidePricing: boolean;
  showIndividualPricing: boolean;
  // Reference "Inclusions & Exclusions" — rich-text blocks.
  inclusionsHtml: string | null;
  exclusionsHtml: string | null;
  paymentPolicies: string | null;
  cancellationPolicies: string | null;
  bookingTerms: string | null;
  // Reference "Visa" — single dedicated section.
  includeVisa: boolean;
  visaSectionTitle: string | null;
  visaAmount: string;
  visaDestination: string | null;
  visaType: string | null;
  visaServiceCharge: string;
  visaGstPercent: string;
  visaVfsCharge: string;
  // Reference "Flight" — structured journeys/segments (JSON).
  flightDetails: FlightDetails | null;
  // Reference "Hotel" — editable section metadata (JSON).
  hotelDetails: HotelDetails | null;
  // Reference "Add-on Services" — top-level include flag (JSON).
  addOnDetails: { include?: boolean; sectionTitle?: string | null } | null;
  // Reference "Sightseeing" — day-wise activity itinerary (JSON).
  sightseeingDetails: SightseeingDetails | null;
  notes: string | null;
  internalNotes?: string | null;
  status: string;
  finalizedAt: string | null;
  createdAt: string;
  createdBy: PersonRef;
  itinerary: TemplateItinerary[];
  hotels: TemplateHotel[];
  services: Array<
    TemplateService & {
      unitSellingPrice: string;
      totalSellingPrice: string;
      unitCost?: string;
      totalCost?: string;
    }
  >;
  inclusions: ContentRow[];
  exclusions: ContentRow[];
  terms: ContentRow[];
}
export interface QuotationDocument {
  id: string;
  quotationVersionId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string | null;
  documentType: string;
  status: string;
  createdAt: string;
}
export interface Quotation {
  id: string;
  quotationNumber: string;
  queryId: string;
  customer: { id: string; customerNumber: string; displayName: string } | null;
  currentVersionId: string | null;
  acceptedVersionId: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  destinationSummary: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
  rooms: number;
  currency: string;
  validUntil: string | null;
  firstSentAt: string | null;
  lastSentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PersonRef;
  query: {
    id: string;
    queryNumber: string;
    leadStage: string;
    assignedToId: string | null;
    createdById: string;
    departureCity: string | null;
    departureCountry: string | null;
    services?: Array<{ serviceType: string }>;
    itinerary?: Array<{
      id: string;
      country: string;
      destination: string;
      nights: number;
      sequence: number;
      arrivalDate: string | null;
      departureDate: string | null;
    }>;
  };
  versions: QuotationVersion[];
  documents: QuotationDocument[];
  emailLogs: EmailLog[];
  activityTimeline?: Array<{
    id: string;
    action: string;
    metadata: unknown;
    createdAt: string;
    actorUser: PersonRef | null;
  }>;
  booking: { id: string; bookingNumber: string; bookingStatus: string } | null;
}
export interface EmailLog {
  id: string;
  quotationVersionId: string;
  recipientEmail: string;
  cc: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  failureReason: string | null;
  createdAt: string;
  sentBy: PersonRef;
}
export interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface QuotationPage extends Page<Quotation> {
  analytics: { byStatus: Record<string, number>; totalQuotedValue: string; acceptanceRate: number };
}

export const quotationKeys = {
  templates: ['quotation-templates'] as const,
  templateList: (query: string) => ['quotation-templates', 'list', query] as const,
  template: (id: string) => ['quotation-templates', id] as const,
  templatePreview: (id: string) => ['quotation-templates', id, 'preview'] as const,
  quotations: ['quotations'] as const,
  quotationList: (query: string) => ['quotations', 'list', query] as const,
  quotation: (id: string) => ['quotations', id] as const,
};

export function useQuotationTemplates(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: quotationKeys.templateList(query),
    queryFn: ({ signal }) =>
      apiClient.get<Page<QuotationTemplate>>(
        `/quotation-templates${query ? `?${query}` : ''}`,
        signal,
      ),
  });
}
export function useQuotationTemplate(id?: string, preview = false) {
  return useQuery({
    queryKey: preview ? quotationKeys.templatePreview(id ?? '') : quotationKeys.template(id ?? ''),
    queryFn: ({ signal }) =>
      apiClient.get<QuotationTemplate>(
        `/quotation-templates/${id}${preview ? '/preview' : ''}`,
        signal,
      ),
    enabled: Boolean(id),
  });
}
export function useSaveQuotationTemplate(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationTemplateInput | QuotationTemplateUpdate) =>
      id
        ? apiClient.patch<QuotationTemplate>(`/quotation-templates/${id}`, input)
        : apiClient.post<QuotationTemplate>('/quotation-templates', input),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: quotationKeys.templates });
      client.setQueryData(quotationKeys.template(data.id), data);
    },
  });
}
export function useTemplateAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action: 'duplicate' | 'status' | 'delete';
      body?: unknown;
    }) =>
      action === 'delete'
        ? apiClient.delete(`/quotation-templates/${id}`)
        : action === 'status'
          ? apiClient.patch(`/quotation-templates/${id}/status`, body)
          : apiClient.post<QuotationTemplate>(`/quotation-templates/${id}/duplicate`),
    onSuccess: () => void client.invalidateQueries({ queryKey: quotationKeys.templates }),
  });
}
export function useQuotations(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: quotationKeys.quotationList(query),
    queryFn: ({ signal }) =>
      apiClient.get<QuotationPage>(`/quotations${query ? `?${query}` : ''}`, signal),
  });
}
export function useQuotation(id?: string) {
  return useQuery({
    queryKey: quotationKeys.quotation(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Quotation>(`/quotations/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useCreateQuotation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationInput) => apiClient.post<Quotation>('/quotations', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: quotationKeys.quotations }),
  });
}
export function useQuotationAction(id: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: quotationKeys.quotation(id) });
    void client.invalidateQueries({ queryKey: quotationKeys.quotations });
  };
  return useMutation({
    mutationFn: ({
      path,
      method = 'post',
      body,
    }: {
      path: string;
      method?: 'get' | 'post' | 'patch' | 'delete';
      body?: unknown;
    }) =>
      method === 'get'
        ? apiClient.get(`/quotations/${id}/${path}`)
        : method === 'delete'
          ? apiClient.delete(`/quotations/${id}/${path}`)
          : method === 'patch'
            ? apiClient.patch(`/quotations/${id}/${path}`, body)
            : apiClient.post(`/quotations/${id}/${path}`, body),
    onSuccess: refresh,
  });
}
/**
 * Generate the PDF for an exact quotation version, then resolve a short-lived
 * download URL for it. Two server calls, one user action: the button stays in a
 * single loading state until a real, openable PDF URL is ready. Returns the URL
 * plus the server-sanitised filename so the caller can open or download it.
 */
export function useGenerateQuotationPdf(quotationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) => {
      // force: true — an explicit "Generate PDF" always produces a fresh
      // document so the latest destination image / footer is included.
      const document = await apiClient.post<{ id: string; fileName: string }>(
        `/quotations/${quotationId}/versions/${versionId}/generate-pdf`,
        { force: true },
      );
      const { url } = await apiClient.get<{ url: string }>(
        `/quotations/${quotationId}/documents/${document.id}/download-url`,
      );
      return { url, fileName: document.fileName };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: quotationKeys.quotation(quotationId) });
    },
  });
}
export function useUpdateQuotationVersion(quotationId: string, versionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationVersionUpdate) =>
      apiClient.patch<QuotationVersion>(`/quotations/${quotationId}/versions/${versionId}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: quotationKeys.quotation(quotationId) });
      void client.invalidateQueries({ queryKey: quotationKeys.quotations });
    },
  });
}
export function useSendQuotation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationSendInput) =>
      apiClient.post<{ sent: boolean; publicUrl: string | null }>(`/quotations/${id}/send`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: quotationKeys.quotation(id) });
      void client.invalidateQueries({ queryKey: quotationKeys.quotations });
    },
  });
}

/** Public weblink analytics for a quotation (authenticated, tenant-scoped). */
export interface WeblinkAnalyticsEntry {
  ipAddress: string;
  type: 'HOME' | 'EXTERNAL';
  views: number;
  firstViewedAt: string;
  lastViewedAt: string;
}
export interface WeblinkAnalytics {
  totalViews: number;
  externalViews: number;
  homeIpViews: number;
  uniqueIps: number;
  entries: WeblinkAnalyticsEntry[];
}

/** Fetch weblink analytics for a quotation. */
export function useQuotationWeblinkAnalytics(quotationId: string | null) {
  return useQuery({
    queryKey: ['quotations', quotationId, 'weblink-analytics'],
    queryFn: ({ signal }) =>
      apiClient.get<WeblinkAnalytics>(`/quotations/${quotationId}/weblink-analytics`, signal),
    enabled: Boolean(quotationId),
    retry: false,
  });
}

export async function uploadQuotationAttachment(quotationId: string, file: File) {
  const approved = await apiClient.post<{
    documentId: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  }>(`/quotations/${quotationId}/uploads`, {
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    documentType: 'SUPPORTING_ATTACHMENT',
  });
  const response = await fetch(approved.uploadUrl, {
    method: 'PUT',
    headers: approved.requiredHeaders,
    body: file,
  });
  if (!response.ok) throw new Error('The storage provider rejected the upload.');
  await apiClient.post(`/quotations/${quotationId}/uploads/${approved.documentId}/confirm`);
  return approved.documentId;
}
