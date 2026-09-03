import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { PublicQuotationPage } from './PublicQuotationPage';

function publicQuotation(flightDetails: unknown) {
  return {
    company: {
      name: 'Alpha Travel',
      email: 'hello@alpha.test',
      phone: '919876543210',
      website: null,
      address: null,
      primaryColor: '#2563eb',
      operatingSince: 2015,
      tripsSold: 4200,
      tan: 'ABCD12345E',
      taxRegistrationNumber: '29ABCDE1234F1Z5',
      logoUrl: null,
    },
    quotation: {
      quotationNumber: 'QT-2026-000001',
      customerName: 'Aarav Mehta',
      destinationSummary: 'Goa',
      travelStartDate: null,
      travelEndDate: null,
      adults: 3,
      childrenWithBed: 3,
      childrenWithoutBed: 2,
      infants: 1,
      rooms: 1,
      validUntil: null,
      createdAt: '2026-08-04T10:00:00.000Z',
      status: 'VIEWED',
    },
    version: {
      title: 'Goa proposal',
      versionNumber: 1,
      currency: 'INR',
      finalAmount: '19000',
      pricingMode: 'SECTION_WISE',
      flightDetails,
      hotelDetails: null,
      hotels: [],
      services: [],
      itinerary: [],
      inclusions: [],
      exclusions: [],
      terms: [],
      pricingHeading: 'Price Breakdown',
      pricingSubheading: null,
      pricingDisplayOrder: null,
      createdAt: '2026-08-04T10:00:00.000Z',
      status: 'VIEWED',
    } as unknown as Record<string, unknown>,
    heroImageUrl: null,
  };
}

describe('Flight pricing breakdown - Weblink', () => {
  it('1. Flight FIXED_TOTAL → aggregate amount only (no breakdown)', async () => {
    const fd = {
      include: true,
      sectionTitle: 'Flight Details',
      amount: 25000,
      pricingBasis: 'FIXED_TOTAL',
      perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
      journeyType: 'ROUND_TRIP',
      outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [] },
      returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [] },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/public/quotations')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: publicQuotation(fd) }) } as unknown as Response;
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: {} }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/test-token-fixed' },
    );
    await screen.findByText('Goa proposal');
    // Should show Flights with aggregate, but not the detailed breakdown
    expect(await screen.findByText('Flights')).toBeInTheDocument();
    expect(screen.queryByText(/Adult:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Flight Total/)).not.toBeInTheDocument();
  });

  it('2. Flight PER_TRAVELER → detailed breakdown appears', async () => {
    const fd = {
      include: true,
      sectionTitle: 'Flight Details',
      amount: 0,
      pricingBasis: 'PER_TRAVELER',
      perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
      journeyType: 'ROUND_TRIP',
      outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [] },
      returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [] },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/public/quotations')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: publicQuotation(fd) }) } as unknown as Response;
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: {} }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/test-token-per-traveler' },
    );
    await screen.findByText('Goa proposal');
    expect(await screen.findByText('Flights')).toBeInTheDocument();
    expect(screen.getByText(/Adult:/)).toBeInTheDocument();
    expect(screen.getByText(/Child With Bed:/)).toBeInTheDocument();
    expect(screen.getByText(/Child Without Bed:/)).toBeInTheDocument();
    expect(screen.getByText(/Infant:/)).toBeInTheDocument();
    expect(screen.getByText('Flight Total')).toBeInTheDocument();
    // Total should be 19k
    expect(screen.getAllByText(/19,000/).length).toBeGreaterThan(0);
  });
});
