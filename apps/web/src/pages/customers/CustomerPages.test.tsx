import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { CustomersPage } from './CustomersPage';
import { CustomerFormPage } from './CustomerFormPage';
import { CustomerWorkspacePage } from './CustomerWorkspacePage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const id = '11111111-1111-4111-8111-111111111111';
const customer = {
  id,
  customerNumber: 'CUS-2026-000001',
  displayName: 'Aarav Mehta',
  primaryPhone: '+91 98765 43210',
  alternatePhone: null,
  email: 'aarav@example.test',
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  lifecycleStage: 'REPEAT_CUSTOMER',
  dateOfBirth: null,
  companyName: null,
  travelPreferences: 'Beach holidays',
  dietaryRequirements: 'Vegetarian',
  specialRequirements: null,
  assignedTo: { id: 'user-1', fullName: 'Aditi Rao' },
  createdBy: { id: 'user-1', fullName: 'Aditi Rao' },
  addresses: [],
  tags: [{ id: 'tag-1', name: 'VIP', color: '#7c3aed' }],
  queryCount: 2,
  quotationCount: 1,
  bookingCount: 1,
  totalBookedValue: '75000.00',
  totalPaid: '50000.00',
  totalOutstanding: '25000.00',
  lastInteractionAt: '2026-07-21T10:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};
const page = { data: [customer], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };

describe('Phase 10 customer pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'customers.view',
      'customers.create',
      'customers.update',
      'customers.merge',
      'customers.manage_notes',
      'customers.view_documents',
      'customers.view_financials',
    ]);
  });

  it('renders analytics, relationship counts and URL-backed list filters', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/lookups')
        ? response({ tags: [{ id: 'tag-1', name: 'VIP', color: '#7c3aed' }], users: [] })
        : String(request).includes('/analytics')
          ? response({
              total: 1,
              active: 1,
              prospects: 0,
              repeat: 1,
              vip: 1,
              totalBookedValue: '75000.00',
              totalOutstanding: '25000.00',
            })
          : response(page),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CustomersPage />);
    expect((await screen.findAllByRole('link', { name: 'Aarav Mehta' })).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 leads · 1 quotes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹25,000').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Search customers'), 'Aarav');
    await userEvent.selectOptions(screen.getByLabelText('Lifecycle stage'), 'REPEAT_CUSTOMER');
    await userEvent.selectOptions(screen.getByLabelText('Customer tag'), 'tag-1');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            String(url).includes('search=Aarav') &&
            String(url).includes('lifecycleStage=REPEAT_CUSTOMER') &&
            String(url).includes('tagId=tag-1'),
        ),
      ).toBe(true),
    );
  });

  it('shows live duplicate matches on the create form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes('/lookups')) return response({ tags: [], users: [] });
        if (url.includes('/duplicates'))
          return response([{ ...customer, reasons: ['PHONE_EXACT'], score: 1, strongMatch: true }]);
        return response({});
      }),
    );
    renderWithProviders(<CustomerFormPage />);
    await userEvent.type(
      screen.getByLabelText('Display name *', { selector: 'input' }),
      'Aarav Mehta',
    );
    await userEvent.type(
      screen.getByText('Primary phone').parentElement!.querySelector('input')!,
      '9876543210',
    );
    expect(await screen.findByText('Possible duplicate customers')).toBeInTheDocument();
    expect(screen.getByText('Phone Exact')).toBeInTheDocument();
  });

  it('renders the workspace and switches to the unified timeline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes('/timeline'))
          return response({
            data: [{ type: 'COMMUNICATION', occurredAt: '2026-07-21T10:00:00.000Z', value: {} }],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          });
        if (url.endsWith('/notes') || url.endsWith('/communications') || url.endsWith('/documents'))
          return response([]);
        if (url.endsWith('/travellers'))
          return response([
            {
              id: 'traveller-1',
              firstName: 'Nina',
              lastName: 'Shah',
              travellerType: 'ADULT',
              visaStatus: 'NOT_STARTED',
              booking: { id: 'booking-1', bookingNumber: 'BKG-2026-000001' },
            },
          ]);
        if (url.endsWith('/payments'))
          return response([
            {
              id: 'payment-1',
              paymentNumber: 'PAY-2026-000001',
              amount: '10000.00',
              currency: 'INR',
              paymentStatus: 'RECEIVED',
              booking: { id: 'booking-1', bookingNumber: 'BKG-2026-000001' },
            },
          ]);
        if (url.includes('/customers?')) return response(page);
        return response(customer);
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/customers/:customerId" element={<CustomerWorkspacePage />} />
      </Routes>,
      { route: `/customers/${id}` },
    );
    expect(await screen.findByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('₹75,000')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('Communication')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Travellers' }));
    expect(await screen.findByText('Nina Shah')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(await screen.findByText('INR 10000.00 · PAY-2026-000001')).toBeInTheDocument();
  });
});
