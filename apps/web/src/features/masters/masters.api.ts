import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CityInput,
  CityUpdateInput,
  CountryReference,
  DestinationImageUploadInput,
  DestinationInput,
  DestinationUpdateInput,
} from '@interscale/shared';
import { apiClient } from '@/api/client';

export interface City {
  id: string;
  countryCode: string;
  countryName: string;
  name: string;
  airportCode: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  _count: { destinationLinks: number };
}

export interface DestinationCityLink {
  id: string;
  cityId: string;
  sequence: number;
  city: City;
}

export interface Destination {
  id: string;
  countryCode: string;
  countryName: string;
  name: string;
  destinationType: string;
  status: string;
  inclusions: string | null;
  exclusions: string | null;
  paymentPolicies: string | null;
  cancellationPolicies: string | null;
  bookingTerms: string | null;
  imageStorageProvider: string | null;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageFileSize: number | null;
  imageConfirmedAt: string | null;
  hasImage: boolean;
  cities: DestinationCityLink[];
  _count: { cities: number };
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
}

export interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface MasterLookups {
  countries: CountryReference[];
  cities: Array<{ id: string; name: string; airportCode: string | null; countryCode: string }>;
}

const keys = {
  cities: ['masters', 'cities'] as const,
  city: (id: string) => ['masters', 'cities', id] as const,
  destinations: ['masters', 'destinations'] as const,
  destination: (id: string) => ['masters', 'destinations', id] as const,
};
const invalidate = (
  client: ReturnType<typeof useQueryClient>,
  kind: 'cities' | 'destinations',
  id?: string,
) => {
  void client.invalidateQueries({ queryKey: keys[kind] });
  if (id)
    void client.invalidateQueries({
      queryKey: kind === 'cities' ? keys.city(id) : keys.destination(id),
    });
};

export function useCities(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...keys.cities, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<City>>(`/masters/cities${query ? `?${query}` : ''}`, signal),
  });
}
export function useCity(id?: string) {
  return useQuery({
    queryKey: keys.city(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<City>(`/masters/cities/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useMasterLookups(country?: string, search?: string) {
  const params = new URLSearchParams();
  if (country) params.set('country', country);
  if (search) params.set('search', search);
  const query = params.toString();
  return useQuery({
    queryKey: ['masters', 'lookups', query],
    queryFn: ({ signal }) =>
      apiClient.get<MasterLookups>(`/masters/cities/lookups${query ? `?${query}` : ''}`, signal),
  });
}
export function useCreateCity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CityInput) => apiClient.post<City>('/masters/cities', input),
    onSuccess: () => invalidate(client, 'cities'),
  });
}
export function useUpdateCity(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CityUpdateInput) => apiClient.patch<City>(`/masters/cities/${id}`, input),
    onSuccess: () => invalidate(client, 'cities', id),
  });
}
export function useArchiveCity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<City>(`/masters/cities/${id}`),
    onSuccess: (_, id) => invalidate(client, 'cities', id),
  });
}

export function useDestinations(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...keys.destinations, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Destination>>(`/masters/destinations${query ? `?${query}` : ''}`, signal),
  });
}
export function useDestination(id?: string) {
  return useQuery({
    queryKey: keys.destination(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Destination>(`/masters/destinations/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useCreateDestination() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DestinationInput) =>
      apiClient.post<Destination>('/masters/destinations', input),
    onSuccess: () => invalidate(client, 'destinations'),
  });
}
export function useUpdateDestination(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DestinationUpdateInput) =>
      apiClient.patch<Destination>(`/masters/destinations/${id}`, input),
    onSuccess: () => invalidate(client, 'destinations', id),
  });
}
export function useArchiveDestination() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Destination>(`/masters/destinations/${id}`),
    onSuccess: (_, id) => invalidate(client, 'destinations', id),
  });
}

export async function approveDestinationImage(id: string, input: DestinationImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/destinations/${id}/image/upload`,
    input,
  );
}
export async function confirmDestinationImage(id: string) {
  return apiClient.post<Destination>(`/masters/destinations/${id}/image/confirm`);
}
export async function destinationImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/destinations/${id}/image/download-url`,
  );
}
export async function deleteDestinationImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/destinations/${id}/image`);
}
