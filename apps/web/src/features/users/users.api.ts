import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
  UserListResult,
  UserLookups,
} from '@interscale/shared';
import { apiClient } from '@/api/client';

export const userKeys = {
  all: ['users'] as const,
  list: (q: string) => ['users', 'list', q] as const,
  detail: (id: string) => ['users', id] as const,
  activity: (id: string) => ['users', id, 'activity'] as const,
  lookups: ['users', 'lookups'] as const,
};
export function useUsers(params: URLSearchParams) {
  const q = params.toString();
  return useQuery({
    queryKey: userKeys.list(q),
    queryFn: ({ signal }) => apiClient.get<UserListResult>(`/users${q ? `?${q}` : ''}`, signal),
  });
}
export function useUser(id?: string) {
  return useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: ({ signal }) =>
      apiClient.get<
        ManagedUser & { recentActivity: Array<{ id: string; action: string; createdAt: string }> }
      >(`/users/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useUserLookups() {
  return useQuery({
    queryKey: userKeys.lookups,
    queryFn: ({ signal }) => apiClient.get<UserLookups>('/users/lookups', signal),
  });
}
export function useUserActivity(id?: string) {
  return useQuery({
    queryKey: userKeys.activity(id ?? ''),
    queryFn: ({ signal }) =>
      apiClient.get<{
        data: Array<{
          id: string;
          action: string;
          createdAt: string;
          actorUser: { fullName: string } | null;
        }>;
      }>(`/users/${id}/activity?pageSize=10`, signal),
    enabled: Boolean(id),
  });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateUserInput) => apiClient.post<ManagedUser>('/users', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}
export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UpdateUserInput) => apiClient.patch<ManagedUser>(`/users/${id}`, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      void qc.invalidateQueries({ queryKey: userKeys.detail(id) });
    },
  });
}
export function useUserAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVE' | 'RESET';
    }) =>
      action === 'ARCHIVE'
        ? apiClient.delete(`/users/${id}`)
        : action === 'RESET'
          ? apiClient.post(`/users/${id}/send-password-reset`)
          : apiClient.patch(`/users/${id}/status`, { status: action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}
