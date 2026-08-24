import { describe, expect, it } from 'vitest';
import { hotelRateForDate } from './QuotationBuilderPage';

const master = {
  price: 10000,
  seasons: [
    { startDate: '2026-12-20', endDate: '2027-01-05', price: 15000 },
    { startDate: '2026-06-01', endDate: '2026-06-30', price: 9000 },
  ],
};

describe('hotelRateForDate (season-aware hotel pricing)', () => {
  it('picks the season rate matching the travel date', () => {
    expect(hotelRateForDate(master, '2026-12-25')).toBe(15000);
    expect(hotelRateForDate(master, new Date('2027-01-01'))).toBe(15000);
    expect(hotelRateForDate(master, '2026-06-15')).toBe(9000);
  });

  it('falls back to the base price when no season matches', () => {
    expect(hotelRateForDate(master, '2026-09-15')).toBe(10000);
    expect(hotelRateForDate(master, null)).toBe(10000);
  });

  it('prefers a matching season over the base price', () => {
    const cheapBase = { price: 5000, seasons: [{ startDate: '2026-12-20', endDate: '2027-01-05', price: 20000 }] };
    expect(hotelRateForDate(cheapBase, '2026-12-25')).toBe(20000);
  });

  it('ignores seasons with no rate and returns null when the base price is missing', () => {
    const noRates = {
      price: null,
      seasons: [
        { startDate: '2026-12-20', endDate: '2027-01-05', price: null },
        { startDate: '2026-06-01', endDate: '2026-06-30', price: null },
      ],
    };
    expect(hotelRateForDate(noRates, '2026-12-25')).toBeNull();
  });

  it('returns null when there is neither a season nor a base price', () => {
    expect(hotelRateForDate({ price: null, seasons: [] }, '2026-12-25')).toBeNull();
  });
});