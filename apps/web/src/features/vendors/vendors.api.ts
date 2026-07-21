import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  VendorContactInput,
  VendorInput,
  VendorNoteInput,
  VendorPayableInput,
  VendorPaymentInput,
  VendorRateInput,
  VendorServiceInput,
  VendorUpdateInput,
} from '@interscale/shared';
import { apiClient } from '@/api/client';

export interface Vendor {
  id: string;
  vendorCode: string;
  name: string;
  vendorType: string;
  status: string;
  contactPerson: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  coverageAreas: string | null;
  servicesOffered: string | null;
  contractType: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  paymentTerm: string;
  gstNumber: string | null;
  panNumber: string | null;
  rating: string | null;
  confirmationRate: string;
  totalBookings: number;
  totalBusiness?: string;
  totalPaid?: string;
  totalOutstanding?: string;
  averageBookingCost?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  assignedTo: { id: string; fullName: string } | null;
  contacts: Array<Record<string, unknown>>;
  services: VendorService[];
  payables?: Array<Record<string, unknown>>;
  recentBookingServices?: Array<Record<string, unknown>>;
  recentPayments?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  bankAccounts?: Array<Record<string, unknown>>;
}
export interface VendorService {
  id: string;
  serviceType: string;
  name: string;
  description: string | null;
  destination: string | null;
  city: string | null;
  coverageArea: string | null;
  currency: string;
  baseCost?: string;
  sellingReferencePrice?: string;
  taxPercentage?: string;
  commissionPercentage?: string;
  validFrom: string | null;
  validUntil: string | null;
  status: string;
  notes?: string | null;
  rates: Array<Record<string, unknown>>;
}
export interface VendorPage {
  data: Vendor[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface VendorAnalytics {
  total: number;
  active: number;
  averageRating: string | null;
  averageConfirmationRate: string | null;
  distribution: Record<string, number>;
  withoutServices: number;
  expiringContracts: number;
  totalVendorCosts?: string;
  totalBusiness?: string;
  totalPaid?: string;
  totalOutstanding?: string;
  totalBookings?: number;
  averageBookingCost?: string;
  paymentDistribution?: Record<string, number>;
}
export interface VendorDuplicate {
  id: string;
  vendorCode: string;
  name: string;
  vendorType: string;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  status: string;
  reasons: string[];
  strongMatch: boolean;
}

export const vendorKeys = {
  all: ['vendors'] as const,
  one: (id: string) => ['vendors', id] as const,
};
const refresh = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: vendorKeys.all });
  if (id) void client.invalidateQueries({ queryKey: vendorKeys.one(id) });
};

export function useVendors(params = new URLSearchParams(), enabled = true) {
  const query = params.toString();
  return useQuery({
    queryKey: [...vendorKeys.all, 'list', query],
    queryFn: ({ signal }) =>
      apiClient.get<VendorPage>(`/vendors${query ? `?${query}` : ''}`, signal),
    enabled,
  });
}
export function useVendorAnalytics() {
  return useQuery({
    queryKey: [...vendorKeys.all, 'analytics'],
    queryFn: ({ signal }) => apiClient.get<VendorAnalytics>('/vendors/analytics', signal),
  });
}
export function useVendorLookups() {
  return useQuery({
    queryKey: [...vendorKeys.all, 'lookups'],
    queryFn: ({ signal }) =>
      apiClient.get<{ users: Array<{ id: string; fullName: string }> }>('/vendors/lookups', signal),
  });
}
export function useVendor(id?: string) {
  return useQuery({
    queryKey: vendorKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Vendor>(`/vendors/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useVendorDuplicates(input: {
  name?: string;
  city?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  panNumber?: string;
  excludeVendorId?: string;
}) {
  const query = new URLSearchParams(
    Object.entries(input).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
  ).toString();
  return useQuery({
    queryKey: [...vendorKeys.all, 'duplicates', query],
    queryFn: ({ signal }) =>
      apiClient.get<VendorDuplicate[]>(`/vendors/duplicates?${query}`, signal),
    enabled: Boolean(
      input.phone ||
      input.email ||
      input.gstNumber ||
      input.panNumber ||
      (input.name && input.name.length > 2),
    ),
    staleTime: 10_000,
  });
}
export function useCreateVendor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorInput) => apiClient.post<Vendor>('/vendors', input),
    onSuccess: () => refresh(client),
  });
}
export function useUpdateVendor(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorUpdateInput) => apiClient.patch<Vendor>(`/vendors/${id}`, input),
    onSuccess: () => refresh(client, id),
  });
}
export function useVendorAction(id: string) {
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
        ? apiClient.delete(`/vendors/${id}/${path}`)
        : method === 'patch'
          ? apiClient.patch(`/vendors/${id}/${path}`, body)
          : apiClient.post(`/vendors/${id}/${path}`, body),
    onSuccess: () => refresh(client, id),
  });
}
export function useVendorServices(id: string) {
  return useQuery({
    queryKey: [...vendorKeys.one(id), 'services'],
    queryFn: ({ signal }) => apiClient.get<VendorService[]>(`/vendors/${id}/services`, signal),
    enabled: Boolean(id),
  });
}
export function useVendorResource(
  id: string,
  resource:
    | 'contacts'
    | 'payables'
    | 'payments'
    | 'documents'
    | 'notes'
    | 'bookings'
    | 'booking-services'
    | 'costs'
    | 'bank-accounts',
  enabled = true,
) {
  return useQuery({
    queryKey: [...vendorKeys.one(id), resource],
    queryFn: ({ signal }) =>
      apiClient.get<Array<Record<string, unknown>>>(`/vendors/${id}/${resource}`, signal),
    enabled: Boolean(id) && enabled,
  });
}
export function useVendorTimeline(id: string) {
  return useQuery({
    queryKey: [...vendorKeys.one(id), 'timeline'],
    queryFn: ({ signal }) =>
      apiClient.get<{ data: Array<Record<string, unknown>>; pagination: VendorPage['pagination'] }>(
        `/vendors/${id}/timeline`,
        signal,
      ),
    enabled: Boolean(id),
  });
}
export async function approveVendorDocument(
  id: string,
  input: { documentType: string; fileName: string; mimeType: string; fileSize: number },
) {
  return apiClient.post<{ document: { id: string }; uploadUrl: string; expiresInSeconds: number }>(
    `/vendors/${id}/documents/uploads`,
    input,
  );
}
export async function confirmVendorDocument(id: string, documentId: string) {
  return apiClient.post(`/vendors/${id}/documents/uploads/${documentId}/confirm`);
}
export function useVendorService(id: string, serviceId?: string) {
  return useQuery({
    queryKey: [...vendorKeys.one(id), 'services', serviceId],
    queryFn: ({ signal }) =>
      apiClient.get<VendorService>(`/vendors/${id}/services/${serviceId}`, signal),
    enabled: Boolean(id && serviceId),
  });
}
export function useCreateVendorService(id: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorServiceInput, options?: Parameters<typeof action.mutate>[1]) =>
      action.mutate({ path: 'services', body: input }, options),
  };
}
export function useUpdateVendorService(id: string, serviceId: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: Partial<VendorServiceInput>, options?: Parameters<typeof action.mutate>[1]) =>
      action.mutate({ path: `services/${serviceId}`, method: 'patch', body: input }, options),
  };
}
export function useCreateVendorRate(id: string, serviceId: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorRateInput, options?: Parameters<typeof action.mutate>[1]) =>
      action.mutate({ path: `services/${serviceId}/rates`, body: input }, options),
  };
}
export function useCreateVendorContact(id: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorContactInput) => action.mutate({ path: 'contacts', body: input }),
  };
}
export function useCreateVendorNote(id: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorNoteInput) => action.mutate({ path: 'notes', body: input }),
  };
}
export function useCreateVendorPayable(id: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorPayableInput) => action.mutate({ path: 'payables', body: input }),
  };
}
export function useCreateVendorPayment(id: string) {
  const action = useVendorAction(id);
  return {
    ...action,
    mutate: (input: VendorPaymentInput) => action.mutate({ path: 'payments', body: input }),
  };
}
