import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { FollowUp, Page, UserOption } from '@/features/queries/queries.api';

export interface FollowUpRow extends FollowUp {
  queryId: string;
  query: {
    id: string;
    queryNumber: string;
    customerName: string;
    phone: string;
    leadStage: string;
    leadType: string;
    priority: string;
    lastContactedAt: string | null;
    itinerary: Array<{ destination: string }>;
  };
}

export interface FollowUpPage extends Page<FollowUpRow> {
  timezone: string;
}

export interface FollowUpAnalytics {
  timezone: string;
  dueToday: number;
  overdue: number;
  upcoming: number;
  completedToday: number;
  completedThisWeek: number;
  cancelled: number;
  missed: number;
  averageCompletionDelayMinutes: number;
  completionRate: number;
  byOutcome: Record<string, number>;
  bySalesperson: Array<{
    user: UserOption | undefined;
    total: number;
    dueToday: number;
    overdue: number;
    completedToday: number;
    completionRate: number;
  }>;
  leadsWithNoUpcomingFollowUp: number;
  hotLeadsWithOverdueFollowUps: number;
}

const keys = {
  all: ['follow-ups'] as const,
  list: (query: string) => ['follow-ups', 'list', query] as const,
  analytics: ['follow-ups', 'analytics'] as const,
};

export function useFollowUpList(params: URLSearchParams) {
  const query = params.toString();
  return useQuery({
    queryKey: keys.list(query),
    queryFn: ({ signal }) =>
      apiClient.get<FollowUpPage>(`/follow-ups${query ? `?${query}` : ''}`, signal),
  });
}

export function useFollowUpAnalytics() {
  return useQuery({
    queryKey: keys.analytics,
    queryFn: ({ signal }) => apiClient.get<FollowUpAnalytics>('/follow-ups/analytics', signal),
  });
}

export function useDedicatedFollowUpAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action?: 'complete' | 'cancel' | 'delete';
      body?: unknown;
    }) =>
      action === 'delete'
        ? apiClient.delete(`/follow-ups/${id}`)
        : apiClient.patch(`/follow-ups/${id}${action ? `/${action}` : ''}`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.all });
      void client.invalidateQueries({ queryKey: ['queries'] });
    },
  });
}
