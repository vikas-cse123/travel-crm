import { describe, it, expect } from 'vitest';
import {
  normalizePricingMode,
  calculateSightseeingActivityTotal,
  calculateSightseeingSectionTotal,
  resolveQuotationPricing,
} from '@interscale/shared';

describe('PricingMode', () => {
  it('Per-Person Pricing mode', () => {
    expect(normalizePricingMode('PER_PERSON')).toBe('PER_PERSON');
    expect(normalizePricingMode('per_person')).toBe('PER_PERSON');
  });
  it('Legacy TOTAL / ITEMIZED values map to Per-Person Pricing', () => {
    expect(normalizePricingMode('TOTAL')).toBe('PER_PERSON');
    expect(normalizePricingMode('total')).toBe('PER_PERSON');
    expect(normalizePricingMode('PACKAGE_TOTAL')).toBe('PER_PERSON');
    expect(normalizePricingMode('ITEMIZED')).toBe('PER_PERSON');
  });
  it('Section-wise Pricing mode', () => {
    expect(normalizePricingMode('SECTION_WISE')).toBe('SECTION_WISE');
    expect(normalizePricingMode('section_wise')).toBe('SECTION_WISE');
  });
  it('Existing quotations without pricing mode continue working (Per-Person default)', () => {
    expect(normalizePricingMode(undefined)).toBe('PER_PERSON');
    expect(normalizePricingMode(null)).toBe('PER_PERSON');
    expect(normalizePricingMode('')).toBe('PER_PERSON');
    expect(normalizePricingMode('ITEMIZED')).toBe('PER_PERSON');
  });
});

describe('Sightseeing pricing', () => {
  const pax = { adults: 3, childrenWithBed: 2, childrenWithoutBed: 1, infants: 1 };
  it('Multiple pricing categories work', () => {
    const total = calculateSightseeingActivityTotal(
      [
        { label: 'Adult', price: 5000 },
        { label: 'Child', price: 3500 },
        { label: 'Infant', price: 0 },
      ],
      pax,
    );
    // Adult 3*5000=15000, Child (2+1)=3*3500=10500, Infant 1*0=0 => 25500
    // But Child maps to CWB+CWOB=3, so 15000+10500=25500
    expect(total).toBe(25500);
  });
  it('Custom pricing category can be added', () => {
    const total = calculateSightseeingActivityTotal([{ label: 'Senior', price: 2000 }], pax);
    expect(total).toBe(2000);
  });
  it('Quantity × price calculation works', () => {
    const total = calculateSightseeingActivityTotal([{ label: 'Adult', price: 5000 }], { adults: 3, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 });
    expect(total).toBe(15000);
  });
  it('Multiple sightseeing items calculate correctly', () => {
    const details = {
      days: [
        { activities: [{ pricingOptions: [{ label: 'Adult', price: 5000 }] }] },
        { activities: [{ pricingOptions: [{ label: 'Adult', price: 3000 }] }] },
      ],
    };
    const total = calculateSightseeingSectionTotal(details, { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 });
    expect(total).toBe(16000);
  });
  it('Sightseeing section total is correct', () => {
    const details = {
      days: [
        {
          activities: [
            { pricingOptions: [{ label: 'Adult', price: 5000 }, { label: 'CWB', price: 3000 }] },
          ],
        },
      ],
    };
    const total = calculateSightseeingSectionTotal(details, { adults: 1, childrenWithBed: 2, childrenWithoutBed: 0, infants: 0 });
    expect(total).toBe(5000 + 6000);
  });
});

describe('Section breakdown', () => {
  it('Section totals calculate correctly', () => {
    const pricing = resolveQuotationPricing({
      version: {
        finalAmount: 100000,
        currency: 'INR',
        flightDetails: { include: true, amount: 20000 },
        hotelDetails: { include: true, amount: 35000 },
        sightseeingDetails: { include: true, amount: 15000, days: [] },
        services: [
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 8000, totalSellingPrice: 8000 },
          { serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 7000, totalSellingPrice: 7000 },
          { serviceType: 'SIGHTSEEING', quantity: 1, unitSellingPrice: 0, totalSellingPrice: 0 },
          { serviceType: 'OTHER_ADD_ON', quantity: 1, unitSellingPrice: 5000, totalSellingPrice: 5000, addOnServiceId: 'x' },
        ],
      },
      quotation: { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.sections.find((s) => s.id === 'flight')?.amount).toBe(20000);
    expect(pricing.sections.find((s) => s.id === 'hotel')?.amount).toBe(35000);
    expect(pricing.sections.find((s) => s.id === 'sightseeing')?.amount).toBe(15000);
    expect(pricing.allocatedAmount).toBe(90000);
  });
  it('Remaining amount calculates correctly', () => {
    const pricing = resolveQuotationPricing({
      version: {
        finalAmount: 100000,
        currency: 'INR',
        flightDetails: { amount: 20000 },
        hotelDetails: { amount: 35000 },
        sightseeingDetails: { amount: 15000, days: [] },
        services: [
          { serviceType: 'CRUISE', totalSellingPrice: 8000 },
          { serviceType: 'VEHICLE_TRANSFER', totalSellingPrice: 7000 },
          { addOnServiceId: '1', serviceType: 'OTHER_ADD_ON', totalSellingPrice: 5000 },
        ],
      },
      quotation: { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.remainingAmount).toBe(10000);
    expect(pricing.isOverallocated).toBe(false);
  });
  it('Exact allocation results in zero remaining', () => {
    const pricing = resolveQuotationPricing({
      version: {
        finalAmount: 90000,
        flightDetails: { amount: 20000 },
        hotelDetails: { amount: 35000 },
        services: [
          { serviceType: 'CRUISE', totalSellingPrice: 8000 },
          { serviceType: 'VEHICLE_TRANSFER', totalSellingPrice: 7000 },
          { addOnServiceId: '1', serviceType: 'OTHER_ADD_ON', totalSellingPrice: 20000 },
        ],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    // 20000+35000+8000+7000+20000=90000
    expect(pricing.remainingAmount).toBe(0);
    expect(pricing.isExactlyAllocated).toBe(true);
  });
  it('Over-allocation is detected', () => {
    const pricing = resolveQuotationPricing({
      version: {
        finalAmount: 100000,
        flightDetails: { amount: 50000 },
        hotelDetails: { amount: 60000 },
        services: [],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.isOverallocated).toBe(true);
    expect(pricing.overallocatedAmount).toBe(10000);
  });
  it('Package total is never automatically modified', () => {
    const pricing = resolveQuotationPricing({
      version: { finalAmount: 100000, flightDetails: { amount: 20000 }, hotelDetails: { amount: 35000 }, services: [], sightseeingDetails: { days: [] } },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.packageTotal).toBe(100000);
  });
});

describe('Weblink and PDF pricing mode', () => {
  it('Per-Person Pricing hides section prices (resolver)', () => {
    const pricing = resolveQuotationPricing({
      version: { pricingMode: 'PER_PERSON', finalAmount: 100000, flightDetails: { amount: 20000 }, hotelDetails: { amount: 35000 }, services: [], sightseeingDetails: { days: [] } },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.pricingMode).toBe('PER_PERSON');
    // Package total remains the authoritative number in per-person mode.
    expect(pricing.packageTotal).toBe(100000);
  });
  it('Legacy TOTAL version renders as Per-Person (backward compatible)', () => {
    const pricing = resolveQuotationPricing({
      version: { pricingMode: 'TOTAL', finalAmount: 100000, flightDetails: { amount: 20000 }, hotelDetails: { amount: 35000 }, services: [], sightseeingDetails: { days: [] } },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.pricingMode).toBe('PER_PERSON');
  });
  it('Section-wise displays section prices', () => {
    const pricing = resolveQuotationPricing({
      version: { pricingMode: 'SECTION_WISE', finalAmount: 100000, flightDetails: { amount: 20000 }, hotelDetails: { amount: 35000 }, services: [], sightseeingDetails: { days: [] }, includeVisa: true, visaAmount: 5000, visaServiceCharge: 1000, visaGstPercent: 18, visaVfsCharge: 500 },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.pricingMode).toBe('SECTION_WISE');
    expect(pricing.sections.length).toBe(7);
    // Visa is a single section: amount + service charge (+ GST) + VFS.
    expect(pricing.sections.find((s) => s.id === 'visa')?.amount).toBe(5000 + 1000 + 180 + 500);
  });
});

describe('Section-wise total (sectionTotal)', () => {
  it('sums every section including visa into the grand total', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 0,
        currency: 'INR',
        flightDetails: { include: true, amount: 20000 },
        hotelDetails: { include: true },
        hotels: [
          { hotelName: 'Hotel A', sellingPrice: 15000, selected: true },
          { hotelName: 'Hotel B', sellingPrice: 25000, selected: true },
        ],
        sightseeingDetails: { include: true, amount: 12000, days: [] },
        services: [
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 8000, totalSellingPrice: 8000 },
          { serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 7000, totalSellingPrice: 7000 },
          { serviceType: 'OTHER_ADD_ON', quantity: 1, unitSellingPrice: 5000, totalSellingPrice: 5000, addOnServiceId: 'x' },
        ],
        includeVisa: true,
        visaAmount: 3000,
        visaServiceCharge: 500,
        visaGstPercent: 18,
        visaVfsCharge: 200,
      },
      quotation: { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    // Flight 20000 + Hotels 40000 + Cruise 8000 + Vehicle 7000 + Sightseeing
    // 12000 + Add-on 5000 + Visa (3000+500+90+200=3790) = 95790.
    expect(pricing.sectionTotal).toBe(95790);
    expect(pricing.allocatedAmount).toBe(95790);
    expect(pricing.sections.find((s) => s.id === 'visa')?.amount).toBe(3790);
  });

  it('excludes visa from the section total when the visa section is off', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 0,
        flightDetails: { include: true, amount: 20000 },
        hotelDetails: { include: true, amount: 35000 },
        services: [],
        sightseeingDetails: { days: [] },
        includeVisa: false,
        visaAmount: 9999,
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.sections.find((s) => s.id === 'visa')?.amount).toBe(0);
    expect(pricing.sectionTotal).toBe(55000);
  });

  it('sums multiple services in the same section (two cruises)', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 0,
        flightDetails: { include: true, amount: 0 },
        hotelDetails: { include: true, amount: 0 },
        services: [
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 8000, totalSellingPrice: 8000 },
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 12000, totalSellingPrice: 12000 },
          { serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 7000, totalSellingPrice: 7000 },
        ],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    expect(pricing.sections.find((s) => s.id === 'cruise')?.amount).toBe(20000);
    expect(pricing.sections.find((s) => s.id === 'vehicle')?.amount).toBe(7000);
  });
});

describe('Hotel section multi-item sum', () => {
  it('sums every included hotel stay price into the hotel section', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 100000,
        flightDetails: { amount: 0 },
        hotelDetails: { include: true },
        hotels: [
          { hotelName: 'Hotel A', sellingPrice: 45678, selected: true },
          { hotelName: 'Hotel B', sellingPrice: 453, selected: true },
        ],
        services: [],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    const hotel = pricing.sections.find((s) => s.id === 'hotel');
    expect(hotel?.amount).toBe(46131);
  });

  it('excludes deselected hotels from the section total', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 100000,
        hotelDetails: { include: true },
        hotels: [
          { hotelName: 'Hotel A', sellingPrice: 45678, selected: true },
          { hotelName: 'Hotel B', sellingPrice: 453, selected: false },
        ],
        services: [],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    const hotel = pricing.sections.find((s) => s.id === 'hotel');
    expect(hotel?.amount).toBe(45678);
  });

  it('falls back to hotelDetails.amount when no per-stay hotels array is supplied', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        finalAmount: 100000,
        hotelDetails: { include: true, amount: 35000 },
        services: [],
        sightseeingDetails: { days: [] },
      },
      quotation: { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 },
    });
    const hotel = pricing.sections.find((s) => s.id === 'hotel');
    expect(hotel?.amount).toBe(35000);
  });
});
