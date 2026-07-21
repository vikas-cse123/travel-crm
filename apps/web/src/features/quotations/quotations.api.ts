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
export interface TemplateHotel {
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
export interface TemplateService {
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
export interface QuotationVersion {
  id: string;
  versionNumber: number;
  title: string;
  introduction: string | null;
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
