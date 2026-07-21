import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CustomerCommunicationInput,
  CustomerInput,
  CustomerMergeInput,
  CustomerNoteInput,
  CustomerUpdateInput,
} from '@interscale/shared';
import { apiClient } from '@/api/client';

export interface CustomerRef {
  id: string;
  customerNumber: string;
  displayName: string;
  primaryPhone: string | null;
  email: string | null;
}
export interface Customer extends CustomerRef {
  type: string;
  status: string;
  lifecycleStage: string;
  alternatePhone: string | null;
  dateOfBirth: string | null;
  companyName: string | null;
  travelPreferences: string | null;
  dietaryRequirements: string | null;
  specialRequirements: string | null;
  assignedTo: { id: string; fullName: string } | null;
  createdBy: { id: string; fullName: string };
  addresses: Array<{
    id: string;
    type: string;
    line1: string;
    city: string;
    country: string;
    isPrimary: boolean;
  }>;
  tags: Array<{ id: string; name: string; color: string }>;
  queryCount: number;
  quotationCount: number;
  bookingCount: number;
  completedBookingCount: number;
  isRepeatCustomer: boolean;
  isVip: boolean;
  totalBookedValue?: string;
  totalPaid?: string;
  totalOutstanding?: string;
  lifetimeGrossProfit?: string;
  lastContactedAt: string | null;
  lastEnquiryAt: string | null;
  lastBookingAt: string | null;
  nextFollowUpAt: string | null;
  latestLead?: { id: string; queryNumber: string; leadStage: string; createdAt: string } | null;
  latestQuotation?: {
    id: string;
    quotationNumber: string;
    status: string;
    createdAt: string;
  } | null;
  latestBooking?: {
    id: string;
    bookingNumber: string;
    bookingStatus: string;
    travelStartDate: string | null;
    createdAt: string;
  } | null;
  upcomingTravel?: {
    id: string;
    bookingNumber: string;
    destinationSummary: string;
    travelStartDate: string;
  } | null;
  duplicateWarnings?: DuplicateMatch[];
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CustomerPage {
  data: Customer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface CustomerAnalytics {
  total: number;
  active: number;
  newThisMonth: number;
  prospects: number;
  repeat: number;
  vip: number;
  openLeads: number;
  acceptedQuotations: number;
  upcomingBookings: number;
  inactive: number;
  notContactedIn30Days: number;
  withoutTags: number;
  possibleDuplicateGroups: number;
  customersWithOutstanding?: number;
  totalPaid?: string;
  averageBookingValue?: string;
  repeatPercentage: number;
  totalOutstanding?: string;
  totalBookedValue?: string;
}
export interface DuplicateMatch extends CustomerRef {
  reasons: string[];
  score: number;
  strongMatch: boolean;
  status: string;
  lifecycleStage: string;
}
export interface TimelinePage {
  data: Array<{ type: string; occurredAt: string; value: Record<string, unknown> }>;
  pagination: CustomerPage['pagination'];
}

export const customerKeys = {
  all: ['customers'] as const,
  one: (id: string) => ['customers', id] as const,
  timeline: (id: string) => ['customers', id, 'timeline'] as const,
};
const refresh = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: customerKeys.all });
  if (id) void client.invalidateQueries({ queryKey: customerKeys.one(id) });
};

export function useCustomers(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...customerKeys.all, 'list', query],
    queryFn: ({ signal }) =>
      apiClient.get<CustomerPage>(`/customers${query ? `?${query}` : ''}`, signal),
  });
}
export function useCustomerAnalytics() {
  return useQuery({
    queryKey: [...customerKeys.all, 'analytics'],
    queryFn: ({ signal }) => apiClient.get<CustomerAnalytics>('/customers/analytics', signal),
  });
}
export function useCustomer(id?: string) {
  return useQuery({
    queryKey: customerKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Customer>(`/customers/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useCustomerLookups() {
  return useQuery({
    queryKey: [...customerKeys.all, 'lookups'],
    queryFn: ({ signal }) =>
      apiClient.get<{
        tags: Array<{ id: string; name: string; color: string }>;
        users: Array<{ id: string; fullName: string }>;
      }>('/customers/lookups', signal),
  });
}
export function useCustomerDuplicates(input: {
  displayName?: string;
  phone?: string;
  email?: string;
  excludeCustomerId?: string;
}) {
  const query = new URLSearchParams(
    Object.entries(input).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
  ).toString();
  return useQuery({
    queryKey: [...customerKeys.all, 'duplicates', query],
    queryFn: ({ signal }) =>
      apiClient.get<DuplicateMatch[]>(`/customers/duplicates?${query}`, signal),
    enabled: Boolean(
      input.phone || input.email || (input.displayName && input.displayName.length > 2),
    ),
    staleTime: 10_000,
  });
}
export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => apiClient.post<Customer>('/customers', input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateCustomer(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerUpdateInput) =>
      apiClient.patch<Customer>(`/customers/${id}`, input),
    onSuccess: () => refresh(client, id),
  });
}
export function useCustomerRelationships(
  id: string,
  type: 'leads' | 'quotations' | 'bookings' | 'travellers' | 'payments',
) {
  return useQuery({
    queryKey: [...customerKeys.one(id), type],
    queryFn: ({ signal }) =>
      apiClient.get<Array<Record<string, unknown>>>(`/customers/${id}/${type}`, signal),
    enabled: Boolean(id),
  });
}
export function useCustomerTimeline(id: string) {
  return useQuery({
    queryKey: customerKeys.timeline(id),
    queryFn: ({ signal }) => apiClient.get<TimelinePage>(`/customers/${id}/timeline`, signal),
    enabled: Boolean(id),
  });
}
export function useCustomerNotes(id: string) {
  return useQuery({
    queryKey: [...customerKeys.one(id), 'notes'],
    queryFn: ({ signal }) =>
      apiClient.get<Array<Record<string, unknown>>>(`/customers/${id}/notes`, signal),
    enabled: Boolean(id),
  });
}
export function useCustomerCommunications(id: string) {
  return useQuery({
    queryKey: [...customerKeys.one(id), 'communications'],
    queryFn: ({ signal }) =>
      apiClient.get<Array<Record<string, unknown>>>(`/customers/${id}/communications`, signal),
    enabled: Boolean(id),
  });
}
export function useCustomerDocuments(id: string, enabled = true) {
  return useQuery({
    queryKey: [...customerKeys.one(id), 'documents'],
    queryFn: ({ signal }) =>
      apiClient.get<Array<Record<string, unknown>>>(`/customers/${id}/documents`, signal),
    enabled: Boolean(id) && enabled,
  });
}
export function useCustomerAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = 'post',
      body,
    }: {
      path: string;
      method?: 'post' | 'patch' | 'delete';
      body?: unknown;
    }) =>
      method === 'delete'
        ? apiClient.delete(`/customers/${id}/${path}`)
        : method === 'patch'
          ? apiClient.patch(`/customers/${id}/${path}`, body)
          : apiClient.post(`/customers/${id}/${path}`, body),
    onSuccess: () => refresh(client, id),
  });
}
export function useCreateCustomerNote(id: string) {
  const action = useCustomerAction(id);
  return {
    ...action,
    mutate: (input: CustomerNoteInput) => action.mutate({ path: 'notes', body: input }),
  };
}
export function useCreateCustomerCommunication(id: string) {
  const action = useCustomerAction(id);
  return {
    ...action,
    mutate: (input: CustomerCommunicationInput) =>
      action.mutate({ path: 'communications', body: input }),
  };
}
export function useMergeCustomers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerMergeInput & { preview?: boolean }) =>
      input.preview
        ? apiClient.post('/customers/merge/preview', input)
        : apiClient.post('/customers/merge', input),
    onSuccess: () => refresh(client),
  });
}

export async function uploadCustomerDocument(customerId: string, file: File, type: string) {
  const approved = await apiClient.post<{ document: { id: string }; uploadUrl: string }>(
    `/customers/${customerId}/documents/upload`,
    { type, name: file.name, mimeType: file.type, sizeBytes: file.size },
  );
  const response = await fetch(approved.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error('The storage provider rejected the upload.');
  await apiClient.post(`/customers/${customerId}/documents/${approved.document.id}/confirm`);
  return approved.document.id;
}
