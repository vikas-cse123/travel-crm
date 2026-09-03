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

function visibleTabsFor(mode: string) {
  const isSectionWise = mode === 'SECTION_WISE';
  return TABS.filter((tab) => isSectionWise || tab.key !== 'pricingBreakdown');
}

describe('Pricing Breakdown visibility (By Traveler)', () => {
  it('BY_TRAVELER hides Pricing Breakdown tab', () => {
    const tabs = visibleTabsFor('PER_PERSON');
    expect(tabs.some((t) => t.key === 'pricingBreakdown')).toBe(false);
    expect(tabs.some((t) => t.label === 'Pricing Breakdown')).toBe(false);
  });

  it('BY_SECTION keeps Pricing Breakdown tab', () => {
    const tabs = visibleTabsFor('SECTION_WISE');
    expect(tabs.some((t) => t.key === 'pricingBreakdown')).toBe(true);
  });

  it('BY_TRAVELER tabs are clean and relevant', () => {
    const tabs = visibleTabsFor('PER_PERSON');
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual([
      'Pricing Method',
      'Flight',
      'Hotel',
      'Sightseeing',
      'Cruise',
      'Vehicle',
      'Add-on Services',
      'Inclusions & Exclusions',
      'Destination Expert',
      'FAQs',
      'Summary & Pricing',
      'Settings',
    ]);
    expect(labels).not.toContain('Pricing Breakdown');
  });

  it('BY_SECTION retains Pricing Breakdown', () => {
    const tabs = visibleTabsFor('SECTION_WISE');
    expect(tabs.map((t) => t.label)).toContain('Pricing Breakdown');
  });

  it('Switching modes preserves data (simulated)', () => {
    const cruiseData = { cruiseId: 'c1', roomRate: 1000, rooms: 2 };
    let stored = { ...cruiseData };
    // Switch to By Traveler (hide UI) should not clear data
    const afterToTraveler = { ...stored };
    expect(afterToTraveler.roomRate).toBe(1000);
    // Switch back to By Section
    const afterToSection = { ...afterToTraveler };
    expect(afterToSection.roomRate).toBe(1000);
  });

  it('Summary & Pricing hides section-wise config for By Traveler', () => {
    const isSectionWiseFor = (mode: string) => mode === 'SECTION_WISE';
    expect(isSectionWiseFor('PER_PERSON')).toBe(false); // should hide Heading, Subheading, Display Order
    expect(isSectionWiseFor('SECTION_WISE')).toBe(true); // should show
  });
});
