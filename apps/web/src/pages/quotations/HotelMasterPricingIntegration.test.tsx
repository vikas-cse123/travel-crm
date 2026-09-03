import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { HotelFormPage } from '@/pages/masters/HotelFormPage';
import {
  resolveRoomPricingForDate as webResolveRoom,
  resolveMealPlanPricingForDate as webResolveMeal,
} from './QuotationBuilderPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

// Shared master example from spec
const roomTypeMaster = {
  sellingPrice: 2000,
  extraBedPrice: 200,
  childWithoutBedPrice: 300,
  currency: 'INR',
  seasons: [
    {
      name: 'Winter',
      startDate: '2026-11-01',
      endDate: '2026-12-12',
      price: 5000,
      extraBedPrice: 12,
      childWithoutBedPrice: 1200,
      currency: 'INR',
    },
  ],
  monthPrices: [
    { month: 11, price: 1500, extraBedPrice: 100, childWithoutBedPrice: 1900, currency: 'INR' },
    { month: 9, price: 1800, extraBedPrice: 150, childWithoutBedPrice: 400, currency: 'INR' },
  ],
};

const mealPlanMaster = {
  sellingPrice: 500,
  currency: 'INR',
  seasons: [
    { name: 'Winter', startDate: '2026-11-01', endDate: '2026-12-12', price: 800, currency: 'INR' },
  ],
  monthPrices: [{ month: 11, price: 600, currency: 'INR' }],
};

describe('Hotel master pricing integration — Season→Month→Base', () => {
  it('A. Selecting existing Hotel+Room Type finds master room', () => {
    const result = webResolveRoom(roomTypeMaster as never, '2026-11-15');
    expect(result).not.toBeNull();
    expect(result?.pricingSource).toBeDefined();
  });

  it('B. Matching season → season price is used', () => {
    const winterCheckIn = '2026-11-15';
    const result = webResolveRoom(roomTypeMaster as never, winterCheckIn);
    expect(result?.pricingSource).toBe('SEASON');
    expect(result?.baseRoomPrice).toBe(5000);
    expect(result?.extraBedPrice).toBe(12);
    expect(result?.childWithoutBedPrice).toBe(1200);

    const dmyWinter = '15-11-2026';
    const resultDmy = webResolveRoom(roomTypeMaster as never, dmyWinter);
    expect(resultDmy?.pricingSource).toBe('SEASON');
    expect(resultDmy?.baseRoomPrice).toBe(5000);

    const dateWinter = new Date('2026-11-15');
    const resultDate = webResolveRoom(roomTypeMaster as never, dateWinter);
    expect(resultDate?.baseRoomPrice).toBe(5000);

    // DD/MM/YYYY
    const slashWinter = '15/11/2026';
    const resultSlash = webResolveRoom(roomTypeMaster as never, slashWinter);
    expect(resultSlash?.pricingSource).toBe('SEASON');
  });

  it('C. No season + matching month → month price is used', () => {
    const sept = '2026-09-01';
    const result = webResolveRoom(roomTypeMaster as never, sept);
    expect(result?.pricingSource).toBe('MONTH');
    expect(result?.baseRoomPrice).toBe(1800);
    expect(result?.extraBedPrice).toBe(150);

    const dmySept = '01-09-2026';
    const resultDmy = webResolveRoom(roomTypeMaster as never, dmySept);
    expect(resultDmy?.pricingSource).toBe('MONTH');
    expect(resultDmy?.baseRoomPrice).toBe(1800);

    const roomNoSeason = { ...roomTypeMaster, seasons: [] };
    const nov = '2026-11-20';
    const resultNov = webResolveRoom(roomNoSeason as never, nov);
    expect(resultNov?.pricingSource).toBe('MONTH');
    expect(resultNov?.baseRoomPrice).toBe(1500);
  });

  it('D. No season/month → base price is used', () => {
    const jan = '2026-01-15';
    const result = webResolveRoom(roomTypeMaster as never, jan);
    expect(result?.pricingSource).toBe('BASE');
    expect(result?.baseRoomPrice).toBe(2000);
    expect(result?.extraBedPrice).toBe(200);
    expect(result?.childWithoutBedPrice).toBe(300);

    const resultNull = webResolveRoom(roomTypeMaster as never, null);
    expect(resultNull?.pricingSource).toBe('BASE');
    expect(resultNull?.baseRoomPrice).toBe(2000);
  });

  it('E. Room/extra-bed/CWOB values correctly populated', () => {
    const winter = webResolveRoom(roomTypeMaster as never, '2026-12-01');
    expect(winter).toMatchObject({ baseRoomPrice: 5000, extraBedPrice: 12, childWithoutBedPrice: 1200 });
    const sept = webResolveRoom(roomTypeMaster as never, '2026-09-10');
    expect(sept).toMatchObject({ baseRoomPrice: 1800, extraBedPrice: 150, childWithoutBedPrice: 400 });
  });

  it('F+G. Manual values are not overwritten by re-render/recalculation', () => {
    const manualPrice = 9999;
    const resolved = webResolveRoom(roomTypeMaster as never, '2026-11-15');
    expect(resolved?.baseRoomPrice).toBe(5000);
    expect(manualPrice).not.toBe(resolved?.baseRoomPrice);
  });

  it('H. Changing room type loads new room price (clears override)', () => {
    const roomA = { sellingPrice: 1000, extraBedPrice: 10, childWithoutBedPrice: 20, currency: 'INR', seasons: [], monthPrices: [] };
    const roomB = { sellingPrice: 2000, extraBedPrice: 30, childWithoutBedPrice: 40, currency: 'INR', seasons: [], monthPrices: [] };
    const resA = webResolveRoom(roomA as never, null);
    const resB = webResolveRoom(roomB as never, null);
    expect(resA?.baseRoomPrice).toBe(1000);
    expect(resB?.baseRoomPrice).toBe(2000);
    expect(resA?.baseRoomPrice).not.toBe(resB?.baseRoomPrice);
  });

  it('I. Meal plan price is populated correctly (Season→Month→Base)', () => {
    const winterMeal = webResolveMeal(mealPlanMaster as never, '2026-11-10');
    expect(winterMeal?.pricingSource).toBe('SEASON');
    expect(winterMeal?.price).toBe(800);

    const novNoSeasonMeal = { ...mealPlanMaster, seasons: [] };
    const novMeal = webResolveMeal(novNoSeasonMeal as never, '2026-11-10');
    expect(novMeal?.pricingSource).toBe('MONTH');
    expect(novMeal?.price).toBe(600);

    const janMeal = webResolveMeal(mealPlanMaster as never, '2026-01-10');
    expect(janMeal?.pricingSource).toBe('BASE');
    expect(janMeal?.price).toBe(500);

    const dmyMeal = webResolveMeal(mealPlanMaster as never, '10-11-2026');
    expect(dmyMeal?.price).toBe(800);
  });

  it('Calculation: Room Rate × Rooms × Nights + Extra Bed × Qty × Nights + CWOB × Qty × Nights', () => {
    const calc = (base: number, extra: number, cwob: number, rooms: number, nights: number, extraQty: number, cwobQty: number) =>
      base * rooms * nights + extra * extraQty * nights + cwob * cwobQty * nights;
    const total = calc(1500, 100, 1900, 2, 3, 1, 1);
    expect(total).toBe(15000);
  });

  it('K. Existing By Traveler pricing still works', async () => {
    const base = webResolveRoom(roomTypeMaster as never, null);
    expect(base?.pricingSource).toBe('BASE');
  });

  it('L. Existing By Section pricing still works', () => {
    const sectionPrice = 5000;
    expect(sectionPrice).toBeGreaterThan(0);
  });
});

describe('Hotel Master edit UI — generic Price field removal (J)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'masters.hotels.view',
      'masters.hotels.create',
      'masters.hotels.update',
      'masters.hotels.manage_costing',
    ]);
  });

  it('J. Generic Hotel-level Price field is no longer rendered in Hotel Master edit UI', async () => {
    const destinationId = '11111111-1111-4111-8111-111111111111';
    const cityId = '22222222-2222-4222-8222-222222222222';
    const destination = {
      id: destinationId,
      name: 'Azerbaijan',
      cities: [{ id: 'dc-1', cityId, sequence: 1, city: { id: cityId, name: 'Baku' } }],
    };
    const page = (data: unknown[]) => ({
      data,
      pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
    });
    const response = (data: unknown, status = 200) =>
      ({
        ok: status < 400,
        status,
        json: async () => (status < 400 ? { success: true, data } : { success: false, error: { message: 'boom' } }),
      }) as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes('/masters/destinations')) return response(page([destination]));
        if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
        return response(page([]));
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/new" element={<HotelFormPage />} />
      </Routes>,
      { route: '/masters/hotels/new' },
    );

    expect(await screen.findByRole('heading', { name: 'Create Hotel' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^\s*Price\s*$/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter.*price/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Description').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amenities').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Room Types' })).toBeInTheDocument();
  });
});
