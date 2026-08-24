import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface DestinationExpertPreset {
  id: string;
  destination: string;
  heading: string | null;
  customIntroduction: string | null;
  whatsappNumber: string | null;
  callNumber: string | null;
  email: string | null;
  showWhatsapp: boolean;
  showCall: boolean;
  showEmail: boolean;
  showExperience: boolean;
  showTripsPlanned: boolean;
  showLanguages: boolean;
  jobTitle: string | null;
  bio: string | null;
  specialization: string | null;
  yearsOfExperience: number | null;
  tripsPlanned: number | null;
  languages: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  profileImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DestinationExpertPresetInput = Omit<DestinationExpertPreset, 'id' | 'createdAt' | 'updatedAt'>;

const key = ['destination-expert-presets'] as const;

export function useDestinationExpertPresets() {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiClient.get<DestinationExpertPreset[]>('/destination-expert-presets', signal),
  });
}

export function useDestinationExpertPreset(id?: string) {
  return useQuery({
    queryKey: [...key, id] as const,
    queryFn: ({ signal }) => apiClient.get<DestinationExpertPreset>(`/destination-expert-presets/${id}`, signal),
    enabled: Boolean(id),
  });
}

export function useCreateDestinationExpertPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DestinationExpertPresetInput) =>
      apiClient.post<DestinationExpertPreset>('/destination-expert-presets', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateDestinationExpertPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<DestinationExpertPresetInput>) =>
      apiClient.patch<DestinationExpertPreset>(`/destination-expert-presets/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteDestinationExpertPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/destination-expert-presets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
