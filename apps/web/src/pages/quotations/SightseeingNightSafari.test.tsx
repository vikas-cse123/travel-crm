import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { SightseeingSection, emptySightseeingDay } from './SightseeingSection';
import type { QuotationVersionInput } from '@interscale/shared';

vi.mock('@/features/masters/masters.api', () => ({
  useSightseeingActivities: () => ({
    data: {
      activities: [
        {
          id: 'night-safari-id',
          title: 'Night safari',
          sequence: 1,
          estimatedHours: 2.5,
          suggestedStartTime: '18:00',
          description: '<p>Night safari</p>',
          pricing: [
            { label: 'adult', price: 3000 },
            { label: 'child', price: 4000 },
          ],
          destination: { id: 'dest-1', name: 'Singapore' },
          city: { id: 'city-1', name: 'Singapore' },
          images: [],
        },
      ],
      destination: { id: 'dest-1', name: 'Singapore' },
      city: { id: 'city-1', name: 'Singapore' },
    },
    isLoading: false,
    isError: false,
  }),
  useSightseeingPresentations: () => ({ data: {}, isLoading: false, isError: false }),
}));

function Harness() {
  const form = useForm<QuotationVersionInput>({
    defaultValues: {
      pricingMode: 'SECTION_WISE' as any,
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing',
        amount: 0,
        description: null,
        days: [emptySightseeingDay(1)] as any,
      },
    } as any,
  });
  return <SightseeingSection form={form} destination="Singapore" pax={{ adults: 3, childrenWithBed: 0, childrenWithoutBed: 4, infants: 1 }} />;
}

describe('Night safari master pricing', () => {
  it('copies adult 3000 and child 4000 into activity and calculates 25000', async () => {
    render(<Harness />);
    // Find the sightseeing activity select for Day 1 activity 1
    const select = await screen.findByLabelText('Day 1 activity 1');
    // Open the select and choose Night safari
    await userEvent.click(select);
    const option = await screen.findByText('Night safari');
    await userEvent.click(option);

    // After selection, the pricing inputs should be filled (only Adult/Child now)
    const adultPrice = await screen.findByLabelText('Day 1 activity 1 adult price');
    const childPrice = await screen.findByLabelText('Day 1 activity 1 child price');
    
    // Wait for the pricing to be set
    await waitFor(() => expect((adultPrice as HTMLInputElement).value).toBe('3000'));
    expect((childPrice as HTMLInputElement).value).toBe('4000');
    expect(screen.queryByLabelText('Day 1 activity 1 senior price')).not.toBeInTheDocument();

    // Activity Amount should be 3*3000 + 4*4000 = 25000 (appears twice: activity + section total)
    await waitFor(() => expect(screen.getAllByText('₹25000.00').length).toBeGreaterThanOrEqual(2));

    // Section total at top should also be 25000
    expect(screen.getByText('Sightseeing Total:')).toBeInTheDocument();
  });
});
