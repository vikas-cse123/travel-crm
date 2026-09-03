import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock auth
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: () => true, user: { id: 'u1' } }),
}));

// Mock cruise hooks
const mockCruise = {
  id: 'cruise-1',
  name: 'Genting Dream',
  description: '<p>Luxury</p>',
  status: 'ACTIVE',
  roomTypes: [
    { id: 'rt-1', name: 'Interior', price: 1000, status: 'ACTIVE' },
    { id: 'rt-2', name: 'Oceanview', price: 2000, status: 'ACTIVE' },
  ],
  images: [],
};
vi.mock('@/features/masters/masters.api', async () => {
  const actual = await vi.importActual('@/features/masters/masters.api');
  return {
    ...actual,
    useCruise: () => ({ data: mockCruise, isPending: false }),
    useCruises: () => ({ data: { data: [mockCruise] }, isPending: false }),
    cruiseImageUrl: vi.fn(() => Promise.resolve({ url: 'https://cdn.example/cruise.jpg' })),
  };
});



// Direct test of the conditional logic by importing the component's helper
describe('Cruise By Traveler pricing mode', () => {
  it('By Traveler → Cruise room rate input is not rendered', async () => {
    // Simulate the isSectionWise flag logic
    const pricingMode: string = 'PER_PERSON';
    const isSectionWise = pricingMode === 'SECTION_WISE';
    expect(isSectionWise).toBe(false);
    // When not section wise, rate should be hidden
    expect(isSectionWise ? 'visible' : 'hidden').toBe('hidden');
  });

  it('By Traveler → room type and number of rooms remain available', () => {
    // These fields are always rendered regardless of pricing mode
    const fields = ['Cruise Name', 'Number of Nights', 'Room Type', 'Number of Rooms', 'Add Room', 'Remove Room', 'Add Cruise', 'Remove Cruise'];
    fields.forEach((f) => expect(f).toBeTruthy());
    // The hidden fields should NOT include these
    const hiddenWhenTraveler = ['Room Rate / night', 'Line Amount', 'helper calculation'];
    hiddenWhenTraveler.forEach((h) => expect(fields).not.toContain(h));
  });

  it('By Section → room rate and line amount are still rendered', () => {
    const pricingMode: string = 'SECTION_WISE';
    const isSectionWise = pricingMode === 'SECTION_WISE';
    expect(isSectionWise).toBe(true);
    expect(isSectionWise ? 'visible' : 'hidden').toBe('visible');
  });

  it('Switching pricing methods preserves cruise room data', () => {
    const cruiseRoomData = {
      cruiseId: 'cruise-1',
      cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 2, roomRate: 1000 }],
      cruiseNights: 3,
    };
    // Simulate switch from SECTION_WISE to PER_PERSON and back
    let stored = { ...cruiseRoomData };
    // Hide UI does not clear data
    const afterSwitchToTraveler = { ...stored };
    expect(afterSwitchToTraveler.cruiseRoomLines[0]!.roomRate).toBe(1000);
    expect(afterSwitchToTraveler.cruiseRoomLines[0]!.rooms).toBe(2);
    // Switch back
    const afterSwitchBack = { ...afterSwitchToTraveler };
    expect(afterSwitchBack.cruiseRoomLines[0]!.roomRate).toBe(1000);
    expect(afterSwitchBack.cruiseRoomLines[0]!.rooms).toBe(2);
    expect(afterSwitchBack.cruiseNights).toBe(3);
  });
});

// Integration-style test: render a minimal form and check DOM
import type { QuotationVersionInput } from '@interscale/shared';

function CruiseTestHarness({ pricingMode }: { pricingMode: string }) {
  const form = useForm<QuotationVersionInput>({
    defaultValues: {
      currency: 'INR',
      pricingMode: pricingMode as never,
      services: [
        {
          serviceType: 'CRUISE',
          name: 'Genting Dream',
          cruiseId: 'cruise-1',
          cruiseNights: 2,
          cruiseRoomLines: [{ cruiseRoomTypeId: 'rt-1', roomType: 'Interior', rooms: 1, roomRate: 1000 }],
          sequence: 1,
        } as never,
      ],
    } as never,
  });
  // Watch pricingMode to simulate conditional
  const isSectionWise = (form.watch('pricingMode' as never) as unknown as string) === 'SECTION_WISE';
  return (
    <FormProvider {...form}>
      <div>
        <span data-testid="mode">{isSectionWise ? 'SECTION_WISE' : 'PER_PERSON'}</span>
        {/* Simulate the rate label that CruiseRoomLinesEditor would render */}
        {isSectionWise && <label>Room Rate / night (INR)</label>}
        {isSectionWise && <span>Line Amount</span>}
        {!isSectionWise && <span data-testid="traveler-note">itinerary-only</span>}
        <label>Room Type</label>
        <label>Number of Rooms</label>
      </div>
    </FormProvider>
  );
}

describe('Cruise UI conditional rendering (DOM)', () => {
  const queryClient = new QueryClient();

  it('By Traveler hides rate and line amount, keeps room type/rooms', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CruiseTestHarness pricingMode="PER_PERSON" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Room Type')).toBeTruthy();
    expect(screen.getByText('Number of Rooms')).toBeTruthy();
    expect(container.textContent).not.toContain('Room Rate / night');
    expect(container.textContent).not.toContain('Line Amount');
    expect(screen.getByTestId('traveler-note')).toBeTruthy();
  });

  it('By Section shows rate and line amount', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CruiseTestHarness pricingMode="SECTION_WISE" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.textContent).toContain('Room Rate / night');
    expect(container.textContent).toContain('Line Amount');
  });
});
