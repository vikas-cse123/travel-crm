import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ManagedRole,
  ManagedTemplate,
  PageResult,
  PermissionGroup,
  RoleInput,
  RoleUpdate,
  TemplateInput,
  TemplateUpdate,
} from '@interscale/shared';
import { apiClient } from '@/api/client';
export const adminKeys = {
  roles: ['roles'] as const,
  role: (id: string) => ['roles', id] as const,
  templates: ['permission-templates'] as const,
  template: (id: string) => ['permission-templates', id] as const,
  permissions: ['permissions'] as const,
  activity: ['activity-logs'] as const,
};
export const usePermissions = () =>
  useQuery({
    queryKey: adminKeys.permissions,
    queryFn: ({ signal }) => apiClient.get<PermissionGroup[]>('/permissions', signal),
  });
export const useRoles = (p: URLSearchParams) =>
  useQuery({
    queryKey: [...adminKeys.roles, p.toString()],
    queryFn: ({ signal }) => apiClient.get<PageResult<ManagedRole>>(`/roles?${p}`, signal),
  });
export const useRole = (id?: string) =>
  useQuery({
    queryKey: adminKeys.role(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<ManagedRole>(`/roles/${id}`, signal),
    enabled: Boolean(id),
  });
export function useSaveRole(id?: string) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: (v: RoleInput | RoleUpdate) =>
      id
        ? apiClient.patch<ManagedRole>(`/roles/${id}`, v)
        : apiClient.post<ManagedRole>('/roles', v),
    onSuccess: () => q.invalidateQueries({ queryKey: adminKeys.roles }),
  });
}
export function useDeleteRole() {
  const q = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/roles/${id}`),
    onSuccess: () => q.invalidateQueries({ queryKey: adminKeys.roles }),
  });
}
export const useTemplates = (p: URLSearchParams) =>
  useQuery({
    queryKey: [...adminKeys.templates, p.toString()],
    queryFn: ({ signal }) =>
      apiClient.get<PageResult<ManagedTemplate>>(`/permission-templates?${p}`, signal),
  });
export const useTemplate = (id?: string) =>
  useQuery({
    queryKey: adminKeys.template(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<ManagedTemplate>(`/permission-templates/${id}`, signal),
    enabled: Boolean(id),
  });
export function useSaveTemplate(id?: string) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: (v: TemplateInput | TemplateUpdate) =>
      id
        ? apiClient.patch<ManagedTemplate>(`/permission-templates/${id}`, v)
        : apiClient.post<ManagedTemplate>('/permission-templates', v),
    onSuccess: () => q.invalidateQueries({ queryKey: adminKeys.templates }),
  });
}
export function useTemplateAction() {
  const q = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'duplicate' | 'ACTIVE' | 'INACTIVE' | 'delete';
    }) =>
      action === 'duplicate'
        ? apiClient.post<ManagedTemplate>(`/permission-templates/${id}/duplicate`)
        : action === 'delete'
          ? apiClient.delete(`/permission-templates/${id}`)
          : apiClient.patch<ManagedTemplate>(`/permission-templates/${id}/status`, {
              status: action,
            }),
    onSuccess: () => q.invalidateQueries({ queryKey: adminKeys.templates }),
  });
}
export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorUser: { id: string; fullName: string; username: string } | null;
  targetUser: { id: string; fullName: string; username: string } | null;
}
export const useActivityLogs = (p: URLSearchParams) =>
  useQuery({
    queryKey: [...adminKeys.activity, p.toString()],
    queryFn: ({ signal }) =>
      apiClient.get<PageResult<ActivityEntry>>(`/activity-logs?${p}`, signal),
  });
