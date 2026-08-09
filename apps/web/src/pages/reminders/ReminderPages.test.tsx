import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { RemindersPage } from './RemindersPage';
import { NotificationsPage } from './NotificationsPage';
import { NotificationSettingsPage } from './NotificationSettingsPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const page = {
  data: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Call Goa customer',
      description: 'Discuss the latest quotation',
      dueAt: '2026-07-23T10:00:00.000Z',
      originalDueAt: null,
      snoozedUntil: null,
      status: 'ACTIVE',
      priority: 'HIGH',
      reminderType: 'LEAD_FOLLOW_UP',
      source: 'MANUAL',
      assignedTo: { id: 'user-1', fullName: 'Sales Agent', email: 'sales@test' },
      createdBy: { id: 'owner-1', fullName: 'Owner', email: 'owner@test' },
      linkedEntity: {
        type: 'Lead',
        id: 'lead-1',
        label: 'QRY-2026-000001 · Goa Customer',
        href: '/queries/lead-1',
      },
      reminderRule: null,
      completionOutcome: null,
      completionNotes: null,
      completedAt: null,
      cancellationReason: null,
      createdAt: '2026-07-22T08:00:00.000Z',
      updatedAt: '2026-07-22T08:00:00.000Z',
      queryId: 'lead-1',
      customerId: null,
      quotationId: null,
      bookingId: null,
      vendorId: null,
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

describe('Phase 12 reminder pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'reminders.view',
      'reminders.create',
      'reminders.update',
      'reminders.complete',
      'reminders.snooze',
      'reminders.manage_rules',
      'notifications.view',
      'notifications.manage',
      'notifications.settings',
    ]);
  });

  it('renders KPI cards, URL-backed filters and reminder actions', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(request);
      if (url.includes('/analytics'))
        return response({ total: 4, active: 2, overdue: 1, completed: 1 });
      if (url.includes('/complete')) return response({ ...page.data[0], status: 'COMPLETED' });
      return response(page);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<RemindersPage />);
    expect(await screen.findByText('Call Goa customer')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search reminders'), 'Goa');
    await userEvent.selectOptions(screen.getByLabelText('Filter priority'), 'HIGH');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url).includes('search=Goa') && String(url).includes('priority=HIGH'),
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/complete'))).toBe(true),
    );
  });

  it('renders recipient notifications and performs read/archive actions', async () => {
    const notificationPage = {
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          category: 'REMINDER_OVERDUE',
          severity: 'WARNING',
          status: 'UNREAD',
          title: 'Overdue · Call customer',
          message: 'This reminder needs attention.',
          actionUrl: '/reminders/11111111-1111-4111-8111-111111111111',
          createdAt: '2026-07-22T08:00:00.000Z',
          readAt: null,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/analytics')
        ? response({ total: 1, unread: 1, reminderAlerts: 1, escalations: 0 })
        : String(request).includes('/read')
          ? response({ ...notificationPage.data[0], status: 'READ' })
          : response(notificationPage),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText('Overdue · Call customer')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Mark read'));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/read'))).toBe(true),
    );
  });

  it('shows only manual reminder notification preferences and hides automation', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(request);
      if (url.includes('/notification-preferences'))
        return response({
          inAppEnabled: true,
          emailEnabled: true,
          reminderAlerts: true,
          overdueAlerts: true,
          escalationAlerts: true,
          bookingAlerts: true,
          paymentAlerts: true,
          quotationAlerts: true,
          documentAlerts: true,
          vendorAlerts: true,
          digestMode: 'IMMEDIATE',
          quietHoursStart: null,
          quietHoursEnd: null,
        });
      return response({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NotificationSettingsPage />);
    expect(await screen.findByText('My reminder notifications')).toBeInTheDocument();
    // Only the three reminder preferences remain visible.
    expect(screen.getAllByText('In-app notifications').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reminder alerts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overdue reminder alerts').length).toBeGreaterThan(0);
    // Everything else is hidden (no email, digest, escalation, events, automation).
    expect(screen.queryByText('Email notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Digest mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Escalations')).not.toBeInTheDocument();
    expect(screen.queryByText('Booking events')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment events')).not.toBeInTheDocument();
    expect(screen.queryByText('Quotation events')).not.toBeInTheDocument();
    expect(screen.queryByText('Document events')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor events')).not.toBeInTheDocument();
    expect(screen.queryByText('Automation rules')).not.toBeInTheDocument();
    expect(screen.queryByText('Lead · New lead')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/notification-preferences') && init?.method === 'PATCH',
        ),
      ).toBe(true),
    );
  });
});
