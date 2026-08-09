import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { quotationVersionInputSchema, type QuotationVersionInput } from '@interscale/shared';
import {
  SightseeingSection,
  emptySightseeingActivity,
  emptySightseeingDay,
  withDefaultPricingRows,
  withSightseeingPricingRows,
} from './SightseeingSection';

/**
 * Per-activity pricing in the Quotation Builder.
 *
 * Adult/Child/Senior are default UI rows over the same `pricingOptions` array
 * every custom row lives in — nothing here is a separate persisted field.
 */

vi.mock('@/features/masters/masters.api', () => ({
  useSightseeingActivities: () => ({ data: { activities: [] }, isLoading: false, isError: false }),
  useSightseeingPresentations: () => ({ data: {}, isLoading: false, isError: false }),
}));

let latestValues: QuotationVersionInput | null = null;

function Harness({ days }: { days?: unknown[] }) {
  const form = useForm<QuotationVersionInput>({
    // Only the sightseeing slice matters here; the section reads nothing else.
    defaultValues: {
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: 0,
        description: null,
        days: (days ?? [emptySightseeingDay(1)]) as never,
      },
    } as unknown as QuotationVersionInput,
  });
  latestValues = form.watch();
  return <SightseeingSection form={form} destination="Singapore" />;
}

/** Run the real schema over the harness's current form state. */
const savedActivities = () => {
  const details = latestValues?.sightseeingDetails;
  const parsed = quotationVersionInputSchema
    .innerType()
    .shape.sightseeingDetails.safeParse(details);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  return { ok: true as const, days: parsed.data?.days ?? [] };
};

const priceInput = (activity: number, label: string) =>
  screen.getByLabelText(`Day 1 activity ${activity} ${label} price`);

describe('builder — activity pricing defaults', () => {
  it('shows Adult/Child/Senior price inputs on a new activity, all empty', async () => {
    render(<Harness />);
    expect(screen.getByText('Activity Pricing')).toBeInTheDocument();
    for (const label of ['adult', 'child', 'senior']) {
      expect(priceInput(1, label)).toHaveValue(null);
    }
  });

  it('saves nothing when every default price is left empty', async () => {
    render(<Harness />);
    const saved = savedActivities();
    expect(saved.ok).toBe(true);
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([]);
  });

  it('saves only the default rows the user filled in', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
    ]);
  });

  it('saves Adult + Child together', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.type(priceInput(1, 'child'), '2500');
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Child', price: 2500 },
    ]);
  });
});

describe('builder — custom price options', () => {
  it('adds a custom Infant option', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.type(
      screen.getByLabelText('Day 1 activity 1 price option 1 label'),
      'Infant',
    );
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 price'), '500');
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('adds several custom options', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.type(
      screen.getByLabelText('Day 1 activity 1 price option 1 label'),
      'Infant',
    );
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 price'), '500');
    await userEvent.type(
      screen.getByLabelText('Day 1 activity 1 price option 2 label'),
      'Foreign National',
    );
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 2 price'), '4500');
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Infant', price: 500 },
      { label: 'Foreign National', price: 4500 },
    ]);
  });

  it('removes only the custom row, leaving the activity intact', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.type(
      screen.getByLabelText('Day 1 activity 1 price option 1 label'),
      'Infant',
    );
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 price'), '500');

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Day 1 activity 1 price option 1' }),
    );

    expect(
      screen.queryByLabelText('Day 1 activity 1 price option 1 label'),
    ).not.toBeInTheDocument();
    // The activity itself, its transfer and its default prices all survive.
    expect(screen.getByLabelText('Day 1 activity 1 name')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Day 1 activity 1 daily transfer Shared Transfer'),
    ).toBeInTheDocument();
    expect(priceInput(1, 'adult')).toHaveValue(3500);
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
    ]);
  });
});

describe('builder — pricing validation', () => {
  it('blocks a duplicate label, case-insensitively', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 label'), 'adult');
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 price'), '4000');
    const saved = savedActivities();
    expect(saved.ok).toBe(false);
    expect(!saved.ok && saved.issues.map((i) => i.message)).toContain(
      '"adult" is already priced on this activity.',
    );
  });

  it('blocks a negative price', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '-5');
    const saved = savedActivities();
    expect(saved.ok).toBe(false);
    expect(!saved.ok && saved.issues.map((i) => i.message)).toContain(
      'Enter a price of 0 or more.',
    );
  });

  it('blocks a custom price entered without a label', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add Price Option' }));
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 price option 1 price'), '500');
    const saved = savedActivities();
    expect(saved.ok).toBe(false);
    expect(!saved.ok && saved.issues.map((i) => i.message)).toContain(
      'Add a label for this price.',
    );
  });
});

describe('builder — multiple activities and reopening', () => {
  it('keeps each activity’s pricing separate', async () => {
    render(
      <Harness
        days={[
          emptySightseeingDay(1, {
            activities: [emptySightseeingActivity(), emptySightseeingActivity()],
          }),
        ]}
      />,
    );
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.type(priceInput(2, 'adult'), '3800');
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
    ]);
    expect(saved.ok && saved.days[0]?.activities[1]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3800 },
    ]);
  });

  it('reopens a saved activity with its prices in the default boxes', async () => {
    const reopened = withSightseeingPricingRows({
      include: true,
      days: [
        {
          ...emptySightseeingDay(1),
          activities: [
            {
              ...emptySightseeingActivity(),
              name: 'Singapore Zoo',
              pricingOptions: [
                { label: 'Adult', price: 3500 },
                { label: 'Infant', price: 500 },
              ],
            },
          ],
        },
      ],
    });
    render(<Harness days={reopened.days} />);
    expect(priceInput(1, 'adult')).toHaveValue(3500);
    expect(priceInput(1, 'child')).toHaveValue(null);
    expect(screen.getByLabelText('Day 1 activity 1 price option 1 label')).toHaveValue('Infant');
    expect(screen.getByLabelText('Day 1 activity 1 price option 1 price')).toHaveValue(500);
  });

  it('opens a pre-feature activity with blank default boxes and no custom rows', () => {
    const legacyDay = {
      ...emptySightseeingDay(1),
      activities: [{ sightseeingId: null, name: 'Legacy activity', startTime: '09:00' }],
    };
    const prepared = withSightseeingPricingRows({ include: true, days: [legacyDay] });
    render(<Harness days={prepared.days} />);
    for (const label of ['adult', 'child', 'senior']) {
      expect(priceInput(1, label)).toHaveValue(null);
    }
    expect(
      screen.queryByLabelText('Day 1 activity 1 price option 1 label'),
    ).not.toBeInTheDocument();
  });

  it('does not lose pricing when another field on the activity changes', async () => {
    render(<Harness />);
    await userEvent.type(priceInput(1, 'adult'), '3500');
    await userEvent.type(screen.getByLabelText('Day 1 activity 1 name'), 'Singapore Zoo');
    await userEvent.click(
      screen.getByLabelText('Day 1 activity 1 daily transfer Private Transfer'),
    );
    const saved = savedActivities();
    expect(saved.ok && saved.days[0]?.activities[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
    ]);
    expect(saved.ok && saved.days[0]?.activities[0]?.name).toBe('Singapore Zoo');
    expect(saved.ok && saved.days[0]?.activities[0]?.dailyTransfer).toBe('PRIVATE');
  });
});

describe('withDefaultPricingRows', () => {
  it('adds the three defaults in order and keeps saved custom rows after them', () => {
    expect(
      withDefaultPricingRows([
        { label: 'Infant', price: 500 },
        { label: 'Senior', price: 1200 },
      ] as never),
    ).toEqual([
      { label: 'Adult', price: null },
      { label: 'Child', price: null },
      { label: 'Senior', price: 1200 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('gives a pre-feature activity three blank defaults', () => {
    expect(withDefaultPricingRows(undefined)).toEqual([
      { label: 'Adult', price: null },
      { label: 'Child', price: null },
      { label: 'Senior', price: null },
    ]);
  });
});

describe('activity pricing markup', () => {
  it('stacks the three default prices in one column on phones', () => {
    render(<Harness />);
    const grid = screen.getByText('Activity Pricing').nextElementSibling as HTMLElement;
    expect(grid.className).toContain('grid');
    // One column by default; three only from the sm breakpoint up.
    expect(grid.className).toContain('sm:grid-cols-3');
    expect(within(grid).getAllByRole('spinbutton')).toHaveLength(3);
  });
});
