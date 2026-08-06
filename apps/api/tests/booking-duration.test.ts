import { describe, expect, it } from 'vitest';
import {
  durationLabelForNights,
  nightsBetweenDates,
  resolveBookingDuration,
  toIsoDay,
} from '../src/modules/bookings/booking-duration.js';

describe('resolveBookingDuration', () => {
  it('uses the selected version snapshot travel dates first', () => {
    const result = resolveBookingDuration(
      {
        travelStartDate: new Date('2026-11-13T00:00:00.000Z'),
        travelEndDate: new Date('2026-11-18T00:00:00.000Z'),
      },
      { travelStartDate: '2026-01-01', travelEndDate: '2026-01-05' },
      { travelStartDate: '2026-02-01', travelEndDate: '2026-02-03' },
    );
    expect(result).toEqual({
      travelStart: '2026-11-13',
      travelEnd: '2026-11-18',
      totalNights: 5,
      totalDays: 6,
      durationLabel: '5 Nights / 6 Days',
    });
  });

  it('falls back to quotation dates when the version snapshot has no dates', () => {
    const result = resolveBookingDuration(
      { travelStartDate: null, travelEndDate: null },
      { travelStartDate: '2026-10-10', travelEndDate: '2026-10-14' },
      { travelStartDate: '2026-09-01', travelEndDate: '2026-09-02' },
    );
    expect(result.durationLabel).toBe('4 Nights / 5 Days');
  });

  it('derives nights from the version stay-night allocations when dates are incomplete', () => {
    // Real scenario: version has a start date but no end date; hotels carry the
    // 5-night window (13 Nov -> 18 Nov 2026).
    const result = resolveBookingDuration(
      {
        travelStartDate: '2026-11-13',
        travelEndDate: null,
        hotels: [
          {
            checkInDate: '2026-11-13',
            checkOutDate: '2026-11-18',
            nights: 5,
            selected: true,
          },
        ],
      },
      { travelStartDate: '2026-11-13', travelEndDate: null },
      { travelStartDate: '2026-11-13', travelEndDate: null },
    );
    expect(result.totalNights).toBe(5);
    expect(result.durationLabel).toBe('5 Nights / 6 Days');
    // Travel window comes from the best available edges (hotel checkout).
    expect(result.travelStart).toBe('2026-11-13');
    expect(result.travelEnd).toBe('2026-11-18');
  });

  it('uses the version hotel nights field when check-in/check-out are absent', () => {
    const result = resolveBookingDuration(
      {
        travelStartDate: null,
        travelEndDate: null,
        hotels: [{ nights: 5, selected: true }],
      },
      {},
      { travelStartDate: '2026-02-01', travelEndDate: '2026-02-03' },
    );
    expect(result.durationLabel).toBe('5 Nights / 6 Days');
  });

  it('ignores unselected hotels', () => {
    const result = resolveBookingDuration(
      {
        travelStartDate: null,
        travelEndDate: null,
        hotels: [
          { nights: 5, selected: false },
          { nights: 2, selected: true },
        ],
      },
      {},
      {},
    );
    expect(result.durationLabel).toBe('2 Nights / 3 Days');
  });

  it('derives days from a genuine multi-day itinerary', () => {
    const result = resolveBookingDuration(
      {
        travelStartDate: null,
        travelEndDate: null,
        hotels: [],
        itineraryDays: [{ dayNumber: 1 }, { dayNumber: 2 }, { dayNumber: 3 }, { dayNumber: 4 }],
      },
      {},
      {},
    );
    expect(result.durationLabel).toBe('3 Nights / 4 Days');
  });

  it('does not treat a single imported itinerary row as the trip length', () => {
    const result = resolveBookingDuration(
      { travelStartDate: null, travelEndDate: null, hotels: [], itineraryDays: [{ dayNumber: 1 }] },
      {},
      {},
    );
    expect(result.totalNights).toBeNull();
  });

  it('falls back to lead travel dates only when quotation data is genuinely absent', () => {
    const result = resolveBookingDuration(
      {},
      {},
      { travelStartDate: '2026-10-10', travelEndDate: '2026-10-14' },
    );
    expect(result.durationLabel).toBe('4 Nights / 5 Days');
  });

  it('prefers the version over stale lead dates', () => {
    const result = resolveBookingDuration(
      { travelStartDate: '2026-11-13', travelEndDate: '2026-11-18' },
      {},
      { travelStartDate: '2020-01-01', travelEndDate: '2020-01-02' },
    );
    expect(result.durationLabel).toBe('5 Nights / 6 Days');
  });

  it('handles same-day travel', () => {
    const result = resolveBookingDuration(
      { travelStartDate: '2026-10-10', travelEndDate: '2026-10-10' },
      {},
      {},
    );
    expect(result.durationLabel).toBe('0 Nights / 1 Day');
  });

  it('skips reversed dates and continues to the next source', () => {
    const result = resolveBookingDuration(
      { travelStartDate: '2026-11-18', travelEndDate: '2026-11-13' },
      {},
      { travelStartDate: '2026-10-10', travelEndDate: '2026-10-14' },
    );
    expect(result.durationLabel).toBe('4 Nights / 5 Days');
  });

  it('returns nulls when every source is invalid or absent', () => {
    const result = resolveBookingDuration({}, {}, {});
    expect(result).toEqual({
      travelStart: null,
      travelEnd: null,
      totalNights: null,
      totalDays: null,
      durationLabel: null,
    });
  });
});

describe('duration helpers', () => {
  it('normalizes Date and ISO strings to a UTC day', () => {
    expect(toIsoDay('2026-11-13T00:00:00.000Z')).toBe('2026-11-13');
    expect(toIsoDay(new Date('2026-11-13T00:00:00.000Z'))).toBe('2026-11-13');
    expect(toIsoDay('not-a-date')).toBeNull();
    expect(toIsoDay(null)).toBeNull();
  });

  it('computes calendar-day differences without timezone drift', () => {
    expect(nightsBetweenDates('2026-03-08', '2026-03-14')).toBe(6);
    expect(nightsBetweenDates('2026-11-13', '2026-11-18')).toBe(5);
    expect(nightsBetweenDates('2026-11-18', '2026-11-13')).toBeNull();
    expect(nightsBetweenDates(null, '2026-11-18')).toBeNull();
  });

  it('formats night counts with correct grammar', () => {
    expect(durationLabelForNights(0)).toBe('0 Nights / 1 Day');
    expect(durationLabelForNights(1)).toBe('1 Night / 2 Days');
    expect(durationLabelForNights(5)).toBe('5 Nights / 6 Days');
    expect(durationLabelForNights(-1)).toBeNull();
    expect(durationLabelForNights(Number.NaN)).toBeNull();
  });
});
