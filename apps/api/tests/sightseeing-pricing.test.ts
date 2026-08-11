import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { sightseeingActivitySchema } from '@interscale/shared';
import {
  PDF_BOTTOM_MARGIN,
  PDF_FOOTER_HEIGHT,
  PDF_PAGE_HEIGHT,
  pdfActivityPrices,
  renderQuotationPdf,
} from '../src/modules/quotations/pdf.service.js';

/**
 * Per-activity informational pricing: schema normalisation/validation, and the
 * PDF's rendering plus its page-break measurement.
 *
 * These prices are display-only — nothing here may reach quotation totals.
 */

const parseActivity = (pricingOptions: unknown) =>
  sightseeingActivitySchema.safeParse({ name: 'Singapore Zoo', pricingOptions });

const priced = (pricingOptions: unknown) => {
  const result = parseActivity(pricingOptions);
  if (!result.success) throw new Error(`expected valid: ${result.error.message}`);
  return result.data.pricingOptions;
};

const issuePaths = (pricingOptions: unknown) => {
  const result = parseActivity(pricingOptions);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
};

describe('sightseeing activity pricing — schema', () => {
  it('treats a pre-feature activity with no pricingOptions as empty', () => {
    const result = sightseeingActivitySchema.safeParse({ name: 'Legacy activity' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.pricingOptions).toEqual([]);
  });

  it('persists nothing when every default price is left empty', () => {
    expect(
      priced([
        { label: 'Adult', price: '' },
        { label: 'Child', price: null },
        { label: 'Senior', price: undefined },
      ]),
    ).toEqual([]);
  });

  it('persists Adult only', () => {
    expect(
      priced([
        { label: 'Adult', price: '3500' },
        { label: 'Child', price: '' },
        { label: 'Senior', price: '' },
      ]),
    ).toEqual([{ label: 'Adult', price: 3500 }]);
  });

  it('persists Adult + Child', () => {
    expect(
      priced([
        { label: 'Adult', price: 3500 },
        { label: 'Child', price: 2500 },
        { label: 'Senior', price: '' },
      ]),
    ).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Child', price: 2500 },
    ]);
  });

  it('persists Adult + Child + Senior', () => {
    expect(
      priced([
        { label: 'Adult', price: 3500 },
        { label: 'Child', price: 2500 },
        { label: 'Senior', price: 1800 },
      ]),
    ).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Child', price: 2500 },
      { label: 'Senior', price: 1800 },
    ]);
  });

  it('persists a custom Infant option alongside the defaults', () => {
    expect(
      priced([
        { label: 'Adult', price: 3500 },
        { label: 'Child', price: '' },
        { label: 'Senior', price: '' },
        { label: 'Infant', price: 500 },
      ]),
    ).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('persists several custom options in the order they were added', () => {
    expect(
      priced([
        { label: 'Adult', price: '' },
        { label: 'Child', price: '' },
        { label: 'Senior', price: '' },
        { label: 'Infant', price: 500 },
        { label: 'Foreign National', price: 4500 },
        { label: 'Child 5–12 Years', price: 1500 },
      ]),
    ).toEqual([
      { label: 'Infant', price: 500 },
      { label: 'Foreign National', price: 4500 },
      { label: 'Child 5–12 Years', price: 1500 },
    ]);
  });

  it('trims surrounding whitespace from custom labels', () => {
    expect(priced([{ label: '   Foreign National   ', price: 4500 }])).toEqual([
      { label: 'Foreign National', price: 4500 },
    ]);
  });

  it('drops a removed row without touching the others', () => {
    // The builder removes an entry from the array; nothing else shifts.
    expect(
      priced([
        { label: 'Adult', price: 3500 },
        { label: 'Infant', price: 500 },
      ]),
    ).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('blocks duplicate labels case-insensitively', () => {
    expect(
      issuePaths([
        { label: 'Adult', price: 1000 },
        { label: 'adult', price: 2000 },
      ]),
    ).toEqual(['pricingOptions.1.label']);
    expect(
      issuePaths([
        { label: 'Adult', price: 1000 },
        { label: '  ADULT ', price: 2000 },
      ]),
    ).toEqual(['pricingOptions.1.label']);
  });

  it('blocks negative, NaN-producing and non-finite prices', () => {
    expect(issuePaths([{ label: 'Adult', price: -5 }])).toEqual(['pricingOptions.0.price']);
    expect(issuePaths([{ label: 'Adult', price: Number.POSITIVE_INFINITY }])).toEqual([
      'pricingOptions.0.price',
    ]);
    // Unparseable text is treated as "not filled in" and dropped, never NaN.
    expect(priced([{ label: 'Adult', price: 'abc' }])).toEqual([]);
  });

  it('allows a zero price', () => {
    expect(priced([{ label: 'Infant', price: 0 }])).toEqual([{ label: 'Infant', price: 0 }]);
  });

  it('blocks a custom price entered without a label', () => {
    expect(issuePaths([{ label: '   ', price: 500 }])).toEqual(['pricingOptions.0.label']);
  });

  it('reports issues at the row index the builder rendered', () => {
    // Blank rows keep their slot so inline errors land on the right input.
    expect(
      issuePaths([
        { label: 'Adult', price: '' },
        { label: 'Child', price: '' },
        { label: 'Senior', price: '' },
        { label: '', price: 900 },
      ]),
    ).toEqual(['pricingOptions.3.label']);
  });

  it('normalises a mixed part-filled activity down to the meaningful rows only', () => {
    expect(
      priced([
        { label: 'Adult', price: '' },
        { label: 'Child', price: 2500 },
        { label: 'Senior', price: '' },
        { label: '', price: '' },
      ]),
    ).toEqual([{ label: 'Child', price: 2500 }]);
  });

  it('keeps each activity’s pricing independent', () => {
    const a = priced([{ label: 'Adult', price: 3500 }]);
    const b = priced([{ label: 'Adult', price: 3800 }]);
    expect(a).toEqual([{ label: 'Adult', price: 3500 }]);
    expect(b).toEqual([{ label: 'Adult', price: 3800 }]);
  });
});

describe('sightseeing activity pricing — PDF row selection', () => {
  it('keeps only rows safe to show a customer', () => {
    expect(
      pdfActivityPrices([
        { label: 'Adult', price: 3500 },
        { label: '  ', price: 900 },
        { label: 'Child', price: null },
        { label: 'Senior', price: '' },
        { label: 'Bad', price: -1 },
        { label: 'Worse', price: Number.POSITIVE_INFINITY },
        { label: '  Infant  ', price: '500' },
      ]),
    ).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('returns [] for a pre-feature activity', () => {
    expect(pdfActivityPrices(undefined)).toEqual([]);
    expect(pdfActivityPrices(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

const company = {
  name: 'Alpha Travel',
  email: '',
  phone: null,
  website: null,
  address: null,
  primaryColor: '#2563eb',
  operatingSinceYear: null,
  tripsSold: null,
  tan: null,
  taxRegistrationNumber: null,
  logo: null,
};
const quotation = () => ({
  quotationNumber: 'QT-ACTIVITY-0001',
  customerName: 'Mira Shah',
  customerEmail: null,
  customerPhone: '+91 90000 00000',
  destinationSummary: 'Singapore',
  travelStartDate: null,
  travelEndDate: null,
  adults: 3,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  rooms: 1,
  validUntil: null,
});
const baseVersion = () => ({
  versionNumber: 1,
  title: 'Singapore Escape',
  introduction: null,
  currency: 'INR',
  finalAmount: '100',
  notes: null,
  perAdultPrice: '50',
  perChildWithBedPrice: '0',
  perChildWithoutBedPrice: '0',
  perInfantPrice: '0',
  taxNote: null,
  initialPaymentAmount: '0',
  paymentLink: null,
  inclusionsHtml: null,
  exclusionsHtml: null,
  paymentPolicies: null,
  cancellationPolicies: null,
  bookingTerms: null,
  includeVisa: false,
  visaSectionTitle: null,
  visaAmount: '0',
  visaDestination: null,
  visaType: null,
  visaServiceCharge: '0',
  visaGstPercent: '0',
  visaVfsCharge: '0',
  flightDetails: null,
  sightseeingDetails: null,
  hotels: [],
  itinerary: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
});

const sightseeing = (activities: unknown[]) => ({
  include: true,
  days: [
    {
      dayNumber: 1,
      title: 'Day 1: Singapore highlights',
      city: 'Singapore',
      date: null,
      meals: { breakfast: false, lunch: false, dinner: false },
      mealMode: 'INCLUDE_AT_HOTEL',
      dailyTransfer: 'SHARED',
      activities,
    },
  ],
});

const render = (activities: unknown[]) =>
  renderQuotationPdf({
    company,
    consultant: { name: 'Only Name', phone: null, email: null },
    quotation: quotation(),
    version: { ...baseVersion(), sightseeingDetails: sightseeing(activities) },
  } as Parameters<typeof renderQuotationPdf>[0]);

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';
const visibleText = (buffer: Buffer) =>
  execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
const wordBoxes = (buffer: Buffer) => {
  const bbox = execFileSync('pdftotext', ['-bbox', '-', '-'], {
    input: buffer,
    maxBuffer: 32 * 1024 * 1024,
  }).toString('utf8');
  return [
    ...bbox.matchAll(
      /<word[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>(.*?)<\/word>/g,
    ),
  ].map((m) => ({ text: m[5] ?? '', yBottomFromTop: Number(m[4]) }));
};
/** Every word with its page index and vertical extent, for overlap checks. */
const wordsWithPages = (buffer: Buffer) => {
  const bbox = execFileSync('pdftotext', ['-bbox', '-', '-'], {
    input: buffer,
    maxBuffer: 32 * 1024 * 1024,
  }).toString('utf8');
  return bbox
    .split('<page')
    .slice(1)
    .flatMap((pageXml, page) =>
      [
        ...pageXml.matchAll(
          /<word[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>(.*?)<\/word>/g,
        ),
      ].map((m) => ({
        page,
        text: m[5] ?? '',
        yTop: Number(m[2]),
        yBottom: Number(m[4]),
      })),
    );
};

describe('sightseeing activity pricing — PDF', () => {
  it('renders populated prices with the quotation currency', async () => {
    const pdf = await render([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [
          { label: 'Adult', price: 3500 },
          { label: 'Child', price: 2500 },
        ],
      },
    ]);
    expect(isPdf(pdf)).toBe(true);
    const text = visibleText(pdf);
    expect(text).toContain('PRICING');
    expect(text).toContain('Adult');
    expect(text).toContain('₹3,500');
    expect(text).toContain('Child');
    expect(text).toContain('₹2,500');
  });

  it('renders custom labels exactly as entered', async () => {
    const pdf = await render([
      {
        name: 'Universal Studios',
        description: '<p>Theme park day.</p>',
        pricingOptions: [
          { label: 'Foreign National', price: 4500 },
          { label: 'Child 5–12 Years', price: 1500 },
        ],
      },
    ]);
    const text = visibleText(pdf);
    expect(text).toContain('Foreign National');
    expect(text).toContain('₹4,500');
    expect(text).toContain('Child 5–12 Years');
    expect(text).toContain('₹1,500');
  });

  it('renders nothing pricing-related when an activity has no prices', async () => {
    const pdf = await render([
      { name: 'Singapore Zoo', description: '<p>Meet the animals.</p>' },
      {
        name: 'Gardens by the Bay',
        description: '<p>Evening show.</p>',
        pricingOptions: [],
      },
    ]);
    const text = visibleText(pdf);
    expect(text).toContain('Singapore Zoo');
    expect(text).not.toContain('PRICING');
    expect(text).not.toMatch(/₹\s*0\b/);
  });

  it('drops half-filled rows rather than printing a blank or ₹0 line', async () => {
    const pdf = await render([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [
          { label: 'Adult', price: 3500 },
          { label: 'Child', price: null },
          { label: '', price: 900 },
        ],
      },
    ]);
    const text = visibleText(pdf);
    expect(text).toContain('Adult');
    expect(text).toContain('₹3,500');
    expect(text).not.toContain('Child ₹');
  });

  it('reserves the pricing height so the next activity never overlaps it', async () => {
    const rows = [
      { label: 'Adult', price: 3500 },
      { label: 'Child', price: 2500 },
      { label: 'Senior Citizen Resident Concession', price: 1200 },
      { label: 'Foreign National Weekend Surcharge Rate', price: 4500 },
    ];
    const first = (pricingOptions?: unknown) => ({
      name: 'Zoo',
      description: `<p>${'A long activity description sentence that wraps. '.repeat(12)}</p>`,
      ...(pricingOptions ? { pricingOptions } : {}),
    });
    const second = { name: 'Gardens', description: '<p>Evening show.</p>' };

    const withoutPricing = await render([first(), second]);
    const withPricing = await render([first(rows), second]);

    const findWord = (pdf: Buffer, text: string) =>
      wordsWithPages(pdf).find((word) => word.text === text);

    const before = findWord(withoutPricing, 'Gardens');
    const after = findWord(withPricing, 'Gardens');
    expect(before).toBeDefined();
    expect(after).toBeDefined();

    // The planner reserved room for the pricing: the following activity moved
    // down the page (or onto a later one) rather than being drawn over.
    const movedDown =
      after!.page > before!.page || (after!.page === before!.page && after!.yTop > before!.yTop);
    expect(movedDown).toBe(true);

    // And on the priced render nothing from the pricing block sits at or below
    // where the next activity's heading starts.
    const pricingWords = wordsWithPages(withPricing).filter(
      (word) => word.page === after!.page && /^(PRICING|Adult|Child|₹[\d,]+)$/.test(word.text),
    );
    for (const word of pricingWords) expect(word.yBottom).toBeLessThanOrEqual(after!.yTop);
  });

  it('keeps long wrapped pricing labels above the footer', async () => {
    const longLabels = Array.from({ length: 8 }, (_, i) => ({
      label: `Extremely Long Pricing Category Label Number ${i + 1} For Wrapping`,
      price: 1000 + i,
    }));
    const pdf = await render(
      Array.from({ length: 4 }, (_, i) => ({
        name: `Activity ${i + 1}`,
        description: `<p>${'Long activity description sentence. '.repeat(20)}</p>`,
        pricingOptions: longLabels,
      })),
    );
    expect(isPdf(pdf)).toBe(true);
    const footerTop = PDF_PAGE_HEIGHT - PDF_BOTTOM_MARGIN - PDF_FOOTER_HEIGHT;
    const offender = wordBoxes(pdf).find(
      (word) => word.yBottomFromTop > footerTop && !/^(Page|\d+\/\d+)$/.test(word.text.trim()),
    );
    expect(offender).toBeUndefined();
  });
});
