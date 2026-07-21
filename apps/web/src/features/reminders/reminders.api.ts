import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferenceInput, ReminderInput } from '@interscale/shared';
import { apiClient } from '@/api/client';

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  originalDueAt: string | null;
  snoozedUntil: string | null;
  status: 'ACTIVE' | 'OVERDUE' | 'SNOOZED' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  reminderType: string;
  source: string;
  assignedTo: { id: string; fullName: string; email: string };
  createdBy: { id: string; fullName: string; email: string };
  linkedEntity: { type: string; id: string; label: string; href: string } | null;
  reminderRule: { id: string; name: string } | null;
  completionOutcome: string | null;
  completionNotes: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  queryId: string | null;
  customerId: string | null;
  quotationId: string | null;
  bookingId: string | null;
  vendorId: string | null;
}
export interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface ReminderAnalytics {
  total: number;
  active: number;
  overdue: number;
  completed: number;
  snoozed: number;
  cancelled: number;
  pending?: number;
  sent?: number;
}
export interface ReminderLookups {
  users: Array<{ id: string; fullName: string }>;
  queries: Array<{ id: string; queryNumber: string; customerName: string }>;
  customers: Array<{ id: string; customerNumber: string; displayName: string }>;
  quotations: Array<{ id: string; quotationNumber: string; customerName: string }>;
  bookings: Array<{ id: string; bookingNumber: string; customerName: string }>;
  vendors: Array<{ id: string; vendorCode: string; name: string }>;
}
export interface Notification {
  id: string;
  category: string;
  severity: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  title: string;
  message: string;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
}
export interface ReminderRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  isEnabled: boolean;
  leadStage: string | null;
  reminderType: string;
  reminderPriority: string;
  delayValue: number;
  delayUnit: string;
  dueTime: string;
  assignToMode: string;
  titleTemplate: string;
  channels: string[];
  escalationEnabled: boolean;
  _count: { reminders: number; executions: number };
}

const keys = {
  all: ['reminders'] as const,
  notifications: ['notifications'] as const,
  rules: ['reminder-rules'] as const,
};
const invalidate = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: keys.all });
  void client.invalidateQueries({ queryKey: keys.notifications });
  void client.invalidateQueries({ queryKey: keys.rules });
};
export function useReminders(params: URLSearchParams, booking = false) {
  const query = params.toString();
  const path = booking ? '/booking-reminders' : '/reminders';
  return useQuery({
    queryKey: [...keys.all, booking ? 'bookings' : 'list', query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Reminder>>(`${path}${query ? `?${query}` : ''}`, signal),
  });
}
export function useReminderAnalytics(booking = false) {
  return useQuery({
    queryKey: [...keys.all, booking ? 'booking-analytics' : 'analytics'],
    queryFn: ({ signal }) =>
      apiClient.get<ReminderAnalytics>(
        `${booking ? '/booking-reminders' : '/reminders'}/analytics`,
        signal,
      ),
  });
}
export function useReminder(id?: string) {
  return useQuery({
    queryKey: [...keys.all, id],
    queryFn: ({ signal }) => apiClient.get<Reminder>(`/reminders/${id}`, signal),
    enabled: Boolean(id),
  });
}
export function useReminderLookups() {
  return useQuery({
    queryKey: [...keys.all, 'lookups'],
    queryFn: ({ signal }) => apiClient.get<ReminderLookups>('/reminders/lookups', signal),
  });
}
export function useSaveReminder(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderInput | Partial<ReminderInput>) =>
      id
        ? apiClient.patch<Reminder>(`/reminders/${id}`, input)
        : apiClient.post<Reminder>('/reminders', input),
    onSuccess: () => invalidate(client),
  });
}
export function useReminderAction(booking = false) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action: 'complete' | 'snooze' | 'cancel' | 'assignment' | 'delete';
      body?: unknown;
    }) =>
      action === 'delete'
        ? apiClient.delete(`/reminders/${id}`)
        : apiClient.patch(`${booking ? '/booking-reminders' : '/reminders'}/${id}/${action}`, body),
    onSuccess: () => invalidate(client),
  });
}
export function useNotifications(params: URLSearchParams) {
  const query = params.toString();
  return useQuery({
    queryKey: [...keys.notifications, query],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Notification>>(`/notifications${query ? `?${query}` : ''}`, signal),
  });
}
export function useNotificationAnalytics(enabled = true) {
  return useQuery({
    queryKey: [...keys.notifications, 'analytics'],
    queryFn: ({ signal }) =>
      apiClient.get<{ total: number; unread: number; reminderAlerts: number; escalations: number }>(
        '/notifications/analytics',
        signal,
      ),
    enabled,
  });
}
export function useNotificationAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id?: string;
      action: 'read' | 'unread' | 'archive' | 'read-all';
    }) => apiClient.patch(id ? `/notifications/${id}/${action}` : '/notifications/read-all'),
    onSuccess: () => invalidate(client),
  });
}
export function useNotificationPreferences() {
  return useQuery({
    queryKey: [...keys.notifications, 'preferences'],
    queryFn: ({ signal }) =>
      apiClient.get<NotificationPreferenceInput>('/notification-preferences', signal),
  });
}
export function useSaveNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferenceInput) =>
      apiClient.patch('/notification-preferences', input),
    onSuccess: () => invalidate(client),
  });
}
export function useReminderRules() {
  return useQuery({
    queryKey: keys.rules,
    queryFn: ({ signal }) =>
      apiClient.get<{ rules: ReminderRule[]; leadStages: string[] }>('/reminder-rules', signal),
  });
}
export function useRuleAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      id,
      body,
    }: {
      action: 'update' | 'reset' | 'preview' | 'run';
      id?: string;
      body?: unknown;
    }) =>
      action === 'reset'
        ? apiClient.post('/reminder-rules/reset-defaults')
        : action === 'preview'
          ? apiClient.get(`/reminder-rules/${id}/preview`)
          : action === 'run'
            ? apiClient.post(`/reminder-rules/${id}/run-preview`)
            : apiClient.patch(`/reminder-rules/${id}`, body),
    onSuccess: () => invalidate(client),
  });
}
