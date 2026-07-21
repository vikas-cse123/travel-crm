import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type {
  BookingCostInput,
  BookingDocumentUpload,
  BookingManualInput,
  BookingNoteInput,
  BookingPaymentInput,
  BookingPaymentScheduleInput,
  BookingServiceInput,
  QuotationConversionInput,
  TravellerInput,
} from '@interscale/shared';

export interface PersonRef {
  id: string;
  fullName: string;
  username: string;
}
export interface BookingTraveller {
  id: string;
  travellerType: string;
  title: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  nationality: string | null;
  dateOfBirth: string | null;
  passportMasked: string | null;
  passportExpiresAt: string | null;
  visaStatus: string;
  isPrimaryTraveller: boolean;
  sequence: number;
}
export interface BookingService {
  id: string;
  serviceType: string;
  name: string;
  city: string | null;
  confirmationStatus: string;
  confirmationNumber: string | null;
  supplierName: string | null;
  supplierReference: string | null;
  customerSellingAmount: string;
  internalCostSnapshot?: string;
  sequence: number;
}
export interface BookingSchedule {
  id: string;
  installmentNumber: number;
  label: string;
  amount: string;
  dueDate: string;
  status: string;
  notes: string | null;
}
export interface BookingPayment {
  id: string;
  paymentNumber: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  receivedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  paymentScheduleId: string | null;
}
export interface BookingCost {
  id: string;
  costCategory: string;
  supplierName: string;
  description: string;
  amount: string;
  currency: string;
  costStatus: string;
  dueDate: string | null;
  paidAt: string | null;
  bookingServiceId: string | null;
}
export interface BookingDocument {
  id: string;
  travellerId: string | null;
  bookingServiceId: string | null;
  paymentId: string | null;
  documentType: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadStatus: string;
  visibility: string;
  createdAt: string;
  uploadedBy: PersonRef;
}
export interface BookingNote {
  id: string;
  content: string;
  noteType: string;
  createdAt: string;
  authorUser: PersonRef;
}
export interface Booking {
  id: string;
  bookingNumber: string;
  queryId: string | null;
  quotationId: string | null;
  quotationVersionId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  destinationSummary: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  rooms: number;
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
  currency: string;
  bookingStatus: string;
  operationalStatus: string;
  paymentStatus: string;
  bookedBy: PersonRef;
  assignedTo: PersonRef | null;
  sourceTitle: string | null;
  manualCreationReason: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  attentionIndicators: string[];
  totalSellingAmount?: string;
  totalCustomerPaid?: string;
  totalCustomerOutstanding?: string;
  totalCost?: string;
  grossProfit?: string;
  profitMarginPercentage?: string;
  travellers: BookingTraveller[];
  services: BookingService[];
  itinerary: Array<{
    id: string;
    dayNumber: number;
    title: string;
    destination: string;
    description: string;
    sequence: number;
  }>;
  paymentSchedules: BookingSchedule[];
  payments: BookingPayment[];
  costs?: BookingCost[];
  documents: BookingDocument[];
  notes: BookingNote[];
  emailLogs: Array<{
    id: string;
    emailType: string;
    recipientEmail: string;
    subject: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  }>;
  query: { id: string; queryNumber: string; leadStage: string } | null;
  quotation: { id: string; quotationNumber: string; status: string } | null;
  quotationVersion: { id: string; versionNumber: number; title: string; status: string } | null;
}
export interface BookingPage {
  data: Booking[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface BookingAnalytics {
  totalBookings: number;
  pendingConfirmation: number;
  confirmed: number;
  travelUpcoming: number;
  travelInProgress: number;
  completed: number;
  cancelled: number;
  overdueCustomerPayments: number;
  bookingsDepartingNext7Days: number;
  bookingsWithMissingTravellerDocuments: number;
  servicesAwaitingConfirmation: number;
  totalCustomerOutstanding?: string;
  totalBookingValue?: string;
  totalCustomerPaymentsReceived?: string;
  totalRecordedCosts?: string;
  grossProfit?: string;
}

export const bookingKeys = {
  all: ['bookings'] as const,
  list: (query: string) => ['bookings', 'list', query] as const,
  analytics: ['bookings', 'analytics'] as const,
  one: (id: string) => ['bookings', id] as const,
  timeline: (id: string) => ['bookings', id, 'timeline'] as const,
};

export function useBookings(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: bookingKeys.list(query),
    queryFn: ({ signal }) =>
      apiClient.get<BookingPage>(`/bookings${query ? `?${query}` : ''}`, signal),
  });
}
export function useBookingAnalytics() {
  return useQuery({
    queryKey: bookingKeys.analytics,
    queryFn: ({ signal }) => apiClient.get<BookingAnalytics>('/bookings/analytics', signal),
  });
}
export function useBooking(id?: string) {
  return useQuery({
    queryKey: bookingKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Booking>(`/bookings/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useBookingLookups() {
  return useQuery({
    queryKey: ['bookings', 'lookups'],
    queryFn: ({ signal }) => apiClient.get<{ users: PersonRef[] }>('/bookings/lookups', signal),
  });
}
export function useCreateBooking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingManualInput) => apiClient.post<Booking>('/bookings', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}
export function useConvertQuotation(quotationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: QuotationConversionInput) =>
      apiClient.post<Booking>(`/quotations/${quotationId}/convert-to-booking`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: bookingKeys.all });
      void client.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}
export function useBookingAction(id: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: bookingKeys.one(id) });
    void client.invalidateQueries({ queryKey: bookingKeys.all });
  };
  return useMutation({
    mutationFn: ({
      path = '',
      method = 'post',
      body,
    }: {
      path?: string;
      method?: 'get' | 'post' | 'patch' | 'delete';
      body?: unknown;
    }) => {
      const url = `/bookings/${id}${path ? `/${path}` : ''}`;
      return method === 'get'
        ? apiClient.get(url)
        : method === 'patch'
          ? apiClient.patch(url, body)
          : method === 'delete'
            ? apiClient.delete(url)
            : apiClient.post(url, body);
    },
    onSuccess: refresh,
  });
}
export function useBookingTimeline(id: string) {
  return useQuery({
    queryKey: bookingKeys.timeline(id),
    queryFn: ({ signal }) =>
      apiClient.get<{
        data: Array<{
          id: string;
          type: string;
          title: string;
          description: string;
          timestamp: string;
          actor: PersonRef | null;
        }>;
        pagination: unknown;
      }>(`/bookings/${id}/timeline`, signal),
    enabled: Boolean(id),
  });
}

export type BookingOperationInput =
  | TravellerInput
  | BookingServiceInput
  | BookingPaymentScheduleInput
  | BookingPaymentInput
  | BookingCostInput
  | BookingDocumentUpload
  | BookingNoteInput;

export async function uploadBookingDocument(
  bookingId: string,
  file: File,
  input: Omit<BookingDocumentUpload, 'fileName' | 'mimeType' | 'fileSize'>,
) {
  const approved = await apiClient.post<{ document: { id: string }; uploadUrl: string }>(
    `/bookings/${bookingId}/documents/uploads`,
    { ...input, fileName: file.name, mimeType: file.type, fileSize: file.size },
  );
  const response = await fetch(approved.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error('The storage provider rejected the upload.');
  await apiClient.post(`/bookings/${bookingId}/documents/uploads/${approved.document.id}/confirm`);
  return approved.document.id;
}
