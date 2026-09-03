import { describe, it, expect } from 'vitest';
import {
  calculateFlightTotal,
  calculateSightseeingActivityTotal,
  calculateHotelRowTotal,
  filterContributingHotelRows,
  resolveQuotationPricing,
  validateQuotationPricing,
  type PaxCounts,
} from '@interscale/shared';
import { calculatePricing } from '../src/modules/quotations/pricing.service.js';

const PAX: PaxCounts = {
  adults: 3,
  childrenWithBed: 2,
  childrenWithoutBed: 2,
  infants: 1,
};

const round = (value: number) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// Flight pricing
// ---------------------------------------------------------------------------

describe('Flight pricing', () => {
  it('FIXED_TOTAL uses the section amount', () => {
    const flight = { include: true, pricingBasis: 'FIXED_TOTAL', amount: 285966 };
    expect(calculateFlightTotal(flight, PAX)).toBe(285966);
  });

  it('PER_TRAVELER multiplies rates by traveler counts', () => {
    const flight = {
      include: true,
      pricingBasis: 'PER_TRAVELER',
      amount: 0,
      perTraveler: {
        adult: 25000,
        childWithBed: 20000,
        childWithoutBed: 15000,
        infant: 5000,
      },
    };
    // 3Ã—25000 + 2Ã—20000 + 2Ã—15000 + 1Ã—5000 = 150000
    expect(calculateFlightTotal(flight, PAX)).toBe(150000);
  });

  it('PER_TRAVELER falls back to the fixed amount when no rates are entered', () => {
    const flight = { include: true, pricingBasis: 'PER_TRAVELER', amount: 50000, perTraveler: {} };
    expect(calculateFlightTotal(flight, PAX)).toBe(50000);
  });

  it('excluded flight section contributes zero', () => {
    expect(
      calculateFlightTotal({ include: false, pricingBasis: 'FIXED_TOTAL', amount: 50000 }, PAX),
    ).toBe(0);
  });

  it('image-mode quotations price as FIXED_TOTAL', () => {
    expect(
      calculateFlightTotal(
        { include: true, entryMode: 'IMAGE', pricingBasis: 'FIXED_TOTAL', amount: 120000 },
        PAX,
      ),
    ).toBe(120000);
  });
});

// ---------------------------------------------------------------------------
// Hotel pricing
// ---------------------------------------------------------------------------

describe('Hotel pricing', () => {
  const masterStay = {
    hotelName: 'Hotel Boss Singapore',
    nights: 5,
    selected: true,
    roomLines: [
      {
        roomType: 'Superior Room',
        rooms: 2,
        baseRoomPrice: 1500,
        extraBedQuantity: 2,
        extraBedPrice: 500,
        childWithoutBedQuantity: 2,
        childWithoutBedPrice: 400,
      },
    ],
  };

  it('monthly rate snapshot: rooms + extra beds + children without bed Ã— nights', () => {
    // 2Ã—1500Ã—5 + 2Ã—500Ã—5 + 2Ã—400Ã—5 = 15000 + 5000 + 4000
    const totals = calculateHotelRowTotal(masterStay);
    expect(totals.roomTotal).toBe(24000);
    expect(totals.total).toBe(24000);
  });

  it('meal plan lines are added on top of the room total', () => {
    const withMeals = {
      ...masterStay,
      mealPlanLines: [{ mealPlan: 'Breakfast', sellingPrice: 10500 }],
    };
    const totals = calculateHotelRowTotal(withMeals);
    expect(totals.mealTotal).toBe(10500);
    expect(totals.total).toBe(34500);
  });

  it('manual override is preserved when structured lines price to zero', () => {
    const overridden = { hotelName: 'Override', sellingPrice: 26000, roomLines: [] };
    expect(calculateHotelRowTotal(overridden).total).toBe(26000);
    // The calculated figure is kept alongside the override:
    const calculated = { ...masterStay, sellingPrice: 26000 };
    expect(calculateHotelRowTotal(calculated).total).toBe(24000);
  });

  it('alternative options never add together â€” only the selected one contributes', () => {
    const optionA = { hotelName: 'Hotel Boss', optionGroupId: 'A', selected: true, sellingPrice: 24000 };
    const optionB = { hotelName: 'Furama', optionGroupId: 'A', selected: false, sellingPrice: 29000 };
    expect(filterContributingHotelRows([optionA, optionB])).toEqual([optionA]);

    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: true },
        hotels: [optionA, optionB],
        sightseeingDetails: { days: [] },
        services: [],
      },
      quotation: PAX,
    });
    expect(pricing.sections.find((s) => s.id === 'hotel')?.amount).toBe(24000);
  });

  it('a group with no explicit selection falls back to its first option', () => {
    const a = { hotelName: 'A', optionGroupId: 'A', selected: true, sellingPrice: 24000 };
    const b = { hotelName: 'B', optionGroupId: 'A', sellingPrice: 29000 };
    expect(filterContributingHotelRows([b, a])).toEqual([b]);
  });

  it('consecutive hotel stays add together', () => {
    const stay1 = { hotelName: 'Hotel Boss', nights: 2, sellingPrice: 10000 };
    const stay2 = { hotelName: 'Furama', nights: 3, sellingPrice: 15000 };
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: true },
        hotels: [stay1, stay2],
        sightseeingDetails: { days: [] },
        services: [],
      },
      quotation: PAX,
    });
    expect(pricing.sections.find((s) => s.id === 'hotel')?.amount).toBe(25000);
  });

  it('disabled hotel section contributes zero but keeps its configuration', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: false, amount: 24000 },
        hotels: [{ hotelName: 'Hotel Boss', sellingPrice: 24000 }],
        sightseeingDetails: { days: [] },
        services: [],
      },
      quotation: PAX,
    });
    expect(pricing.sections.find((s) => s.id === 'hotel')?.amount).toBe(0);
  });

  it('disabled sightseeing section contributes zero but keeps its configuration', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: {
          include: false,
          amount: 0,
          days: [
            {
              activities: [{ pricingOptions: [{ label: 'Adult', price: 5000 }] }],
            },
          ],
        },
        services: [{ serviceType: 'SIGHTSEEING', quantity: 2, unitSellingPrice: 1000 }],
        addOnDetails: { include: true },
      },
      quotation: PAX,
    });
    expect(pricing.sections.find((s) => s.id === 'sightseeing')?.amount).toBe(0);
    expect(pricing.sectionTotal).toBe(0);
  });

  it('disabled add-on section contributes zero but keeps its rows', () => {
    const version = {
      pricingMode: 'SECTION_WISE' as const,
      hotelDetails: null,
      hotels: [],
      sightseeingDetails: { days: [] },
      addOnDetails: { include: false },
      services: [
        { addOnServiceId: 'a1', serviceType: 'OTHER_ADD_ON', quantity: 2, unitSellingPrice: 2750 },
        { serviceType: 'TRAVEL_INSURANCE', quantity: 1, unitSellingPrice: 900 },
      ],
    };
    const pricing = resolveQuotationPricing({ version, quotation: PAX });
    expect(pricing.sections.find((s) => s.id === 'addon')?.amount).toBe(0);
    expect(pricing.sectionTotal).toBe(0);
    // Backend parity: disabled add-on rows contribute ₹0 to stored totals too.
    const result = calculatePricing({
      pricingMode: 'SECTION_WISE',
      hotels: [],
      services: version.services,
      sightseeingDetails: version.sightseeingDetails,
      addOnDetails: version.addOnDetails,
      markupMode: 'NONE',
      markupValue: 0,
      taxRate: 0,
      discountAmount: 0,
      pax: PAX,
    });
    expect(Number(result.finalAmount)).toBe(0);
    expect(Number(result.subtotalCost)).toBe(0);
    // Re-enabling the section restores the exact same configuration's price.
    const reEnabled = resolveQuotationPricing({
      version: { ...version, addOnDetails: { include: true } },
      quotation: PAX,
    });
    expect(reEnabled.sections.find((s) => s.id === 'addon')?.amount).toBe(6400);
  });

  it('disabled flight section zeroes flight service rows as well', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: { include: false, pricingBasis: 'FIXED_TOTAL' as const, amount: 100000 },
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: { days: [] },
        services: [{ serviceType: 'FLIGHT', quantity: 2, unitSellingPrice: 30000 }],
      },
      quotation: PAX,
    });
    expect(pricing.sections.find((s) => s.id === 'flight')?.amount).toBe(0);
    expect(pricing.sectionTotal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sightseeing pricing bases
// ---------------------------------------------------------------------------

describe('Sightseeing pricing', () => {
  it('PER_TRAVELER multiplies label-matched rates by traveler counts', () => {
    const total = calculateSightseeingActivityTotal(
      [
        { label: 'Adult', price: 3000 },
        { label: 'Child', price: 4000 },
      ],
      { adults: 3, childrenWithBed: 2, childrenWithoutBed: 2, infants: 0 },
    );
    // 3Ã—3000 + 4Ã—4000 (Child = CWB + CWOB)
    expect(total).toBe(25000);
  });

  it('PER_GROUP multiplies by quantity, never by traveler counts', () => {
    const total = calculateSightseeingActivityTotal(
      [{ label: 'Group', price: 15000 }],
      PAX,
      { pricingBasis: 'PER_GROUP', pricingQuantity: 1 },
    );
    expect(total).toBe(15000);
  });

  it('PER_VEHICLE multiplies the vehicle rate by the vehicle count', () => {
    const total = calculateSightseeingActivityTotal(
      [{ label: 'Vehicle', price: 8000 }],
      PAX,
      { pricingBasis: 'PER_VEHICLE', pricingQuantity: 2 },
    );
    expect(total).toBe(16000);
  });

  it('FIXED prices once regardless of pax', () => {
    const total = calculateSightseeingActivityTotal([{ label: 'Total', price: 20000 }], PAX, {
      pricingBasis: 'FIXED',
      pricingQuantity: null,
    });
    expect(total).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// Section-wise vs traveler-wise â€” no double counting
// ---------------------------------------------------------------------------

const sectionVersion = {
  pricingMode: 'SECTION_WISE' as const,
  currency: 'INR',
  flightDetails: { include: true, pricingBasis: 'FIXED_TOTAL' as const, amount: 285966 },
  hotelDetails: { include: true },
  hotels: [{ hotelName: 'Hotel Boss', selected: true, sellingPrice: 24000 }],
  sightseeingDetails: {
    include: true,
    days: [
      {
        activities: [
          {
            pricingOptions: [
              { label: 'Adult', price: 5000 },
              { label: 'Child', price: 5000 },
            ],
          },
        ],
      },
    ],
  },
  services: [
    { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 82000, totalSellingPrice: 82000 },
    { serviceType: 'VEHICLE_TRANSFER', quantity: 3, unitSellingPrice: 5000 },
    { addOnServiceId: 'a1', serviceType: 'OTHER_ADD_ON', quantity: 2, unitSellingPrice: 2750 },
  ],
  includeVisa: false,
};

describe('No double counting between pricing methods', () => {
  it('SECTION mode: the grand total comes from sections only', () => {
    // Flight 285966 + Hotel 24000 + Sightseeing 35000 + Cruise 82000 +
    // Vehicle 15000 + Add-ons 5500 = 447466
    const pricing = resolveQuotationPricing({
      version: sectionVersion,
      quotation: PAX,
    });
    expect(pricing.pricingMode).toBe('SECTION_WISE');
    expect(pricing.sectionTotal).toBe(447466);
    expect(pricing.grandTotal).toBe(447466);
    // The traveler-wise package prices are NOT added on top.
    expect(pricing.travelerPricing.subtotal).toBe(0);
  });

  it('TRAVELER mode: the grand total comes from per-traveler prices only', () => {
    const pricing = resolveQuotationPricing({
      version: {
        ...sectionVersion,
        pricingMode: 'PER_PERSON',
        perAdultPrice: 40000,
        perChildWithBedPrice: 30000,
        perChildWithoutBedPrice: 20000,
        perInfantPrice: 5000,
      },
      quotation: PAX,
    });
    // 3Ã—40000 + 2Ã—30000 + 2Ã—20000 + 1Ã—5000 = 225000 â€” never 447466 + 225000.
    expect(pricing.pricingMode).toBe('PER_PERSON');
    expect(pricing.travelerPricing.subtotal).toBe(225000);
    expect(pricing.grandTotal).toBe(225000);
  });

  it('discount and tax are applied exactly once to the active method', () => {
    const pricing = resolveQuotationPricing({
      version: {
        ...sectionVersion,
        discountAmount: 10000,
        taxRate: 18,
      },
      quotation: PAX,
    });
    // (447466 âˆ’ 10000) Ã— 0.18 = 76943.88 â†’ 504409.88
    expect(pricing.taxableAmount).toBe(437466);
    expect(pricing.taxAmount).toBe(78743.88);
    expect(pricing.grandTotal).toBe(516209.88);
  });

  it('switching methods preserves the other configuration and flips the total', () => {
    const travelerVersion = {
      ...sectionVersion,
      pricingMode: 'PER_PERSON' as const,
      perAdultPrice: 40000,
      perChildWithBedPrice: 30000,
      perChildWithoutBedPrice: 20000,
      perInfantPrice: 5000,
    };
    const before = resolveQuotationPricing({ version: travelerVersion, quotation: PAX });
    const after = resolveQuotationPricing({
      version: { ...travelerVersion, pricingMode: 'SECTION_WISE' },
      quotation: PAX,
    });
    expect(before.grandTotal).toBe(225000);
    expect(after.grandTotal).toBe(447466);
    // Section configuration is still present after reading the traveler total.
    expect(after.sections.find((s) => s.id === 'flight')?.amount).toBe(285966);
  });
});

// ---------------------------------------------------------------------------
// Backend authoritative engine parity
// ---------------------------------------------------------------------------

describe('Backend calculatePricing (authoritative)', () => {
  it('matches the shared section total for the full spec example', () => {
    const result = calculatePricing({
      pricingMode: 'SECTION_WISE',
      hotels: [{ internalCost: 20000, sellingPrice: 24000, nights: 5 }],
      services: [
        { serviceType: 'CRUISE', quantity: 1, sellingPrice: 82000 },
        { serviceType: 'VEHICLE_TRANSFER', quantity: 3, sellingPrice: 5000 },
        { serviceType: 'OTHER_ADD_ON', quantity: 2, sellingPrice: 2750 },
      ],
      flightDetails: sectionVersion.flightDetails,
      sightseeingDetails: sectionVersion.sightseeingDetails,
      includeVisa: false,
      markupMode: 'NONE',
      markupValue: 0,
      taxRate: 0,
      discountAmount: 0,
      pax: PAX,
    });
    expect(Number(result.finalAmount)).toBe(447466);
    expect(Number(result.subtotalSellingPrice)).toBe(447466);
    expect(Number(result.marginAmount)).toBe(447466 - 20000);
  });

  it('traveler-wise totals apply discount and tax once', () => {
    const result = calculatePricing({
      pricingMode: 'PER_PERSON',
      hotels: [{ internalCost: 20000, sellingPrice: 24000 }],
      services: [],
      perAdultPrice: 40000,
      perChildWithBedPrice: 30000,
      perChildWithoutBedPrice: 20000,
      perInfantPrice: 5000,
      netAmount: 180000,
      taxRate: 10,
      discountAmount: 5000,
      markupMode: 'NONE',
      markupValue: 0,
      pax: PAX,
    });
    // (225000 âˆ’ 5000) Ã— 1.10 = 242000; margin = 220000 âˆ’ 180000 = 40000
    expect(Number(result.finalAmount)).toBe(242000);
    expect(Number(result.taxAmount)).toBe(22000);
    expect(Number(result.discountAmount)).toBe(5000);
    expect(Number(result.marginAmount)).toBe(40000);
    // Section prices must NOT be added: subtotal selling is the package total.
    expect(Number(result.subtotalSellingPrice)).toBe(225000);
  });

  it('zero selling price yields zero margin, never negative surprises', () => {
    const result = calculatePricing({
      hotels: [{ internalCost: 1000, sellingPrice: 0 }],
      services: [],
      markupMode: 'NONE',
      markupValue: 0,
      taxRate: 0,
      discountAmount: 0,
      pax: PAX,
    });
    expect(Number(result.finalAmount)).toBe(0);
    expect(Number(result.marginAmount)).toBe(-1000);
    expect(Number(result.marginPercentage)).toBe(0);
  });

  it('currency-safe decimal totals with markup, discount and tax', () => {
    const result = calculatePricing({
      hotels: [
        { internalCost: 10000.1, sellingPrice: 12500.25, nights: 4 },
      ],
      services: [
        { serviceType: 'SIGHTSEEING', quantity: 2, internalCost: 500.15, sellingPrice: 750.25 },
      ],
      markupMode: 'PERCENTAGE',
      markupValue: 10,
      taxRate: 5,
      discountAmount: 100,
      pax: PAX,
    });
    // Historical regression guard: decimal-safe half-up rounding at 2dp.
    expect(result.finalAmount.toString()).toBe('16065.87');
  });
});

// ---------------------------------------------------------------------------
// Pricing completeness validation
// ---------------------------------------------------------------------------

describe('validateQuotationPricing', () => {
  it('flags an enabled flight section with real segments but no selling price', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: {
          include: true,
          pricingBasis: 'FIXED_TOTAL',
          amount: 0,
          outbound: { segments: [{ flightNumber: 'AI101', from: 'DEL', to: 'SIN' }] },
        },
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR' && issue.section === 'flight')).toBe(
      true,
    );
  });

  it('does not flag image-mode or skeleton flight sections', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: { include: true, entryMode: 'IMAGE', pricingBasis: 'FIXED_TOTAL', amount: 0 },
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.filter((issue) => issue.severity === 'ERROR')).toEqual([]);
  });

  it('flags an enabled hotel section without prices', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 0 }],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR' && issue.section === 'hotel')).toBe(
      true,
    );
  });

  it('flags a cruise service row without a price in a section-priced quotation', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 5000 }],
        sightseeingDetails: null,
        services: [{ serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR' && issue.section === 'cruise')).toBe(
      true,
    );
  });

  it('does not flag lead-seeded zero-priced placeholder rows in an unpriced quotation', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [
          { serviceType: 'CRUISE', quantity: 1, unitSellingPrice: 0 },
          { serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 0 },
        ],
      },
      quotation: PAX,
    });
    expect(issues.filter((issue) => issue.severity === 'ERROR')).toEqual([]);
  });

  it('flags a vehicle service row without a price', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: { include: true },
        hotels: [{ hotelName: 'X', selected: true, sellingPrice: 5000 }],
        sightseeingDetails: null,
        services: [{ serviceType: 'VEHICLE_TRANSFER', quantity: 1, unitSellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR' && issue.section === 'vehicle')).toBe(
      true,
    );
  });

  it('flags traveler mode with configured sections but no prices', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        flightDetails: {
          include: true,
          pricingBasis: 'FIXED_TOTAL',
          amount: 0,
          outbound: { segments: [{ flightNumber: 'AI101', from: 'DEL', to: 'SIN' }] },
        },
        hotelDetails: null,
        hotels: [],
        services: [],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR')).toBe(true);
  });

  it('a fully empty draft only warns â€” legacy finalize flows keep working', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        hotelDetails: null,
        hotels: [],
        services: [{ serviceType: 'HOTEL', quantity: 1, sellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.every((issue) => issue.severity === 'WARNING')).toBe(true);
  });

  it('empty PER_PERSON draft errors with traveler pricing incomplete', () => {
    const issues = validateQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        hotelDetails: null,
        hotels: [],
        services: [{ serviceType: 'HOTEL', quantity: 1, sellingPrice: 0 }],
      },
      quotation: PAX,
    });
    expect(issues.some((issue) => issue.severity === 'ERROR' && issue.section === 'pricing')).toBe(true);
    expect(issues.every((issue) => issue.section === 'pricing')).toBe(true);
    expect(issues[0]!.message).toMatch(/Traveler pricing is incomplete/);
  });

  it('a fully priced section quotation passes with no errors', () => {
    const issues = validateQuotationPricing({
      version: sectionVersion,
      quotation: PAX,
    });
    expect(issues.filter((issue) => issue.severity === 'ERROR')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Legacy compatibility
// ---------------------------------------------------------------------------

describe('Legacy quotation compatibility', () => {
  it('a legacy amount-only quotation keeps its stored total as the grand total', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'PER_PERSON',
        finalAmount: 16065.87,
        currency: 'INR',
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [],
      },
      quotation: PAX,
    });
    expect(pricing.packageTotal).toBe(16065.87);
    expect(pricing.grandTotal).toBe(16065.87);
  });

  it('rounding stays at 2 decimals through the pipeline', () => {
    const pricing = resolveQuotationPricing({
      version: {
        pricingMode: 'SECTION_WISE',
        flightDetails: { include: true, pricingBasis: 'FIXED_TOTAL', amount: 100.005 },
        hotelDetails: null,
        hotels: [],
        sightseeingDetails: null,
        services: [],
        includeVisa: false,
        discountAmount: 0.01,
        taxRate: 18,
      },
      quotation: PAX,
    });
    expect(round(pricing.sectionTotal)).toBe(100.01);
    expect(round(pricing.grandTotal)).toBe(round(pricing.taxableAmount + pricing.taxAmount));
  });
});
