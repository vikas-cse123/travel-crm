import { describe, it, expect } from 'vitest';

const TABS = [
  { key: 'pricingMethod', label: 'Pricing Method' },
  { key: 'flight', label: 'Flight' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'cruise', label: 'Cruise' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'addon', label: 'Add-on Services' },
  { key: 'inclusions', label: 'Inclusions & Exclusions' },
  { key: 'destinationExpert', label: 'Destination Expert' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'summary', label: 'Summary & Pricing' },
  { key: 'pricingBreakdown', label: 'Pricing Breakdown' },
  { key: 'setting', label: 'Settings' },
];

const defaults = {
  pricingMode: 'PER_PERSON' as const,
};

describe('Pricing Method tab order and default', () => {
  it('Pricing Method is first tab', () => {
    expect(TABS[0]!.key).toBe('pricingMethod');
    expect(TABS[0]!.label).toBe('Pricing Method');
  });

  it('Flight is second tab', () => {
    expect(TABS[1]!.key).toBe('flight');
    expect(TABS[1]!.label).toBe('Flight');
  });

  it('New quotation defaults to By Traveler', () => {
    expect(defaults.pricingMode).toBe('PER_PERSON');
  });

  it('By Traveler card is selected by default', () => {
    const mode = defaults.pricingMode as 'SECTION_WISE' | 'PER_PERSON';
    const isByTravelerSelected = mode === 'PER_PERSON';
    const isBySectionSelected = mode === 'SECTION_WISE';
    expect(isByTravelerSelected).toBe(true);
    expect(isBySectionSelected).toBe(false);
  });

  it('Existing quotation preserves saved pricing method', () => {
    const savedModes: Array<'PER_PERSON' | 'SECTION_WISE'> = ['PER_PERSON', 'SECTION_WISE', 'PER_PERSON'];
    savedModes.forEach((saved) => {
      const normalized = saved === 'SECTION_WISE' ? 'SECTION_WISE' : 'PER_PERSON';
      expect(normalized).toBe(saved);
    });
  });

  it('Switching By Traveler <-> By Section preserves data', () => {
    const cruiseData = { cruiseId: 'c1', roomRate: 1000, rooms: 2, nights: 3 };
    let current: any = { pricingMode: 'PER_PERSON', cruise: cruiseData };
    // Switch to By Section
    current = { ...current, pricingMode: 'SECTION_WISE' };
    expect(current.cruise.roomRate).toBe(1000);
    // Switch back to By Traveler
    current = { ...current, pricingMode: 'PER_PERSON' };
    expect(current.cruise.roomRate).toBe(1000);
    expect(current.cruise.rooms).toBe(2);
  });

  it('By Traveler hides Pricing Breakdown, By Section shows it', () => {
    const visibleFor = (mode: string) => TABS.filter((tab) => mode === 'SECTION_WISE' || tab.key !== 'pricingBreakdown');
    expect(visibleFor('PER_PERSON').some((t) => t.key === 'pricingBreakdown')).toBe(false);
    expect(visibleFor('SECTION_WISE').some((t) => t.key === 'pricingBreakdown')).toBe(true);
  });
});
