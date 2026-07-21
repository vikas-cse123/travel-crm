import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { VendorsPage } from './VendorsPage';
import { VendorFormPage } from './VendorFormPage';
import { VendorWorkspacePage } from './VendorWorkspacePage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const id = '11111111-1111-4111-8111-111111111111';
const vendor = {
  id,
  vendorCode: 'VEN-2026-000001',
  name: 'Harbour Hotels',
  vendorType: 'HOTEL',
  status: 'ACTIVE',
  contactPerson: 'Maya Sen',
  primaryPhone: '+91 98765 43210',
  primaryEmail: 'hotel@example.test',
  address: 'Calangute Road',
  city: 'Goa',
  state: 'Goa',
  country: 'India',
  postalCode: '403001',
  coverageAreas: 'Goa, Konkan',
  servicesOffered: 'Hotels and meals',
  contractType: 'NET_RATE',
  contractStartDate: null,
  contractEndDate: null,
  paymentTerm: 'NET_30',
  gstNumber: null,
  panNumber: null,
  rating: '4.50',
  confirmationRate: '75.00',
  totalBookings: 4,
  totalBusiness: '80000.00',
  totalPaid: '50000.00',
  totalOutstanding: '30000.00',
  averageBookingCost: '20000.00',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'user-1', fullName: 'Aditi Rao' },
  assignedTo: null,
  contacts: [],
  services: [
    {
      id: 'service-1',
      serviceType: 'HOTEL',
      name: 'Deluxe Room',
      description: null,
      destination: 'Goa',
      city: 'Goa',
      coverageArea: 'North Goa',
      currency: 'INR',
      baseCost: '12000.00',
      sellingReferencePrice: '15000.00',
      validFrom: null,
      validUntil: null,
      status: 'ACTIVE',
      rates: [],
    },
  ],
  recentBookingServices: [],
  recentPayments: [],
  documents: [],
  notes: [],
  bankAccounts: [],
};
const page = { data: [vendor], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };

describe('Phase 11 vendor pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'vendors.view',
      'vendors.create',
      'vendors.update',
      'vendors.manage_services',
      'vendors.manage_contacts',
      'vendors.manage_documents',
      'vendors.view_financials',
      'vendors.manage_payables',
      'vendors.manage_payments',
    ]);
  });

  it('renders reference-led analytics, financial columns and URL-backed filters', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/analytics')
        ? response({
            total: 1,
            active: 1,
            totalVendorCosts: '80000.00',
            averageRating: '4.50',
            totalBookings: 4,
            distribution: { HOTEL: 1, AIRLINE: 0, TRANSPORT: 0, DMC: 0 },
          })
        : response(page),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<VendorsPage />);
    expect((await screen.findAllByText('Harbour Hotels')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹80,000').length).toBeGreaterThan(0);
    expect(screen.getByText('4.5 / 5')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search vendors'), 'Harbour');
    await userEvent.selectOptions(screen.getByLabelText('Vendor type'), 'HOTEL');
    await userEvent.selectOptions(screen.getByLabelText('Payment status'), 'PARTIALLY_PAID');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            String(url).includes('search=Harbour') &&
            String(url).includes('vendorType=HOTEL') &&
            String(url).includes('paymentStatus=PARTIALLY_PAID'),
        ),
      ).toBe(true),
    );
  });

  it('removes financial columns when permission is absent', async () => {
    auth.permissions = new Set(['vendors.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/analytics')
          ? response({ total: 1, active: 1, averageRating: '4.50', distribution: { HOTEL: 1 } })
          : response({
              ...page,
              data: [
                {
                  ...vendor,
                  totalBusiness: undefined,
                  totalPaid: undefined,
                  totalOutstanding: undefined,
                },
              ],
            }),
      ),
    );
    renderWithProviders(<VendorsPage />);
    await screen.findAllByText('Harbour Hotels');
    expect(screen.queryByText('Total business')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Payment status')).not.toBeInTheDocument();
  });

  it('shows exact duplicate warnings in the create form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes('/lookups')) return response({ users: [] });
        if (url.includes('/duplicates'))
          return response([
            { ...vendor, reasons: ['PHONE_EXACT', 'EMAIL_EXACT'], strongMatch: true },
          ]);
        return response({});
      }),
    );
    renderWithProviders(<VendorFormPage />);
    await userEvent.type(screen.getByLabelText('Vendor name *'), 'Harbour Hotels');
    await userEvent.type(
      screen.getByText('Phone').parentElement!.querySelector('input')!,
      '9876543210',
    );
    expect(await screen.findByText('Possible duplicate vendors')).toBeInTheDocument();
    expect(screen.getByText('Phone Exact, Email Exact')).toBeInTheDocument();
  });

  it('renders the details workspace and switches through operational tabs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.endsWith('/timeline'))
          return response({
            data: [
              {
                id: 'event-1',
                type: 'VENDOR_CREATED',
                title: 'VENDOR CREATED',
                timestamp: '2026-07-20',
                actor: { fullName: 'Aditi Rao' },
              },
            ],
            pagination: page.pagination,
          });
        if (url.endsWith('/bookings'))
          return response([
            {
              id: 'booking-1',
              bookingNumber: 'BK-2026-000001',
              customerName: 'Nina Shah',
              destinationSummary: 'Goa',
              bookingStatus: 'CONFIRMED',
              travelStartDate: '2026-11-01',
            },
          ]);
        if (
          ['/contacts', '/payables', '/payments', '/documents', '/notes', '/bank-accounts'].some(
            (ending) => url.endsWith(ending),
          )
        )
          return response([]);
        return response(vendor);
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/vendors/:vendorId" element={<VendorWorkspacePage />} />
      </Routes>,
      { route: `/vendors/${id}` },
    );
    expect(await screen.findByText('Harbour Hotels')).toBeInTheDocument();
    expect(screen.getAllByText('₹80,000').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Bookings' }));
    expect(await screen.findByText('BK-2026-000001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('VENDOR CREATED')).toBeInTheDocument();
  });
});
