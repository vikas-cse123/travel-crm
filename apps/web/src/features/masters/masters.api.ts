import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AirlineInput,
  AirlineLogoUploadInput,
  AirlineUpdateInput,
  CruiseImageUploadInput,
  CruiseInput,
  CruiseUpdateInput,
  VehicleImageUploadInput,
  VehicleInput,
  VehicleUpdateInput,
  SightseeingImageUploadInput,
  SightseeingInput,
  SightseeingUpdateInput,
  AddOnServiceInput,
  AddOnServiceUpdateInput,
  VisaTypeInput,
  VisaTypeUpdateInput,
  TestimonialInput,
  TestimonialUpdateInput,
  TestimonialImageUploadInput,
  CityInput,
  CityUpdateInput,
  CountryReference,
  DestinationImageUploadInput,
  DestinationInput,
  DestinationUpdateInput,
  HotelImageUploadInput,
  HotelInput,
  HotelMealPlanInput,
  HotelMealPlanUpdateInput,
  HotelRoomTypeInput,
  HotelRoomTypeUpdateInput,
  HotelUpdateInput,
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

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export interface HotelRoomType {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  maxAdults: number | null;
  maxChildren: number | null;
  maxOccupancy: number | null;
  bedType: string | null;
  numberOfBeds: number | null;
  roomSize: string | null;
  viewType: string | null;
  baseCost?: number | null;
  sellingPrice?: number | null;
  currency: string;
  taxPercentage?: number | null;
  internalNotes: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HotelMealPlan {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  type: string;
  description: string | null;
  baseCost?: number | null;
  sellingPrice?: number | null;
  currency: string;
  internalNotes: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HotelSummary {
  id: string;
  name: string;
  starCategory: number | null;
  starRating: number | null;
  status: string;
  isDefaultForCity: boolean;
  isFeatured: boolean;
  hasImage: boolean;
  updatedAt: string;
  createdAt: string;
  destination: { id: string; name: string };
  city: { id: string; name: string };
  _count?: { roomTypes: number; mealPlans: number };
}

export interface Hotel extends Omit<HotelSummary, 'destination' | 'city'> {
  destinationId: string;
  cityId: string;
  propertyType: string | null;
  address: string | null;
  landmark: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  reviewLink: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  description: string | null;
  amenities: string | null;
  internalNotes: string | null;
  externalCode: string | null;
  sortOrder: number;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageFileSize: number | null;
  imageConfirmedAt: string | null;
  destination: { id: string; name: string; countryCode?: string; countryName?: string };
  city: { id: string; name: string; airportCode?: string | null };
  createdBy: { id: string; fullName: string };
  roomTypes: HotelRoomType[];
  mealPlans: HotelMealPlan[];
}

const hotelKeys = {
  all: ['masters', 'hotels'] as const,
  one: (id: string) => ['masters', 'hotels', id] as const,
};

export function useHotels(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...hotelKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<HotelSummary>>(`/masters/hotels${query ? `?${query}` : ''}`, signal),
  });
}
export function useHotel(id?: string) {
  return useQuery({
    queryKey: hotelKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Hotel>(`/masters/hotels/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateHotel = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: hotelKeys.all });
  if (id) void client.invalidateQueries({ queryKey: hotelKeys.one(id) });
};
export function useCreateHotel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HotelInput) => apiClient.post<Hotel>('/masters/hotels', input),
    onSuccess: () => invalidateHotel(client),
  });
}
export function useUpdateHotel(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HotelUpdateInput) => apiClient.patch<Hotel>(`/masters/hotels/${id}`, input),
    onSuccess: () => invalidateHotel(client, id),
  });
}
export function useArchiveHotel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Hotel>(`/masters/hotels/${id}`),
    onSuccess: (_, id) => invalidateHotel(client, id),
  });
}
export function useCreateRoomType(hotelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HotelRoomTypeInput) =>
      apiClient.post<Hotel>(`/masters/hotels/${hotelId}/room-types`, input),
    onSuccess: () => invalidateHotel(client, hotelId),
  });
}
export function useUpdateRoomType(hotelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HotelRoomTypeUpdateInput }) =>
      apiClient.patch<Hotel>(`/masters/hotels/${hotelId}/room-types/${id}`, input),
    onSuccess: () => invalidateHotel(client, hotelId),
  });
}
export function useCreateMealPlan(hotelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HotelMealPlanInput) =>
      apiClient.post<Hotel>(`/masters/hotels/${hotelId}/meal-plans`, input),
    onSuccess: () => invalidateHotel(client, hotelId),
  });
}
export function useUpdateMealPlan(hotelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HotelMealPlanUpdateInput }) =>
      apiClient.patch<Hotel>(`/masters/hotels/${hotelId}/meal-plans/${id}`, input),
    onSuccess: () => invalidateHotel(client, hotelId),
  });
}
export async function approveHotelImage(id: string, input: HotelImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/hotels/${id}/image/upload`,
    input,
  );
}
export async function confirmHotelImage(id: string) {
  return apiClient.post<Hotel>(`/masters/hotels/${id}/image/confirm`);
}
export async function hotelImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/hotels/${id}/image/download-url`,
  );
}
export async function deleteHotelImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/hotels/${id}/image`);
}

// ---------------------------------------------------------------------------
// Airlines
// ---------------------------------------------------------------------------

export interface Airline {
  id: string;
  name: string;
  iataCode: string | null;
  icaoCode: string | null;
  countryCode: string | null;
  countryName: string | null;
  website: string | null;
  internalNotes: string | null;
  status: string;
  hasLogo: boolean;
  logoFileName: string | null;
  logoMimeType: string | null;
  logoConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
}

const airlineKeys = {
  all: ['masters', 'airlines'] as const,
  one: (id: string) => ['masters', 'airlines', id] as const,
};

export function useAirlines(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...airlineKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Airline>>(`/masters/airlines${query ? `?${query}` : ''}`, signal),
  });
}
export function useAirline(id?: string) {
  return useQuery({
    queryKey: airlineKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Airline>(`/masters/airlines/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateAirline = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: airlineKeys.all });
  if (id) void client.invalidateQueries({ queryKey: airlineKeys.one(id) });
};
export function useCreateAirline() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AirlineInput) => apiClient.post<Airline>('/masters/airlines', input),
    onSuccess: () => invalidateAirline(client),
  });
}
export function useUpdateAirline(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AirlineUpdateInput) =>
      apiClient.patch<Airline>(`/masters/airlines/${id}`, input),
    onSuccess: () => invalidateAirline(client, id),
  });
}
export function useArchiveAirline() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Airline>(`/masters/airlines/${id}`),
    onSuccess: (_, id) => invalidateAirline(client, id),
  });
}
export async function approveAirlineLogo(id: string, input: AirlineLogoUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/airlines/${id}/logo/upload`,
    input,
  );
}
export async function confirmAirlineLogo(id: string) {
  return apiClient.post<Airline>(`/masters/airlines/${id}/logo/confirm`);
}
export async function airlineLogoUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/airlines/${id}/logo/download-url`,
  );
}
export async function deleteAirlineLogo(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/airlines/${id}/logo`);
}

// ---------------------------------------------------------------------------
// Cruises
// ---------------------------------------------------------------------------

export interface CruiseRoomType {
  id: string;
  name: string;
  description: string | null;
  /** Absent when the viewer lacks the costing permission. */
  price?: number | null;
  currency?: string;
  status: string;
  sortOrder: number;
}

export interface Cruise {
  id: string;
  name: string;
  description: string | null;
  status: string;
  hasImage: boolean;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
  roomTypes?: CruiseRoomType[];
  /** List responses only. */
  roomTypeCount?: number;
  activeRoomTypeCount?: number;
  priceRange?: { min: number; max: number } | null;
}

const cruiseKeys = {
  all: ['masters', 'cruises'] as const,
  one: (id: string) => ['masters', 'cruises', id] as const,
};

export function useCruises(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...cruiseKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Cruise>>(`/masters/cruises${query ? `?${query}` : ''}`, signal),
  });
}
export function useCruise(id?: string) {
  return useQuery({
    queryKey: cruiseKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Cruise>(`/masters/cruises/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateCruise = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: cruiseKeys.all });
  if (id) void client.invalidateQueries({ queryKey: cruiseKeys.one(id) });
};
export function useCreateCruise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CruiseInput) => apiClient.post<Cruise>('/masters/cruises', input),
    onSuccess: () => invalidateCruise(client),
  });
}
export function useUpdateCruise(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CruiseUpdateInput) =>
      apiClient.patch<Cruise>(`/masters/cruises/${id}`, input),
    onSuccess: () => invalidateCruise(client, id),
  });
}
export function useArchiveCruise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Cruise>(`/masters/cruises/${id}`),
    onSuccess: (_, id) => invalidateCruise(client, id),
  });
}
export function useRestoreCruise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Cruise>(`/masters/cruises/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: (_, id) => invalidateCruise(client, id),
  });
}
export async function approveCruiseImage(id: string, input: CruiseImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/cruises/${id}/image/upload`,
    input,
  );
}
export async function confirmCruiseImage(id: string) {
  return apiClient.post<Cruise>(`/masters/cruises/${id}/image/confirm`);
}
export async function cruiseImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/cruises/${id}/image/download-url`,
  );
}
export async function deleteCruiseImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/cruises/${id}/image`);
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  name: string;
  vehicleType: string;
  capacity: number | null;
  description: string | null;
  status: string;
  hasImage: boolean;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
}

const vehicleKeys = {
  all: ['masters', 'vehicles'] as const,
  one: (id: string) => ['masters', 'vehicles', id] as const,
  types: ['masters', 'vehicles', 'types'] as const,
};

export function useVehicles(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...vehicleKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Vehicle>>(`/masters/vehicles${query ? `?${query}` : ''}`, signal),
  });
}
/** Distinct types already in use, powering the list's type dropdown. */
export function useVehicleTypes() {
  return useQuery({
    queryKey: vehicleKeys.types,
    queryFn: ({ signal }) =>
      apiClient.get<{ vehicleTypes: string[] }>('/masters/vehicles/types', signal),
  });
}
export function useVehicle(id?: string) {
  return useQuery({
    queryKey: vehicleKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Vehicle>(`/masters/vehicles/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateVehicle = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: vehicleKeys.all });
  if (id) void client.invalidateQueries({ queryKey: vehicleKeys.one(id) });
};
export function useCreateVehicle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput) => apiClient.post<Vehicle>('/masters/vehicles', input),
    onSuccess: () => invalidateVehicle(client),
  });
}
export function useUpdateVehicle(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleUpdateInput) =>
      apiClient.patch<Vehicle>(`/masters/vehicles/${id}`, input),
    onSuccess: () => invalidateVehicle(client, id),
  });
}
export function useArchiveVehicle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Vehicle>(`/masters/vehicles/${id}`),
    onSuccess: (_, id) => invalidateVehicle(client, id),
  });
}
export function useRestoreVehicle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Vehicle>(`/masters/vehicles/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: (_, id) => invalidateVehicle(client, id),
  });
}
export async function approveVehicleImage(id: string, input: VehicleImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/vehicles/${id}/image/upload`,
    input,
  );
}
export async function confirmVehicleImage(id: string) {
  return apiClient.post<Vehicle>(`/masters/vehicles/${id}/image/confirm`);
}
export async function vehicleImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/vehicles/${id}/image/download-url`,
  );
}
export async function deleteVehicleImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/vehicles/${id}/image`);
}

// ---------------------------------------------------------------------------
// Sightseeing
// ---------------------------------------------------------------------------

export interface Sightseeing {
  id: string;
  title: string;
  sequence: number;
  estimatedHours: number | null;
  suggestedStartTime: string | null;
  description: string | null;
  remarks: string | null;
  status: string;
  hasImage: boolean;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  destination: { id: string; name: string; countryCode?: string; countryName?: string };
  city: { id: string; name: string; airportCode?: string | null };
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
}

export interface SightseeingSummary {
  totalAttractions: number;
  destinations: number;
  citiesCovered: number;
  withImages: number;
}

const sightseeingKeys = {
  all: ['masters', 'sightseeing'] as const,
  one: (id: string) => ['masters', 'sightseeing', id] as const,
  summary: ['masters', 'sightseeing', 'summary'] as const,
};

export function useSightseeingList(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...sightseeingKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Sightseeing>>(`/masters/sightseeing${query ? `?${query}` : ''}`, signal),
  });
}
/** Counts for the reference's Summary Statistics strip. */
export function useSightseeingSummary() {
  return useQuery({
    queryKey: sightseeingKeys.summary,
    queryFn: ({ signal }) =>
      apiClient.get<SightseeingSummary>('/masters/sightseeing/summary', signal),
  });
}
export function useSightseeing(id?: string) {
  return useQuery({
    queryKey: sightseeingKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Sightseeing>(`/masters/sightseeing/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateSightseeing = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: sightseeingKeys.all });
  if (id) void client.invalidateQueries({ queryKey: sightseeingKeys.one(id) });
};
export function useCreateSightseeing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SightseeingInput) =>
      apiClient.post<Sightseeing>('/masters/sightseeing', input),
    onSuccess: () => invalidateSightseeing(client),
  });
}
export function useUpdateSightseeing(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SightseeingUpdateInput) =>
      apiClient.patch<Sightseeing>(`/masters/sightseeing/${id}`, input),
    onSuccess: () => invalidateSightseeing(client, id),
  });
}
export function useArchiveSightseeing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Sightseeing>(`/masters/sightseeing/${id}`),
    onSuccess: (_, id) => invalidateSightseeing(client, id),
  });
}
export function useRestoreSightseeing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Sightseeing>(`/masters/sightseeing/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: (_, id) => invalidateSightseeing(client, id),
  });
}
/** Move a row up or down within its city group. */
export function useReorderSightseeing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'UP' | 'DOWN' }) =>
      apiClient.patch<Sightseeing>(`/masters/sightseeing/${id}/reorder`, { direction }),
    onSuccess: (_, variables) => invalidateSightseeing(client, variables.id),
  });
}
export async function approveSightseeingImage(id: string, input: SightseeingImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/sightseeing/${id}/image/upload`,
    input,
  );
}
export async function confirmSightseeingImage(id: string) {
  return apiClient.post<Sightseeing>(`/masters/sightseeing/${id}/image/confirm`);
}
export async function sightseeingImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/sightseeing/${id}/image/download-url`,
  );
}
export async function deleteSightseeingImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/sightseeing/${id}/image`);
}

// ---------------------------------------------------------------------------
// Add-On Services
// ---------------------------------------------------------------------------

export interface AddOnService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
}

const addOnServiceKeys = {
  all: ['masters', 'add-on-services'] as const,
  one: (id: string) => ['masters', 'add-on-services', id] as const,
};

export function useAddOnServices(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...addOnServiceKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<AddOnService>>(
        `/masters/add-on-services${query ? `?${query}` : ''}`,
        signal,
      ),
  });
}
export function useAddOnService(id?: string) {
  return useQuery({
    queryKey: addOnServiceKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<AddOnService>(`/masters/add-on-services/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateAddOnService = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: addOnServiceKeys.all });
  if (id) void client.invalidateQueries({ queryKey: addOnServiceKeys.one(id) });
};
export function useCreateAddOnService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddOnServiceInput) =>
      apiClient.post<AddOnService>('/masters/add-on-services', input),
    onSuccess: () => invalidateAddOnService(client),
  });
}
export function useUpdateAddOnService(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddOnServiceUpdateInput) =>
      apiClient.patch<AddOnService>(`/masters/add-on-services/${id}`, input),
    onSuccess: () => invalidateAddOnService(client, id),
  });
}
export function useArchiveAddOnService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<AddOnService>(`/masters/add-on-services/${id}`),
    onSuccess: (_, id) => invalidateAddOnService(client, id),
  });
}
export function useRestoreAddOnService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<AddOnService>(`/masters/add-on-services/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: (_, id) => invalidateAddOnService(client, id),
  });
}

// ---------------------------------------------------------------------------
// Visa Types
// ---------------------------------------------------------------------------

export interface VisaTypeSection {
  id: string;
  visaTypeId: string;
  title: string;
  content: string;
  sequence: number;
}
export interface VisaType {
  id: string;
  destinationId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  destination: { id: string; name: string; countryCode?: string; countryName?: string };
  sections: VisaTypeSection[];
  _count: { sections: number };
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
}

const visaTypeKeys = {
  all: ['masters', 'visa-types'] as const,
  one: (id: string) => ['masters', 'visa-types', id] as const,
};
export function useVisaTypes(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...visaTypeKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<VisaType>>(`/masters/visa-types${query ? `?${query}` : ''}`, signal),
  });
}
export function useVisaType(id?: string) {
  return useQuery({
    queryKey: visaTypeKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<VisaType>(`/masters/visa-types/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateVisaType = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: visaTypeKeys.all });
  if (id) void client.invalidateQueries({ queryKey: visaTypeKeys.one(id) });
};
export function useCreateVisaType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VisaTypeInput) => apiClient.post<VisaType>('/masters/visa-types', input),
    onSuccess: () => invalidateVisaType(client),
  });
}
export function useUpdateVisaType(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VisaTypeUpdateInput) =>
      apiClient.patch<VisaType>(`/masters/visa-types/${id}`, input),
    onSuccess: () => invalidateVisaType(client, id),
  });
}
export function useArchiveVisaType() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<VisaType>(`/masters/visa-types/${id}`),
    onSuccess: (_, id) => invalidateVisaType(client, id),
  });
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export interface Testimonial {
  id: string;
  clientName: string | null;
  destinationName: string;
  description: string;
  isVisible: boolean;
  status: string;
  hasImage: boolean;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
  updatedBy?: { id: string; fullName: string } | null;
}

const testimonialKeys = {
  all: ['masters', 'testimonials'] as const,
  one: (id: string) => ['masters', 'testimonials', id] as const,
};
export function useTestimonials(params = new URLSearchParams()) {
  const query = params.toString();
  return useQuery({
    queryKey: [...testimonialKeys.all, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Testimonial>>(`/masters/testimonials${query ? `?${query}` : ''}`, signal),
  });
}
export function useTestimonial(id?: string) {
  return useQuery({
    queryKey: testimonialKeys.one(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Testimonial>(`/masters/testimonials/${id}`, signal),
    enabled: Boolean(id),
  });
}
const invalidateTestimonial = (client: ReturnType<typeof useQueryClient>, id?: string) => {
  void client.invalidateQueries({ queryKey: testimonialKeys.all });
  if (id) void client.invalidateQueries({ queryKey: testimonialKeys.one(id) });
};
export function useCreateTestimonial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TestimonialInput) =>
      apiClient.post<Testimonial>('/masters/testimonials', input),
    onSuccess: () => invalidateTestimonial(client),
  });
}
export function useUpdateTestimonial(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TestimonialUpdateInput) =>
      apiClient.patch<Testimonial>(`/masters/testimonials/${id}`, input),
    onSuccess: () => invalidateTestimonial(client, id),
  });
}
export function useArchiveTestimonial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Testimonial>(`/masters/testimonials/${id}`),
    onSuccess: (_, id) => invalidateTestimonial(client, id),
  });
}
export async function approveTestimonialImage(id: string, input: TestimonialImageUploadInput) {
  return apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
    `/masters/testimonials/${id}/image/upload`,
    input,
  );
}
export async function confirmTestimonialImage(id: string) {
  return apiClient.post<Testimonial>(`/masters/testimonials/${id}/image/confirm`);
}
export async function testimonialImageUrl(id: string) {
  return apiClient.get<{ url: string; expiresInSeconds: number }>(
    `/masters/testimonials/${id}/image/download-url`,
  );
}
export async function deleteTestimonialImage(id: string) {
  return apiClient.delete<{ deleted: true }>(`/masters/testimonials/${id}/image`);
}
