import { describe, it, expect } from 'vitest';
import { validateQuotationPricing, resolveQuotationPricing } from '@interscale/shared';

const PAX = { adults: 2, childrenWithBed: 1, childrenWithoutBed: 0, infants: 0 };

describe('By Traveler pricing validation (regression)', () => {
  it('BY_TRAVELER + Flight without section price => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        flightDetails: {
          include: true,
          pricingBasis: 'FIXED_TOTAL',
          amount: 0,
          outbound: { segments: [{ flightNumber: 'AI101', from: 'DEL', to: 'SIN', departureDate: '2026-09-01' }] },
        },
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_TRAVELER + Hotel without section price => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 0 }],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_TRAVELER + Sightseeing without priced activities => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: {
          include: true,
          days: [{ activities: [{ name: 'City Tour', pricingOptions: [] }] }],
        },
        services: [],
      },
      quotation: PAX,
    });
    // Should have no sightseeing error under PER_PERSON
    expect(issues.some((i) => i.section === 'sightseeing' && i.severity === 'ERROR')).toBe(false);
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_TRAVELER + Cruise without room rate => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [{ serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.some((i) => i.section === 'cruise')).toBe(false);
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_TRAVELER + Vehicle without pricing => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [{ serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.some((i) => i.section === 'vehicle')).toBe(false);
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_TRAVELER + Add-on without pricing => valid', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 10000,
        perChildWithBedPrice: 8000,
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [{ serviceType: 'OTHER_ADD_ON', quantity: 1, unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('BY_SECTION still correctly validates missing section prices', () => {
    // Flight and hotel missing should error even when sectionTotal is 0
    const flightHotelIssues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: {
          include: true,
          pricingBasis: 'FIXED_TOTAL',
          amount: 0,
          outbound: { segments: [{ flightNumber: 'AI101', from: 'DEL', to: 'SIN' }] },
        },
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 0 }],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(flightHotelIssues.some((i) => i.section === 'flight' && i.severity === 'ERROR')).toBe(true);
    expect(flightHotelIssues.some((i) => i.section === 'hotel' && i.severity === 'ERROR')).toBe(true);

    // Cruise/vehicle missing should error when sectionTotal > 0 (priced hotel makes sectionTotal >0)
    const cruiseVehicleIssues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: null,
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 5000 }],
        sightseeingDetails: null,
        services: [
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 0 },
          { serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 0 },
        ],
      },
      quotation: PAX,
    });
    expect(cruiseVehicleIssues.some((i) => i.section === 'cruise' && i.severity === 'ERROR')).toBe(true);
    expect(cruiseVehicleIssues.some((i) => i.section === 'vehicle' && i.severity === 'ERROR')).toBe(true);
  });

  it('BY_TRAVELER incomplete central pricing => correctly reports central error only', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 0,
        perChildWithBedPrice: 0,
        flightDetails: { include: true, amount: 0, outbound: { segments: [{ flightNumber: 'AI101' }] } },
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', sellingPrice: 0 }],
        sightseeingDetails: { include: true, days: [{ activities: [{ pricingOptions: [] }] }] },
        services: [{ serviceType: 'CRUISE', unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.section).toBe('pricing');
    expect(issues[0]!.severity).toBe('ERROR');
    expect(issues[0]!.message).toMatch(/Traveler pricing is incomplete/);
  });

  it('Finalize allowed when By Traveler pricing is complete', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 40000,
        perChildWithBedPrice: 30000,
        perChildWithoutBedPrice: 20000,
        perInfantPrice: 5000,
        flightDetails: { include: true, amount: 0 },
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', sellingPrice: 0 }],
        sightseeingDetails: { include: true, days: [{ activities: [{ pricingOptions: [] }] }] },
        services: [{ serviceType: 'CRUISE', unitSellingPrice: 0 }],
      },
      quotation: PAX,
    }).filter((i) => i.severity === 'ERROR');
    expect(issues).toEqual([]);
    // Simulate finalize gate: no ERROR means finalize allowed
    const canFinalize = issues.length === 0;
    expect(canFinalize).toBe(true);
    // Also verify grandTotal comes from traveler pricing
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 40000,
        perChildWithBedPrice: 30000,
        perChildWithoutBedPrice: 20000,
        perInfantPrice: 5000,
      },
      quotation: PAX,
    });
    expect(pricing.grandTotal).toBe(40000 * 2 + 30000 * 1);
  });

  it('No section errors appear under BY_TRAVELER even with multiple empty sections', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        perAdultPrice: 15000,
        perChildWithBedPrice: 10000,
        flightDetails: { include: true, amount: 0, outbound: { segments: [{ flightNumber: 'AI101' }] } },
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', sellingPrice: 0 }],
        sightseeingDetails: { include: true, days: [{ activities: [{ pricingOptions: [] }] }] },
        services: [
          { serviceType: 'CRUISE', unitSellingPrice: 0 },
          { serviceType: 'VEHICLE_TRANSFER', unitSellingPrice: 0 },
          { serviceType: 'OTHER_ADD_ON', unitSellingPrice: 0 },
        ],
      },
      quotation: PAX,
    });
    const errorSections = issues.filter((i) => i.severity === 'ERROR').map((i) => i.section);
    expect(errorSections).toEqual([]);
  });
});
