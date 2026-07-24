import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { VisaTypesPage } from './VisaTypesPage';
import { VisaTypeFormPage } from './VisaTypeFormPage';
import { VisaTypeDetailsPage } from './VisaTypeDetailsPage';
import { TestimonialsPage } from './TestimonialsPage';
import { TestimonialFormPage } from './TestimonialFormPage';
import { TestimonialDetailsPage } from './TestimonialDetailsPage';
import { NAV_ITEMS } from '@/components/layout/navigation';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const destinationId = '22222222-2222-4222-8222-222222222222';
const visaTypeId = '55555555-5555-4555-8555-555555555555';
const testimonialId = '66666666-6666-4666-8666-666666666666';

const destination = {
  id: destinationId,
  countryCode: 'TH',
  countryName: 'Thailand',
  name: 'Thailand',
  destinationType: 'INTERNATIONAL',
  status: 'ACTIVE',
  cities: [],
  _count: { cities: 0 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};
const visaType = {
  id: visaTypeId,
  destinationId,
  name: 'Tourist Visa',
  status: 'ACTIVE',
  destination: { id: destinationId, name: 'Thailand' },
  sections: [
    { id: 's1', visaTypeId, title: 'Overview', content: '<p>Visa overview</p>', sequence: 0 },
  ],
  _count: { sections: 1 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};
const testimonial = {
  id: testimonialId,
  clientName: 'Asha Rao',
  destinationName: 'Bali',
  description: 'Wonderful and well organised trip.',
  isVisible: true,
  status: 'ACTIVE',
  hasImage: false,
  imageFileName: null,
  imageMimeType: null,
  imageConfirmedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

const ALL = [
  'masters.visa_types.view',
  'masters.visa_types.create',
  'masters.visa_types.update',
  'masters.visa_types.delete',
  'masters.testimonials.view',
  'masters.testimonials.create',
  'masters.testimonials.update',
  'masters.testimonials.delete',
  'masters.testimonials.manage_media',
];

describe('Phase 21 visa type and testimonial pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  it('lists Visa Types and Testimonials under the Masters nav', () => {
    const masters = NAV_ITEMS.find((item) => item.label === 'Masters');
    const labels = masters?.children?.map((item) => item.label) ?? [];
    expect(labels).toContain('Visa Types');
    expect(labels).toContain('Testimonials');
  });

  it('renders the visa type list, the # sections and destination filter, and archive action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([visaType])),
      ),
    );
    renderWithProviders(<VisaTypesPage />);
    expect((await screen.findAllByText('Tourist Visa')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thailand').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Archive Tourist Visa')).toBeInTheDocument();
  });

  it('shows visa type loading, empty and error states', async () => {
    const never = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => never),
    );
    const loading = renderWithProviders(<VisaTypesPage />);
    expect(loading.container.querySelector('.animate-pulse')).toBeInTheDocument();
    loading.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([])),
      ),
    );
    const empty = renderWithProviders(<VisaTypesPage />);
    expect(await screen.findByText('No visa types found')).toBeInTheDocument();
    empty.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : ({
              ok: false,
              status: 500,
              json: async () => ({ success: false, error: { code: 'X', message: 'f' } }),
            } as Response),
      ),
    );
    renderWithProviders(<VisaTypesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Visa types could not be loaded');
  });

  it('validates the visa type form and supports adding sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(visaType),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/visa-types/new" element={<VisaTypeFormPage />} />
      </Routes>,
      { route: '/masters/visa-types/new' },
    );
    await screen.findByRole('heading', { name: 'Create Visa Type' });
    await userEvent.click(screen.getByRole('button', { name: 'Create Visa Type' }));
    expect(await screen.findByText('Select a destination.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add Section/ }));
    expect(screen.getByLabelText('Section 1 title')).toBeInTheDocument();
  });

  it('renders visa type detail with sanitized section content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(visaType)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/visa-types/:visaTypeId" element={<VisaTypeDetailsPage />} />
      </Routes>,
      { route: `/masters/visa-types/${visaTypeId}` },
    );
    expect((await screen.findAllByText('Tourist Visa')).length).toBeGreaterThan(0);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Visa overview')).toBeInTheDocument();
  });

  it('hides visa type create/archive controls from a read-only role', async () => {
    auth.permissions = new Set(['masters.visa_types.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([visaType])),
      ),
    );
    renderWithProviders(<VisaTypesPage />);
    await screen.findAllByText('Tourist Visa');
    expect(screen.queryByRole('link', { name: 'Add New Visa Type' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archive Tourist Visa')).not.toBeInTheDocument();
  });

  it('renders the testimonial list (incl. mobile cards) and validates the create form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(page([testimonial]))),
    );
    const rendered = renderWithProviders(<TestimonialsPage />);
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bali').length).toBeGreaterThan(0);
    // Desktop table + mobile card both render the row.
    expect(rendered.container.querySelector('.md\\:hidden')).toBeInTheDocument();
    rendered.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(testimonial)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/testimonials/new" element={<TestimonialFormPage />} />
        <Route path="/masters/testimonials/:testimonialId" element={<div>Saved testimonial</div>} />
      </Routes>,
      { route: '/masters/testimonials/new' },
    );
    await screen.findByRole('heading', { name: 'Create Testimonial' });
    await userEvent.click(screen.getByRole('button', { name: 'Create Testimonial' }));
    expect(await screen.findByText('Enter a destination name.')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Enter destination name'), 'Bali');
    await userEvent.type(
      screen.getByPlaceholderText("Write the client's testimonial or review…"),
      'Great trip',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create Testimonial' }));
    await screen.findByText('Saved testimonial');
  });

  it('renders testimonial detail with the visibility flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(testimonial)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/testimonials/:testimonialId" element={<TestimonialDetailsPage />} />
      </Routes>,
      { route: `/masters/testimonials/${testimonialId}` },
    );
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0);
    expect(screen.getByText('Wonderful and well organised trip.')).toBeInTheDocument();
    expect(screen.getAllByText('Visible').length).toBeGreaterThan(0);
  });

  it('hides testimonial create control from a read-only role', async () => {
    auth.permissions = new Set(['masters.testimonials.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(page([testimonial]))),
    );
    renderWithProviders(<TestimonialsPage />);
    await screen.findAllByText('Asha Rao');
    expect(screen.queryByRole('link', { name: 'Add New Testimonial' })).not.toBeInTheDocument();
  });
});
